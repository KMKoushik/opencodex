//! Electron's OpenAppID catalogue and five-minute discovery cache, on the workbench worker.
use crate::{State, sidebar::label};
use rune::{Align, El, Side, col, icon, row};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const CATALOG: [(&str, &str, &str); 7] = [
    (
        "finder",
        "Finder",
        "/System/Library/CoreServices/Finder.app",
    ),
    ("terminal", "Terminal", "Terminal.app"),
    ("ghostty", "Ghostty", "Ghostty.app"),
    ("cursor", "Cursor", "Cursor.app"),
    ("zed", "Zed", "Zed.app"),
    ("vscode", "VS Code", "Visual Studio Code.app"),
    ("iterm", "iTerm", "iTerm.app"),
];
pub struct App {
    pub value: Value,
    pub icon: Option<rune::Image>,
}
fn execute(program: &str, args: &[&str]) -> Result<String, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        if start.elapsed() > Duration::from_secs(5) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Application discovery timed out.".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("{program} failed"));
    }
    if output.stdout.len() > 256 * 1024 {
        return Err("Application discovery output is too large.".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}
fn bundle(name: &str) -> Option<PathBuf> {
    if Path::new(name).is_absolute() {
        return Path::new(name).exists().then(|| name.into());
    }
    let home = std::env::var("HOME").unwrap_or_default();
    for base in [
        "/Applications".to_owned(),
        format!("{home}/Applications"),
        "/System/Applications".into(),
        "/System/Applications/Utilities".into(),
    ] {
        let path = Path::new(&base).join(name);
        if path.exists() {
            return Some(path);
        }
    }
    execute("/usr/bin/mdfind", &["-name", name])
        .ok()?
        .lines()
        .map(PathBuf::from)
        .find(|p| p.is_absolute() && p.ends_with(name) && p.exists())
}
fn preference() -> Option<PathBuf> {
    std::env::var_os("OPENCODEX_DATA_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".opencodex/rune")))
        .map(|p| p.join("open-in-app"))
}
pub fn discover() -> Result<Value, String> {
    static CACHE: OnceLock<Mutex<Option<(Instant, Value)>>> = OnceLock::new();
    let mut cache = CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|e| e.to_string())?;
    if let Some((at, value)) = &*cache {
        if at.elapsed() < Duration::from_secs(300) {
            let mut value = value.clone();
            value["selected"] = json!(preference().and_then(|p| std::fs::read_to_string(p).ok()));
            return Ok(value);
        }
    }
    let mut apps = Vec::new();
    for (id, label, name) in CATALOG {
        if let Some(path) = bundle(name) {
            apps.push(json!({"id":id,"label":label,"bundle":path,"icon":bundle_icon(&path)}));
        }
    }
    let selected = preference().and_then(|p| std::fs::read_to_string(p).ok());
    let value = json!({"__apps": apps, "selected":selected});
    *cache = Some((Instant::now(), value.clone()));
    Ok(value)
}
fn bundle_icon(bundle: &Path) -> Option<String> {
    use base64::Engine;
    let name = execute(
        "/usr/bin/plutil",
        &[
            "-extract",
            "CFBundleIconFile",
            "raw",
            "-o",
            "-",
            bundle.join("Contents/Info.plist").to_str()?,
        ],
    )
    .ok()?;
    if name.is_empty() || name.contains(['/', '\\']) {
        return None;
    }
    let source = bundle
        .join("Contents/Resources")
        .join(if name.ends_with(".icns") {
            name
        } else {
            format!("{name}.icns")
        });
    let temp = std::env::temp_dir().join(format!(
        "opencodex-app-icon-{}-{}.png",
        std::process::id(),
        super::worker::hash(&source.to_string_lossy())
    ));
    let result = execute(
        "/usr/bin/sips",
        &[
            "-s",
            "format",
            "png",
            "-Z",
            "32",
            source.to_str()?,
            "--out",
            temp.to_str()?,
        ],
    );
    let bytes = if result.is_ok() {
        std::fs::read(&temp).ok()
    } else {
        None
    };
    let _ = std::fs::remove_file(temp);
    bytes.map(|b| {
        format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(b)
        )
    })
}
pub fn open(directory: &str, id: &str) -> Result<Value, String> {
    if !Path::new(directory).is_absolute()
        || directory.contains('\0')
        || !Path::new(directory).is_dir()
    {
        return Err("Choose a project directory.".into());
    }
    let apps = discover()?;
    let app = apps["__apps"]
        .as_array()
        .and_then(|a| a.iter().find(|a| a["id"] == id))
        .ok_or("This application is not installed.")?;
    execute(
        "/usr/bin/open",
        &[
            "-a",
            app["bundle"]
                .as_str()
                .ok_or("This application is not installed.")?,
            "--",
            directory,
        ],
    )?;
    if let Some(path) = preference() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(path, id).map_err(|e| e.to_string())?;
    }
    Ok(json!({"selected":id}))
}
pub fn trigger(s: &State) -> El {
    let selected = s
        .workbench
        .open_apps
        .iter()
        .find(|a| a.value["id"] == s.workbench.selected_app)
        .or_else(|| s.workbench.open_apps.first());
    let glyph = selected
        .and_then(|a| a.icon.as_ref())
        .map(|image| {
            rune::el()
                .size(18.0, 18.0)
                .pixels_fit(image.pixels(), rune::SurfaceFit::Fit)
        })
        .unwrap_or_else(|| icon(&crate::chat::icons::OPEN, 18.0).color(s.theme.c("text-tertiary")));
    rune::el()
        .key("open-project-app")
        .size(36.0, 40.0)
        .center()
        .child(glyph)
        .role("button")
        .label("Open in…")
        .help("Open in…")
        .focusable(true)
        .expanded(s.workbench.apps_menu)
        .on_press(|s: &mut State| {
            s.workbench.apps_menu ^= true;
            s.workspace_request("open-apps".into(), super::worker::Operation::DiscoverApps);
        })
        .on_key(|s: &mut State, key, _| {
            if matches!(key.key, rune::Key::Up | rune::Key::Down) {
                s.workbench.apps_menu = true;
                s.workspace_request("open-apps".into(), super::worker::Operation::DiscoverApps);
                true
            } else {
                false
            }
        })
}
pub fn overlay(s: &State) -> El {
    if !s.workbench.apps_menu {
        return rune::el();
    }
    let t = &s.theme;
    let mut menu = col()
        .w(220.0)
        .padding(5.0)
        .radius(10.0)
        .fill(t.c("elevated"))
        .border(1.0, t.c("border-heavy"))
        .role("menu")
        .label("Open project in application")
        .child(
            super::documents::button(s, "Copy Path")
                .w_full()
                .role("menuitem")
                .key("open-app-copy")
                .autofocus()
                .on_press_tx(|s: &mut State, tx| {
                    tx.copy(s.workspace_directory());
                    s.workbench.apps_menu = false;
                    s.menus.toast = Some("Project path copied".into());
                    s.menus.toast_due = Some(tx.clock() + 2.0);
                    tx.wake_after(Duration::from_secs(2));
                }),
        );
    for app in &s.workbench.open_apps {
        let id = app.value["id"].as_str().unwrap_or("").to_owned();
        let glyph = app
            .icon
            .as_ref()
            .map(|image| {
                rune::el()
                    .size(16.0, 16.0)
                    .pixels_fit(image.pixels(), rune::SurfaceFit::Fit)
            })
            .unwrap_or_else(|| icon(&crate::icons::FOLDER, 16.0).color(t.c("text-secondary")));
        menu = menu.child(
            row()
                .h(32.0)
                .w_full()
                .gap(8.0)
                .px(8.0)
                .center_y()
                .radius(6.0)
                .hover(t.c("hover"))
                .child(glyph)
                .child(
                    label(
                        t,
                        app.value["label"].as_str().unwrap_or(""),
                        13.0,
                        400.0,
                        "text",
                    )
                    .grow(1.0),
                )
                .child(label(
                    t,
                    if id == s.workbench.selected_app {
                        "✓"
                    } else {
                        ""
                    },
                    13.0,
                    400.0,
                    "text",
                ))
                .role("menuitemradio")
                .checked(id == s.workbench.selected_app)
                .focusable(true)
                .key(format!("open-app-{id}"))
                .disabled(s.workbench.pending.contains("open-app"))
                .on_press(move |s: &mut State| {
                    s.workspace_request(
                        "open-app".into(),
                        super::worker::Operation::OpenApp {
                            directory: s.workspace_directory(),
                            id: id.clone(),
                        },
                    )
                }),
        );
    }
    if s.workbench.pending.contains("open-apps") {
        menu = menu.child(label(
            t,
            "Finding installed apps…",
            12.0,
            400.0,
            "text-secondary",
        ));
    }
    if let Some(error) = &s.workbench.apps_error {
        menu = menu.child(label(t, error, 12.0, 400.0, "error").wrap().role("alert"));
        menu = menu.child(
            super::documents::button(s, "Retry")
                .key("open-app-retry")
                .role("menuitem")
                .on_press(|s: &mut State| {
                    s.workspace_request("open-apps".into(), super::worker::Operation::DiscoverApps)
                }),
        );
    }
    t.shadow(
        menu.on_key(|s: &mut State, key, tx| {
            if matches!(key.key, rune::Key::Escape | rune::Key::Tab) {
                s.workbench.apps_menu = false;
                tx.focus("open-project-app", false);
                return true;
            }
            let mut keys = vec!["open-app-copy".to_owned()];
            keys.extend(
                s.workbench
                    .open_apps
                    .iter()
                    .filter_map(|a| a.value["id"].as_str().map(|id| format!("open-app-{id}"))),
            );
            if s.workbench.apps_error.is_some() {
                keys.push("open-app-retry".into());
            }
            let at = keys
                .iter()
                .position(|k| Some(k.as_str()) == tx.focused())
                .unwrap_or(0);
            let next = match key.key {
                rune::Key::Home => 0,
                rune::Key::End => keys.len() - 1,
                rune::Key::Down => (at + 1) % keys.len(),
                rune::Key::Up => (at + keys.len() - 1) % keys.len(),
                _ => return false,
            };
            tx.focus(keys[next].clone(), true);
            true
        })
        .anchored("open-project-app", Side::Left, Align::Start, 4.0)
        .modal(true, |s: &mut State| s.workbench.apps_menu = false),
        "shadow",
    )
}
