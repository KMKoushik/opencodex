//! Explicit, verified native updates. All network/archive/filesystem work is off the UI thread.
mod package;
pub mod view;
use crate::State;
use serde_json::{Value, json};
use std::{
    io::Write,
    sync::{Arc, Mutex, OnceLock, mpsc},
    time::{Duration, Instant},
};

pub type Pipe = Arc<Mutex<Option<std::process::ChildStdin>>>;
static COMMANDS: OnceLock<mpsc::SyncSender<String>> = OnceLock::new();
static STATE: Mutex<Option<Value>> = Mutex::new(None);
static PIPE: Mutex<Option<Pipe>> = Mutex::new(None);

pub fn command(action: &str) {
    if matches!(action, "check" | "download" | "install") {
        if let Some(send) = COMMANDS.get() {
            let _ = send.try_send(action.into());
        }
    }
}
pub fn attach(pipe: Pipe) {
    *PIPE.lock().unwrap() = Some(pipe);
    if let Some(state) = STATE.lock().unwrap().as_ref() {
        write_state(state);
    }
}
fn write_state(state: &Value) {
    let pipe = PIPE.lock().unwrap().clone();
    if let Some(pipe) = pipe {
        if let Some(stdin) = pipe.lock().unwrap().as_mut() {
            let _ = writeln!(stdin, "{}", json!({"update":state}));
        }
    }
}
fn publish(handle: &rune::AppHandle<State>, state: &Value) {
    *STATE.lock().unwrap() = Some(state.clone());
    write_state(state);
    let state = state.clone();
    handle.update(move |s, tx| {
        s.pages.data.insert("host/update".into(), Ok(state));
        if s.pages.route == crate::pages::Route::Settings("general".into()) {
            tx.instant();
        } else {
            tx.live_only();
        }
    });
}
pub fn start(handle: rune::AppHandle<State>) {
    let (send, receive) = mpsc::sync_channel::<String>(16);
    if COMMANDS.set(send).is_err() {
        return;
    }
    std::thread::spawn(move || {
        let installed = package::Installed::load();
        let version = installed
            .as_ref()
            .map(|i| i.version.as_str())
            .unwrap_or(env!("CARGO_PKG_VERSION"));
        let mut state = json!({"status":"idle","currentVersion":version});
        if let Err(reason) = &installed {
            state["status"] = json!("disabled");
            state["disabledReason"] = json!(reason);
        }
        publish(&handle, &state);
        let mut due = Instant::now() + Duration::from_secs(15);
        let mut release: Option<package::Release> = None;
        let mut staged: Option<package::Staged> = None;
        loop {
            let action = match receive.recv_timeout(due.saturating_duration_since(Instant::now())) {
                Ok(action) => action,
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    due = Instant::now() + Duration::from_secs(3600);
                    "check".into()
                }
                Err(_) => break,
            };
            let Ok(installed) = &installed else {
                continue;
            };
            let status = state["status"].as_str().unwrap_or("");
            let result = match action.as_str() {
                "check" if matches!(status, "idle" | "up-to-date" | "error") => {
                    state = json!({"status":"checking","currentVersion":installed.version});
                    publish(&handle, &state);
                    package::check(installed).map(|next| {
                        release = next;
                        state["status"] = json!(if release.is_some() {
                            "available"
                        } else {
                            "up-to-date"
                        });
                        if let Some(release) = &release {
                            state["version"] = json!(release.version);
                        }
                    })
                }
                "download" if status == "available" => {
                    state["status"] = json!("downloading");
                    state["percent"] = json!(0);
                    state.as_object_mut().unwrap().remove("error");
                    publish(&handle, &state);
                    package::download(installed, release.as_ref().unwrap(), |percent| {
                        state["percent"] = json!(percent);
                        publish(&handle, &state);
                    })
                    .map(|download| {
                        staged = Some(download);
                        state["status"] = json!("ready");
                        state.as_object_mut().unwrap().remove("percent");
                    })
                }
                "install" if status == "ready" => {
                    state["status"] = json!("installing");
                    state.as_object_mut().unwrap().remove("error");
                    publish(&handle, &state);
                    package::install(installed, staged.as_ref().unwrap()).map(|()| {
                        // Only explicit verified restart closes the UI and its gateway child.
                        handle.update(|s, tx| {
                            s.sidecar.take();
                            tx.quit();
                        });
                    })
                }
                _ => continue,
            };
            if let Err(error) = result {
                let fallback = if staged.is_some() {
                    "ready"
                } else if release.is_some() {
                    "available"
                } else {
                    "error"
                };
                state["status"] = json!(fallback);
                state["error"] = json!(error);
                state.as_object_mut().unwrap().remove("percent");
            }
            publish(&handle, &state);
        }
    });
}
