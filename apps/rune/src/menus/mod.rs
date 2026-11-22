use crate::{State, sidebar::label};
use rune::{El, ScrollSpec, TextEdit, TextStyle, Tx, col, el, row, text_input};
pub mod native;
#[derive(Clone)]
pub enum Menu {
    Search,
    Projects,
    Thread(String),
    Rename(String),
    Project(String),
    EditProject(String),
    Brand,
}
#[derive(Default)]
pub struct Menus {
    pub open: Option<Menu>,
    pub search: TextEdit,
    pub toast: Option<String>,
    pub toast_due: Option<f64>,
    pub point: Option<(f32, f32)>,
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
    tx.focus("navigation-search", false);
}
pub fn open_projects(s: &mut State, tx: &mut Tx) {
    s.menus.open = Some(Menu::Projects);
    s.menus.search.clear();
    tx.focus("navigation-search", false);
}
pub fn view(s: &State) -> Option<El> {
    let menu = s.menus.open.as_ref()?;
    let t = &s.theme;
    let compact = matches!(menu, Menu::Thread(_) | Menu::Project(_) | Menu::Brand);
    let width = if compact { 200.0 } else { 520.0 };
    let mut panel = col()
        .w(width)
        .max_h(520.0)
        .padding(if compact { 4.0 } else { 16.0 })
        .gap(if compact { 0.0 } else { 8.0 })
        .radius(if compact { 8.0 } else { 12.0 })
        .fill(t.c("elevated"))
        .border(1.0, t.c("border-heavy"));
    let title = match menu {
        Menu::Search => "Search threads",
        Menu::Projects => "Open project",
        Menu::Thread(_) => "Thread actions",
        Menu::Rename(_) => "Rename thread",
        Menu::Project(_) => "Project actions",
        Menu::EditProject(_) => "Edit project",
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
    if matches!(menu, Menu::Search | Menu::Projects) {
        panel = panel.child(
            text_input(&s.menus.search, TextStyle::new(13.0, 400.0))
                .key("navigation-search")
                .on_edit(|s: &mut State| &mut s.menus.search)
                .placeholder("Search…", t.c("text-tertiary"))
                .w_full()
                .h(36.0)
                .px(10.0)
                .color(t.c("text"))
                .border(1.0, t.c("border"))
                .radius(6.0),
        );
        let query = s.menus.search.text.to_lowercase();
        let mut list = col().w_full().max_h(380.0).gap(2.0).scroll(ScrollSpec {
            stick_bottom: false,
        });
        match menu {
            Menu::Search => {
                let mut threads: Vec<_> = s
                    .snapshot
                    .sessions
                    .values()
                    .filter(|v| v.title.to_lowercase().contains(&query))
                    .collect();
                threads.sort_by(|a, b| b.activity().total_cmp(&a.activity()));
                for thread in threads.into_iter().take(100) {
                    let id = thread.id.clone();
                    list = list.child(button(s, &thread.title).w_full().on_press(
                        move |s: &mut State| {
                            s.menus.open = None;
                            s.open_session(Some(id.clone()));
                        },
                    ));
                }
            }
            Menu::Projects => {
                for project in s
                    .snapshot
                    .projects
                    .iter()
                    .filter(|v| {
                        v.display_name().to_lowercase().contains(&query)
                            || v.canonical.to_lowercase().contains(&query)
                    })
                    .take(100)
                {
                    let path = project.canonical.clone();
                    list = list.child(button(s, project.display_name()).w_full().on_press(
                        move |s: &mut State| {
                            s.prefs.project = Some(path.clone());
                            s.prefs.closed_projects.retain(|p| p != &path);
                            s.menus.open = None;
                            s.open_session(None);
                            crate::sidebar::rebuild(s);
                            s.save();
                        },
                    ));
                }
                list = list.child(
                    button(s, "Choose folder…").on_press_tx(|s: &mut State, tx| {
                        s.menus.open = None;
                        tx.open_folder(
                            rune::FileDialogOptions {
                                title: "Open project".into(),
                                ..Default::default()
                            },
                            |s: &mut State, result, _| match result {
                                Ok(Some(path)) => s.command(oc_gateway::Command::AddProject(
                                    path.to_string_lossy().into_owned(),
                                )),
                                Err(e) => s.error = Some(e.to_string()),
                                _ => {}
                            },
                        );
                    }),
                );
            }
            _ => {}
        }
        panel = panel.child(list);
    }
    if let Menu::Thread(id) = menu {
        for (name, action) in [
            ("Rename", "rename"),
            ("Pin / unpin", "pin"),
            ("Mute / unmute", "mute"),
            ("Mark unread", "unread"),
            ("Fork thread", "fork"),
        ] {
            let id = id.clone();
            panel = panel.child(
                button(s, name).on_press(move |s: &mut State| thread_action(s, &id, action)),
            );
        }
        let id = id.clone();
        panel = panel.child(
            button(s, "Copy thread link").on_press_tx(move |s: &mut State, tx| {
                tx.copy(format!("opencodex://session/{id}"));
                s.menus.open = None;
                s.menus.toast = Some("Thread link copied".into());
                s.menus.toast_due = Some(tx.clock() + 2.0);
                tx.wake_after(std::time::Duration::from_secs(2));
            }),
        );
    }
    if let Menu::Rename(id) | Menu::EditProject(id) = menu {
        panel = panel.child(
            text_input(&s.menus.search, TextStyle::new(13.0, 400.0))
                .key("rename-input")
                .single_line()
                .on_edit(|s: &mut State| &mut s.menus.search)
                .w_full()
                .h(36.0)
                .px(10.0)
                .color(t.c("text"))
                .border(1.0, t.c("border"))
                .radius(6.0),
        );
        let project = matches!(menu, Menu::EditProject(_));
        let id = id.clone();
        panel = panel.child(button(s, "Save").on_press(move |s: &mut State| {
            let title = s.menus.search.text.trim().to_owned();
            if title.is_empty() {
                return;
            }
            if project {
                s.page_write(
                    &format!("projects/{id}"),
                    "PATCH",
                    serde_json::json!({"name":title}),
                    "projects",
                );
            } else {
                s.page_mutate(
                    &format!("sessions/{id}/action"),
                    serde_json::json!({"action":"rename","title":title}),
                    "sessions",
                    false,
                );
            }
            s.menus.open = None;
        }));
    }
    if let Menu::Project(id) = menu {
        let edit = id.clone();
        let work = id.clone();
        let close = id.clone();
        panel = panel
            .child(
                button(s, "Edit project").on_press_tx(move |s: &mut State, tx| {
                    s.menus.search = TextEdit::new(
                        s.snapshot
                            .projects
                            .iter()
                            .find(|p| p.id == edit)
                            .map(|p| p.display_name())
                            .unwrap_or(""),
                    );
                    s.menus.open = Some(Menu::EditProject(edit.clone()));
                    tx.focus("rename-input", false);
                }),
            )
            .child(button(s, "Worktrees").on_press(move |s: &mut State| {
                s.menus.open = None;
                s.open_page(crate::pages::Route::Worktrees(work.clone()));
            }))
            .child(button(s, "Close project").on_press(move |s: &mut State| {
                if let Some(p) = s.snapshot.projects.iter().find(|p| p.id == close) {
                    s.prefs.closed_projects.push(p.canonical.clone());
                }
                s.menus.open = None;
                crate::sidebar::rebuild(s);
                s.save();
            }));
        if let Some(p) = s.snapshot.projects.iter().find(|p| &p.id == id) {
            let path = p.canonical.clone();
            panel = panel.child(
                button(s, "Copy path").on_press_tx(move |s: &mut State, tx| {
                    tx.copy(path.clone());
                    s.menus.open = None;
                    s.menus.toast = Some("Project path copied".into());
                    s.menus.toast_due = Some(tx.clock() + 2.0);
                    tx.wake_after(std::time::Duration::from_secs(2));
                }),
            );
        }
    }
    if matches!(menu, Menu::Brand) {
        panel = panel.child(button(s, "Settings").on_press(|s: &mut State| {
            s.menus.open = None;
            s.open_page(crate::pages::Route::Settings("general".into()));
        }));
    }
    let (x, y) = if compact {
        s.menus.point.unwrap_or((150.0, 380.0))
    } else {
        ((s.window_size.0 - width) * 0.5, 100.0)
    };
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
            .child(panel.absolute(
                x.min(s.window_size.0 - width - 8.0),
                y.min(s.window_size.1 - 300.0),
            )),
    )
}
fn thread_action(s: &mut State, id: &str, action: &str) {
    let Some(thread) = s.snapshot.sessions.get(id) else {
        return;
    };
    let (path, body, refresh) = match action {
        "rename" => {
            s.menus.search = TextEdit::new(&thread.title);
            s.menus.open = Some(Menu::Rename(id.into()));
            return;
        }
        "pin" => (
            format!("sessions/{id}/focus"),
            serde_json::json!({"action":if thread.pinned.is_some(){"unpin"}else{"pin"}}),
            "sessions",
        ),
        "mute" => (
            format!("sessions/{id}/mute"),
            serde_json::json!({"muted":!thread.muted.unwrap_or(false)}),
            "sessions",
        ),
        "unread" => (
            format!("sessions/{id}/unread"),
            serde_json::json!({"action":"mark"}),
            "sessions",
        ),
        "fork" => (
            format!("sessions/{id}/action"),
            serde_json::json!({"action":"fork"}),
            "fork",
        ),
        _ => return,
    };
    s.page_mutate(&path, body, refresh, false);
    s.menus.open = None;
}
