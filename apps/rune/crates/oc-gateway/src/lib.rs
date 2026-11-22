//! The native client talks only to the TypeScript gateway, never to OpenCode.
mod client;
pub mod messages;
mod project_icon;
pub mod prompt;
mod snapshot;
mod sse;
pub mod timeline;
pub mod types;

pub use client::Gateway;
pub use client::terminal;
pub use snapshot::Snapshot;
pub fn capture_project_preview(source: &str) -> Result<serde_json::Value, String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?
        .block_on(project_icon::preview(source))
}

/// Screenshot-only page fetch. Call before rendering, on a capture worker.
pub fn capture_page(url: &str, path: &str) -> Result<serde_json::Value, String> {
    capture_page_query(url, path, &[])
}
pub fn capture_page_query(
    url: &str,
    path: &str,
    query: &[(&str, &str)],
) -> Result<serde_json::Value, String> {
    let client = Gateway::new(url, None)?;
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?
        .block_on(client.get(path, query))
}

#[cfg(test)]
mod message_tests;
#[cfg(test)]
mod tests;

use futures_util::StreamExt;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

pub enum Command {
    Refresh,
    More(String),
    AddProject(String),
    Details(String),
    OpenSession(String),
    EarlierMessages(String),
}

/// A capacity-one latest snapshot mailbox; streaming cannot build a UI work backlog.
pub struct Worker {
    latest: Arc<Mutex<Option<Arc<Snapshot>>>>,
    chat: Arc<Mutex<Option<Arc<messages::Messages>>>>,
    page_changes: Arc<Mutex<std::collections::BTreeSet<String>>>,
    commands: mpsc::Sender<Command>,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
}
impl Worker {
    pub fn start(
        client: Gateway,
        initial_directory: Option<String>,
        wake: impl Fn() + Send + Sync + 'static,
    ) -> Self {
        let latest = Arc::new(Mutex::new(None));
        let mailbox = latest.clone();
        let chat = Arc::new(Mutex::new(None));
        let chat_mailbox = chat.clone();
        let page_changes = Arc::new(Mutex::new(std::collections::BTreeSet::new()));
        let pages_mailbox = page_changes.clone();
        let (commands, mut receiver) = mpsc::channel(16);
        let (stop, stopped) = tokio::sync::oneshot::channel();
        std::thread::Builder::new().name("gateway".into()).spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().expect("gateway runtime");
            rt.block_on(async {
                let publish = |s: &mut Snapshot| {
                    s.revision += 1;
                    *mailbox.lock().expect("mailbox") = Some(Arc::new(s.clone()));
                    wake();
                };
                let publish_chat = |s: &messages::Messages| {
                    *chat_mailbox.lock().expect("chat mailbox") = Some(Arc::new(s.clone()));
                    wake();
                };
                let invalidate=|key:String|{let mut changes=pages_mailbox.lock().expect("page events");if changes.len()>=64{changes.clear();changes.insert("all".into());}else{changes.insert(key);}drop(changes);wake();};
                let run = async {
                    let mut snapshot = Snapshot::default();
                    let mut transcript: Option<messages::Messages> = None;
                    let mut refresh_chat: Option<tokio::time::Instant> = None;
                    let mut delay = Duration::from_millis(500);
                    loop {
                        let result: Result<(), String> = async {
                            // Open the subscription BEFORE reading snapshots: no launch/reconnect gap.
                            let response = client.events().await?;
                            let mut bytes = response.bytes_stream();
                            let mut parser = sse::Parser::default();
                            loop {
                                tokio::select! {
                                    chunk = tokio::time::timeout(Duration::from_secs(45), bytes.next()) => {
                                        let chunk = chunk.map_err(|_| "Live stream timed out".to_owned())?
                                            .ok_or("Live stream ended")?.map_err(|e| e.to_string())?;
                                        for (name, data) in parser.push(&chunk)? {
                                            match name.as_str() {
                                                "ready" => {
                                                    snapshot = Snapshot::load(&client).await?;
                                                    snapshot.live = true;
                                                    delay = Duration::from_millis(500);
                                                    publish(&mut snapshot);
                                                    if let Some(chat) = &mut transcript {
                                                        if let Err(e) = chat.refresh(&client).await { chat.error = Some(e); }
                                                        publish_chat(chat);
                                                    }
                                                    let directory = initial_directory.clone()
                                                        .or_else(|| snapshot.projects.first().map(|p| p.canonical.clone()));
                                                    if let Some(directory) = directory {
                                                        if let Err(e) = snapshot.details(&client, &directory).await { snapshot.error=Some(e); }
                                                        publish(&mut snapshot);
                                                    }
                                                }
                                                "opencode" => {
                                                    let event: types::Event = serde_json::from_str(&data).map_err(|e| format!("Invalid gateway event: {e}"))?;
                                                    if event.r#type.starts_with("rpc.opencodex.tasks."){invalidate("tasks".into());}
                                                    if matches!(event.r#type.as_str(),"worktree.updated"|"worktree.resolved") {if let Some(id)=event.data["projectID"].as_str(){invalidate(format!("worktree:{id}"));}}
                                                    if let Some(chat) = &mut transcript {
                                                        let (changed, refresh) = chat.reduce(&event);
                                                        if changed { publish_chat(chat); }
                                                        if refresh && refresh_chat.is_none() { refresh_chat = Some(tokio::time::Instant::now() + Duration::from_millis(250)); }
                                                    }
                                                    let requests=event.r#type.starts_with("permission.") || event.r#type.starts_with("form.");
                                                    let projects=event.r#type.starts_with("project.");
                                                    let mut changed=snapshot.reduce(event);
                                                    if requests { changed|=snapshot.refresh_attention(&client).await?; }
                                                    if projects { snapshot.projects=client.projects().await?;changed=true; }
                                                    if changed { publish(&mut snapshot); }
                                                }
                                                "unavailable" => return Err("OpenCode is unavailable".into()),
                                                "canvas" => {
                                                    let event:serde_json::Value=serde_json::from_str(&data).map_err(|e|format!("Invalid canvas event: {e}"))?;
                                                    match event["type"].as_str(){Some("list")=>invalidate("apps".into()),Some("app")|Some("source")=>{if let Some(id)=event["id"].as_str(){invalidate(format!("{}:{id}",event["type"].as_str().unwrap()));}},_=>{}}
                                                },
                                                _ => {}
                                            }
                                        }
                                    }
                                    command = receiver.recv() => {
                                        let Some(command) = command else { return Ok(()); };
                                        match command {
                                            Command::OpenSession(id) => {
                                                refresh_chat = None;
                                                match messages::Messages::load(&client, &id).await {
                                                    Ok(chat) => transcript = Some(chat),
                                                    Err(error) => transcript = Some(messages::Messages { session_id: id, error: Some(error), ..Default::default() }),
                                                }
                                                publish_chat(transcript.as_ref().unwrap());
                                                continue;
                                            }
                                            Command::EarlierMessages(id) => {
                                                if let Some(chat) = transcript.as_mut().filter(|c| c.session_id == id) {
                                                    if let Err(e) = chat.earlier(&client).await { chat.error = Some(e); }
                                                    publish_chat(chat);
                                                }
                                                continue;
                                            }
                                            Command::Details(directory) => {
                                                if snapshot.models.contains_key(&directory) { continue; }
                                                snapshot.details(&client,&directory).await?;
                                            }
                                            Command::Refresh => {
                                                snapshot = Snapshot::load(&client).await?;
                                                snapshot.live = true;
                                            }
                                            Command::AddProject(directory) => {
                                                client.add_project(&directory).await?;
                                                snapshot = Snapshot::load(&client).await?;
                                                snapshot.live = true;
                                            }
                                            Command::More(directory) => {
                                                if let Some(cursor) = snapshot.cursors.get(&directory) {
                                                    let page = client.sessions(&directory, Some(cursor)).await?;
                                                    snapshot.cursors.remove(&directory);
                                                    if let Some(cursor) = page.next_cursor { snapshot.cursors.insert(directory.clone(), cursor); }
                                                    for s in page.sessions { snapshot.sessions.insert(s.id.clone(), s); }
                                                }
                                                if let Some(id) = snapshot.projects.iter().find(|p| p.canonical==directory).map(|p| p.id.clone()) {
                                                    if let Some(cursor) = snapshot.project_cursors.get(&id) {
                                                        let page = client.project_sessions(&id, Some(cursor)).await?;
                                                        snapshot.project_cursors.remove(&id);
                                                        if let Some(cursor) = page.next_cursor { snapshot.project_cursors.insert(id, cursor); }
                                                        for s in page.sessions { snapshot.sessions.insert(s.id.clone(), s); }
                                                    }
                                                }
                                            }
                                        }
                                        publish(&mut snapshot);
                                    }
                                    _ = async { match refresh_chat { Some(due) => tokio::time::sleep_until(due).await, None => std::future::pending().await } } => {
                                        refresh_chat = None;
                                        if let Some(chat) = &mut transcript {
                                            if let Err(e) = chat.refresh(&client).await { chat.error = Some(e); }
                                            publish_chat(chat);
                                        }
                                    }
                                }
                            }
                        }.await;
                        if let Err(error) = result {
                            snapshot.live = false;
                            snapshot.error = Some(error);
                            publish(&mut snapshot);
                        }
                        tokio::time::sleep(delay).await;
                        delay = (delay * 2).min(Duration::from_secs(30));
                    }
                };
                tokio::select! { _ = run => {}, _ = stopped => {} }
            });
        }).expect("gateway worker");
        Self {
            latest,
            chat,
            page_changes,
            commands,
            stop: Some(stop),
        }
    }
    pub fn take(&self) -> Option<Arc<Snapshot>> {
        self.latest.lock().expect("mailbox").take()
    }
    pub fn take_messages(&self) -> Option<Arc<messages::Messages>> {
        self.chat.lock().expect("chat mailbox").take()
    }
    pub fn take_page_changes(&self) -> Vec<String> {
        std::mem::take(&mut *self.page_changes.lock().expect("page events"))
            .into_iter()
            .collect()
    }
    pub fn command(&self, command: Command) -> Result<(), String> {
        self.commands.try_send(command).map_err(|e| e.to_string())
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}

