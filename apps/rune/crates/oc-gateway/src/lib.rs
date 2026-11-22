//! The native client talks only to the TypeScript gateway, never to OpenCode.
mod client;
mod snapshot;
mod sse;
pub mod types;

pub use client::Gateway;
pub use snapshot::Snapshot;

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
}

/// A capacity-one latest snapshot mailbox; streaming cannot build a UI work backlog.
pub struct Worker {
    latest: Arc<Mutex<Option<Arc<Snapshot>>>>,
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
                let run = async {
                    let mut snapshot = Snapshot::default();
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
                                                    let directory = initial_directory.clone()
                                                        .or_else(|| snapshot.projects.first().map(|p| p.canonical.clone()));
                                                    if let Some(directory) = directory {
                                                        if let Err(e) = snapshot.details(&client, &directory).await { snapshot.error=Some(e); }
                                                        publish(&mut snapshot);
                                                    }
                                                }
                                                "opencode" => {
                                                    let event: types::Event = serde_json::from_str(&data).map_err(|e| format!("Invalid gateway event: {e}"))?;
                                                    let requests=event.r#type.starts_with("permission.") || event.r#type.starts_with("form.");
                                                    let projects=event.r#type.starts_with("project.");
                                                    let mut changed=snapshot.reduce(event);
                                                    if requests { changed|=snapshot.refresh_attention(&client).await?; }
                                                    if projects { snapshot.projects=client.projects().await?;changed=true; }
                                                    if changed { publish(&mut snapshot); }
                                                }
                                                "unavailable" => return Err("OpenCode is unavailable".into()),
                                                _ => {}
                                            }
                                        }
                                    }
                                    command = receiver.recv() => {
                                        let Some(command) = command else { return Ok(()); };
                                        match command {
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
            commands,
            stop: Some(stop),
        }
    }
    pub fn take(&self) -> Option<Arc<Snapshot>> {
        self.latest.lock().expect("mailbox").take()
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
    std::thread::spawn(move || {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?
            .block_on(async {
                let mut snapshot = Snapshot::load(&client).await?;
                if let Some(directory) = snapshot.projects.first().map(|p| p.canonical.clone()) {
                    snapshot.details(&client, &directory).await?;
                }
                Ok(snapshot)
            })
    })
    .join()
    .map_err(|_| "Gateway capture worker panicked".to_owned())?
}
