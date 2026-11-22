#![forbid(unsafe_code)]
mod apps;
mod assets;
mod bench;
mod chat;
mod composer;
mod docks;
mod docx;
mod find;
mod icons;
mod menus;
mod native;
mod notifications;
mod pages;
mod profile;
mod settings;
mod shortcuts;
mod sidebar;
mod sidecar;
mod tasks;
mod terminal;
mod theme;
mod updates;
mod workbench;

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
    panel: Option<String>,
    file: Option<String>,
    size: (f32, f32),
}
static OPTIONS: OnceLock<Options> = OnceLock::new();
struct State {
    theme: Theme,
    snapshot: Arc<Snapshot>,
    worker: Option<Worker>,
    sidecar: Option<sidecar::Sidecar>,
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
    workbench: workbench::Workbench,
    terminal: terminal::Drawer,
    native: native::Native,
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
            sidecar: None,
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
            workbench: Default::default(),
            terminal: Default::default(),
            native: Default::default(),
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
            .and_then(|d| {
                self.snapshot
                    .projects
                    .iter()
                    .chain(self.prefs.opened_projects.iter())
                    .find(|p| &p.canonical == d)
            })
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
        workbench::reset(self);
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
        if self.workbench.open {
            self.load_panel(false);
        }
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
    chat::comments::decorate(s, cx);
    native::coverage(s);
    cx.web_focus();
    // globals.css resets native outlines; individual web controls opt back in.
    cx.focus_ring(0.0, 0.0, rune::Color::TRANSPARENT);
    let t = &s.theme;
    cx.help_look(if matches!(s.pages.route, pages::Route::Settings(_)) {
        t.settings_help(s.window_size.0)
    } else {
        rune::HelpLook::system(t.dark)
    });
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
        .unwrap_or(if s.project().is_some() {
            "New thread"
        } else {
            "OpenCodex"
        });
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
        toolbar = toolbar.pl(96.0);
        if let Some(a) = &s.assets {
            toolbar = toolbar.child(el().size(24.0, 24.0).pixels(a.small.pixels()));
        }
        toolbar = toolbar.child(
            sidebar::icon_button(t, &icons::SIDEBAR_OPEN, "Show sidebar").on_press(
                |s: &mut State| {
                    s.prefs.sidebar_closed = false;
                    s.save();
                },
            ),
        );
    }
    if let Some(p) = s.project() {
        toolbar = toolbar
            .child(
                row()
                    .gap(6.0)
                    .center_y()
                    .min_w(0.0)
                    .shrink()
                    .child(rune::icon(&icons::FOLDER, 14.0).color(t.c("text-secondary")))
                    .child(
                        sidebar::label(t, p.display_name(), 13.0, 400.0, "text-secondary")
                            .truncate(),
                    )
                    .max_w(
                        rune::memo::layout_size("toolbar")
                            .map(|size| (size[0] - 40.0) * 0.3)
                            .unwrap_or((w - width - 40.0) * 0.3),
                    ),
            )
            .child(sidebar::label(t, "/", 13.0, 400.0, "text-tertiary").mx(2.0));
    }
    toolbar = toolbar.child(
        sidebar::label(t, title, 13.0, 500.0, "text")
            .px(if s.selected.is_some() { 5.0 } else { 0.0 })
            // Text is painted from the content inset, not align-items. Keep
            // the 30px title hit box and center its 19.5px line box explicitly.
            .py((30.0 - 19.5) / 2.0)
            .h(30.0)
            .truncate()
            .min_w(0.0),
    );
    if s.selected.is_some() {
        // CSS margin-left:auto doesn't add a flex child (and another gap).
        toolbar = toolbar
            .child(el().grow(1.0).ml(-8.0))
            .child(chat::toolbar(s));
    }
    if menus::search::connected(s)
        && !s.snapshot.live
        && matches!(
            s.pages.route,
            pages::Route::Chat | pages::Route::ProjectSetup
        )
    {
        toolbar = toolbar.child(
            sidebar::label(t, "Live updates paused", 12.0, 400.0, "text-tertiary").role("status"),
        );
    }
    if let Some(error) = s.error.as_ref() {
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
        .border_sides([0.0, 0.0, 0.0, 0.5], t.c("border"))
        .border_layout()
        .child(if matches!(s.pages.route, pages::Route::Settings(_)) {
            row()
                .w_full()
                .h(40.0)
                .px(20.0)
                .center_y()
                .window_drag()
                .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
                .child(if matches!(s.pages.route, pages::Route::Settings(_)) {
                    el()
                } else {
                    sidebar::label(t, "OpenCodex", 13.0, 500.0, "text")
                })
        } else if !matches!(
            s.pages.route,
            pages::Route::Chat | pages::Route::ProjectSetup
        ) {
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
        })
        .child(col().grow(1.0).w_full().min_h(0.0).child(
            if matches!(
                s.pages.route,
                pages::Route::Chat | pages::Route::ProjectSetup
            ) && !menus::search::connected(s)
            {
                pages::offline::view(s)
            } else if s.pages.route == pages::Route::Chat {
                if s.selected.is_none() && s.project().is_none() {
                    settings::projects::setup(s)
                } else {
                    composer::view(
                        s,
                        w - width
                            - s.panel_width()
                            - 0.5
                            - if s.selected.is_some() { 44.0 } else { 0.0 },
                        h,
                    )
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
    shell = shell.child(if s.pages.route == pages::Route::Chat {
        workbench::layout(s, main, cx)
    } else {
        main
    });
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
    shell = shell.child(chat::comments::editor(s));
    if let Some(dialog) = updates::view::dialog(s) {
        shell = shell.child(dialog);
    }
    shell
        .on_background_press(|s: &mut State| {
            composer::context::dispatch(s, composer::context::Event::Dismiss);
        })
        .on_key(|s: &mut State, event, _| {
            if event.key == rune::Key::Escape && s.chat.context {
                composer::context::dispatch(s, composer::context::Event::Dismiss);
                true
            } else {
                false
            }
        })
}
mod poll;
use poll::poll;
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
    bench::init();
    rune::prewarm_gpu();
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    for arg in &mut args {
        if arg == "--screenshot" {
            *arg = "--snap".into();
        }
    }
    let value = |flag: &str| {
        args.windows(2)
            .rev()
            .find(|v| v[0] == flag)
            .map(|v| v[1].clone())
    };
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
    let native_capture = if headless && std::env::var_os("OPENCODEX_CANVAS").is_some() {
        value("--snap").map(|screenshot| {
            let tree = value("--tree").unwrap_or_else(|| format!("{screenshot}.tree.json"));
            (screenshot, tree)
        })
    } else {
        None
    };
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
            panel: value("--panel"),
            file: value("--file"),
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
    if let Some((_, tree)) = &native_capture {
        if !args.iter().any(|a| a == "--tree") {
            args.extend(["--tree".into(), tree.clone()]);
        }
    }
    let spec = AppSpec {
        poll: Some(poll),
        setup: Some(|s, waker| s.waker = Some(waker)),
        fonts: &[],
        // CoreText calls SF Pro "System Font" / ".SF NS"; the web's -apple-system.
        families: (
            "System Font, .SF NS, Segoe UI, sans-serif",
            // CDP CSS.getPlatformFontsForNode resolves the web's mono stack to
            // Menlo on macOS. Rune's ui-monospace instead selects SF NS Mono.
            "Menlo, Consolas, Liberation Mono, monospace",
        ),
        min_size: Some((760.0, 560.0)),
        on_key: Some(|s, e, tx| {
            sidebar::selection::global(s, e, tx) || shortcuts::global(s, e, tx)
        }),
        ..AppSpec::new("OpenCodex", (1240.0, 840.0), State::new, view)
    };
    let app = menus::native::install(rune::App::new(spec))
        .on_ime(terminal::ime)
        .modifier_keys()
        .args(args)
        .font_smoothing(rune::FontSmoothing::Off)
        .chrome(Chrome {
            full_size_content: true,
            traffic_lights: Some((16.0, 13.0)),
            drag_regions: true,
        });
    let handle = app.handle();
    let window_handle = handle.clone();
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
    let mut frames = bench::Frames::default();
    app.init(|| {
        let mut s = State::new();
        if OPTIONS.get().unwrap().headless {
            pages::offline::capture(&mut s);
            if let Some(url) = OPTIONS
                .get()
                .unwrap()
                .gateway
                .as_ref()
                .filter(|_| menus::search::connected(&s))
            {
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
            sidebar::rebuild(&mut s);
            settings::capture(&mut s);
            if let Err(error) = workbench::capture(&mut s) {
                eprintln!("{error}");
                std::process::exit(1);
            }
            if std::env::var_os("OPENCODEX_TERMINAL_OPEN").is_some() && !s.terminal.open {
                if let Err(e) = terminal::capture(&mut s) {
                    eprintln!("{e}");
                    std::process::exit(1);
                }
            }
            if let Err(e) = native::capture(&mut s) {
                eprintln!("{e}");
                std::process::exit(1);
            }
            pages::offline::capture_state(&mut s);
            sidebar::rebuild(&mut s);
        }
        s
    })
    .on_window(move |w| {
        let w = w.clone();
        window_handle.update(move |s, _| native::attach_window(s, w.clone()));
    })
    .on_ready(move |_| {
        updates::start(handle.clone());
        if OPTIONS.get().unwrap().gateway.is_none() {
            sidecar::start(handle.clone());
        }
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
                        sidecar::attach(s, client);
                    }
                    Err(e) => s.error = Some(e),
                },
                None => {}
            }
        });
    })
    .on_frame_encoded(move |frame| {
        frames.encoded(frame);
        if frame_log {
            eprintln!("OPENCODEX_FRAME {:?} {}", frame.outcome(), unix_ms());
        }
    })
    .on_frame_drawn(move |rt| {
        bench::drawn();
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
                    bench::mark("session_first_row");
                    bench::mark("session_loaded");
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
                    bench::mark("session_settled");
                    settled_marked = Some(id.clone());
                }
                if !reply_marked
                    && chat::rendered_reply(&elements, &rt.state.chat.data, reply_after)
                {
                    bench::mark("reply_rendered");
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
            bench::mark("first_content");
            marked = true;
        }
    })
    .run();
    if let Some((screenshot, tree)) = native_capture {
        if let Err(error) = native::capture::composite(&screenshot, &tree) {
            eprintln!("native screenshot: {error}");
            std::process::exit(1);
        }
    }
}