/// Headless capture waits for real data before its virtual clock starts; never used by a window.
pub fn capture(client: Gateway) -> Result<Snapshot, String> {
    capture_directory(client, None)
}
pub fn capture_directory(client: Gateway, directory: Option<String>) -> Result<Snapshot, String> {
    std::thread::spawn(move || {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?
            .block_on(async {
                let mut snapshot = Snapshot::load(&client).await?;
                if let Some(directory) =
                    directory.or_else(|| snapshot.projects.first().map(|p| p.canonical.clone()))
                {
                    snapshot.details(&client, &directory).await?;
                }
                Ok(snapshot)
            })
    })
    .join()
    .map_err(|_| "Gateway capture worker panicked".to_owned())?
}

pub fn capture_messages(
    client: Gateway,
    id: String,
    history: bool,
) -> Result<messages::Messages, String> {
    std::thread::spawn(move || {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?
            .block_on(async {
                let mut messages = messages::Messages::load(&client, &id).await?;
                if history {
                    while messages.cursor.is_some() {
                        messages.earlier(&client).await?;
                    }
                }
                Ok(messages)
            })
    })
    .join()
    .map_err(|_| "Message capture worker panicked".to_owned())?
}

pub fn capture_details(
    client: Gateway,
    directory: String,
    mut snapshot: Snapshot,
) -> Result<Snapshot, String> {
    std::thread::spawn(move || {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?
            .block_on(async {
                snapshot.details(&client, &directory).await?;
                Ok(snapshot)
            })
    })
    .join()
    .map_err(|_| "Capture details worker panicked".to_owned())?
}

/// Blocking adapter for Rune's background image worker. Never called from a frame/handler.
pub fn image_bytes(client: &Gateway, id: &str, source: &str) -> Result<Vec<u8>, String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?
        .block_on(client.image(id, source))
}
