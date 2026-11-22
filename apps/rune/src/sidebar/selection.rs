//! Multi-selection never changes the open thread. Bulk writes are sequenced on
//! the existing worker so large selections cannot overflow its bounded queue.
use crate::{State, sidebar::Item};
use rune::{El, el, row};
use std::collections::{BTreeSet, VecDeque};
#[derive(Default)]
pub struct Selection {
    pub numbers: bool,
    pub picked: BTreeSet<String>,
    pub anchor: Option<String>,
    pub queue: VecDeque<String>,
    pub pending: bool,
    pub failed: bool,
    pub undo: Vec<String>,
    pub undo_due: Option<f64>,
    completed: Vec<String>,
    undoing: bool,
    pub focus_after: Option<String>,
    pub completing_next: std::collections::BTreeMap<String, Option<String>>,
    pub completed_next: Option<(String, String)>,
}
pub fn ready(s: &State) -> Vec<String> {
    s.menus
        .selection
        .picked
        .iter()
        .filter(|id| !s.snapshot.active.contains(*id))
        .cloned()
        .collect()
}
pub fn done_label(s: &State) -> String {
    let count = s.menus.selection.picked.len();
    let ready = ready(s).len();
    if ready == count {
        format!("Mark {count} threads as done")
    } else {
        format!("Mark {ready} of {count} as done")
    }
}
pub fn click(s: &mut State, id: &str, mods: rune::Mods) -> bool {
    if !crate::menus::thread::pickable(s, id) {
        return false;
    }
    let order = &s.menus.focus.order;
    let from = s.menus.selection.anchor.as_ref().or(s.selected.as_ref());
    if mods.shift
        && let (Some(a), Some(b)) = (
            from.and_then(|id| order.iter().position(|t| t == id)),
            order.iter().position(|t| t == id),
        )
    {
        s.menus
            .selection
            .picked
            .extend(order[a.min(b)..=a.max(b)].iter().cloned());
    } else if mods.cmd || mods.ctrl || !s.menus.selection.picked.is_empty() {
        if !s.menus.selection.picked.remove(id) {
            s.menus.selection.picked.insert(id.into());
        }
        s.menus.selection.anchor = Some(id.into());
    } else {
        s.menus.selection.anchor = Some(id.into());
        return false;
    }
    s.rows_revision += 1;
    true
}
pub fn mark_done(s: &mut State) {
    if s.menus.selection.pending || !crate::menus::search::connected(s) || ready(s).is_empty() {
        return;
    }
    s.menus.selection.queue = ready(s).into();
    s.menus.selection.completed.clear();
    s.menus.selection.undoing = false;
    s.menus.selection.failed = false;
    next(s);
}
fn next(s: &mut State) {
    if let Some(id) = s.menus.selection.queue.pop_front() {
        s.menus.selection.pending = s.prompt_request(oc_gateway::prompt::Request::Mutate {
            tag: format!("sidebar-done:{id}"),
            path: format!("sessions/{id}/focus"),
            body: serde_json::json!({"action":if s.menus.selection.undoing {"undone"}else{"done"}}),
            delete: false,
        });
        if !s.menus.selection.pending {
            s.menus.selection.failed = true;
        }
    } else {
        s.menus.selection.pending = false;
        if !s.menus.selection.failed {
            s.menus.selection.picked.clear();
        }
        if !s.menus.selection.undoing {
            s.menus.selection.undo = s.menus.selection.completed.clone();
            s.menus.selection.undo_due = None;
        } else if !s.menus.selection.failed {
            s.menus.selection.undo.clear();
        }
        s.command(oc_gateway::Command::Refresh);
    }
    s.rows_revision += 1;
}
pub fn receive(s: &mut State, id: &str, result: Result<serde_json::Value, String>) {
    if result.is_err() {
        s.menus.selection.failed = true;
    } else {
        s.menus.selection.completed.push(id.into());
    }
    next(s);
}
pub fn toolbar(s: &State) -> El {
    let count = s.menus.selection.picked.len();
    if count == 0 {
        if s.menus.selection.undo.is_empty() {
            return el();
        }
        let count = s.menus.selection.undo.len();
        return bar(s)
            .role("status")
            .child(
                super::label(
                    &s.theme,
                    if s.menus.selection.undoing && s.menus.selection.failed {
                        "Could not undo".into()
                    } else if count == 1 {
                        "Marked as done".into()
                    } else {
                        format!("Marked {count} threads as done")
                    },
                    12.0,
                    400.0,
                    "text-secondary",
                )
                .grow(1.0)
                .truncate(),
            )
            .child(
                crate::pages::controls::ghost(
                    s,
                    if s.menus.selection.undoing && s.menus.selection.failed {
                        "Retry"
                    } else {
                        "Undo"
                    },
                )
                .h(28.0)
                .disabled(s.menus.selection.pending)
                .on_press(|s: &mut State| {
                    s.menus.selection.queue = s.menus.selection.undo.clone().into();
                    s.menus.selection.completed.clear();
                    s.menus.selection.undoing = true;
                    s.menus.selection.failed = false;
                    next(s);
                }),
            )
            .child(
                super::icon_button_size(&s.theme, &crate::icons::CLOSE, "Dismiss", 12.0)
                    .size(24.0, 24.0)
                    .on_press(|s: &mut State| {
                        s.menus.selection.undo.clear();
                        s.rows_revision += 1;
                    }),
            );
    }
    let running = count - ready(s).len();
    let status = if s.menus.selection.failed {
        "Some threads could not be updated".into()
    } else {
        format!(
            "{count} selected{}",
            if running > 0 {
                format!(", {running} running")
            } else {
                String::new()
            }
        )
    };
    bar(s)
        .role("toolbar")
        .label("Selected threads")
        .child(
            super::label(&s.theme, status, 12.0, 400.0, "text-secondary")
                .grow(1.0)
                .truncate(),
        )
        .child(
            crate::pages::controls::ghost(
                s,
                if s.menus.selection.pending {
                    "Marking…"
                } else {
                    "Mark as done"
                },
            )
            .h(28.0)
            .disabled(ready(s).is_empty() || s.menus.selection.pending)
            .on_press(mark_done),
        )
        .child(
            super::icon_button_size(
                &s.theme,
                &crate::icons::CLOSE,
                "Clear selection (Esc)",
                12.0,
            )
            .size(24.0, 24.0)
            .on_press(|s: &mut State| {
                s.menus.selection.picked.clear();
                s.rows_revision += 1;
            }),
        )
}
fn bar(s: &State) -> El {
    row()
        .w_full()
        .h(34.0)
        .mt(8.0)
        .pl(10.0)
        .pr(2.0)
        .py(2.0)
        .gap(2.0)
        .center_y()
        .border(1.0, s.theme.c("border"))
        .border_layout()
        .radius(8.0)
        .fill(s.theme.c("elevated"))
}
pub fn key(s: &mut State, id: &str, event: &rune::KeyEvent, tx: &mut rune::Tx) -> bool {
    if event.key == rune::Key::ContextMenu
        || (event.key == rune::Key::Function(10) && event.mods.shift)
    {
        if crate::menus::search::connected(s) {
            s.menus.point = s
                .menus
                .thread_anchor
                .as_ref()
                .filter(|(row, _)| row == id)
                .map(|(_, rect)| (rect[0], rect[1] + rect[3] + 4.0));
            s.menus.open = Some(crate::menus::Menu::Thread(id.into()));
            s.menus.thread_toolbar = false;
            if let Some(first) = crate::menus::thread::enabled_labels(s, id).first() {
                tx.focus_when_shown(format!("menu-{first}"), true);
            }
        }
        return true;
    }
    if !event.mods.cmd && !event.mods.ctrl && !event.mods.alt && !event.mods.shift {
        let order: Vec<_> = s
            .rows
            .iter()
            .filter_map(|r| {
                if let Item::Session(id, _) = r {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect();
        if let Some(index) = order.iter().position(|row| row == id) {
            let next = match event.key {
                rune::Key::Down => Some((index + 1).min(order.len() - 1)),
                rune::Key::Up => Some(index.saturating_sub(1)),
                rune::Key::Home => Some(0),
                rune::Key::End => Some(order.len() - 1),
                _ => None,
            };
            if let Some(next) = next {
                tx.focus(format!("thread-{}", order[next]), true);
                tx.scroll_into_view(format!("thread-{}", order[next]));
                if next != index
                    && (s.menus.selection.picked.is_empty()
                        || !crate::menus::thread::pickable(s, &order[next]))
                {
                    s.open_session(Some(order[next].clone()));
                    s.save();
                }
                return true;
            }
            if event.key == rune::Key::Enter {
                if s.selected.as_deref() == Some(id) {
                    tx.focus("message", false);
                } else {
                    s.open_session(Some(id.into()));
                    s.save();
                }
                return true;
            }
        }
    }
    if event.key == rune::Key::Escape && !s.menus.selection.picked.is_empty() {
        s.menus.selection.picked.clear();
        s.rows_revision += 1;
        return true;
    }
    if event.mods.cmd && !event.mods.alt && !event.mods.shift && event.key == rune::Key::Enter {
        if tx.key_repeat() {
            return true;
        }
        if !s.menus.selection.picked.is_empty() {
            mark_done(s);
        } else if let Some(thread) = s.snapshot.sessions.get(id) {
            if !s.snapshot.active.contains(id)
                && thread.done.is_none_or(|at| at < thread.activity())
                && !crate::menus::thread::pending_for(s, id, "done")
                && crate::menus::search::connected(s)
            {
                if s.prompt_request(oc_gateway::prompt::Request::Mutate {
                    tag: format!("menu-thread:done:{id}"),
                    path: format!("sessions/{id}/focus"),
                    body: serde_json::json!({"action":"done"}),
                    delete: false,
                }) {
                    s.menus.thread_pending.insert(format!("{id}:done"));
                    let order: Vec<_> = s
                        .rows
                        .iter()
                        .filter_map(|r| {
                            if let Item::Session(id, _) = r {
                                Some(id.clone())
                            } else {
                                None
                            }
                        })
                        .collect();
                    let next = order
                        .iter()
                        .position(|row| row == id)
                        .and_then(|index| {
                            order
                                .get(index + 1)
                                .or_else(|| index.checked_sub(1).and_then(|i| order.get(i)))
                        })
                        .cloned();
                    s.menus.selection.completing_next.insert(id.into(), next);
                }
            }
        }
        tx.instant();
        return true;
    }
    false
}
pub fn poll(s: &mut State, clock: f64, tx: &mut rune::Tx) -> bool {
    let mut navigation_changed = false;
    if let Some((current, next)) = s.menus.selection.completed_next.take() {
        if s.selected.as_deref() == Some(&current)
            && tx
                .focused()
                .is_none_or(|focus| focus == format!("thread-{current}"))
        {
            s.open_session(Some(next.clone()));
            s.save();
            tx.focus(format!("thread-{next}"), true);
            tx.scroll_into_view(format!("thread-{next}"));
            navigation_changed = true;
        }
    }
    let focus = tx
        .focused()
        .filter(|key| {
            key.starts_with("project-row-")
                || key.starts_with("project-new-")
                || key.starts_with("project-close-")
        })
        .map(str::to_owned);
    let focus_changed = s.menus.sidebar_focus != focus;
    if focus_changed {
        s.menus.sidebar_focus = focus;
        s.rows_revision += 1;
    }
    if let Some(next) = s.menus.selection.focus_after.take() {
        tx.focus(format!("thread-{next}"), true);
        tx.scroll_into_view(format!("thread-{next}"));
    }
    if !s.menus.selection.undo.is_empty() && s.menus.selection.undo_due.is_none() {
        s.menus.selection.undo_due = Some(clock + 6.0);
        tx.wake_after(std::time::Duration::from_secs(6));
    }
    if s.menus.selection.undo_due.is_some_and(|due| clock >= due) {
        s.menus.selection.undo.clear();
        s.menus.selection.undo_due = None;
        s.rows_revision += 1;
        return true;
    }
    focus_changed || navigation_changed
}
pub fn shortcut_ids(s: &State) -> Vec<String> {
    s.rows
        .iter()
        .take_while(|row| !matches!(row, Item::Inactive))
        .filter_map(|r| {
            if let Item::Session(id, false) = r {
                Some(id.clone())
            } else {
                None
            }
        })
        .take(9)
        .collect()
}
pub fn tab_target(s: &State, id: &str, previous: bool) -> String {
    let Some(index) = s
        .rows
        .iter()
        .position(|row| matches!(row,Item::Session(row,_)if row==id))
    else {
        return format!("thread-{id}");
    };
    let target = |row: &Item| match row {
        Item::Session(id, _) => Some(format!("thread-{id}")),
        Item::More(id) => Some(format!("more-project-{id}")),
        Item::MoreInactive => Some("more-inactive".into()),
        Item::Inactive => Some("inactive-toggle".into()),
        Item::Project(id) => Some(format!(
            "project-{}-{id}",
            if previous { "close" } else { "row" }
        )),
        Item::Heading(title) if title == "Projects" => Some("thread-view-toggle".into()),
        Item::Heading(title) if title == "Focus" => Some(
            if previous {
                "thread-view-toggle"
            } else {
                "focus-filter-trigger"
            }
            .into(),
        ),
        _ => None,
    };
    if previous {
        s.rows[..index]
            .iter()
            .rev()
            .find_map(target)
            .unwrap_or_else(|| last_app(s).unwrap_or_else(|| "sidebar-apps".into()))
    } else {
        s.rows[index + 1..]
            .iter()
            .find_map(target)
            .unwrap_or_else(|| "sidebar-settings".into())
    }
}
fn last_app(s: &State) -> Option<String> {
    let mut apps: Vec<_> = crate::pages::data(s, "apps")?.as_array()?.iter().collect();
    apps.sort_by(|a, b| b["created"].as_i64().cmp(&a["created"].as_i64()));
    let mut visible: Vec<_> = apps.iter().take(5).copied().collect();
    if let Some(open) = apps
        .iter()
        .find(|app| app["id"].as_str() == s.pages.app.as_deref())
        && !visible.iter().any(|app| app["id"] == open["id"])
    {
        visible.push(open);
    }
    visible
        .last()?
        .get("id")?
        .as_str()
        .map(|id| format!("sidebar-app-{id}"))
}
pub fn global(s: &mut State, event: &rune::KeyEvent, tx: &mut rune::Tx) -> bool {
    if matches!(event.key, rune::Key::Modifier { .. }) {
        let numbers = event.mods.cmd && !event.mods.alt && !event.mods.shift;
        if numbers != s.menus.selection.numbers {
            s.menus.selection.numbers = numbers;
            s.rows_revision += 1;
        }
        return false;
    }
    if s.menus.open.is_some() || s.pages.projects.dialog.is_some() || s.menus.focus.filter_open {
        return false;
    }
    if event.key == rune::Key::Escape && !s.menus.selection.picked.is_empty() {
        s.menus.selection.picked.clear();
        s.rows_revision += 1;
        return true;
    }
    if event.mods.cmd && !event.mods.alt && !event.mods.shift && crate::menus::search::connected(s)
    {
        if let rune::Key::Command(c) = event.key
            && let Some(n) = c.to_digit(10).filter(|n| *n >= 1 && *n <= 9)
        {
            if let Some(id) = shortcut_ids(s).get(n as usize - 1) {
                s.menus.selection.picked.clear();
                s.menus.selection.anchor = Some(id.clone());
                s.open_session(Some(id.clone()));
                s.save();
                tx.focus("message", false);
                return true;
            }
        }
    }
    false
}
