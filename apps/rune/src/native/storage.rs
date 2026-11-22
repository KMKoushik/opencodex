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
