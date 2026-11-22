use crate::{State, sidebar::label};
use rune::{El, TextEdit, Tx, col, el, row};
pub mod native;
pub(crate) mod overlay;
pub(crate) mod projects;
pub(crate) mod search;
pub(crate) mod thread;
#[derive(Clone)]
pub enum Menu {
    Choice(crate::pages::controls::Select),
    Search,
    Projects,
    Thread(String),
    Project(String),
    App(String),
    AppRun(String),
    Brand,
}
#[derive(Default)]
pub struct Menus {
    pub path_copy: rune::Latest<bool>,
    pub sidebar_current: Option<String>,
    pub sidebar_pages: crate::sidebar::pagination::Pagination,
    pub sidebar_scopes: Option<std::collections::BTreeSet<String>>,
    pub project_counts: std::collections::BTreeMap<String, usize>,
    pub sidebar_focus: Option<String>,
    pub thread_anchor: Option<(String, [f32; 4])>,
    pub thread_toolbar: bool,
    pub thread_menu_height: Option<(String, f32)>,
    pub open: Option<Menu>,
    pub search: TextEdit,
    pub search_before: Option<TextEdit>,
    pub toast: Option<String>,
    pub toast_due: Option<f64>,
    pub point: Option<(f32, f32)>,
    pub thread_pending: std::collections::BTreeSet<String>,
    pub thread_errors: std::collections::BTreeMap<String, String>,
    pub export_names: std::collections::BTreeMap<String, String>,
    pub export_ready: std::collections::VecDeque<thread::Download>,
    pub export_dialog: bool,
    pub connection_due: Option<f64>,
    pub search_due: Option<f64>,
    pub search_connected: bool,
    pub error: Option<String>,
    pub results: Vec<serde_json::Value>,
    pub search_pending: Option<String>,
    pub cursor: Option<String>,
    pub notice: Option<String>,
    pub search_revision: u64,
    pub search_generation: u64,
    pub pagination: search::Pagination,
    pub projects: projects::Picker,
    pub focus: crate::sidebar::focus::Focus,
    pub selection: crate::sidebar::selection::Selection,
    pub images: crate::sidebar::images::Images,
}
fn button(s: &State, title: &str) -> El {
    row()
        .key(format!("menu-{title}"))
        .role("menuitem")
        .label(title)
        .focusable(true)
        .w_full()
        .h(match s.menus.open {
            Some(Menu::Project(_)) => 35.5,
            Some(Menu::Brand) => 31.5,
            _ => 32.0,
        })
        .px(10.0)
        .center_y()
        .radius(if matches!(s.menus.open, Some(Menu::Thread(_))) {
            4.0
        } else {
            5.0
        })
        .hover(s.theme.c("hover"))
        .focus_fill(s.theme.c("hover"))
        .no_focus_ring()
        .child(label(&s.theme, title, 13.0, 400.0, "text"))
}
pub fn project_height(s: &State, id: &str) -> f32 {
    let project = s.snapshot.projects.iter().find(|p| p.id == id);
    let count = 3
        + usize::from(project.is_some_and(|p| p.vcs.is_some()))
        + usize::from(project.is_some())
        + usize::from(project.is_some_and(|p| !s.prefs.closed_projects.contains(&p.canonical)));
    10.0 + count as f32 * 35.5
}
pub fn open_search(s: &mut State, tx: &mut Tx) {
    if !search::connected(s) {
        return;
    }
    s.menus.open = Some(Menu::Search);
    s.menus.search_due = None;
    s.menus.search = Default::default();
    s.menus.search_generation = s.menus.search_generation.wrapping_add(1);
    s.menus.pagination = Default::default();
    s.menus.results.clear();
    s.menus.cursor = None;
    s.menus.error = None;
    search::load(s, false);
    tx.focus_when_shown("navigation-search", false);
}
pub fn open_projects(s: &mut State, tx: &mut Tx) {
    s.menus.open = None;
    s.open_session(None);
    s.prefs.project = None;
    s.pages.projects.dialog = None;
    s.pages.projects.directory.clear();
    s.pages.projects.error = None;
    s.pages.projects.suggesting = false;
    s.open_page(crate::pages::Route::ProjectSetup);
    s.save();
    tx.focus_when_shown("Project directory", false);
}
pub fn switch_projects(s: &mut State, tx: &mut Tx) {
    projects::open(s, tx);
}
pub fn view(s: &State) -> Option<El> {
    if s.menus.focus.filter_open {
        return Some(crate::sidebar::focus::filter(s));
    }
    if let Some(Menu::Choice(menu)) = s.menus.open.as_ref() {
        return Some(crate::pages::controls::select_overlay(s, menu));
    }
    if let Some(dialog) = crate::settings::projects::dialog(s) {
        let dialog = if matches!(
            s.pages.projects.dialog,
            Some(crate::settings::projects::Dialog::Open(false))
        ) && s.pages.route == crate::pages::Route::Chat
        {
            dialog.focus_return("Switch project")
        } else {
            dialog
        };
        return Some(
            if let Some(folders) = crate::settings::projects::folder::overlay(s) {
                dialog.child(folders)
            } else {
                dialog
            },
        );
    }
    if let Some(dialog) = crate::apps::dialog(s) {
        return Some(dialog);
    }
    if let Some(folders) = crate::settings::projects::folder::overlay(s) {
        return Some(folders);
    }
    let menu = s.menus.open.as_ref()?;
    if matches!(menu, Menu::Search) {
        return Some(search::dialog(s));
    }
    if matches!(menu, Menu::Projects) {
        return Some(projects::view(s));
    }
    let t = &s.theme;
    let compact = matches!(
        menu,
        Menu::Thread(_) | Menu::Project(_) | Menu::App(_) | Menu::AppRun(_) | Menu::Brand
    );
    let width = if matches!(menu, Menu::Project(_)) {
        176.0
    } else if compact {
        180.0
    } else {
        520.0
    };
    let mut panel = col()
        .w(width)
        .max_h(520.0)
        .padding(if compact { 4.0 } else { 16.0 })
        .gap(if compact { 0.0 } else { 8.0 })
        .radius(if matches!(menu, Menu::Brand | Menu::Project(_)) {
            9.0
        } else if compact {
            8.0
        } else {
            12.0
        })
        .fill(t.c("elevated"))
        .border(
            1.0,
            t.c(if matches!(menu, Menu::Project(_)) {
                "border"
            } else {
                "border-heavy"
            }),
        )
        .border_layout();
    let title = match menu {
        Menu::Choice(_) => unreachable!(),
        Menu::Search => "Search threads",
        Menu::Projects => "Switch project",
        Menu::Thread(_) => "Thread actions",
        Menu::Project(_) => "Project actions",
        Menu::App(_) => "App actions",
        Menu::AppRun(_) => "Run a function",
        Menu::Brand => "OpenCodex",
    };
    if !compact {
        panel = panel.child(
            row()
                .w_full()
                .center_y()
                .child(label(t, title, 15.0, 600.0, "text").grow(1.0))
                .child(
                    button(s, "Close")
                        .w(56.0)
                        .on_press(|s: &mut State| s.menus.open = None),
                ),
        );
    }
    if let Menu::Thread(id) = menu {
        panel = thread::view(s, id, panel);
    }
    if let Menu::Project(id) = menu {
        let edit = id.clone();
        let work = id.clone();
        let close = id.clone();
        let open = id.clone();
        let instructions = id.clone();
        panel = panel
            .child(
                button(s, "Open project")
                    .disabled(!s.snapshot.live)
                    .on_press(move |s: &mut State| {
                        if let Some(project) = s.snapshot.projects.iter().find(|p| p.id == open) {
                            let path = project.canonical.clone();
                            s.prefs.project = Some(path.clone());
                            s.prefs.closed_projects.retain(|p| p != &path);
                            s.folded.remove(&open);
                        }
                        s.menus.open = None;
                        s.open_session(None);
                        crate::sidebar::rebuild(s);
                        s.save();
                    }),
            )
            .child(
                button(s, "Edit project").on_press_tx(move |s: &mut State, tx| {
                    crate::settings::projects::open(
                        s,
                        crate::settings::projects::Dialog::Edit(edit.clone()),
                        tx,
                    );
                }),
            )
            .child(
                button(s, "Instructions")
                    .disabled(!s.snapshot.live)
                    .on_press_tx(move |s: &mut State, tx| {
                        crate::settings::projects::open(
                            s,
                            crate::settings::projects::Dialog::Instructions(instructions.clone()),
                            tx,
                        );
                    }),
            );
        if s.snapshot
            .projects
            .iter()
            .find(|p| &p.id == id)
            .is_some_and(|p| p.vcs.is_some())
        {
            panel = panel.child(
                button(s, "Manage worktrees")
                    .disabled(!s.snapshot.live)
                    .on_press_tx(move |s: &mut State, tx| {
                        crate::settings::projects::open(
                            s,
                            crate::settings::projects::Dialog::Worktrees(work.clone()),
                            tx,
                        );
                    }),
            );
        }
        if let Some(p) = s.snapshot.projects.iter().find(|p| &p.id == id) {
            let path = p.canonical.clone();
            panel = panel.child(
                button(s, "Copy path").on_press_tx(move |s: &mut State, tx| {
                    s.menus.open = None;
                    if cfg!(target_os = "macos")
                        && !crate::OPTIONS.get().is_some_and(|o| o.headless)
                    {
                        if let Some(wake) = &s.waker {
                            s.menus.path_copy.set_waker(wake.clone());
                        }
                        s.menus
                            .path_copy
                            .request(path.clone(), |text| oc_native::clipboard::write(&text));
                    } else {
                        tx.copy(path.clone());
                        tx.read_clipboard(|s: &mut State, content, _| {
                            s.pages.project_notice = Some(
                                if content.text().is_empty() {
                                    "Could not copy project path."
                                } else {
                                    "Project path copied."
                                }
                                .into(),
                            );
                        });
                    }
                }),
            );
        }
        if s.snapshot
            .projects
            .iter()
            .find(|p| &p.id == id)
            .is_some_and(|p| !s.prefs.closed_projects.contains(&p.canonical))
        {
            panel = panel.child(button(s, "Close project").on_press(move |s: &mut State| {
                crate::sidebar::close_project(s, &close);
                s.menus.open = None;
            }));
        }
    }
    if matches!(menu, Menu::Brand) {
        for (section, name) in [
            ("projects", "Projects"),
            ("appearance", "Appearance"),
            ("shortcuts", "Shortcuts"),
            ("usage", "Usage"),
        ] {
            panel = panel.child(button(s, name).on_press(move |s: &mut State| {
                s.menus.open = None;
                s.open_page(crate::pages::Route::Settings(section.into()));
            }));
        }
    }
    if let Menu::App(_) = menu {
        for (name, kind) in [
            ("Change model…", "model"),
            ("Change icon…", "icon"),
            ("Delete app…", "delete"),
        ] {
            panel = panel.child(
                button(s, name)
                    .on_press_tx(move |s: &mut State, tx| crate::apps::open_dialog(s, kind, tx)),
            );
        }
    }
    if let Menu::AppRun(id) = menu {
        if let Some(app) = crate::pages::data(s, "apps")
            .and_then(serde_json::Value::as_array)
            .and_then(|apps| apps.iter().find(|a| a["id"] == *id))
        {
            for name in app["triggers"]
                .as_object()
                .into_iter()
                .flat_map(|t| t.keys())
            {
                let id = id.clone();
                let name = name.clone();
                panel = panel.child(
                    button(s, &format!("Run {name}"))
                        .disabled(
                            app["running"]
                                .as_array()
                                .is_some_and(|rs| rs.iter().any(|r| r == &name)),
                        )
                        .on_press(move |s: &mut State| {
                            crate::apps::run(s, &id, &name);
                            s.menus.open = None;
                        }),
                );
            }
        }
    }
    let (x, y) = if compact {
        if matches!(menu, Menu::Brand) {
            (18.0, 80.0)
        } else {
            s.menus.point.unwrap_or((150.0, 380.0))
        }
    } else {
        ((s.window_size.0 - width) * 0.5, 100.0)
    };
    if compact {
        panel = panel.on_key(compact_key);
    }
    let menu_height = if let Menu::Thread(id) = menu {
        let identity = format!(
            "{id}:{}:{}",
            s.menus.selection.picked.contains(id),
            s.menus.thread_errors.len()
        );
        let estimate = 10.0
            + 32.0
                * if s.menus.selection.picked.contains(id) {
                    2.0
                } else if thread::pickable(s, id) {
                    7.0
                } else {
                    6.0
                };
        let height = s
            .menus
            .thread_menu_height
            .as_ref()
            .filter(|(key, _)| key == &identity)
            .map(|(_, height)| *height)
            .unwrap_or(estimate);
        panel = panel.on_layout_tx(move |s: &mut State, rect, tx| {
            if s.menus
                .thread_menu_height
                .as_ref()
                .is_none_or(|(key, height)| key != &identity || (*height - rect[3]).abs() > 0.25)
            {
                s.menus.thread_menu_height = Some((identity.clone(), rect[3]));
                tx.instant();
            } else {
                tx.live_only();
            }
        });
        height
    } else {
        if matches!(menu, Menu::Brand) {
            136.0
        } else if let Menu::Project(id) = menu {
            project_height(s, id)
        } else {
            292.0
        }
    };
    let [x, y] = overlay::position(
        [x, y, 0.0, 0.0],
        [width, menu_height],
        s.window_size,
        rune::Side::Bottom,
        rune::Align::Start,
        0.0,
        overlay::Collision::Shift,
    );
    Some(
        el().key("navigation-overlay")
            .absolute(0.0, 0.0)
            .size(s.window_size.0, s.window_size.1)
            .modal(true, |s: &mut State| s.menus.open = None)
            .child(
                el().w_full()
                    .h_full()
                    .fill(if compact {
                        rune::Color::TRANSPARENT
                    } else {
                        t.c("scrim")
                    })
                    .on_press(|s: &mut State| s.menus.open = None),
            )
            .child(overlay::raised(t, panel).absolute(x, y)),
    )
}
fn compact_key(s: &mut State, event: &rune::KeyEvent, tx: &mut Tx) -> bool {
    let Some(menu) = s.menus.open.as_ref() else {
        return false;
    };
    let mut labels: Vec<String> = Vec::new();
    let back = match menu {
        Menu::Project(id) => {
            labels.extend(["Open project", "Edit project", "Instructions"].map(str::to_owned));
            if s.snapshot
                .projects
                .iter()
                .find(|p| p.id == *id)
                .is_some_and(|p| p.vcs.is_some())
            {
                labels.push("Manage worktrees".into());
            }
            labels.push("Copy path".into());
            if s.snapshot
                .projects
                .iter()
                .find(|p| p.id == *id)
                .is_some_and(|p| !s.prefs.closed_projects.contains(&p.canonical))
            {
                labels.push("Close project".into());
            }
            format!("project-actions-{id}")
        }
        Menu::Thread(id) => {
            labels = thread::enabled_labels(s, id);
            format!("thread-{id}")
        }
        Menu::Brand => {
            labels.extend(["Projects", "Appearance", "Shortcuts", "Usage"].map(str::to_owned));
            "brand-menu".into()
        }
        Menu::App(id) => {
            labels.extend(["Change model…", "Change icon…", "Delete app…"].map(str::to_owned));
            format!("app-actions-{id}")
        }
        Menu::AppRun(id) => {
            if let Some(app) = crate::pages::data(s, "apps")
                .and_then(serde_json::Value::as_array)
                .and_then(|apps| apps.iter().find(|a| a["id"] == *id))
            {
                labels.extend(
                    app["triggers"]
                        .as_object()
                        .into_iter()
                        .flat_map(|t| t.keys())
                        .filter(|name| {
                            !app["running"]
                                .as_array()
                                .is_some_and(|rs| rs.iter().any(|r| r == *name))
                        })
                        .map(|name| format!("Run {name}")),
                );
            }
            format!("app-run-{id}")
        }
        _ => return false,
    };
    if matches!(event.key, rune::Key::Escape | rune::Key::Tab) {
        let back = if event.key == rune::Key::Tab {
            if let Menu::Thread(id) = menu {
                crate::sidebar::selection::tab_target(s, id, event.mods.shift)
            } else {
                back
            }
        } else {
            back
        };
        s.menus.open = None;
        tx.return_focus(back, true);
        return true;
    }
    if labels.is_empty() {
        return false;
    }
    let focused = tx.focused().unwrap_or("");
    let index = labels
        .iter()
        .position(|l| focused == format!("menu-{l}"))
        .map(|n| n as isize)
        .unwrap_or(-1);
    let next = match event.key {
        rune::Key::Down => ((index + 1) as usize) % labels.len(),
        rune::Key::Up => (index - 1).rem_euclid(labels.len() as isize) as usize,
        rune::Key::Home => 0,
        rune::Key::End => labels.len() - 1,
        _ => return false,
    };
    tx.focus(format!("menu-{}", labels[next]), true);
    true
}
