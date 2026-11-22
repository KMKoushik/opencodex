//! Mirrors SessionActionsMenu; title editing belongs to the title, not this menu.
use crate::{State, sidebar::label};
use rune::El;
use serde_json::json;
pub struct Download {
    pub session: String,
    pub filename: String,
    pub temporary: String,
}

pub(super) fn view(s: &State, id: &str, mut panel: El) -> El {
    let Some(thread) = s.snapshot.sessions.get(id) else {
        return panel;
    };
    let done = thread.done.is_some_and(|at| at >= thread.activity());
    let running = s.snapshot.active.contains(id);
    if s.menus.selection.picked.contains(id) {
        let back = id.to_owned();
        let clear_back = id.to_owned();
        return panel
            .child(
                control(
                    s,
                    &crate::sidebar::selection::done_label(s),
                    !super::search::connected(s) || crate::sidebar::selection::ready(s).is_empty(),
                )
                .on_press_tx(move |s: &mut State, tx| {
                    crate::sidebar::selection::mark_done(s);
                    s.menus.open = None;
                    tx.return_focus(format!("thread-{back}"), tx.by_keys());
                }),
            )
            .child(
                super::button(s, "Clear selection").on_press_tx(move |s: &mut State, tx| {
                    s.menus.selection.picked.clear();
                    s.rows_revision += 1;
                    s.menus.open = None;
                    tx.return_focus(format!("thread-{clear_back}"), tx.by_keys());
                }),
            );
    }
    for (name, action) in [
        (
            if thread.pinned.is_some() {
                "Unpin thread"
            } else {
                "Pin thread"
            },
            "pin",
        ),
        (
            if done {
                "Mark as not done"
            } else {
                "Mark as done"
            },
            "done",
        ),
        (
            if pending(s, "unread") {
                "Marking as unread…"
            } else {
                "Mark as unread"
            },
            "unread",
        ),
        (
            if thread.muted.unwrap_or(false) {
                "Unmute notifications"
            } else {
                "Mute notifications"
            },
            "mute",
        ),
    ] {
        let id = id.to_owned();
        let disabled = !super::search::connected(s)
            || pending(s, action)
            || (action == "done" && !done && running);
        let mut button = control(s, name, disabled);
        if action == "done" && !done && pickable(s, id.as_str()) {
            button = button.child(rune::el().grow(1.0)).child(label(
                &s.theme,
                "⌘↵",
                12.0,
                400.0,
                "text-tertiary",
            ));
        }
        panel = panel.child(button.on_press(move |s: &mut State| {
            if !super::search::connected(s)
                || pending_for(s, &id, action)
                || (action == "done" && !done && s.snapshot.active.contains(&id))
            {
                return;
            }
            let Some(thread) = s.snapshot.sessions.get(&id) else {
                return;
            };
            let (endpoint, body) = match action {
                "pin" => (
                    "focus",
                    json!({"action": if thread.pinned.is_some() { "unpin" } else { "pin" }}),
                ),
                "done" => (
                    "focus",
                    json!({"action": if done { "undone" } else { "done" }}),
                ),
                "mute" => ("mute", json!({"muted": !thread.muted.unwrap_or(false)})),
                _ => ("unread", json!({"action":"mark"})),
            };
            if s.prompt_request(oc_gateway::prompt::Request::Mutate {
                tag: format!("menu-thread:{action}:{id}"),
                path: format!("sessions/{id}/{endpoint}"),
                body,
                delete: false,
            }) {
                s.menus.thread_pending.insert(format!("{id}:{action}"));
                s.menus.thread_errors.remove(&format!("{id}:{action}"));
            }
        }));
    }
    for (name, format) in [
        ("Export as Markdown", "markdown"),
        ("Export as JSON", "json"),
    ] {
        let id = id.to_owned();
        panel = panel.child(
            control(
                s,
                if s.menus.thread_pending.contains(&format!("{id}:{format}")) {
                    "Exporting…"
                } else {
                    name
                },
                !super::search::connected(s) || pending(s, format),
            )
            .on_press(move |s: &mut State| {
                if !super::search::connected(s) || pending_for(s, &id, format) {
                    return;
                }
                let id = id.clone();
                let title = s
                    .snapshot
                    .sessions
                    .get(&id)
                    .map(|t| t.title.as_str())
                    .unwrap_or("");
                let file_name = filename(title, &id, format);
                if s.prompt_request(oc_gateway::prompt::Request::DownloadExport {
                    session: id.clone(),
                    format: format.into(),
                }) {
                    s.menus.export_names.insert(id.clone(), file_name);
                    s.menus.thread_pending.insert(format!("{id}:{format}"));
                    s.menus.thread_errors.remove(&format!("{id}:export"));
                }
            }),
        );
    }
    if pickable(s, id) {
        let id = id.to_owned();
        panel = panel.child(
            super::button(s, "Select").on_press_tx(move |s: &mut State, tx| {
                s.menus.selection.picked.insert(id.clone());
                s.menus.selection.anchor = Some(id.clone());
                s.rows_revision += 1;
                s.menus.open = None;
                tx.return_focus(format!("thread-{id}"), tx.by_keys());
            }),
        );
    }
    for (_, error) in s
        .menus
        .thread_errors
        .iter()
        .filter(|(key, _)| key.starts_with(&format!("{id}:")))
    {
        panel = panel.child(
            label(&s.theme, error, 12.0, 400.0, "error")
                .w_full()
                .wrap()
                .padding(8.0)
                .role("alert"),
        );
    }
    panel
}
fn control(s: &State, title: &str, disabled: bool) -> El {
    rune::row()
        .key(format!("menu-{title}"))
        .role("menuitem")
        .label(title)
        .focusable(true)
        .w_full()
        .h(32.0)
        .px(10.0)
        .center_y()
        .radius(4.0)
        .hover(if disabled {
            rune::Color::TRANSPARENT
        } else {
            s.theme.c("hover")
        })
        .focus_fill(s.theme.c("hover"))
        .no_focus_ring()
        .child(label(
            &s.theme,
            title,
            13.0,
            400.0,
            if disabled { "text-tertiary" } else { "text" },
        ))
        .disabled(disabled)
        .dim(if disabled { 0.45 } else { 1.0 })
}

