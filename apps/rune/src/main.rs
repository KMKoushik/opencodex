#![forbid(unsafe_code)]
mod assets;
mod composer;
mod icons;
mod profile;
mod sidebar;
mod theme;

#[cfg(test)]
mod runtime_tests;

use assets::Assets;
use oc_gateway::{Gateway, Snapshot, Worker};
use profile::{Preferences, Profile};
use rune::{AppSpec, Chrome, Cx, El, TextEdit, Tx, col, el, row};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, OnceLock};
use theme::Theme;

struct Options {
    gateway: Option<String>,
    preset: String,
    dark: bool,
    headless: bool,
}
static OPTIONS: OnceLock<Options> = OnceLock::new();
struct State {
    theme: Theme,
    snapshot: Arc<Snapshot>,
    worker: Option<Worker>,
    profile: Option<Profile>,
    prefs: Preferences,
    assets: Option<Assets>,
    rows: Vec<sidebar::Item>,
    rows_revision: u64,
    folded: BTreeSet<String>,
    visible: BTreeMap<String, usize>,
    inactive_open: bool,
    inactive_visible: usize,
    selected: Option<String>,
    draft: TextEdit,
    error: Option<String>,
    window_size: (f32, f32),
    waker: Option<rune::Waker>,
}
impl State {
    fn new() -> Self {
        let options = OPTIONS.get().expect("launch options");
        Self {
            theme: Theme::new(options.dark, &options.preset),
            snapshot: Arc::default(),
            worker: None,
            profile: None,
            prefs: Preferences {
                project: std::env::var("OPENCODEX_BENCH_PROJECT").ok(),
                ..Default::default()
            },
            assets: None,
            rows: Vec::new(),
            rows_revision: 0,
            folded: BTreeSet::new(),
            visible: BTreeMap::new(),
            inactive_open: false,
            inactive_visible: 10,
            selected: None,
            draft: TextEdit::new(""),
            error: None,
            window_size: (1240.0, 840.0),
            waker: None,
        }
    }
    fn project(&self) -> Option<&oc_gateway::types::Project> {
        self.prefs
            .project
            .as_ref()
            .and_then(|d| self.snapshot.projects.iter().find(|p| &p.canonical == d))
            .or_else(|| self.snapshot.projects.first())
    }
    fn sidebar_width(&self) -> f32 {
        self.prefs
            .sidebar_width
            .unwrap_or(300.0)
            .clamp(200.0, (self.window_size.0 - 360.0).clamp(200.0, 480.0))
    }
    fn save(&self) {
        if let Some(profile) = &self.profile {
            profile.save(self.prefs.clone());
        }
    }
    fn model_name(&self) -> &str {
        self.project()
            .and_then(|p| self.snapshot.models.get(&p.canonical))
            .and_then(|c| {
                c.default_model
                    .as_ref()
                    .and_then(|default| c.data.iter().find(|m| m.id == default.id))
            })
            .map(|m| m.name.as_str())
            .unwrap_or("Select model")
    }
    fn command(&mut self, command: oc_gateway::Command) {
        if let Some(worker) = &self.worker {
            if let Err(e) = worker.command(command) {
                self.error = Some(e);
            }
        }
    }
}
fn view(s: &State, cx: &mut Cx<State>) -> El {
    let t = &s.theme;
    cx.caption_color(if t.dark {
        t.c("text-secondary")
    } else {
        t.c("text")
    });
    let (w, h) = cx
        .layout_size("window")
        .map(|v| (v[0], v[1]))
        .unwrap_or(s.window_size);
    let width = if s.prefs.sidebar_closed {
        0.0
    } else {
        s.sidebar_width()
    };
    let title = s
        .selected
        .as_ref()
        .and_then(|id| s.snapshot.sessions.get(id))
        .map(|t| t.title.as_str())
        .unwrap_or("New thread");
    let mut toolbar = row()
        .key("toolbar")
        .h(40.0)
        .w_full()
        .px(20.0)
        .gap(8.0)
        .center_y()
        .window_drag()
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
        .border_layout();
    if s.prefs.sidebar_closed {
        toolbar = toolbar.pl(96.0).child(
            sidebar::icon_button(t, &icons::SIDEBAR, "Show sidebar").on_press(|s: &mut State| {
                s.prefs.sidebar_closed = false;
                s.save();
            }),
        );
    }
    if let Some(p) = s.project() {
        toolbar = toolbar
            .child(rune::icon(&icons::FOLDER, 14.0).color(t.c("text-secondary")))
            .child(sidebar::label(
                t,
                p.display_name(),
                13.0,
                400.0,
                "text-secondary",
            ))
            .child(sidebar::label(t, "/", 13.0, 400.0, "text-tertiary"));
    }
    toolbar = toolbar.child(sidebar::label(t, title, 13.0, 500.0, "text"));
    if let Some(error) = s.error.as_ref().or(s.snapshot.error.as_ref()) {
        toolbar = toolbar
            .child(el().grow(1.0))
            .child(sidebar::label(t, error, 12.0, 400.0, "error").truncate());
    }
    let main = col()
        .key("main")
        .grow(1.0)
        .h_full()
        .min_w(0.0)
        .min_h(0.0)
        .fill(t.c("surface"))
        .border_sides([0.0, 0.0, 0.0, 1.0], t.c("border"))
        .border_layout()
        .child(toolbar)
        .child(
            col()
                .grow(1.0)
                .w_full()
                .min_h(0.0)
                .child(composer::view(s, w - width, h)),
        );
    let mut shell = row()
        .key("window")
        .role("window")
        .w_full()
        .h_full()
        .fill(t.c("surface-under"))
        .on_layout_tx(|s: &mut State, r, tx| {
            s.window_size = (r[2], r[3]);
            tx.live_only();
        });
    if !s.prefs.sidebar_closed {
        shell = shell.child(sidebar::view(s));
    }
    shell = shell.child(main);
    if !s.prefs.sidebar_closed {
        shell = shell.child(
            el().key("sidebar-resize")
                .role("separator")
                .label("Resize sidebar")
                .focusable(true)
                .size(8.0, h)
                .absolute(width - 4.0, 0.0)
                .cursor(rune::Cursor::ResizeColumn)
                .on_double_press(|s: &mut State| {
                    s.prefs.sidebar_width = Some(300.0);
                    s.save();
                })
                .on_key(|s: &mut State, ev, tx| {
                    let max = (s.window_size.0 - 360.0).clamp(200.0, 480.0);
                    let next = match ev.key {
                        rune::Key::Left => s.sidebar_width() - 32.0,
                        rune::Key::Right => s.sidebar_width() + 32.0,
                        rune::Key::Home => 200.0,
                        rune::Key::End => max,
                        _ => return false,
                    };
                    s.prefs.sidebar_width = Some(next.clamp(200.0, max));
                    s.save();
                    tx.instant();
                    true
                })
                .on_drag(|s: &mut State, d, tx| match d.phase {
                    rune::Phase::Down => d.data = s.sidebar_width(),
                    rune::Phase::Move => {
                        s.prefs.sidebar_width = Some(
                            (d.data + d.dx)
                                .clamp(200.0, (s.window_size.0 - 360.0).clamp(200.0, 480.0)),
                        );
                        tx.instant();
                    }
                    rune::Phase::Up => {
                        if d.cancelled() {
                            s.prefs.sidebar_width = Some(d.data);
                        }
                        s.save();
                    }
                }),
        );
    }
    shell
}
fn poll(s: &mut State, _: f64, tx: &mut Tx) -> bool {
    let mut changed = false;
    if let Some(prefs) = s
        .profile
        .as_ref()
        .and_then(|p| p.loaded.lock().ok()?.take())
    {
        let bench = std::env::var("OPENCODEX_BENCH_PROJECT").ok();
        s.prefs = prefs;
        if bench.is_some() {
            s.prefs.project = bench;
        }
        changed = true;
    }
    if let Some(snapshot) = s.worker.as_ref().and_then(Worker::take) {
        if std::env::var("OPENCODEX_FRAME_LOG").as_deref() == Ok("1") {
            eprintln!(
                "OPENCODEX_SNAPSHOT {} {} {} {} {:?}",
                snapshot.sessions.len(),
                snapshot.active.len(),
                snapshot_digest(&snapshot),
                unix_ms(),
                snapshot.error
            );
        }
        s.snapshot = snapshot;
        changed = true;
        if let Some(directory) = s
            .project()
            .filter(|p| !s.snapshot.models.contains_key(&p.canonical))
            .map(|p| p.canonical.clone())
        {
            s.command(oc_gateway::Command::Details(directory));
        }
    }
    if changed {
        sidebar::rebuild(s);
        tx.instant();
    }
    changed
}
pub fn unix_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
fn snapshot_digest(snapshot: &Snapshot) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut digest = std::collections::hash_map::DefaultHasher::new();
    for thread in snapshot.sessions.values() {
        thread.title.hash(&mut digest);
    }
    digest.finish()
}
fn main() {
    rune::prewarm_gpu();
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    for arg in &mut args {
        if arg == "--screenshot" {
            *arg = "--snap".into();
        }
    }
    let value = |flag: &str| args.windows(2).find(|v| v[0] == flag).map(|v| v[1].clone());
    let dark = value("--theme").is_none_or(|t| t != "light");
    if args.iter().any(|a| a == "--list-presets") {
        for p in theme::presets(dark) {
            println!("{}\t{}", p.id, p.name);
        }
        return;
    }
    if args.iter().any(|a| a == "--dump-theme") {
        println!(
            "{}",
            serde_json::to_string(&Theme::new(dark, &value("--preset").unwrap_or_default()).tokens)
                .unwrap()
        );
        return;
    }
    let headless = args.iter().any(|a| {
        matches!(
            a.as_str(),
            "--snap" | "--tree" | "--frames" | "--first-pixels"
        )
    });
    OPTIONS
        .set(Options {
            gateway: std::env::var("OPENCODEX_GATEWAY").ok(),
            preset: value("--preset").unwrap_or_default(),
            dark,
            headless,
        })
        .ok();
    let spec = AppSpec {
        poll: Some(poll),
        setup: Some(|s, waker| s.waker = Some(waker)),
        fonts: &[],
        // CoreText calls SF Pro "System Font" / ".SF NS"; the web's -apple-system.
        families: (
            "System Font, .SF NS, Segoe UI, sans-serif",
            "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace",
        ),
        min_size: Some((760.0, 560.0)),
        on_key: Some(|s, ev, tx| {
            if rune::Chord::parse("mod+b").unwrap().matches_tx(ev, tx) {
                s.prefs.sidebar_closed = !s.prefs.sidebar_closed;
                s.save();
                return true;
            }
            if ev.is_command('n') {
                s.selected = None;
                tx.focus("message", false);
                return true;
            }
            false
        }),
        ..AppSpec::new("OpenCodex", (1240.0, 840.0), State::new, view)
    };
    let app = rune::App::new(spec)
        .args(args)
        .font_smoothing(rune::FontSmoothing::Off)
        .chrome(Chrome {
            full_size_content: true,
            traffic_lights: Some((16.0, 13.0)),
            drag_regions: true,
        });
    let handle = app.handle();
    let bench = std::env::var("OPENCODEX_BENCH").as_deref() == Ok("1");
    let frame_log = std::env::var("OPENCODEX_FRAME_LOG").as_deref() == Ok("1");
    let mut marked = false;
    app.init(|| {
        let mut s = State::new();
        if OPTIONS.get().unwrap().headless {
            if let Some(url) = &OPTIONS.get().unwrap().gateway {
                match Gateway::new(url, None).and_then(oc_gateway::capture) {
                    Ok(snapshot) => s.snapshot = Arc::new(snapshot),
                    Err(e) => {
                        eprintln!("{e}");
                        std::process::exit(1);
                    }
                }
            }
            s.assets = Some(Assets::load(&s.theme, Arc::new(|| {}), true));
            sidebar::rebuild(&mut s);
        }
        s
    })
    .on_ready(move |_| {
        handle.update(|s, tx| {
            if s.worker.is_some() {
                return;
            }
            tx.instant();
            let wake = s.waker.clone().expect("setup waker");
            s.assets = Some(Assets::load(&s.theme, wake.clone(), false));
            let profile_wake = wake.clone();
            s.profile = Some(Profile::start(move || profile_wake()));
            match &OPTIONS.get().unwrap().gateway {
                Some(url) => match Gateway::new(url, None) {
                    Ok(client) => {
                        s.worker = Some(Worker::start(client, s.prefs.project.clone(), move || {
                            wake()
                        }))
                    }
                    Err(e) => s.error = Some(e),
                },
                None => s.error = Some("Set OPENCODEX_GATEWAY to your gateway URL".into()),
            }
            // M5: spawn the bundled gateway on a free loopback port here, retain its child,
            // and stop only that child on quit. Never discover/start/stop OpenCode in Rust.
        });
    })
    .on_frame_encoded(move |frame| {
        if frame_log {
            eprintln!("OPENCODEX_FRAME {:?} {}", frame.outcome(), unix_ms());
        }
    })
    .on_frame_drawn(move |rt| {
        if frame_log {
            eprintln!(
                "OPENCODEX_SIDEBAR {} {} {}",
                rt.state.snapshot.sessions.len(),
                rt.state.snapshot.active.len(),
                snapshot_digest(&rt.state.snapshot)
            );
        }
        if bench
            && !marked
            && rt
                .elements()
                .iter()
                .any(|e| e.key.as_deref().is_some_and(|k| k.starts_with("thread-")))
        {
            eprintln!("OPENCODEX_BENCH first_content {}", unix_ms());
            marked = true;
        }
    })
    .run();
}
