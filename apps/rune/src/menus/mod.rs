use crate::{State, sidebar::label};
use rune::{El, ScrollSpec, TextEdit, TextStyle, Tx, col, el, row, text_input};
pub mod native;
pub(crate) mod search;
pub(crate) mod thread;
#[derive(Clone)]
pub enum Menu {
    Search,
    Projects,
    Thread(String),
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
    pub pending: Option<String>,
    pub error: Option<String>,
    pub results: Vec<serde_json::Value>,
    pub search_pending: Option<String>,
    pub cursor: Option<String>,
    pub notice: Option<String>,
    pub search_revision: u64,
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
    s.menus.open = Some(Menu::Projects);
    s.menus.search.clear();
    tx.focus("navigation-search", false);
}
pub fn view(s: &State) -> Option<El> {
    let menu = s.menus.open.as_ref()?;
    if matches!(menu, Menu::Search) {
        return Some(search::dialog(s));
    }
    let t = &s.theme;
    let compact = matches!(menu, Menu::Thread(_) | Menu::Project(_) | Menu::Brand);
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
        Menu::Search => "Search threads",
        Menu::Projects => "Open project",
        Menu::Thread(_) => "Thread actions",
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
                .placeholder(
                    if matches!(menu, Menu::Search) {
                        "Search titles and messages…"
                    } else {
                        "Search…"
                    },
                    t.c("text-tertiary"),
                )
                .on_input_change(|s: &mut State, _| {
                    if matches!(s.menus.open, Some(Menu::Search)) {
                        search::load(s, false);
                    }
                })
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
                list = search::view(s, list);
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
        panel = thread::view(s, id, panel);
    }
    if let Menu::EditProject(id) = menu {
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
        let id = id.clone();
        panel = panel.child(button(s, "Save").on_press(move |s: &mut State| {
            let title = s.menus.search.text.trim().to_owned();
            if title.is_empty() {
                return;
            }
            s.page_write(
                &format!("projects/{id}"),
                "PATCH",
                serde_json::json!({"name":title}),
                "projects",
            );
            s.menus.open = None;
        }));
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
            .child(
                button(s, "Instructions")
                    .disabled(!s.snapshot.live)
                    .on_press(move |s: &mut State| {
                        s.menus.open = None;
                        s.pages.instructions_project = Some(instructions.clone());
                        s.page_get(&format!("projects/{instructions}/instructions"));
                        s.open_page(crate::pages::Route::Settings("projects".into()));
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
                    .on_press(move |s: &mut State| {
                        s.menus.open = None;
                        s.open_page(crate::pages::Route::Worktrees(work.clone()));
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
                if let Some(p) = s.snapshot.projects.iter().find(|p| p.id == close) {
                    s.prefs.closed_projects.push(p.canonical.clone());
                }
                s.menus.open = None;
                crate::sidebar::rebuild(s);
                s.save();
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
    let (x, y) = if compact {
        if matches!(menu, Menu::Brand) {
            (18.0, 80.0)
        } else {
            s.menus.point.unwrap_or((150.0, 380.0))
        }
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
            .child(t.shadow(panel, "shadow").absolute(
                x.min(s.window_size.0 - width - 8.0),
                y.min(s.window_size.1 - 300.0),
            )),
    )
}
