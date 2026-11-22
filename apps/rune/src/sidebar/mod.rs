use crate::{State, icons as i, theme::Theme};
use rune::{Color, El, GrowthSpec, ScrollSpec, TextStyle, col, el, icon, row, text};
pub(crate) mod focus;
mod glyphs;
pub(crate) mod images;
pub(crate) mod pagination;
mod shell;
mod visuals;
pub use shell::view;
use visuals::project_badge;
pub use visuals::resize;
pub(crate) mod selection;
#[cfg(test)]
mod tests;

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
    FocusRetry,
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
            Self::FocusRetry => "focus-retry".into(),
        }
    }
}
pub fn rebuild(s: &mut State) {
    if !crate::menus::search::connected(s) {
        s.rows.clear();
        s.rows_revision += 1;
        return;
    }
    images::request(s);
    if let Some((native_id, current)) = s.project().map(|p| {
        (
            p.id.clone(),
            oc_gateway::types::Project {
                id: format!("folder:{}", p.canonical),
                name: Some(p.display_name().into()),
                canonical: p.canonical.clone(),
                icon: None,
                vcs: None,
                time: Default::default(),
            },
        )
    }) {
        if s.menus.sidebar_current.as_deref() != Some(&current.canonical) {
            s.folded.remove(&native_id);
        }
        if s.selected.is_some() {
            s.prefs
                .closed_projects
                .retain(|path| path != &current.canonical);
        }
        if !s
            .prefs
            .opened_projects
            .iter()
            .any(|p| p.canonical == current.canonical)
        {
            s.prefs.opened_projects.insert(0, current);
        }
    }
    s.menus.sidebar_current = s.project().map(|p| p.canonical.clone());
    let mut rows = Vec::new();
    let mut project_counts = std::collections::BTreeMap::new();
    let mut pinned: Vec<_> = s
        .snapshot
        .sessions
        .values()
        .filter(|t| t.pinned.is_some())
        .collect();
    pinned.sort_by(|a, b| b.pinned.partial_cmp(&a.pinned).unwrap());
    s.menus.focus.order = pinned.iter().map(|t| t.id.clone()).collect();
    if !pinned.is_empty() {
        rows.push(Item::Heading("Pinned".into()));
        rows.extend(pinned.iter().map(|t| Item::Session(t.id.clone(), false)));
        rows.push(Item::Gap("pinned".into()));
    }
    if s.prefs.focus {
        if !focus::append(s, &mut rows) {
            s.rows = rows;
            s.rows_revision += 1;
            pagination::sync(s);
            return;
        }
    } else {
        rows.push(Item::Heading("Projects".into()));
        if projects(s).is_empty() {
            rows.push(Item::Note("Open a project to get started.".into()));
        }
        for project in projects(s) {
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
                project_counts.insert(project.id.clone(), threads.len());
                if threads.is_empty() && s.snapshot.loaded_directories.contains(&project.canonical)
                {
                    rows.push(Item::Note("No threads yet".into()));
                } else if !s.snapshot.loaded_directories.contains(&project.canonical)
                    && !s.snapshot.project_errors.contains_key(&project.canonical)
                {
                    rows.push(Item::Note("Loading…".into()));
                }
                rows.extend(
                    threads
                        .iter()
                        .take(limit)
                        .map(|t| Item::Session(t.id.clone(), true)),
                );
                if threads.len() > limit
                    || pagination::error(s, &project.id).is_some()
                    || s.snapshot.cursors.contains_key(&project.canonical)
                    || s.snapshot.project_cursors.contains_key(&project.id)
                {
                    rows.push(Item::More(project.id.clone()));
                }
                if let Some(error) = pagination::error(s, &project.id) {
                    rows.push(Item::Note(error.into()));
                }
                rows.push(Item::Gap(project.id.clone()));
            }
        }
    }
    s.rows = rows;
    s.menus.project_counts = project_counts;
    pagination::sync(s);
    let listed: std::collections::HashSet<&str> =
        s.menus.focus.order.iter().map(String::as_str).collect();
    s.menus
        .selection
        .picked
        .retain(|id| listed.contains(id.as_str()));
    s.rows_revision += 1;
}
/// React starts with only the current project's disclosure expanded.
pub fn initialize(s: &mut State) {
    let current = s.project().map(|p| p.id.clone());
    s.folded = s
        .snapshot
        .projects
        .iter()
        .chain(s.prefs.opened_projects.iter())
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
fn render_item(s: &State, n: usize) -> El {
    let t = &s.theme;
    match &s.rows[n] {
        Item::FocusRetry => crate::pages::controls::ghost(s, "Retry")
            .on_press(|s: &mut State| focus::load(s, false)),
        Item::Heading(title) => {
            let heading = row()
                .w_full()
                .h(if title == "Projects" { 34.0 } else { 35.0 })
                .pb(if title == "Projects" { 6.0 } else { 7.0 })
                .pl(8.0)
                .pr(2.0)
                .center_y()
                .justify_between()
                .child(label(t, title, 12.0, 500.0, "text-tertiary"));
            if title == "Pinned" {
                heading
            } else {
                let toggle = icon_button_size(t, &i::INBOX, "Focus view", 14.0)
                    .key("thread-view-toggle")
                    .on_press(|s: &mut State| {
                        s.prefs.focus = !s.prefs.focus;
                        s.menus.selection.picked.clear();
                        s.inactive_open = false;
                        s.inactive_visible = 10;
                        if s.prefs.focus {
                            focus::load(s, false);
                        }
                        rebuild(s);
                        s.save();
                    });
                if title == "Focus" {
                    heading.child(
                        row()
                            .gap(6.0)
                            .child(
                                icon_button_size(t, &glyphs::FILTER, "Filter projects", 14.0)
                                    .key("focus-filter-trigger")
                                    .on_drawn_layout_tx(|s: &mut State, r, tx| {
                                        s.pages.anchors.insert("focus-filter-trigger".into(), r);
                                        tx.live_only();
                                    })
                                    .on_press_tx(|s: &mut State, tx| {
                                        s.menus.focus.filter_open = true;
                                        tx.focus_when_shown("focus-filter-0", tx.by_keys());
                                    }),
                            )
                            .child(toggle),
                    )
                } else {
                    heading.child(toggle)
                }
            }
        }
        Item::Inactive => row()
            .key("inactive-toggle")
            .w_full()
            .h(if s.inactive_open { 35.0 } else { 34.0 })
            .pb(if s.inactive_open { 7.0 } else { 6.0 })
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
            .key("more-inactive")
            .w_full()
            .h(32.0)
            .pl(8.0)
            .center_y()
            .role("button")
            .label("Show more")
            .focusable(true)
            .disabled(s.menus.focus.pending)
            .radius(8.0)
            .hover(t.c("hover"))
            .child(label(
                t,
                if s.menus.focus.pending {
                    "Loading…"
                } else {
                    "Show more"
                },
                13.0,
                400.0,
                "text-tertiary",
            ))
            .on_press(|s: &mut State| {
                if s.menus.focus.pending {
                    return;
                }
                let inactive = s.menus.focus.inactive_count;
                if inactive <= s.inactive_visible && s.menus.focus.cursor.is_some() {
                    s.menus.focus.expand_page = true;
                    focus::load(s, true);
                } else {
                    s.inactive_visible += 10;
                }
                rebuild(s);
            }),
        Item::Note(note) => label(t, note, 12.0, 400.0, "text-tertiary")
            .w_full()
            .py(6.0)
            .px(8.0),
        Item::Gap(_) => el().w_full().h(
            if n > 0
                && matches!(
                    s.rows[n - 1],
                    Item::Session(_, _) | Item::More(_) | Item::MoreInactive
                )
            {
                13.0
            } else {
                14.0
            },
        ),
        Item::Project(id) => {
            let Some(p) = projects(s).into_iter().find(|p| &p.id == id) else {
                return el();
            };
            let id = id.clone();
            let close = id.clone();
            let new = id.clone();
            let within = s.menus.sidebar_focus.as_ref().is_some_and(|key| {
                [
                    format!("project-row-{id}"),
                    format!("project-new-{id}"),
                    format!("project-close-{id}"),
                ]
                .contains(key)
            });
            let close_focused =
                s.menus.sidebar_focus.as_deref() == Some(&format!("project-close-{id}"));
            // The first group's 4px top margin collapses into the heading's
            // 6px bottom margin in CSS; virtual rows must not add both.
            let first =
                n > 0 && matches!(&s.rows[n - 1], Item::Heading(title) if title == "Projects");
            row()
                .key(format!("folder-{id}"))
                .w_full()
                .h(if first { 32.0 } else { 36.0 })
                .pt(if first { 0.0 } else { 4.0 })
                .hover_group()
                .center_y()
                .child(
                    row()
                        .role("treeitem")
                        .key(format!("project-row-{id}"))
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
                                    (if p.icon.is_some() {
                                        images::avatar(s, p, 16.0)
                                    } else {
                                        icon(&i::FOLDER, 16.0).color(t.c("text-secondary"))
                                    })
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
                                && let Some(path) = projects(s)
                                    .into_iter()
                                    .find(|p| p.id == id)
                                    .map(|p| p.canonical.clone())
                            {
                                let different = s.project().is_none_or(|p| p.canonical != path);
                                s.prefs.project = Some(path);
                                if different {
                                    s.open_session(None);
                                }
                            }
                            rebuild(s);
                            s.save();
                        }),
                )
                .child(
                    icon_button_size(
                        t,
                        &i::PLUS,
                        &format!("New chat in {}", p.display_name()),
                        14.0,
                    )
                    .key(format!("project-new-{new}"))
                    .w(24.0)
                    .group_opacity(if within { 1.0 } else { 0.0 }, 1.0)
                    .on_press(move |s: &mut State| {
                        if let Some(path) = projects(s)
                            .into_iter()
                            .find(|p| p.id == new)
                            .map(|p| p.canonical.clone())
                        {
                            s.prefs.project = Some(path);
                        }
                        s.open_session(None);
                        s.folded.remove(&new);
                        rebuild(s);
                        s.save();
                    }),
                )
                .child(
                    icon_button_size(
                        t,
                        &i::CLOSE,
                        &format!("Close project {}", p.display_name()),
                        14.0,
                    )
                    .key(format!("project-close-{close}"))
                    .w(24.0)
                    .group_opacity(if close_focused { 1.0 } else { 0.0 }, 1.0)
                    .on_press(move |s: &mut State| {
                        close_project(s, &close);
                    }),
                )
        }
        Item::More(id) => {
            let id = id.clone();
            let pending = pagination::pending(s, &id);
            let has_hidden = s.menus.project_counts.get(&id).copied().unwrap_or(0)
                > s.visible.get(&id).copied().unwrap_or(4);
            let disabled = pending || (!has_hidden && !crate::menus::search::connected(s));
            let error = pagination::error(s, &id);
            let title = if pending { "Loading…" } else { "Show more" };
            row()
                .key(format!("more-project-{id}"))
                .w_full()
                .h(33.0)
                .pl(32.0)
                .center_y()
                .role("button")
                .label(error.unwrap_or(title))
                .focusable(!disabled)
                .disabled(disabled)
                .dim(if disabled { 0.45 } else { 1.0 })
                .radius(8.0)
                .hover(t.c("hover"))
                .child(label(
                    t,
                    if error.is_some() { "Try again" } else { title },
                    13.0,
                    400.0,
                    if error.is_some() {
                        "error"
                    } else {
                        "text-tertiary"
                    },
                ))
                .on_press(move |s: &mut State| {
                    pagination::more(s, &id);
                })
        }
        Item::Session(id, nested) => {
            let actions = id.clone();
            let keyboard = id.clone();
            let anchor = id.clone();
            let anchor_key = format!("thread-{id}");
            let thread = &s.snapshot.sessions[id];
            let active = s.snapshot.active.contains(id);
            let selected = s.selected.as_ref() == Some(id);
            let highlighted = if !nested && !s.menus.selection.picked.is_empty() {
                s.menus.selection.picked.contains(id)
            } else {
                selected
            };
            let id = id.clone();
            let worktree = *nested
                && s.snapshot
                    .projects
                    .iter()
                    .find(|p| thread.project_id.as_ref() == Some(&p.id))
                    .is_some_and(|p| thread.directory != p.canonical);
            let mut r = row()
                .key(format!("thread-{id}"))
                .on_drawn_layout_tx(move |s: &mut State, rect, tx| {
                    if tx.focused() == Some(anchor_key.as_str())
                        && s.menus
                            .thread_anchor
                            .as_ref()
                            .is_none_or(|(row, old)| row != &anchor || old != &rect)
                    {
                        s.menus.thread_anchor = Some((anchor.clone(), rect));
                    }
                    tx.live_only();
                })
                .on_secondary_press(move |s: &mut State, point, tx| {
                    if !crate::menus::search::connected(s) {
                        return;
                    }
                    s.menus.point = Some((point.x, point.y));
                    s.menus.open = Some(crate::menus::Menu::Thread(actions.clone()));
                    if let Some(first) = crate::menus::thread::enabled_labels(s, &actions).first() {
                        tx.focus_when_shown(format!("menu-{first}"), false);
                    }
                })
                .on_key(move |s: &mut State, e, tx| selection::key(s, &keyboard, e, tx))
                .role("button")
                .label(&thread.title)
                .focusable(true)
                .w_full()
                .h(32.0)
                .pl(if *nested { 32.0 } else { 8.0 })
                .pr(8.0)
                .gap(9.0)
                .center_y()
                .radius(6.0)
                .fill(if highlighted {
                    t.c("selected")
                } else {
                    Color::TRANSPARENT
                })
                .focus_selected(selected)
                .hover(if highlighted {
                    Color::TRANSPARENT
                } else {
                    t.c("hover")
                });
            if !nested {
                let number = s
                    .menus
                    .selection
                    .numbers
                    .then(|| selection::shortcut_ids(s).iter().position(|row| row == &id))
                    .flatten();
                if let Some(number) = number {
                    r = r.child(
                        el().size(16.0, 16.0)
                            .radius(4.0)
                            .center()
                            .fill(t.c("elevated"))
                            .border(1.0, t.c("border-heavy"))
                            .child(label(
                                t,
                                (number + 1).to_string(),
                                10.0,
                                400.0,
                                "text-secondary",
                            )),
                    );
                } else {
                    if !s.menus.selection.picked.is_empty() {
                        r = r.child(
                            el().size(16.0, 16.0)
                                .radius(4.0)
                                .fill(if s.menus.selection.picked.contains(&id) {
                                    t.c("accent")
                                } else {
                                    Color::TRANSPARENT
                                })
                                .border(
                                    1.0,
                                    if s.menus.selection.picked.contains(&id) {
                                        Color::TRANSPARENT
                                    } else {
                                        t.c("border-heavy")
                                    },
                                )
                                .child(if s.menus.selection.picked.contains(&id) {
                                    icon(&i::TICK, 11.0).color(t.c("on-accent"))
                                } else {
                                    el()
                                }),
                        );
                    }
                    let project = s
                        .snapshot
                        .projects
                        .iter()
                        .find(|p| thread.project_id.as_ref() == Some(&p.id));
                    if let Some(project) = project {
                        r = r.child(images::avatar(s, project, 16.0));
                    }
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
            if thread.muted.unwrap_or(false) {
                r = r.child(
                    icon(&glyphs::MUTED, 14.0)
                        .color(t.c("text-tertiary"))
                        .label("Notifications muted"),
                );
            }
            if thread.fork.is_some() {
                r = r.child(
                    icon(&glyphs::FORK, 14.0)
                        .color(t.c("text-tertiary"))
                        .label("Forked thread"),
                );
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
                .child(r.on_press_tx(move |s: &mut State, tx| {
                    if selection::click(s, &id, tx.mods()) {
                        return;
                    }
                    if let Some(t) = s.snapshot.sessions.get(&id) {
                        s.prefs.project = Some(t.directory.clone());
                    }
                    s.open_session(Some(id.clone()));
                    s.save();
                }))
        }
    }
}
fn projects(s: &State) -> Vec<&oc_gateway::types::Project> {
    s.prefs
        .opened_projects
        .iter()
        .filter(|p| !s.prefs.closed_projects.contains(&p.canonical))
        .map(|folder| {
            s.snapshot
                .projects
                .iter()
                .find(|p| p.canonical == folder.canonical)
                .unwrap_or(folder)
        })
        .collect()
}
pub(crate) fn close_project(s: &mut State, id: &str) {
    let Some(path) = projects(s)
        .into_iter()
        .find(|p| p.id == id)
        .map(|p| p.canonical.clone())
    else {
        return;
    };
    let current = s.project().is_some_and(|p| p.canonical == path);
    s.prefs.opened_projects.retain(|p| p.canonical != path);
    if !s.prefs.closed_projects.contains(&path) {
        s.prefs.closed_projects.push(path);
    }
    if current {
        s.prefs.project = projects(s).first().map(|p| p.canonical.clone());
        s.open_session(None);
    }
    rebuild(s);
    s.save();
}
const RUNNING: rune::Icon = rune::Icon {
    name: "running",
    view: 10.0,
    body: r##"<circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/><path d="M5 .75 A4.25 4.25 0 0 1 9.25 5" fill="none" stroke="currentColor" stroke-width="1.5"/>"##,
};
