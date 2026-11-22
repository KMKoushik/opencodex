//! Prompt mutations have their own worker: admission must never block the SSE reader.
use crate::{Gateway, types::ModelRef};
use serde_json::{Value, json};
use std::sync::{Arc, mpsc};

#[derive(Clone)]
pub struct Attachment {
    pub name: String,
    pub mime: String,
    pub bytes: Arc<Vec<u8>>,
}
impl Attachment {
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
        let item = Self {
            name,
            mime,
            bytes: Arc::new(bytes),
        };
        validate_attachments(std::slice::from_ref(&item))?;
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
                        while let Some(request) = rx.recv().await {
                            let reply = match request {
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
            let _: Value = self
                .post(
                    &format!("sessions/{id}/worktree"),
                    json!({"branch":send.branch}),
                )
                .await?;
        }
        if send.full_access {
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
                    client
                        .get(path, &[("directory", directory.as_str())])
                        .await?,
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