pub fn receive(s: &mut State, tag: &str, result: Result<serde_json::Value, String>) -> bool {
    if let Some(id) = tag
        .strip_prefix("menu-export:")
        .and_then(|tag| tag.strip_suffix(":saved"))
    {
        if let Err(error) = result {
            s.error = Some(format!("Could not save the exported file. {error}"));
        }
        let _ = id;
        return true;
    }
    if let Some(id) = tag
        .strip_prefix("menu-export:")
        .and_then(|tag| tag.strip_suffix(":temp"))
    {
        let filename = s.menus.export_names.remove(id);
        match result {
            Ok(value) => {
                if let (Some(filename), Some(temporary)) = (filename, value["temporary"].as_str()) {
                    s.menus.export_ready.push_back(Download {
                        session: id.into(),
                        filename,
                        temporary: temporary.into(),
                    });
                    return receive(s, &format!("menu-export:{id}"), Ok(serde_json::Value::Null));
                }
                return receive(
                    s,
                    &format!("menu-export:{id}"),
                    Err("The gateway returned an invalid export download.".into()),
                );
            }
            Err(error) => return receive(s, &format!("menu-export:{id}"), Err(error)),
        }
    }
    let (action, id) = if let Some(rest) = tag.strip_prefix("menu-thread:") {
        rest.split_once(':').unwrap_or((rest, ""))
    } else if let Some(id) = tag.strip_prefix("menu-export:") {
        ("export", id)
    } else {
        return false;
    };
    if action == "export" {
        s.menus.thread_pending.remove(&format!("{id}:markdown"));
        s.menus.thread_pending.remove(&format!("{id}:json"));
    } else {
        s.menus.thread_pending.remove(&format!("{id}:{action}"));
    }
    match result {
        Ok(value) => {
            if action == "done" {
                s.menus.selection.undo = if value["done"].as_f64().is_some() {
                    vec![id.into()]
                } else {
                    vec![]
                };
                s.menus.selection.undo_due = None;
            }
            if let Some(Some(next)) = s.menus.selection.completing_next.remove(id) {
                if s.selected.as_deref() == Some(id) {
                    s.menus.selection.completed_next = Some((id.into(), next));
                }
            }
            if matches!(&s.menus.open,Some(super::Menu::Thread(open)) if open==id) {
                s.menus.open = None;
                if s.menus.selection.focus_after.is_none() {
                    s.menus.selection.focus_after = Some(id.into());
                }
            }
            if action != "export" {
                s.command(oc_gateway::Command::Refresh);
            }
        }
        Err(error) => {
            if s.menus.selection.completing_next.remove(id).is_some() {
                s.menus.point = s
                    .menus
                    .thread_anchor
                    .as_ref()
                    .filter(|(row, _)| row == id)
                    .map(|(_, rect)| (rect[0], rect[1] + rect[3] + 4.0));
                s.menus.open = Some(super::Menu::Thread(id.into()));
            }
            let message = match action {
                "unread" => "Could not mark this thread as unread.",
                "mute" => "Could not change this thread's notifications.",
                "export" => "Could not export this thread.",
                _ => "Could not update this thread.",
            };
            s.menus
                .thread_errors
                .insert(format!("{id}:{action}"), format!("{message} {error}"));
            while s.menus.thread_errors.len() > 64 {
                s.menus.thread_errors.pop_first();
            }
        }
    }
    true
}

