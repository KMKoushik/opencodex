use crate::{State, icons as i, theme::Theme};
use rune::{Color, El, GrowthSpec, ScrollSpec, TextStyle, col, el, icon, row, text};

#[derive(Clone)]
pub enum Item {
    Heading(String),
    Project(String),
    Session(String, bool),
    More(String),
    Gap(String),
    Inactive,
    MoreInactive,
    Note(String),
}
impl Item {
    pub fn key(&self) -> String {
        match self {
            Self::Heading(s) => format!("heading-{s}"),
            Self::Project(s) => format!("project-{s}"),
            Self::Session(s, _) => format!("session-{s}"),
            Self::More(s) => format!("more-{s}"),
            Self::Gap(s) => format!("gap-{s}"),
            Self::Inactive => "inactive".into(),
            Self::MoreInactive => "more-inactive".into(),
            Self::Note(s) => format!("note-{s}"),
        }
    }
}
pub fn rebuild(s: &mut State) {
    let mut rows = Vec::new();
    let mut pinned: Vec<_> = s
        .snapshot
        .sessions
        .values()
        .filter(|t| t.pinned.is_some())
        .collect();
    pinned.sort_by(|a, b| b.pinned.partial_cmp(&a.pinned).unwrap());
    if !pinned.is_empty() {
        rows.push(Item::Heading("Pinned".into()));
        rows.extend(pinned.iter().map(|t| Item::Session(t.id.clone(), false)));
        rows.push(Item::Gap("pinned".into()));
    }
    if s.prefs.focus {
        rows.push(Item::Heading("Focus".into()));
        let now = crate::unix_ms() as f64;
        let (mut recent, mut inactive): (Vec<_>, Vec<_>) = s
            .snapshot
            .sessions
            .values()
            .filter(|t| t.pinned.is_none())
            .partition(|t| {
                s.snapshot.active.contains(&t.id)
                    || s.snapshot.attention.contains_key(&t.id)
                    || (t.activity() >= now - 3.0 * 86400000.0
                        && t.done.is_none_or(|d| d < t.activity()))
            });
        recent.sort_by(|a, b| {
            let rank = |t: &oc_gateway::types::Session| {
                if s.snapshot.attention.contains_key(&t.id)
                    || (!s.snapshot.active.contains(&t.id) && t.unread())
                {
                    0
                } else if s.snapshot.active.contains(&t.id) {
                    1
                } else {
                    2
                }
            };
            rank(a)
                .cmp(&rank(b))
                .then(b.activity().total_cmp(&a.activity()))
        });
        rows.extend(recent.iter().map(|t| Item::Session(t.id.clone(), false)));
        if recent.is_empty() {
            rows.push(Item::Note("Nothing needs focus".into()));
        }
        rows.push(Item::Gap("focus".into()));
        rows.push(Item::Inactive);
        if s.inactive_open {
            inactive.sort_by(|a, b| b.activity().total_cmp(&a.activity()));
            rows.extend(
                inactive
                    .iter()
                    .take(s.inactive_visible)
                    .map(|t| Item::Session(t.id.clone(), false)),
            );
            if inactive.len() > s.inactive_visible {
                rows.push(Item::MoreInactive);
            }
            if inactive.is_empty() {
                rows.push(Item::Note("No inactive threads".into()));
            }
        }
    } else {
        rows.push(Item::Heading("Projects".into()));
        for project in &s.snapshot.projects {
            if s.prefs.closed_projects.contains(&project.canonical) {
                continue;
            }
            rows.push(Item::Project(project.id.clone()));
            if !s.folded.contains(&project.id) {
                let mut threads: Vec<_> = s
                    .snapshot
                    .sessions
                    .values()
                    .filter(|t| {
                        t.pinned.is_none()
                            && (t.directory == project.canonical
                                || (project.vcs.is_some()
                                    && t.project_id.as_ref() == Some(&project.id)))
                    })
                    .collect();
                threads.sort_by(|a, b| {
                    let at = |t: &oc_gateway::types::Session| {
                        if s.snapshot.active.contains(&t.id) {
                            t.updated_at
                        } else {
                            t.activity()
                        }
                    };
                    at(b).total_cmp(&at(a))
                });
                let limit = s.visible.get(&project.id).copied().unwrap_or(4);
                rows.extend(
                    threads
                        .iter()
                        .take(limit)
                        .map(|t| Item::Session(t.id.clone(), true)),
                );
                if threads.len() > limit
                    || s.snapshot.cursors.contains_key(&project.canonical)
                    || s.snapshot.project_cursors.contains_key(&project.id)
                {
                    rows.push(Item::More(project.id.clone()));
                }
                rows.push(Item::Gap(project.id.clone()));
            }
        }
    }
    s.rows = rows;
    s.rows_revision += 1;
}
/// React starts with only the current project's disclosure expanded.
pub fn initialize(s: &mut State) {
    let current = s.project().map(|p| p.id.clone());
    s.folded = s
        .snapshot
        .projects
        .iter()
        .filter(|p| Some(&p.id) != current.as_ref())
        .map(|p| p.id.clone())
        .collect();
}
pub fn label(t: &Theme, value: impl Into<String>, size: f32, weight: f32, token: &str) -> El {
    text(value)
        .font(TextStyle::new(size, weight).lh(size * 1.5))
        .color(t.c(token))
}
pub fn icon_button(t: &Theme, glyph: &'static rune::Icon, name: &str) -> El {
    icon_button_size(t, glyph, name, 16.0)
}
pub fn icon_button_size(t: &Theme, glyph: &'static rune::Icon, name: &str, size: f32) -> El {
    el().role("button")
        .label(name)
        .help(name)
        .focusable(true)
        .size(28.0, 28.0)
        .radius(7.0)
        .center()
        .hover(t.c("hover"))
        .child(icon(glyph, size).color(t.c("text-secondary")))
}
pub fn nav(t: &Theme, glyph: &'static rune::Icon, name: &str) -> El {
    nav_ink(t, glyph, name, "text")
}
fn nav_ink(t: &Theme, glyph: &'static rune::Icon, name: &str, ink: &str) -> El {
    row()
        .role("button")
        .label(name)
        .focusable(true)
        .w_full()
        .h(32.0)
        .px(8.0)
        .gap(9.0)
        .center_y()
        .radius(8.0)
        .hover(t.c("hover"))
        .child(icon(glyph, 16.0).color(t.c(ink)))
        .child(label(t, name, 13.5, 400.0, ink))
}
pub fn view(s: &State) -> El {
    let t = &s.theme;
    let header = row()
        .key("sidebar-header")
        .h(40.0)
        .w_full()
        .pl(88.0)
        .pr(8.0)
        .center_y()
        .justify_between()
        .window_drag()
        .child(
            row()
                .gap(2.0)
                .child(
                    icon_button_size(t, &i::BACK, "Go back", 14.0)
                        .on_press(|s: &mut State| s.navigate(false))
                        .dim(if s.history_index > 0 { 1.0 } else { 0.45 }),
                )
                .child(
                    icon_button_size(t, &i::FORWARD, "Go forward", 14.0)
                        .on_press(|s: &mut State| s.navigate(true))
                        .dim(if s.history_index + 1 < s.history.len() {
                            1.0
                        } else {
                            0.45
                        }),
                ),
        )
        .child(
            icon_button(t, &i::SIDEBAR, "Hide sidebar").on_press(|s: &mut State| {
                s.prefs.sidebar_closed = true;
                s.save();
            }),
        );
    let mut identity = row()
        .key("identity")
        .h(44.0)
        .w_full()
        .mb(4.0)
        .pl(8.0)
        .gap(5.0)
        .center_y();
    if let Some(a) = &s.assets {
        identity = identity
            .child(el().size(24.0, 24.0).pixels(a.small.pixels()))
            .child(el().size(96.0, 16.4).pixels(a.wordmark.pixels()));
    } else {
        identity = identity.child(el().size(125.0, 24.0));
    }
    identity = identity
        .child(
            icon_button_size(t, &i::DOWN, "App menu", 10.0)
                .on_press(|s: &mut State| s.menus.open = Some(crate::menus::Menu::Brand)),
        )
        .child(el().grow(1.0))
        .child(
            icon_button_size(t, &i::SEARCH, "Search threads", 15.0)
                .on_press_tx(|s: &mut State, tx| crate::menus::open_search(s, tx)),
        );
    if let crate::pages::Route::Settings(section) = &s.pages.route {
        return col()
            .key("sidebar")
            .w(s.sidebar_width())
            .h_full()
            .fill(t.c("surface-under"))
            .child(header)
            .child(
                col()
                    .w_full()
                    .px(10.0)
                    .child(identity)
                    .child(crate::settings::navigation(s, section)),
            );
    }
    let actions = col()
        .w_full()
        .mb(16.0)
        .child(nav(t, &i::EDIT, "New thread").on_press(|s: &mut State| {
            s.open_session(None);
        }))
        .child(
            nav(t, &i::FOLDER_OPEN, "Open project").on_press_tx(|s: &mut State, tx| {
                crate::menus::open_projects(s, tx);
            }),
        )
        .child(
            nav(t, &i::TASKS, "Tasks")
                .fill(if s.pages.route == crate::pages::Route::Tasks {
                    t.c("selected")
                } else {
                    rune::Color::TRANSPARENT
                })
                .on_press(|s: &mut State| s.open_page(crate::pages::Route::Tasks)),
        )
        .child(
            nav(t, &i::APPS, "Apps")
                .fill(
                    if s.pages.route == crate::pages::Route::Apps && s.pages.app.is_none() {
                        t.c("selected")
                    } else {
                        rune::Color::TRANSPARENT
                    },
                )
                .on_press(|s: &mut State| {
                    s.pages.app = None;
                    s.open_page(crate::pages::Route::Apps)
                }),
        )
        .child(crate::apps::sidebar(s));
    let list = col()
        .key("project-list")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(
            col()
                .key("sidebar-rows")
                .w_full()
                .growth(GrowthSpec::default())
                .virtual_rows(
                    s.rows.len(),
                    32.0,
                    |s: &State, n| s.rows[n].key().into(),
                    render_item,
                )
                .virtual_rows_version(s.rows_revision),
        );
    let footer = row()
        .h(40.0)
        .pt(8.0)
        .gap(2.0)
        .center_y()
        .child(
            nav_ink(t, &i::SETTINGS, "Settings", "text-secondary")
                .grow(1.0)
                .on_press(|s: &mut State| {
                    s.open_page(crate::pages::Route::Settings("general".into()))
                }),
        )
        .child(
            icon_button(t, &i::USAGE, "Usage limits").on_press(|s: &mut State| {
                s.open_page(crate::pages::Route::Settings("usage".into()))
            }),
        );
    col()
        .key("sidebar")
        .w(s.sidebar_width())
        .h_full()
        .min_h(0.0)
        .fill(t.c("surface-under"))
        .child(header)
        .child(
            col()
                .grow(1.0)
                .w_full()
                .min_h(0.0)
                .px(10.0)
                .pb(10.0)
                .child(identity)
                .child(actions)
                .child(list)
                .child(footer),
        )
}
fn render_item(s: &State, n: usize) -> El {
    let t = &s.theme;
    match &s.rows[n] {
        Item::Heading(title) => {
            let heading = row()
                .w_full()
                .h(28.0)
                .pl(8.0)
                .pr(2.0)
                .center_y()
                .justify_between()
                .child(label(t, title, 12.0, 500.0, "text-tertiary"));
            if title == "Pinned" {
                heading
            } else {
                heading.child(icon_button_size(t, &i::INBOX, "Focus view", 14.0).on_press(
                    |s: &mut State| {
                        s.prefs.focus = !s.prefs.focus;
                        rebuild(s);
                        s.save();
                    },
                ))
            }
        }
        Item::Inactive => row()
            .w_full()
            .h(28.0)
            .pl(8.0)
            .gap(4.0)
            .center_y()
            .role("button")
            .label("Inactive")
            .expanded(s.inactive_open)
            .focusable(true)
            .child(label(t, "Inactive", 12.0, 500.0, "text-tertiary"))
            .child(
                icon(if s.inactive_open { &i::DOWN } else { &i::RIGHT }, 12.0)
                    .color(t.c("text-tertiary")),
            )
            .on_press(|s: &mut State| {
                s.inactive_open = !s.inactive_open;
                rebuild(s);
            }),
        Item::MoreInactive => row()
            .w_full()
            .h(32.0)
            .pl(8.0)
            .center_y()
            .role("button")
            .label("Show more")
            .focusable(true)
            .radius(8.0)
            .hover(t.c("hover"))
            .child(label(t, "Show more", 13.0, 400.0, "text-tertiary"))
            .on_press(|s: &mut State| {
                s.inactive_visible += 10;
                rebuild(s);
            }),
        Item::Note(note) => label(t, note, 12.0, 400.0, "text-tertiary")
            .w_full()
            .py(6.0)
            .px(8.0),
        Item::Gap(_) => el().w_full().h(14.0),
        Item::Project(id) => {
            let Some(p) = s.snapshot.projects.iter().find(|p| &p.id == id) else {
                return el();
            };
            let id = id.clone();
            let close = id.clone();
            let new = id.clone();
            row()
                .key(format!("folder-{id}"))
                .w_full()
                .h(36.0)
                .pt(4.0)
                .hover_group()
                .center_y()
                .child(
                    row()
                        .role("treeitem")
                        .label(p.display_name())
                        .expanded(!s.folded.contains(&id))
                        .focusable(true)
                        .grow(1.0)
                        .min_w(0.0)
                        .h(32.0)
                        .px(8.0)
                        .gap(8.0)
                        .center_y()
                        .radius(8.0)
                        .hover(t.c("hover"))
                        .child(
                            el().size(16.0, 16.0)
                                .child(
                                    icon(&i::FOLDER, 16.0)
                                        .color(t.c("text-secondary"))
                                        .absolute(0.0, 0.0)
                                        .group_opacity(1.0, 0.0),
                                )
                                .child(
                                    icon(
                                        if s.folded.contains(&id) {
                                            &i::RIGHT
                                        } else {
                                            &i::DOWN
                                        },
                                        12.0,
                                    )
                                    .color(t.c("text-secondary"))
                                    .absolute(2.0, 2.0)
                                    .group_opacity(0.0, 1.0),
                                ),
                        )
                        .child(label(t, p.display_name(), 13.0, 400.0, "text-secondary").truncate())
                        .on_press(move |s: &mut State| {
                            let expanding = s.folded.remove(&id);
                            if !expanding {
                                s.folded.insert(id.clone());
                            }
                            if expanding
                                && let Some(p) = s.snapshot.projects.iter().find(|p| p.id == id)
                            {
                                s.prefs.project = Some(p.canonical.clone());
                            }
                            rebuild(s);
                            s.save();
                        }),
                )
                .child(
                    icon_button(t, &i::PLUS, &format!("New chat in {}", p.display_name()))
                        .w(24.0)
                        .group_opacity(0.0, 1.0)
                        .on_press(move |s: &mut State| {
                            if let Some(p) = s.snapshot.projects.iter().find(|p| p.id == new) {
                                s.prefs.project = Some(p.canonical.clone());
                            }
                            s.open_session(None);
                            s.folded.remove(&new);
                            rebuild(s);
                            s.save();
                        }),
                )
                .child(
                    icon_button(t, &i::CLOSE, &format!("Close project {}", p.display_name()))
                        .w(24.0)
                        .group_opacity(0.0, 1.0)
                        .on_press(move |s: &mut State| {
                            crate::settings::projects::close_project(s, &close);
                        }),
                )
        }
        Item::More(id) => {
            let id = id.clone();
            row()
                .w_full()
                .h(33.0)
                .pl(32.0)
                .center_y()
                .role("button")
                .label("Show more")
                .focusable(true)
                .radius(8.0)
                .hover(t.c("hover"))
                .child(label(t, "Show more", 13.0, 400.0, "text-tertiary"))
                .on_press(move |s: &mut State| {
                    *s.visible.entry(id.clone()).or_insert(4) += 4;
                    if let Some(p) = s.snapshot.projects.iter().find(|p| p.id == id) {
                        if s.snapshot.cursors.contains_key(&p.canonical)
                            || s.snapshot.project_cursors.contains_key(&p.id)
                        {
                            s.command(oc_gateway::Command::More(p.canonical.clone()));
                        }
                    }
                    rebuild(s);
                })
        }
        Item::Session(id, nested) => {
            let actions = id.clone();
            let thread = &s.snapshot.sessions[id];
            let active = s.snapshot.active.contains(id);
            let selected = s.selected.as_ref() == Some(id);
            let id = id.clone();
            let worktree = *nested
                && s.snapshot
                    .projects
                    .iter()
                    .find(|p| thread.project_id.as_ref() == Some(&p.id))
                    .is_some_and(|p| thread.directory != p.canonical);
            let mut r = row()
                .key(format!("thread-{id}"))
                .on_secondary_press(move |s: &mut State, point, _| {
                    s.menus.point = Some((point.x, point.y));
                    s.menus.open = Some(crate::menus::Menu::Thread(actions.clone()))
                })
                .role("listitem")
                .label(&thread.title)
                .focusable(true)
                .w_full()
                .h(32.0)
                .pl(if *nested { 32.0 } else { 8.0 })
                .pr(8.0)
                .gap(9.0)
                .center_y()
                .radius(6.0)
                .fill(if selected {
                    t.c("selected")
                } else {
                    Color::TRANSPARENT
                })
                .focus_selected(selected)
                .hover(if selected {
                    Color::TRANSPARENT
                } else {
                    t.c("hover")
                });
            if !nested {
                let project = s
                    .snapshot
                    .projects
                    .iter()
                    .find(|p| thread.project_id.as_ref() == Some(&p.id));
                if let Some(project) = project {
                    r = r.child(project_badge(t, project));
                }
            }
            r = r.child(
                label(
                    t,
                    &thread.title,
                    13.0,
                    400.0,
                    if selected { "text" } else { "text-secondary" },
                )
                .grow(1.0)
                .min_w(0.0)
                .truncate_fade(),
            );
            if worktree {
                r = r.child(icon(&i::WORKTREE, 14.0).color(t.c("text-tertiary")));
            }
            let attention = (!nested)
                .then(|| s.snapshot.attention.get(&thread.id))
                .flatten();
            if let Some(kind) = attention {
                r = r.child(
                    el().size(14.0, 14.0)
                        .radius(7.0)
                        .center()
                        .fill(t.c(if kind == "permission" {
                            "warning"
                        } else {
                            "accent"
                        }))
                        .child(label(
                            t,
                            if kind == "permission" { "!" } else { "?" },
                            10.0,
                            700.0,
                            if kind == "permission" {
                                "surface"
                            } else {
                                "on-accent"
                            },
                        )),
                );
            } else if active {
                r = r.child(
                    icon(&RUNNING, 10.0)
                        .color(t.c("text-secondary"))
                        .looping(rune::LoopSpec::rotation(0.9)),
                );
            }
            if thread.unread() && !active && attention.is_none() {
                r = r.child(el().size(6.0, 6.0).radius(3.0).fill(t.c("accent")));
            }
            if active && thread.unread.is_some() && attention.is_none() {
                r = r.child(
                    el().size(4.0, 4.0)
                        .radius(2.0)
                        .fill(t.c("accent"))
                        .absolute(s.sidebar_width() - 32.0, 18.0),
                );
            }
            col()
                .h(33.0)
                .w_full()
                .child(r.on_press(move |s: &mut State| {
                    if let Some(t) = s.snapshot.sessions.get(&id) {
                        s.prefs.project = Some(t.directory.clone());
                    }
                    s.open_session(Some(id.clone()));
                    s.save();
                }))
        }
    }
}
fn project_badge(t: &Theme, p: &oc_gateway::types::Project) -> El {
    let color = p
        .icon
        .as_ref()
        .and_then(|i| i.color.as_deref())
        .filter(|c| matches!(*c, "gray" | "blue" | "green" | "orange" | "pink" | "purple"))
        .unwrap_or("gray");
    el().size(16.0, 16.0)
        .radius(4.0)
        .center()
        .fill(t.c(&format!("project-{color}")))
        .border(1.0, t.c("border-heavy"))
        .child(label(
            t,
            p.display_name()
                .trim()
                .chars()
                .next()
                .unwrap_or('?')
                .to_uppercase()
                .collect::<String>(),
            10.0,
            500.0,
            "on-project",
        ))
}
const RUNNING: rune::Icon = rune::Icon {
    name: "running",
    view: 10.0,
    body: r##"<circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/><path d="M5 .75 A4.25 4.25 0 0 1 9.25 5" fill="none" stroke="currentColor" stroke-width="1.5"/>"##,
};
pub fn resize(width: f32, height: f32) -> El {
    el().key("sidebar-resize")
        .role("separator")
        .label("Resize sidebar")
        .focusable(true)
        .size(8.0, height)
        .absolute(width - 4.0, 0.0)
        .cursor(rune::Cursor::ResizeColumn)
        .on_double_press(|s: &mut State| {
            s.prefs.sidebar_width = Some(300.0);
            s.save();
        })
        .on_key(|s: &mut State, event, tx| {
            let max = (s.window_size.0 - 360.0).clamp(200.0, 480.0);
            let next = match event.key {
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
                    (d.data + d.dx).clamp(200.0, (s.window_size.0 - 360.0).clamp(200.0, 480.0)),
                );
                tx.instant();
            }
            rune::Phase::Up => {
                if d.cancelled() {
                    s.prefs.sidebar_width = Some(d.data);
                }
                s.save();
            }
        })
}
