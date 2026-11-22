#![forbid(unsafe_code)]
mod assets;
mod chat;
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
    session: Option<String>,
    scroll: String,
    work: Option<String>,
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
    chat: chat::Chat,
    history: Vec<Option<String>>,
    history_index: usize,
    draft: TextEdit,
    error: Option<String>,
    window_size: (f32, f32),
    waker: Option<rune::Waker>,
    chat_settle_due: Option<f64>,
    chat_settled: bool,
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
            chat: chat::Chat::default(),
            history: vec![None],
            history_index: 0,
            draft: TextEdit::new(""),
            error: None,
            window_size: (1240.0, 840.0),
            waker: None,
            chat_settle_due: None,
            chat_settled: false,
        }
    }
    fn project(&self) -> Option<&oc_gateway::types::Project> {
        self.prefs
            .project
            .as_ref()
            .and_then(|d| self.snapshot.projects.iter().find(|p| &p.canonical == d))
            .or_else(|| self.snapshot.projects.first())
    }
    fn open_session(&mut self, id: Option<String>) {
        if self.selected == id {
            return;
        }
        self.history.truncate(self.history_index + 1);
        self.history.push(id.clone());
        if self.history.len() > 64 {
            self.history.remove(0);
            self.history_index = self.history_index.saturating_sub(1);
        }
        self.history_index += 1;
        self.select_session(id);
    }
    fn select_session(&mut self, id: Option<String>) {
        self.chat = chat::Chat::default();
        if let Some(id) = &id {
            if let Some(thread) = self.snapshot.sessions.get(id) {
                self.prefs.project = Some(thread.directory.clone());
            }
            self.command(oc_gateway::Command::OpenSession(id.clone()));
        }
        self.selected = id;
    }
    fn navigate(&mut self, forward: bool) {
        let next = if forward {
            (self.history_index + 1).min(self.history.len() - 1)
        } else {
            self.history_index.saturating_sub(1)
        };
        if next != self.history_index {
            self.history_index = next;
            self.select_session(self.history[next].clone());
        }
    }
    fn load_earlier(&mut self) {
        if let Some(id) = self
            .selected
            .clone()
            .filter(|_| self.chat.data.cursor.is_some())
        {
            self.chat.loading_earlier = true;
            self.command(oc_gateway::Command::EarlierMessages(id));
        }
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
        .or_else(|| s.chat.data.info.as_ref().and_then(|i| i.title.as_deref()))
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
    if s.selected.is_some() {
        toolbar = toolbar.child(el().grow(1.0)).child(chat::toolbar(s));
    }
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
    if let Some(preview) = chat::preview::view(s, w, h) {
        shell = shell.child(preview);
    }
    shell
}
fn poll(s: &mut State, clock: f64, tx: &mut Tx) -> bool {
    let mut changed = false;
    let mut sidebar_changed = false;
    let mut chat_updated = false;
    if let Some(data) = s.worker.as_ref().and_then(Worker::take_messages) {
        if s.selected.as_deref() == Some(&data.session_id) {
            s.chat.accept(data);
            if let Some(info) = &s.chat.data.info {
                s.prefs.project = Some(info.location.directory.clone());
            }
            s.chat.media.request(
                s.chat.data.clone(),
                OPTIONS.get().unwrap().gateway.as_deref(),
                s.waker.clone(),
            );
            changed = true;
            chat_updated = true;
            s.chat_settled = false;
            s.chat_settle_due = Some(clock + 0.5);
            tx.wake_after(std::time::Duration::from_millis(500));
        }
    }
    if s.chat.media.take() {
        s.chat.disclosure_revision += 1;
        changed = true;
    }
    if s.chat.data.running {
        if s.chat.tick_due.is_none_or(|due| clock >= due) {
            s.chat.tick_due = Some(clock + 1.0);
            s.chat.now_ms = unix_ms() as f64;
            tx.wake_after(std::time::Duration::from_secs(1));
            changed = true;
        }
    } else {
        s.chat.tick_due = None;
    }
    if s.chat_settle_due.is_some_and(|due| clock >= due) {
        s.chat_settle_due = None;
        s.chat_settled = true;
        changed = true;
    }
    if s.selected.is_some() && !s.chat.rows.is_empty() {
        let at = s.chat.position.get();
        let away = at.max[1] - at.offset[1] > 40.0;
        if s.chat.jump != away {
            s.chat.jump = away;
            changed = true;
        }
        if at.viewport[1] > 0.0 && !s.chat.scroll_applied {
            let scroll = &OPTIONS.get().unwrap().scroll;
            if scroll == "top" {
                tx.scroll_to_instant(chat::scroll_key(s), 0.0, 0.0);
            }
            if scroll == "middle" {
                tx.scroll_to_instant(chat::scroll_key(s), 0.0, at.max[1] * 0.5);
            }
            s.chat.scroll_applied = true;
            changed = true;
        }
        if !chat_updated
            && s.worker.is_some()
            && at.viewport[1] > 0.0
            && at.offset[1] < 240.0
            && s.chat.scroll_applied
            && !s.chat.loading_earlier
            && s.chat.data.error.is_none()
            && s.chat.data.cursor.is_some()
        {
            s.load_earlier();
            changed = true;
        }
    }
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
        sidebar_changed = true;
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
        sidebar_changed = true;
        if let Some(directory) = s
            .project()
            .filter(|p| !s.snapshot.models.contains_key(&p.canonical))
            .map(|p| p.canonical.clone())
        {
            s.command(oc_gateway::Command::Details(directory));
        }
    }
    if sidebar_changed {
        sidebar::rebuild(s);
    }
    if changed {
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
            session: value("--session"),
            scroll: value("--scroll").unwrap_or_else(|| "bottom".into()),
            work: value("--work"),
        })
        .ok();
    if let Some(id) = value("--profile-chat") {
        let url = OPTIONS
            .get()
            .unwrap()
            .gateway
            .as_deref()
            .expect("OPENCODEX_GATEWAY");
        let ms = value("--probe-ms")
            .and_then(|v| v.parse().ok())
            .unwrap_or(1500);
        if let Err(error) = chat::probe::run(url, id, std::time::Duration::from_millis(ms)) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
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
                s.open_session(None);
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
    if bench && !headless {
        let signal_handle = handle.clone();
        std::thread::spawn(move || {
            if let Ok(mut signals) =
                signal_hook::iterator::Signals::new([signal_hook::consts::SIGUSR1])
            {
                for _ in signals.forever() {
                    if let Ok(id) = std::env::var("OPENCODEX_BENCH_SESSION") {
                        signal_handle.update(move |s, tx| {
                            s.open_session(Some(id.clone()));
                            tx.settle();
                        });
                    }
                }
            }
        });
    }
    let frame_log = std::env::var("OPENCODEX_FRAME_LOG").as_deref() == Ok("1");
    let mut marked = false;
    let mut session_marked: Option<String> = None;
    let mut settled_marked: Option<String> = None;
    let mut reply_marked = false;
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
            if let Some(id) = &OPTIONS.get().unwrap().session {
                s.selected = Some(id.clone());
                if let Some(thread) = s.snapshot.sessions.get(id) {
                    s.prefs.project = Some(thread.directory.clone());
                }
                if let Some(url) = &OPTIONS.get().unwrap().gateway {
                    match Gateway::new(url, None).and_then(|client| {
                        oc_gateway::capture_messages(
                            client,
                            id.clone(),
                            OPTIONS.get().unwrap().scroll != "bottom",
                        )
                    }) {
                        Ok(data) => s.chat.accept(Arc::new(data)),
                        Err(e) => {
                            eprintln!("{e}");
                            std::process::exit(1);
                        }
                    }
                    if let Err(error) = s.chat.media.capture(s.chat.data.clone(), url) {
                        s.error = Some(error);
                    }
                }
                if let Some(directory) = s.project().map(|p| p.canonical.clone()) {
                    if !s.snapshot.models.contains_key(&directory) {
                        // Capture-only snapshot details still run on a worker, never in a frame.
                        if let Some(url) = &OPTIONS.get().unwrap().gateway {
                            let client = Gateway::new(url, None).expect("capture gateway");
                            s.snapshot = Arc::new(
                                oc_gateway::capture_details(
                                    client,
                                    directory,
                                    (*s.snapshot).clone(),
                                )
                                .expect("capture details"),
                            );
                        }
                    }
                }
            }
            s.assets = Some(Assets::load(&s.theme, Arc::new(|| {}), true));
            if let Some(mode) = &OPTIONS.get().unwrap().work {
                s.chat.expand(mode);
            }
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
                        s.worker =
                            Some(Worker::start(client, s.prefs.project.clone(), move || {
                                wake()
                            }));
                        if let Some(id) = &OPTIONS.get().unwrap().session {
                            s.open_session(Some(id.clone()));
                        }
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
        if bench {
            if let Some(id) = &rt.state.selected {
                let mounted = rt.elements().iter().any(|e| {
                    if e.visible[2] <= 0.0 || e.visible[3] <= 0.0 {
                        return false;
                    }
                    e.key
                        .as_ref()
                        .is_some_and(|key| rt.state.chat.rows.iter().any(|row| &row.id == key))
                });
                if mounted && session_marked.as_ref() != Some(id) {
                    eprintln!("OPENCODEX_BENCH session_first_row {}", unix_ms());
                    eprintln!("OPENCODEX_BENCH session_loaded {}", unix_ms());
                    session_marked = Some(id.clone());
                }
                if mounted && rt.state.chat_settled && settled_marked.as_ref() != Some(id) {
                    eprintln!("OPENCODEX_BENCH session_settled {}", unix_ms());
                    settled_marked = Some(id.clone());
                }
                if !reply_marked
                    && rt.elements().iter().any(|e| {
                        e.path.contains(":text:")
                            && e.visible[2] > 0.0
                            && e.visible[3] > 0.0
                            && e.text.as_deref().is_some_and(|t| t.contains("BENCH-END"))
                    })
                {
                    eprintln!("OPENCODEX_BENCH reply_rendered {}", unix_ms());
                    reply_marked = true;
                }
            }
        }
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
