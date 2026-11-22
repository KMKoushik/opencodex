//! Presentation-only tab persistence. File reads, JSON and atomic writes stay off the UI thread.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, mpsc},
};
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Tabs {
    pub browsers: Vec<String>,
    pub browser: usize,
    pub canvases: Vec<String>,
    pub canvas: Option<String>,
}
pub type Saved = BTreeMap<String, Tabs>;
pub struct Storage {
    pub loaded: Arc<Mutex<Option<Result<Saved, String>>>>,
    pub error: Arc<Mutex<Option<String>>>,
    pending: Arc<Mutex<Option<Saved>>>,
    signal: mpsc::SyncSender<()>,
}
impl Storage {
    pub fn start(wake: rune::Waker) -> Self {
        let loaded = Arc::new(Mutex::new(None));
        let out = loaded.clone();
        let pending = Arc::new(Mutex::new(None));
        let next = pending.clone();
        let error = Arc::new(Mutex::new(None));
        let errors = error.clone();
        let (signal, rx) = mpsc::sync_channel(1);
        std::thread::Builder::new()
            .name("panel-preferences".into())
            .spawn(move || {
                let dir = std::env::var_os("OPENCODEX_DATA_DIR")
                    .map(std::path::PathBuf::from)
                    .or_else(|| {
                        std::env::var_os("HOME")
                            .map(|h| std::path::PathBuf::from(h).join(".opencodex/rune"))
                    });
                let path = dir.as_ref().map(|p| p.join("panels.json"));
                let read = || -> Result<Saved, String> {
                    let Some(path) = &path else {
                        return Ok(Saved::new());
                    };
                    match std::fs::read(path) {
                        Ok(bytes) if bytes.len() <= 1024 * 1024 => serde_json::from_slice(&bytes)
                            .map_err(|e| format!("Panel preferences: {e}")),
                        Ok(_) => Err("Panel preferences exceed 1 MiB".into()),
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Saved::new()),
                        Err(e) => Err(format!("Panel preferences: {e}")),
                    }
                };
                *out.lock().unwrap() = Some(read());
                wake();
                while rx.recv().is_ok() {
                    let Some(value) = next.lock().unwrap().take() else {
                        continue;
                    };
                    let write = || -> Result<(), String> {
                        let (Some(dir), Some(path)) = (&dir, &path) else {
                            return Ok(());
                        };
                        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
                        let bytes = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
                        let temp = dir.join("panels.json.new");
                        std::fs::write(&temp, bytes)
                            .and_then(|_| std::fs::rename(&temp, path))
                            .map_err(|e| e.to_string())
                    };
                    if let Err(e) = write() {
                        *errors.lock().unwrap() = Some(format!("Save panel preferences: {e}"));
                        wake();
                    }
                }
            })
            .expect("panel preferences worker");
        Self {
            loaded,
            error,
            pending,
            signal,
        }
    }
    pub fn save(&self, value: Saved) {
        *self.pending.lock().unwrap() = Some(value);
        let _ = self.signal.try_send(());
    }
}
use super::{
    Browser, ChatTabs, Operation, State, TextEdit, address_url, annotations, browser_key, canvas,
    web,
};

pub(super) fn sync_chat_tabs(s: &mut State) {
    if s.native.session == s.selected {
        return;
    }
    annotations::cancel(s);
    let n = &mut s.native;
    let old = ChatTabs {
        browsers: std::mem::take(&mut n.browsers),
        browser: n.browser,
        canvases: std::mem::take(&mut n.canvas_tabs),
        canvas: n.selected_canvas.take(),
    };
    for b in &old.browsers {
        b.web.hide();
    }
    let next = n.retained.remove(&s.selected);
    n.retained.insert(n.session.clone(), old);
    n.session = s.selected.clone();
    n.delete_canvas = None;
    n.list_loaded = false;
    if let Some(next) = next {
        n.browser = next.browser;
        n.canvas_tabs = next.canvases;
        n.selected_canvas = next.canvas;
        n.browsers = next.browsers;
    } else {
        restore_tabs(s);
    }
    s.native.tabs_dirty |= s.native.preferences_loaded;
}
pub(super) fn restore_tabs(s: &mut State) {
    let key = s
        .selected
        .clone()
        .unwrap_or_else(|| format!("directory:{}", s.workspace_directory()));
    let next = s.native.saved.get(&key).cloned().unwrap_or_default();
    s.native.browser = next.browser.min(next.browsers.len().saturating_sub(1));
    s.native.canvas_tabs = next
        .canvases
        .into_iter()
        .filter(|id| canvas::valid_id(id))
        .take(12)
        .collect();
    s.native.selected_canvas = next.canvas.filter(|id| s.native.canvas_tabs.contains(id));
    for url in next
        .browsers
        .into_iter()
        .filter_map(|url| address_url(if url.is_empty() { "about:blank" } else { &url }))
        .take(12)
    {
        let web = web(s, false);
        let error = if url.starts_with("file:") {
            None
        } else {
            web.load_url(&url).err()
        };
        s.native.browsers.push(Browser {
            key: browser_key(),
            web,
            address: TextEdit::new(if url == "about:blank" {
                String::new()
            } else {
                url.clone()
            }),
            error,
        });
        if url.starts_with("file:") {
            let key = s.native.browsers.last().unwrap().key;
            s.native_request(format!("browser-file:{key}"), Operation::LocalHTML(url));
        }
    }
}
fn browser_url(b: &Browser) -> String {
    let url = b.web.state().url;
    if url.is_empty() && b.address.text.is_empty() {
        "about:blank".into()
    } else if url.is_empty() {
        b.address.text.clone()
    } else {
        url
    }
}
fn saved(t: &ChatTabs) -> Tabs {
    Tabs {
        browsers: t.browsers.iter().map(browser_url).collect(),
        browser: t.browser,
        canvases: t.canvases.clone(),
        canvas: t.canvas.clone(),
    }
}
pub(super) fn save_tabs(s: &mut State) {
    for (id, tabs) in &s.native.retained {
        if let Some(id) = id {
            s.native.saved.insert(id.clone(), saved(tabs));
        }
    }
    let key = s
        .selected
        .clone()
        .unwrap_or_else(|| format!("directory:{}", s.workspace_directory()));
    s.native.saved.insert(
        key,
        Tabs {
            browsers: s.native.browsers.iter().map(browser_url).collect(),
            browser: s.native.browser,
            canvases: s.native.canvas_tabs.clone(),
            canvas: s.native.selected_canvas.clone(),
        },
    );
    while s.native.saved.len() > 128 {
        s.native.saved.pop_first();
    }
    if let Some(storage) = &s.native.storage {
        storage.save(s.native.saved.clone());
    }
}
