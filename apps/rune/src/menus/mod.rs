use crate::{State, sidebar::label};
use rune::{El, TextEdit, Tx, col, el, row};
pub mod native;
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
    pub open: Option<Menu>,
    pub search: TextEdit,
    pub toast: Option<String>,
    pub toast_due: Option<f64>,
    pub point: Option<(f32, f32)>,
    pub pending: Option<String>,
    pub error: Option<String>,
    pub results: Vec<serde_json::Value>,
    pub search_pending: Option<String>,
    pub cursor: Option<String>,
    pub notice: Option<String>,
    pub search_revision: u64,
    pub projects: projects::Picker,
}
fn button(s: &State, title: &str) -> El {
    row()
        .key(format!("menu-{title}"))
        .role("menuitem")
        .label(title)
        .focusable(true)
        .w_full()
        .h(32.0)
        .px(10.0)
        .center_y()
        .radius(5.0)
        .hover(s.theme.c("hover"))
        .child(label(&s.theme, title, 13.0, 400.0, "text"))
}
pub fn open_search(s: &mut State, tx: &mut Tx) {
    s.menus.open = Some(Menu::Search);
    s.menus.search.clear();
    s.menus.results.clear();
    s.menus.cursor = None;
    s.menus.error = None;
    search::load(s, false);
    tx.focus("navigation-search", false);
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
    if let Some(Menu::Choice(menu)) = s.menus.open.as_ref() {
        return Some(crate::pages::controls::select_overlay(s, menu));
    }
    if let Some(dialog) = crate::settings::projects::dialog(s) {
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
    let width = if compact { 180.0 } else { 520.0 };
    let mut panel = col()
        .w(width)
        .max_h(520.0)
        .padding(if compact { 4.0 } else { 16.0 })
        .gap(if compact { 0.0 } else { 8.0 })
        .radius(if matches!(menu, Menu::Brand) {
            9.0
        } else if compact {
            8.0
        } else {
            12.0
        })
        .fill(t.c("elevated"))
        .border(1.0, t.c("border-heavy"));
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
                    tx.copy(path.clone());
                    s.menus.open = None;
                    s.pages.project_notice = Some("Project path copied.".into());
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
                crate::settings::projects::close_project(s, &close);
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
            .child(t.shadow(panel, "shadow").absolute(
                x.min(s.window_size.0 - width - 8.0),
                y.min(s.window_size.1 - 300.0),
            )),
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
            if let Some(t) = s.snapshot.sessions.get(id) {
                if s.snapshot.live && s.menus.pending.is_none() {
                    labels.push(
                        if t.pinned.is_some() {
                            "Unpin thread"
                        } else {
                            "Pin thread"
                        }
                        .into(),
                    );
                    let done = t.done.is_some_and(|at| at >= t.activity());
                    if done || !s.snapshot.active.contains(id) {
                        labels.push(
                            if done {
                                "Mark as not done"
                            } else {
                                "Mark as done"
                            }
                            .into(),
                        );
                    }
                    labels.push("Mark as unread".into());
                    labels.push(
                        if t.muted.unwrap_or(false) {
                            "Unmute notifications"
                        } else {
                            "Mute notifications"
                        }
                        .into(),
                    );
                    labels.extend(["Export as Markdown", "Export as JSON"].map(str::to_owned));
                }
            }
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
        .unwrap_or(0);
    let next = match event.key {
        rune::Key::Down => (index + 1) % labels.len(),
        rune::Key::Up => (index + labels.len() - 1) % labels.len(),
        rune::Key::Home => 0,
        rune::Key::End => labels.len() - 1,
        _ => return false,
    };
    tx.focus(format!("menu-{}", labels[next]), true);
    true
}
