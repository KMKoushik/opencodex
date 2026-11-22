//! Bounded network/parse worker. No filesystem access or lexer runs in a UI handler.
use super::diff;
use oc_gateway::Gateway;
use rune_kit::syntax;
use serde_json::Value;
use std::{
    collections::HashMap,
    hash::{Hash, Hasher},
    sync::mpsc,
};

pub enum Operation {
    Highlight {
        path: String,
        text: String,
        revision: u64,
    },
    DiscoverApps,
    OpenApp {
        directory: String,
        id: String,
    },
    SaveData {
        uri: String,
        destination: std::path::PathBuf,
    },
    RevealFile {
        directory: String,
        path: String,
    },
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
    pub preview: Option<String>,
    pub apps: Vec<super::open_apps::App>,
    pub value: Value,
    pub diff: Vec<diff::FileDiff>,
    pub highlights: HashMap<u64, Vec<syntax::Highlight>>,
    pub image: Option<Result<rune::Image, String>>,
}
pub struct Worker {
    send: mpsc::SyncSender<Request>,
    receive: mpsc::Receiver<Reply>,
    native_send: mpsc::SyncSender<Reply>,
    wake: rune::Waker,
    native_busy: std::sync::Arc<[std::sync::atomic::AtomicBool; 2]>,
}
impl Worker {
    pub fn start(client: Gateway, wake: rune::Waker) -> Self {
        let (send, requests) = mpsc::sync_channel::<Request>(16);
        let (replies, receive) = mpsc::sync_channel(16);
        let native_send = replies.clone();
        let native_wake = wake.clone();
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
                                if kind == "diff-full" {
                                    value["__full"] = Value::Bool(true);
                                }
                                if kind == "file" || kind == "save" {
                                    value["__path"] = Value::String(
                                        serde_json::from_str::<[String; 2]>(path)
                                            .map(|v| v[1].clone())
                                            .unwrap_or_else(|_| path.into()),
                                    );
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
        Self {
            send,
            receive,
            native_send,
            wake: native_wake,
            native_busy: std::sync::Arc::new([false.into(), false.into()]),
        }
    }
    pub fn request(&self, request: Request) -> Result<(), String> {
        // Spotlight/LaunchServices can take seconds. They must not serialize file, diff,
        // or save requests behind discovery. State's per-tag admission bounds these to
        // one discovery and one open operation; results still use the bounded mailbox.
        if matches!(
            &request.op,
            Operation::DiscoverApps | Operation::OpenApp { .. }
        ) {
            use std::sync::atomic::Ordering;
            let kind = if matches!(&request.op, Operation::DiscoverApps) {
                0
            } else {
                1
            };
            if self.native_busy[kind].swap(true, Ordering::AcqRel) {
                return Err(
                    "An application operation is already running. Retry when it finishes.".into(),
                );
            }
            let busy = self.native_busy.clone();
            let replies = self.native_send.clone();
            let wake = self.wake.clone();
            let result = std::thread::Builder::new()
                .name("open-in-app".into())
                .spawn(move || {
                    let result = match request.op {
                        Operation::DiscoverApps => super::open_apps::discover(),
                        Operation::OpenApp { directory, id } => {
                            super::open_apps::open(&directory, &id)
                        }
                        _ => unreachable!(),
                    }
                    .map(prepare);
                    busy[kind].store(false, Ordering::Release);
                    if replies
                        .send(Reply {
                            epoch: request.epoch,
                            tag: request.tag,
                            result,
                        })
                        .is_ok()
                    {
                        wake();
                    }
                });
            if let Err(error) = result {
                self.native_busy[kind].store(false, Ordering::Release);
                return Err(error.to_string());
            }
            return Ok(());
        }
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
        Operation::Highlight {
            path,
            text,
            revision,
        } => Ok(serde_json::json!({"__path":path,"text":text,"revision":revision})),
        Operation::DiscoverApps => super::open_apps::discover(),
        Operation::OpenApp { directory, id } => super::open_apps::open(&directory, &id),
        Operation::SaveData { uri, destination } => {
            use base64::Engine;
            let (_, data) = uri
                .split_once(";base64,")
                .ok_or("This file has no downloadable data.")?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|e| e.to_string())?;
            std::fs::write(destination, bytes).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        Operation::RevealFile { directory, path } => {
            let location: Value = client
                .get_bounded(
                    "workspace/file-location",
                    &[("directory", directory.as_str()), ("path", path.as_str())],
                    16 * 1024,
                )
                .await?;
            let path = location["path"]
                .as_str()
                .ok_or("The service did not return a file location.")?;
            let result = std::process::Command::new("/usr/bin/open")
                .args(["-R", "--", path])
                .status()
                .map_err(|e| e.to_string())?;
            if !result.success() {
                return Err("This file could not be shown in Finder.".into());
            }
            Ok(Value::Null)
        }
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
pub fn prepare(mut value: Value) -> Payload {
    let mut highlights = HashMap::new();
    let mut prepared = Vec::new();
    if let Some(patch) = value["patch"].as_str() {
        // The owned model uses Arc sources: parsing, pairing, folding and lexing all stay here.
        for file in diff::parse(patch) {
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
            let mut file = if value["__full"] == true {
                file.fold(3)
            } else {
                file
            };
            file.prepare_layout();
            prepared.push(file);
        }
    }
    if let Some(text) = value["text"].as_str() {
        // File syntax is prepared separately with the selected path supplied below.
        highlights.insert(
            hash(text),
            source_highlights(value["__path"].as_str().unwrap_or(""), text),
        );
    }
    let mut natural = None;
    let image = value["uri"]
        .as_str()
        .and_then(|uri| uri.split_once(";base64,"))
        .map(|(_, data)| {
            use base64::Engine;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|e| e.to_string())?;
            natural = super::image::svg_size(&bytes);
            let image = rune::ImageCache::new(std::sync::Arc::new(|| {})).load(bytes);
            image.wait().map_err(|e| e.to_string())?;
            let [w, h] = image.size().ok_or("Image has no dimensions")?;
            if w as u64 * h as u64 * 4 * 4 / 3 > 32 * 1024 * 1024 {
                return Err("Image exceeds 32 MiB decoded budget".into());
            }
            Ok(image)
        });
    if let Some(size) = natural {
        value["__imageNatural"] = serde_json::json!(size);
    }
    Payload {
        preview: super::preview::prepare(&value),
        apps: value["__apps"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|value| {
                let icon = prepare(serde_json::json!({"uri":value["icon"]}))
                    .image
                    .and_then(Result::ok);
                super::open_apps::App {
                    value: value.clone(),
                    icon,
                }
            })
            .collect(),
        value,
        diff: prepared,
        highlights,
        image,
    }
}
pub fn source_highlights(path: &str, text: &str) -> Vec<syntax::Highlight> {
    let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    // FileEditor loads only these language chunks. Markdown/Python/Rust/etc stay plain.
    if !matches!(
        extension.as_str(),
        "js" | "jsx"
            | "mjs"
            | "mjsx"
            | "cjs"
            | "cjsx"
            | "ts"
            | "tsx"
            | "mts"
            | "mtsx"
            | "cts"
            | "ctsx"
            | "json"
            | "jsonc"
            | "css"
            | "html"
            | "htm"
    ) {
        return Vec::new();
    }
    let mut spans = syntax::builtin(syntax::lang_for_path(path), text);
    for (range, paint) in &mut spans {
        if matches!(&text[range.clone()], "true" | "false" | "null") {
            *paint = syntax::Paint::Kind(syntax::Syntax::Number);
        }
    }
    spans
}
