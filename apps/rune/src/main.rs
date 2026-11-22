#![forbid(unsafe_code)]
mod apps;
mod assets;
mod chat;
mod composer;
mod docks;
mod find;
mod icons;
mod menus;
mod notifications;
mod pages;
mod profile;
mod settings;
mod shortcuts;
mod sidebar;
mod tasks;
mod theme;

#[cfg(test)]
mod runtime_tests;

use assets::Assets;
use oc_gateway::{Gateway, Snapshot, Worker};
use profile::{Preferences, Profile};
use rune::{AppSpec, Chrome, Cx, El, Tx, col, el, row};
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
    composer_state: String,
    page: String,
    size: (f32, f32),
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
    composer: composer::state::Composer,
    docks: docks::Docks,
    error: Option<String>,
    window_size: (f32, f32),
    waker: Option<rune::Waker>,
    chat_settle_due: Option<f64>,
    chat_settled: bool,
    pages: pages::Pages,
    menus: menus::Menus,
    find: find::Find,
    notifications: notifications::Notifications,
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
            composer: Default::default(),
            docks: Default::default(),
            error: None,
            window_size: options.size,
            waker: None,
            chat_settle_due: None,
            chat_settled: false,
            pages: Default::default(),
            menus: Default::default(),
            find: Default::default(),
            notifications: Default::default(),
        }
    }
    fn project(&self) -> Option<&oc_gateway::types::Project> {
        if self.pages.route == pages::Route::ProjectSetup {
            return None;
        }
        if let Some(session) = self
            .selected
            .as_ref()
            .and_then(|id| self.snapshot.sessions.get(id))
        {
            if let Some(project) = self.snapshot.projects.iter().find(|p| {
                session.project_id.as_deref() == Some(&p.id) || session.directory == p.canonical
            }) {
                return Some(project);
            }
        }
        self.prefs
            .project
            .as_ref()
            .and_then(|d| self.snapshot.projects.iter().find(|p| &p.canonical == d))
            .filter(|p| !self.prefs.closed_projects.contains(&p.canonical))
    }
    fn open_session(&mut self, id: Option<String>) {
        self.pages.route = pages::Route::Chat;
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
        self.composer.menu = None;
        self.docks = Default::default();
        if let Some(id) = &id {
            if let Some(thread) = self.snapshot.sessions.get(id) {
                self.prefs.project = Some(thread.directory.clone());
            }
            self.command(oc_gateway::Command::OpenSession(id.clone()));
            self.prompt_request(oc_gateway::prompt::Request::Get {
                tag: format!("info:{id}"),
                path: format!("sessions/{id}"),
                query: vec![],
            });
        }
        self.selected = id;
        self.refresh_docks();
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
            self.chat.disclosure_revision += 1;
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
        self.model_info()
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
    cx.web_focus();
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
        .child(
            if matches!(
                s.pages.route,
                pages::Route::Settings(_) | pages::Route::ProjectSetup
            ) || (s.pages.route == pages::Route::Chat
                && s.selected.is_none()
                && s.project().is_none())
            {
                el().w_full()
                    .h(40.0)
                    .window_drag()
                    .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
            } else if s.pages.route != pages::Route::Chat {
                row()
                    .w_full()
                    .h(40.0)
                    .px(20.0)
                    .center_y()
                    .window_drag()
                    .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
                    .child(sidebar::label(
                        t,
                        match s.pages.route {
                            pages::Route::Tasks => "Tasks",
                            pages::Route::Apps => "Apps",
                            _ => "",
                        },
                        13.0,
                        500.0,
                        "text",
                    ))
            } else {
                toolbar
            },
        )
        .child(col().grow(1.0).w_full().min_h(0.0).child(
            if s.pages.route == pages::Route::Chat && !s.snapshot.live && s.snapshot.error.is_some()
            {
                pages::offline::view(s)
            } else if s.pages.route == pages::Route::Chat {
                if s.selected.is_none() && s.project().is_none() {
                    settings::projects::setup(s)
                } else {
                    composer::view(s, w - width, h)
                }
            } else {
                pages::view(s)
            },
        ));
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
        shell = shell.child(rune::memo(
            "sidebar",
            (
                s.rows_revision,
                s.snapshot.revision,
                &s.selected,
                &s.pages.route,
                &s.pages.app,
                s.sidebar_width().to_bits(),
                s.prefs.focus,
            ),
            || sidebar::view(s),
        ));
    }
    shell = shell.child(main);
    if let Some(message) = &s.menus.toast {
        shell = shell.child(
            sidebar::label(t, message, 13.0, 400.0, "text")
                .padding(12.0)
                .fill(t.c("elevated"))
                .radius(8.0)
                .absolute(width + 24.0, h - 64.0),
        );
    }
    if let Some(menu) = menus::view(s) {
        shell = shell.child(menu);
    }
    if let Some(menu) = composer::menus::view(s) {
        shell = shell.child(menu);
    }
    if !s.prefs.sidebar_closed {
        shell = shell.child(sidebar::resize(width, h));
    }
    if let Some(preview) = chat::preview::view(s, w, h) {
        shell = shell.child(preview);
    }
    shell
}
fn poll(s: &mut State, clock: f64, tx: &mut Tx) -> bool {
    let task_minute = s.pages.tasks.minute;
    if let Some(worker) = &s.worker {
        let changes = worker.take_page_changes();
        pages::invalidate(s, changes);
    }
    pages::poll(s, clock, tx);
    notifications::clear_on_focus(s);
    let code_changed = apps::code::poll(s);
    let mut changed = settings::appearance::receive_color(s)
        || task_minute != s.pages.tasks.minute
        || code_changed;
    if s.menus.toast_due.is_some_and(|due| clock >= due) {
        s.menus.toast = None;
        s.menus.toast_due = None;
        changed = true;
    }
    let mut sidebar_changed = false;
    let mut chat_updated = false;
    if let Some(data) = s.worker.as_ref().and_then(Worker::take_messages) {
        if s.selected.as_deref() == Some(&data.session_id) {
            s.chat.accept(data);
            if s.find.open {
                find::refresh(s);
            }
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
        s.theme = settings::restored_theme(
            &s.prefs,
            s.pages.appearance.system_dark.unwrap_or(s.theme.dark),
        );
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
        notifications::snapshot(s, &snapshot);
        let reconnected = snapshot.live && !s.snapshot.live;
        let first_projects = s.snapshot.projects.is_empty() && !snapshot.projects.is_empty();
        s.snapshot = snapshot;
        if first_projects {
            sidebar::initialize(s);
        }
        if reconnected && s.pages.route != pages::Route::Chat {
            s.open_page(s.pages.route.clone());
        }
        if reconnected {
            pages::invalidate(s, vec!["all".into()]);
        }
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
    composer::menus::prefetch(s);
    if composer::state::poll(s) {
        changed = true;
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
            composer_state: value("--composer-state").unwrap_or_default(),
            page: value("--page").unwrap_or_default(),
            size: value("--size")
                .and_then(|v| {
                    let (w, h) = v.split_once('x')?;
                    Some((w.parse().ok()?, h.parse().ok()?))
                })
                .unwrap_or((1240.0, 840.0)),
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
        on_key: Some(shortcuts::global),
        ..AppSpec::new("OpenCodex", (1240.0, 840.0), State::new, view)
    };
    let app = menus::native::install(rune::App::new(spec))
        .args(args)
        .font_smoothing(rune::FontSmoothing::Off)
        .chrome(Chrome {
            full_size_content: true,
            traffic_lights: Some((16.0, 13.0)),
            drag_regions: true,
        });
    let handle = app.handle();
    let notify_handle = handle.clone();
    rune_notify::on_click(move |click| {
        if let Some(id) = click.get("session") {
            let id = id.to_owned();
            rune_notify::bring_to_front();
            notify_handle.update(move |s, _| s.open_session(Some(id.clone())));
        }
    });
    let bench = std::env::var("OPENCODEX_BENCH").as_deref() == Ok("1");
    #[cfg(unix)]
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
    let mut settled_geometry: Option<(String, usize, u32, u32)> = None;
    let settle_handle = handle.clone();
    let appearance_handle = handle.clone();
    let mut reply_marked = false;
    let mut reply_after = f64::MAX;
    app.init(|| {
        let mut s = State::new();
        if OPTIONS.get().unwrap().headless {
            if let Some(url) = &OPTIONS.get().unwrap().gateway {
                match Gateway::new(url, None).and_then(|client| {
                    oc_gateway::capture_directory(client, s.prefs.project.clone())
                }) {
                    Ok(mut snapshot) => {
                        snapshot.live = true;
                        s.snapshot = Arc::new(snapshot);
                    }
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
            composer::capture::setup(&mut s);
            sidebar::initialize(&mut s);
            if let Some(url) = &OPTIONS.get().unwrap().gateway {
                let url = url.clone();
                let result = std::thread::spawn(move || oc_gateway::capture_page(&url, "apps"))
                    .join()
                    .unwrap();
                pages::receive(&mut s, "page:apps", result);
            }
            settings::capture(&mut s);
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
                        composer::state::start(s, client.clone(), wake.clone());
                        s.page_get("apps");
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
        pages::after_frame(rt, &appearance_handle);
        let elements = if bench { rt.elements() } else { Vec::new() };
        if bench {
            if let Some(id) = &rt.state.selected {
                let mounted = elements.iter().any(|e| {
                    if e.visible[2] <= 0.0 || e.visible[3] <= 0.0 {
                        return false;
                    }
                    e.key
                        .as_ref()
                        .is_some_and(|key| rt.state.chat.rows.iter().any(|row| &row.id == key))
                });
                if mounted && session_marked.as_ref() != Some(id) {
                    reply_after = unix_ms() as f64;
                    reply_marked = false;
                    eprintln!("OPENCODEX_BENCH session_first_row {}", unix_ms());
                    eprintln!("OPENCODEX_BENCH session_loaded {}", unix_ms());
                    session_marked = Some(id.clone());
                }
                let position = rt.state.chat.position.get();
                let geometry = (
                    id.clone(),
                    rt.state.chat.rows.len(),
                    position.max[1].to_bits(),
                    position.viewport[1].to_bits(),
                );
                let geometry_changed = settled_geometry.as_ref() != Some(&geometry);
                if mounted && geometry_changed && settled_marked.as_ref() != Some(id) {
                    settled_geometry = Some(geometry);
                    let id = id.clone();
                    settle_handle.update(move |s, tx| {
                        if s.selected.as_ref() != Some(&id) {
                            return;
                        }
                        s.chat_settled = false;
                        s.chat_settle_due = Some(tx.clock() + 0.5);
                        tx.wake_after(std::time::Duration::from_millis(500));
                        tx.live_only();
                    });
                }
                if mounted
                    && !geometry_changed
                    && rt.state.chat_settled
                    && settled_marked.as_ref() != Some(id)
                {
                    eprintln!("OPENCODEX_BENCH session_settled {}", unix_ms());
                    settled_marked = Some(id.clone());
                }
                if !reply_marked
                    && chat::rendered_reply(&elements, &rt.state.chat.data, reply_after)
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
            && elements
                .iter()
                .any(|e| e.key.as_deref().is_some_and(|k| k.starts_with("thread-")))
        {
            eprintln!("OPENCODEX_BENCH first_content {}", unix_ms());
            marked = true;
        }
    })
    .run();
}
