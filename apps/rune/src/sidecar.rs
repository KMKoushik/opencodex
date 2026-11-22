//! Own only the gateway child. OpenCode's lifecycle belongs to the gateway.
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{OnceLock, mpsc},
    time::{Duration, Instant},
};
static URL: OnceLock<String> = OnceLock::new();
pub fn url() -> Option<&'static str> {
    crate::OPTIONS
        .get()?
        .gateway
        .as_deref()
        .or_else(|| URL.get().map(String::as_str))
}
pub fn data_dir() -> PathBuf {
    std::env::var_os("OPENCODEX_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".opencodex/rune")
        })
}
pub struct Sidecar {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
}
impl Drop for Sidecar {
    fn drop(&mut self) {
        self.stdin.take();
        if let Some(mut child) = self.child.take() {
            std::thread::spawn(move || {
                let until = Instant::now() + Duration::from_secs(12);
                while Instant::now() < until {
                    if !matches!(child.try_wait(), Ok(None)) {
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                let _ = child.kill();
                let _ = child.wait();
            });
        }
    }
}
pub fn start(handle: rune::AppHandle<crate::State>) {
    std::thread::spawn(move || {
        let result = launch();
        handle.update(move |s, tx| {
            match result {
                Ok((child, client)) => {
                    s.sidecar = Some(child);
                    attach(s, client);
                }
                Err(error) => s.error = Some(error),
            }
            tx.instant();
        });
    });
}
pub fn attach(s: &mut crate::State, client: oc_gateway::Gateway) {
    let wake = s.waker.clone().expect("setup waker");
    crate::composer::state::start(s, client.clone(), wake.clone());
    s.worker = Some(oc_gateway::Worker::start(
        client,
        s.prefs.project.clone(),
        move || wake(),
    ));
    if let Some(id) = &crate::OPTIONS.get().unwrap().session {
        s.open_session(Some(id.clone()));
    }
}
fn executable() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let packaged = exe
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("Resources/opencodex-gateway"));
    if let Some(path) = packaged.filter(|p| p.is_file()) {
        return Ok(path);
    }
    for parent in exe.ancestors() {
        let path = parent.join("packages/gateway/dist/opencodex-gateway");
        if path.is_file() {
            return Ok(path);
        }
    }
    Err("Bundled gateway missing. Run bun run gateway:compile or set OPENCODEX_GATEWAY".into())
}
fn launch() -> Result<(Sidecar, oc_gateway::Gateway), String> {
    let path = executable()?;
    let env = shell_environment();
    let mut child = Command::new(path)
        .args(["--port", "0", "--parent-stdin"])
        .envs(env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Gateway launch: {e}"))?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let stdin = child.stdin.take();
    let owned = Sidecar {
        child: Some(child),
        stdin,
    };
    std::thread::spawn(move || drain_log(stderr));
    let (send, receive) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            match reader.by_ref().take(65536).read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if let Some(json) = line.strip_prefix("OPENCODEX_GATEWAY_READY ") {
                        let result = serde_json::from_str::<serde_json::Value>(json)
                            .ok()
                            .and_then(|v| v["url"].as_str().map(str::to_owned))
                            .ok_or_else(|| "Invalid gateway READY record".to_string());
                        let _ = send.try_send(result);
                    }
                }
            }
        }
    });
    let url = receive
        .recv_timeout(Duration::from_secs(20))
        .map_err(|e| format!("Gateway readiness: {e}; see gateway.log"))??;
    let client = oc_gateway::Gateway::new(&url, None)?;
    let _ = URL.set(url);
    crate::bench::mark("gateway_ready");
    oc_gateway::connect_blocking(&client)?;
    crate::bench::mark("gateway_connected");
    Ok((owned, client))
}
fn drain_log(mut input: impl Read) {
    let dir = data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("gateway.log");
    let mut log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok();
    let mut size = log
        .as_ref()
        .and_then(|f| f.metadata().ok())
        .map_or(0, |m| m.len());
    let mut buf = [0; 8192];
    while let Ok(n) = input.read(&mut buf) {
        if n == 0 {
            break;
        }
        if size + n as u64 > 1024 * 1024 {
            log.take();
            let _ = std::fs::rename(&path, dir.join("gateway.previous.log"));
            log = std::fs::File::create(&path).ok();
            size = 0;
        }
        if let Some(file) = &mut log {
            let _ = file.write_all(&buf[..n]);
        }
        size += n as u64;
    }
}
fn shell_environment() -> BTreeMap<String, String> {
    const NAMES: &[&str] = &[
        "PATH",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "SSH_AUTH_SOCK",
        "HOMEBREW_PREFIX",
        "HOMEBREW_CELLAR",
        "HOMEBREW_REPOSITORY",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
    ];
    const MARK: &str = "__OPENCODEX_ENV__";
    let print = NAMES
        .iter()
        .map(|name| format!("printf '%s=%s\\0' {name} \"${name}\""))
        .collect::<Vec<_>>()
        .join("; ");
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut values = BTreeMap::new();
    if let Ok(mut child) = Command::new(shell)
        .args([
            "-ilc",
            &format!("printf '{MARK}'; {print}; printf '{MARK}'"),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        let stdout = child.stdout.take().unwrap();
        let (send, recv) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stdout.take(1024 * 1024).read_to_end(&mut bytes);
            let _ = send.send(bytes);
        });
        let until = Instant::now() + Duration::from_secs(5);
        let mut success = false;
        while Instant::now() < until {
            match child.try_wait() {
                Ok(Some(status)) => {
                    success = status.success();
                    break;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(20)),
                Err(_) => break,
            }
        }
        if success {
            if let Ok(bytes) = recv.recv_timeout(Duration::from_millis(100)) {
                let text = String::from_utf8_lossy(&bytes);
                for pair in text.split(MARK).nth(1).unwrap_or("").split('\0') {
                    if let Some((key, value)) = pair.split_once('=') {
                        if NAMES.contains(&key)
                            && !value.is_empty()
                            && (key == "PATH" || std::env::var_os(key).is_none())
                        {
                            values.insert(key.to_string(), value.to_string());
                        }
                    }
                }
            }
        } else {
            let _ = child.kill();
        }
        let _ = child.wait();
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let fallback = format!(
        "{home}/.opencode/bin:/opt/homebrew/bin:/usr/local/bin:{home}/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    );
    let mut entries = Vec::new();
    for path in [
        std::env::var("PATH").ok(),
        values.get("PATH").cloned(),
        Some(fallback),
    ]
    .into_iter()
    .flatten()
    {
        for entry in path.split(':').filter(|p| !p.is_empty()) {
            if !entries.iter().any(|p| p == entry) {
                entries.push(entry.to_string());
            }
        }
    }
    values.insert("PATH".into(), entries.join(":"));
    values
}
