//! Bounded network/parse worker. No filesystem access or lexer runs in a UI handler.
use oc_gateway::Gateway;
use rune_kit::{diff, syntax};
use serde_json::Value;
use std::{
    collections::HashMap,
    hash::{Hash, Hasher},
    sync::mpsc,
};

pub enum Operation {
    CanvasWrite {
        path: String,
        body: Value,
    },
    Patch {
        path: String,
        body: Value,
    },
    Delete(String),
    Post {
        path: String,
        body: Value,
    },
    TerminalCreate(String),
    TerminalClose {
        directory: String,
        id: String,
    },
    Get {
        path: String,
        query: Vec<(String, String)>,
    },
    Save(Value),
    CreateSide(String),
    SendSide {
        id: String,
        body: Value,
    },
}
pub struct Request {
    pub epoch: u64,
    pub tag: String,
    pub op: Operation,
}
pub struct Reply {
    pub epoch: u64,
    pub tag: String,
    pub result: Result<Payload, String>,
}
pub struct Payload {
    pub value: Value,
    pub diff: Vec<PreparedFile>,
    pub highlights: HashMap<u64, Vec<syntax::Highlight>>,
    pub image: Option<Result<rune::Image, String>>,
}
pub struct PreparedFile {
    pub header: String,
    pub hunks: Vec<diff::Hunk>,
}
pub struct Worker {
    send: mpsc::SyncSender<Request>,
    receive: mpsc::Receiver<Reply>,
}
impl Worker {
    pub fn start(client: Gateway, wake: rune::Waker) -> Self {
        let (send, requests) = mpsc::sync_channel::<Request>(16);
        let (replies, receive) = mpsc::sync_channel(16);
        std::thread::Builder::new()
            .name("workbench".into())
            .spawn(move || {
                let client = client.isolated_pool();
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("workbench runtime");
                while let Ok(request) = requests.recv() {
                    let tag = request.tag.clone();
                    let result = client
                        .as_ref()
                        .map_err(Clone::clone)
                        .and_then(|client| rt.block_on(run(client, request.op)))
                        .map(|mut value| {
                            if let Some((kind, path)) = tag.split_once(':') {
                                if kind == "file" || kind == "save" {
                                    value["__path"] = Value::String(path.into());
                                }
                            }
                            prepare(value)
                        });
                    if replies
                        .send(Reply {
                            epoch: request.epoch,
                            tag: request.tag,
                            result,
                        })
                        .is_err()
                    {
                        break;
                    }
                    wake();
                }
            })
            .expect("workbench worker");
        Self { send, receive }
    }
    pub fn request(&self, request: Request) -> Result<(), String> {
        self.send
            .try_send(request)
            .map_err(|e| format!("Workspace queue: {e}"))
    }
    pub fn take(&self) -> Vec<Reply> {
        self.receive.try_iter().take(16).collect()
    }
}
async fn run(client: &Gateway, op: Operation) -> Result<Value, String> {
    match op {
        Operation::CanvasWrite { path, body } => client.canvas_write(&path, body).await,
        Operation::Patch { path, body } => client.patch_json(&path, body).await,
        Operation::Delete(path) => client.delete_json(&path).await,
        Operation::Post { path, body } => client.post(&path, body).await,
        Operation::TerminalCreate(directory) => {
            let t = client.create_terminal(&directory).await?;
            Ok(serde_json::json!({"id":t.id,"cwd":t.cwd,"title":t.title,"status":t.status}))
        }
        Operation::TerminalClose { directory, id } => {
            client.close_terminal(&directory, &id).await?;
            Ok(Value::Null)
        }
        Operation::Get { path, query } => {
            let query: Vec<_> = query
                .iter()
                .map(|(k, v)| (k.as_str(), v.as_str()))
                .collect();
            client.get_bounded(&path, &query, 16 * 1024 * 1024).await
        }
        Operation::Save(body) => client.put("workspace/file", body).await,
        Operation::CreateSide(id) => {
            client
                .post(&format!("sessions/{id}/side-chats"), serde_json::json!({}))
                .await
        }
        Operation::SendSide { id, body } => {
            client.post(&format!("sessions/{id}/prompt"), body).await
        }
    }
}
pub fn hash(text: &str) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut h);
    h.finish()
}
pub fn prepare(value: Value) -> Payload {
    let mut highlights = HashMap::new();
    let mut prepared = Vec::new();
    if let Some(patch) = value["patch"].as_str() {
        // FileDiff holds Rc internally. Transfer only its Send-safe public data; recreate the
        // constant-size header on the UI thread, never redo Myers/word pairing there.
        for mut file in diff::parse(patch) {
            let lang = file.language();
            for side in [diff::Side::Old, diff::Side::New] {
                let mut chunks: std::collections::BTreeMap<u32, Vec<(u32, &str)>> =
                    Default::default();
                for line in file.hunks.iter().flat_map(|h| &h.lines) {
                    if let Some(n) = line.number(side) {
                        chunks
                            .entry((n - 1) / 128)
                            .or_default()
                            .push((n, &line.text));
                    }
                }
                for (chunk, lines) in chunks {
                    let mut text = String::new();
                    let mut it = lines.into_iter().peekable();
                    for n in chunk * 128 + 1..=(chunk + 1) * 128 {
                        if it.peek().is_some_and(|(i, _)| *i == n) {
                            text.push_str(it.next().unwrap().1);
                        }
                        text.push('\n');
                    }
                    highlights
                        .entry(hash(&text))
                        .or_insert_with(|| syntax::builtin(lang, &text));
                }
            }
            let hunks = std::mem::take(&mut file.hunks);
            prepared.push(PreparedFile {
                header: file.patch(),
                hunks,
            });
        }
    }
    if let Some(text) = value["text"].as_str() {
        // File syntax is prepared separately with the selected path supplied below.
        let lang = syntax::lang_for_path(value["__path"].as_str().unwrap_or(""));
        highlights.insert(hash(text), syntax::builtin(lang, text));
    }
    let image = value["uri"]
        .as_str()
        .and_then(|uri| uri.split_once(";base64,"))
        .map(|(_, data)| {
            use base64::Engine;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|e| e.to_string())?;
            let image = rune::ImageCache::new(std::sync::Arc::new(|| {})).load(bytes);
            image.wait().map_err(|e| e.to_string())?;
            let [w, h] = image.size().ok_or("Image has no dimensions")?;
            if w as u64 * h as u64 * 4 * 4 / 3 > 32 * 1024 * 1024 {
                return Err("Image exceeds 32 MiB decoded budget".into());
            }
            Ok(image)
        });
    Payload {
        value,
        diff: prepared,
        highlights,
        image,
    }
}
