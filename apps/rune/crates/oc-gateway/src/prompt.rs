//! Prompt mutations have their own worker: admission must never block the SSE reader.
use crate::{Gateway, types::ModelRef};
use serde_json::{Value, json};
use std::sync::{Arc, mpsc};

#[derive(Clone)]
pub struct Attachment {
    pub name: String,
    pub mime: String,
    pub bytes: Arc<Vec<u8>>,
    pub thumbnail: Option<Thumbnail>,
}
#[derive(Clone)]
pub struct Thumbnail {
    pub width: u32,
    pub height: u32,
    pub rgba: Arc<[u8]>,
}
impl Attachment {
    pub fn preview(&mut self) {
        if !self.image() {
            return;
        }
        let Ok(mut reader) = image::ImageReader::new(std::io::Cursor::new(self.bytes.as_slice()))
            .with_guessed_format()
        else {
            return;
        };
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(8192);
        limits.max_image_height = Some(8192);
        limits.max_alloc = Some(64 * 1024 * 1024);
        reader.limits(limits);
        if let Ok(image) = reader.decode() {
            let thumb = image.thumbnail(88, 88).into_rgba8();
            self.thumbnail = Some(Thumbnail {
                width: thumb.width(),
                height: thumb.height(),
                rgba: thumb.into_raw().into(),
            });
        }
    }
    pub fn image(&self) -> bool {
        self.mime.starts_with("image/")
    }
    pub fn read(path: &str) -> Result<Self, String> {
        use std::io::Read;
        let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take(20 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        let name = std::path::Path::new(path)
            .file_name()
            .ok_or("Missing filename")?
            .to_string_lossy()
            .into_owned();
        let mime = match name
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_lowercase()
            .as_str()
        {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "pdf" => "application/pdf",
            _ if !bytes.contains(&0) && std::str::from_utf8(&bytes).is_ok() => "text/plain",
            _ => "application/octet-stream",
        }
        .to_owned();
        let mut item = Self {
            name,
            mime,
            bytes: Arc::new(bytes),
            thumbnail: None,
        };
        validate_attachments(std::slice::from_ref(&item))?;
        item.preview();
        Ok(item)
    }
}
pub fn validate_attachments(items: &[Attachment]) -> Result<(), String> {
    if items.len() > 100 {
        return Err("Attach up to 100 files per message.".into());
    }
    let mut images = 0;
    for item in items {
        let limit = if item.image() { 10 } else { 20 };
        if item.bytes.len() > limit * 1024 * 1024 {
            return Err(format!("{} exceeds the {limit} MiB limit.", item.name));
        }
        if item.image() {
            images += item.bytes.len();
        }
    }
    if images > 80 * 1024 * 1024 {
        return Err("Images must total 80 MiB or less per message.".into());
    }
    Ok(())
}
#[derive(Clone)]
pub struct Send {
    pub key: String,
    pub revision: u64,
    pub session: Option<String>,
    pub directory: String,
    pub model: ModelRef,
    pub text: String,
    pub attachments: Vec<Attachment>,
    pub mentions: Vec<Value>,
    pub command: Option<String>,
    pub skill: Option<String>,
    pub full_access: bool,
    pub worktree: bool,
    pub branch: Option<String>,
}
pub enum Request {
    DownloadExport {
        session: String,
        format: String,
    },
    FinishExport {
        session: String,
        temporary: String,
        destination: Option<String>,
    },
    ProjectIcon {
        source: String,
        local: bool,
        favicon: bool,
    },
    DeleteQuery {
        tag: String,
        path: String,
        query: Vec<(String, String)>,
    },
    Export {
        session: String,
        format: String,
        destination: String,
    },
    Write {
        tag: String,
        path: String,
        method: String,
        body: Value,
    },
    PrepareAttachment {
        key: String,
        item: Attachment,
    },
    IndexFiles(String),
    Action {
        session: String,
        revision: u64,
        name: String,
        args: String,
        destination: Option<String>,
    },
    Send(Send),
    ReadAttachment {
        key: String,
        path: String,
    },
    Get {
        tag: String,
        path: String,
        query: Vec<(String, String)>,
    },
    Mutate {
        tag: String,
        path: String,
        body: Value,
        delete: bool,
    },
}
pub enum Reply {
    Action {
        session: String,
        revision: u64,
        result: Result<Value, String>,
    },
    Sent {
        key: String,
        revision: u64,
        session: Option<String>,
        result: Result<(), String>,
    },
    Attachment {
        key: String,
        result: Result<Attachment, String>,
    },
    Data {
        tag: String,
        result: Result<Value, String>,
    },
}
pub struct PromptWorker {
    requests: tokio::sync::mpsc::Sender<Request>,
    replies: mpsc::Receiver<Reply>,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
}
impl PromptWorker {
    pub fn start(client: Gateway, wake: impl Fn() + std::marker::Send + 'static) -> Self {
        let (requests, mut rx) = tokio::sync::mpsc::channel(16);
        let (tx, replies) = mpsc::channel();
        let (stop, stopped) = tokio::sync::oneshot::channel();
        std::thread::Builder::new()
            .name("prompt-gateway".into())
            .spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("prompt runtime");
                rt.block_on(async {
                    let run = async {
                        // TempPath guards clean interrupted/cancelled downloads when
                        // this worker stops too; filesystem cleanup stays off the UI.
                        let mut downloads = std::collections::BTreeMap::new();
                        while let Some(request) = rx.recv().await {
                            let reply = match request {
                                Request::DownloadExport { session, format } => Reply::Data {
                                    tag: format!("menu-export:{session}:temp"),
                                    result: client.download_export(&session, &format).await.map(
                                        |file| {
                                            let path = file.into_temp_path();
                                            let temporary = path.to_string_lossy().into_owned();
                                            downloads.insert(temporary.clone(), path);
                                            json!({"temporary":temporary})
                                        },
                                    ),
                                },
                                Request::FinishExport {
                                    session,
                                    temporary,
                                    destination,
                                } => {
                                    let result = if let Some(path) = downloads.remove(&temporary) {
                                        destination
                                            .map(|destination| {
                                                std::fs::copy(&path, destination)
                                                    .map(|_| ())
                                                    .map_err(|e| e.to_string())
                                            })
                                            .unwrap_or(Ok(()))
                                    } else {
                                        Err("The prepared export is no longer available".into())
                                    };
                                    Reply::Data {
                                        tag: format!("menu-export:{session}:saved"),
                                        result: result.map(|_| Value::Null),
                                    }
                                }
                                Request::ProjectIcon {
                                    source,
                                    local,
                                    favicon,
                                } => Reply::Data {
                                    tag: "project-icon".into(),
                                    result: crate::project_icon::prepare(&source, local, favicon)
                                        .await,
                                },
                                Request::DeleteQuery { tag, path, query } => {
                                    let query: Vec<_> = query
                                        .iter()
                                        .map(|(k, v)| (k.as_str(), v.as_str()))
                                        .collect();
                                    let result = client
                                        .response(
                                            &path,
                                            &query,
                                            reqwest::Method::DELETE,
                                            None,
                                            false,
                                        )
                                        .await
                                        .map(|_| Value::Null);
                                    Reply::Data { tag, result }
                                }
                                Request::Export {
                                    session,
                                    format,
                                    destination,
                                } => Reply::Data {
                                    tag: format!("menu-export:{session}"),
                                    result: client
                                        .composer_action(
                                            &session,
                                            "export",
                                            &format,
                                            Some(destination),
                                        )
                                        .await,
                                },
                                Request::PrepareAttachment { key, mut item } => {
                                    item.preview();
                                    Reply::Attachment {
                                        key,
                                        result: Ok(item),
                                    }
                                }
                                Request::IndexFiles(directory) => Reply::Data {
                                    tag: format!("files:{directory}"),
                                    result: client.composer_files(&directory).await,
                                },
                                Request::Action {
                                    session,
                                    revision,
                                    name,
                                    args,
                                    destination,
                                } => {
                                    let result = client
                                        .composer_action(&session, &name, &args, destination)
                                        .await;
                                    Reply::Action {
                                        session,
                                        revision,
                                        result,
                                    }
                                }
                                Request::Send(send) => {
                                    let mut session = send.session.clone();
                                    let result = client.send_prompt(&send, &mut session).await;
                                    Reply::Sent {
                                        key: send.key,
                                        revision: send.revision,
                                        session,
                                        result,
                                    }
                                }
                                Request::ReadAttachment { key, path } => Reply::Attachment {
                                    key,
                                    result: Attachment::read(&path),
                                },
                                Request::Get { tag, path, query } => {
                                    let q: Vec<_> = query
                                        .iter()
                                        .map(|(k, v)| (k.as_str(), v.as_str()))
                                        .collect();
                                    Reply::Data {
                                        tag,
                                        result: client.get(&path, &q).await,
                                    }
                                }
                                Request::Write {
                                    tag,
                                    path,
                                    method,
                                    body,
                                } => {
                                    let result =
                                        match reqwest::Method::from_bytes(method.as_bytes()) {
                                            Ok(method) => match client
                                                .response(&path, &[], method, Some(body), false)
                                                .await
                                            {
                                                Ok(response) => {
                                                    response.json().await.map_err(|e| e.to_string())
                                                }
                                                Err(error) => Err(error),
                                            },
                                            Err(error) => Err(error.to_string()),
                                        };
                                    Reply::Data { tag, result }
                                }
                                Request::Mutate {
                                    tag,
                                    path,
                                    body,
                                    delete,
                                } => {
                                    let result = if delete {
                                        client
                                            .response(
                                                &path,
                                                &[],
                                                reqwest::Method::DELETE,
                                                None,
                                                false,
                                            )
                                            .await
                                            .map(|_| Value::Null)
                                    } else {
                                        client.post(&path, body).await
                                    };
                                    Reply::Data { tag, result }
                                }
                            };
                            if tx.send(reply).is_err() {
                                break;
                            }
                            wake();
                        }
                    };
                    tokio::select! { _ = run => {}, _ = stopped => {} }
                });
            })
            .expect("prompt worker");
        Self {
            requests,
            replies,
            stop: Some(stop),
        }
    }
    pub fn request(&self, request: Request) -> Result<(), String> {
        self.requests.try_send(request).map_err(|e| e.to_string())
    }
    pub fn take(&self) -> Option<Reply> {
        self.replies.try_recv().ok()
    }
}
impl Drop for PromptWorker {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}
impl Gateway {
    async fn composer_files(&self, directory: &str) -> Result<Value, String> {
        // A bounded local-search catalog, loaded away from keyboard input. Never walk .git.
        let mut folders = std::collections::VecDeque::from([String::new()]);
        let mut files = vec![];
        let mut bytes = 0;
        let mut visited = 0;
        while let Some(path) = folders.pop_front() {
            if visited >= 64 || files.len() >= 2000 || bytes >= 1024 * 1024 {
                break;
            }
            visited += 1;
            let mut query = vec![("directory", directory)];
            if !path.is_empty() {
                query.push(("path", path.trim_end_matches('/')));
            }
            let entries: Vec<Value> = self.get("workspace/files", &query).await?;
            for item in entries {
                let Some(path) = item["path"].as_str() else {
                    continue;
                };
                if path
                    .split('/')
                    .any(|p| p == ".git" || p == "node_modules" || p == "target")
                {
                    continue;
                }
                if item["type"] == "directory" {
                    if folders.len() < 128 {
                        folders.push_back(path.into());
                    }
                } else {
                    bytes += path.len();
                    files.push(item);
                    if files.len() >= 2000 {
                        break;
                    }
                }
            }
        }
        Ok(json!(files))
    }
    async fn composer_action(
        &self,
        id: &str,
        name: &str,
        args: &str,
        destination: Option<String>,
    ) -> Result<Value, String> {
        if name == "export" {
            let format = if args == "json" { "json" } else { "markdown" };
            let response = self
                .response(
                    &format!("sessions/{id}/export"),
                    &[("format", format)],
                    reqwest::Method::GET,
                    None,
                    false,
                )
                .await?;
            let bytes = response.bytes().await.map_err(|e| e.to_string())?;
            std::fs::write(destination.ok_or("Choose an export destination")?, bytes)
                .map_err(|e| e.to_string())?;
            return Ok(Value::Null);
        }
        if name == "side" {
            let side: Value = self
                .post(&format!("sessions/{id}/side-chats"), json!({}))
                .await?;
            let sid = side["id"].as_str().ok_or("Side chat has no id")?;
            if !args.trim().is_empty() {
                if let Err(error) = self
                    .post::<Value>(&format!("sessions/{sid}/prompt"), json!({"text":args}))
                    .await
                {
                    let _ = self
                        .response(
                            &format!("sessions/{id}/side-chats/{sid}"),
                            &[],
                            reqwest::Method::DELETE,
                            None,
                            false,
                        )
                        .await;
                    return Err(error);
                }
            }
            return Ok(json!({"open":sid}));
        }
        let mut body = json!({"action":name});
        let mut restored = None;
        if name == "rename" {
            body["title"] = json!(args.trim());
        }
        if name == "undo" {
            let messages = self.messages(id, None).await?;
            let message = messages
                .data
                .iter()
                .filter(|m| m.r#type == "user")
                .max_by(|a, b| a.time.created.total_cmp(&b.time.created))
                .ok_or("No earlier user message is loaded.")?;
            body["messageID"] = json!(message.id);
            restored = message.fields.get("text").cloned();
        }
        let value: Value = self.post(&format!("sessions/{id}/action"), body).await?;
        Ok(if name == "fork" {
            json!({"open":value["id"]})
        } else if let Some(text) = restored {
            json!({"restored":text})
        } else {
            Value::Null
        })
    }
    /// Electron downloads the response before asking where to save it. Spool on
    /// the worker rather than carrying an unbounded JSON/Markdown blob into UI state.
    async fn download_export(
        &self,
        id: &str,
        format: &str,
    ) -> Result<tempfile::NamedTempFile, String> {
        use std::io::Write;
        let mut response = self
            .response(
                &format!("sessions/{id}/export"),
                &[("format", format)],
                reqwest::Method::GET,
                None,
                false,
            )
            .await?;
        let mut file = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            file.write_all(&chunk).map_err(|e| e.to_string())?;
        }
        Ok(file)
    }
    pub async fn send_prompt(
        &self,
        send: &Send,
        session: &mut Option<String>,
    ) -> Result<(), String> {
        validate_attachments(&send.attachments)?;
        if session.is_none() {
            let created: Value = self
                .post(
                    "sessions",
                    json!({"directory":send.directory,"model":send.model}),
                )
                .await?;
            *session = Some(
                created["id"]
                    .as_str()
                    .ok_or("Session response has no id")?
                    .into(),
            );
        }
        let id = session.as_ref().expect("created session");
        if send.session.is_none() && send.worktree {
            let body = send
                .branch
                .as_ref()
                .map(|branch| json!({"branch":branch}))
                .unwrap_or_else(|| json!({}));
            let _: Value = self.post(&format!("sessions/{id}/worktree"), body).await?;
        }
        if send.session.is_none() && send.full_access {
            let _: Value = self
                .post(&format!("sessions/{id}/access"), json!({"mode":"full"}))
                .await?;
        }
        let files: Vec<_> = send.attachments.iter().map(|a| json!({"name":a.name,"uri":format!("data:{};base64,{}", a.mime, base64(&a.bytes))})).collect();
        let mut body =
            json!({"text":send.text,"model":send.model,"files":files,"mentions":send.mentions});
        if let Some(command) = &send.command {
            body["command"] = json!(command);
        }
        if let Some(skill) = &send.skill {
            body["skill"] = json!(skill);
        }
        let _: Value = self.post(&format!("sessions/{id}/prompt"), body).await?;
        Ok(())
    }
}
fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = ((c[0] as u32) << 16)
            | ((c.get(1).copied().unwrap_or(0) as u32) << 8)
            | c.get(2).copied().unwrap_or(0) as u32;
        out.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        out.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        out.push(if c.len() > 1 {
            ALPHABET[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if c.len() > 2 {
            ALPHABET[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

/// Headless-only preflight; the caller runs this on a worker before the virtual clock starts.
pub fn capture(
    client: Gateway,
    directory: String,
    session: Option<String>,
) -> Result<Vec<(String, Value)>, String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?
        .block_on(async {
            let mut values = vec![];
            for (kind, path) in [
                ("commands", "commands"),
                ("skills", "workspace/skills"),
                ("files", "workspace/files"),
                ("branches", "workspace/branches"),
            ] {
                values.push((
                    format!("{kind}:{directory}"),
                    if kind == "files" {
                        client.composer_files(&directory).await?
                    } else {
                        client
                            .get(path, &[("directory", directory.as_str())])
                            .await?
                    },
                ));
            }
            if let Some(id) = session {
                for kind in ["forms", "permissions"] {
                    values.push((
                        format!("{kind}:{id}"),
                        client.get(&format!("sessions/{id}/{kind}"), &[]).await?,
                    ));
                }
            }
            Ok(values)
        })
}