pub fn pending(s: &State, action: &str) -> bool {
    let id = match &s.menus.open {
        Some(super::Menu::Thread(id)) => Some(id),
        _ => s.selected.as_ref(),
    };
    id.is_some_and(|id| pending_for(s, id, action))
}
pub fn pending_for(s: &State, id: &str, action: &str) -> bool {
    let pending = &s.menus.thread_pending;
    match action {
        "pin" | "done" => {
            pending.contains(&format!("{id}:pin")) || pending.contains(&format!("{id}:done"))
        }
        "markdown" | "json" => {
            pending.contains(&format!("{id}:markdown")) || pending.contains(&format!("{id}:json"))
        }
        _ => pending.contains(&format!("{id}:{action}")),
    }
}
pub fn pickable(s: &State, id: &str) -> bool {
    s.rows
        .iter()
        .any(|r| matches!(r, crate::sidebar::Item::Session(row, false) if row == id))
}
pub fn enabled_labels(s: &State, id: &str) -> Vec<String> {
    if s.menus.selection.picked.contains(id) {
        let mut labels = vec![];
        if super::search::connected(s) && !crate::sidebar::selection::ready(s).is_empty() {
            labels.push(crate::sidebar::selection::done_label(s));
        }
        labels.push("Clear selection".into());
        return labels;
    }
    let Some(t) = s.snapshot.sessions.get(id) else {
        return vec![];
    };
    let done = t.done.is_some_and(|at| at >= t.activity());
    let mut labels = vec![];
    if super::search::connected(s) {
        for (action, label) in [
            (
                "pin",
                if t.pinned.is_some() {
                    "Unpin thread"
                } else {
                    "Pin thread"
                },
            ),
            (
                "done",
                if done {
                    "Mark as not done"
                } else {
                    "Mark as done"
                },
            ),
            ("unread", "Mark as unread"),
            (
                "mute",
                if t.muted.unwrap_or(false) {
                    "Unmute notifications"
                } else {
                    "Mute notifications"
                },
            ),
            ("markdown", "Export as Markdown"),
            ("json", "Export as JSON"),
        ] {
            if !pending(s, action) && !(action == "done" && !done && s.snapshot.active.contains(id))
            {
                labels.push(label.into());
            }
        }
    }
    if pickable(s, id) {
        labels.push("Select".into());
    }
    labels
}

/// Electron has no will-download handler: retain its default Save dialog and
/// use the exact a.download name from session-export.ts (80 UTF-16 code units).
pub(crate) fn filename(title: &str, id: &str, format: &str) -> String {
    static INVALID: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let invalid = INVALID.get_or_init(|| regex::Regex::new(r"[^\p{L}\p{N}_-]+").unwrap());
    let lower = title.to_lowercase();
    let sanitized = invalid.replace_all(&lower, "-");
    let mut units = 0;
    let name: String = sanitized
        .trim_matches('-')
        .chars()
        .take_while(|c| {
            units += c.len_utf16();
            units <= 80
        })
        .collect();
    format!(
        "{}.{}",
        if name.is_empty() { id } else { &name },
        if format == "markdown" { "md" } else { "json" }
    )
}
pub fn poll(s: &mut State, tx: &mut rune::Tx) -> bool {
    if s.menus.export_dialog {
        return false;
    }
    let Some(download) = s.menus.export_ready.pop_front() else {
        return false;
    };
    s.menus.export_dialog = true;
    tx.save_file(
        rune::FileDialogOptions {
            file_name: Some(download.filename),
            directory: std::env::var_os("HOME")
                .map(|home| std::path::PathBuf::from(home).join("Downloads")),
            ..Default::default()
        },
        move |s: &mut State, result, tx| {
            s.menus.export_dialog = false;
            let destination = match result {
                Ok(path) => path.map(|path| path.to_string_lossy().into_owned()),
                Err(error) => {
                    s.error = Some(error.to_string());
                    None
                }
            };
            s.prompt_request(oc_gateway::prompt::Request::FinishExport {
                session: download.session.clone(),
                temporary: download.temporary.clone(),
                destination,
            });
            if !s.menus.export_ready.is_empty() {
                tx.wake_after(std::time::Duration::ZERO);
            }
        },
    );
    true
}
