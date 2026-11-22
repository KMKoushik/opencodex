//! Mirrors SessionActionsMenu; title editing belongs to the title, not this menu.
use crate::{State, sidebar::label};
use rune::El;
use serde_json::json;

pub(super) fn view(s: &State, id: &str, mut panel: El) -> El {
    let Some(thread) = s.snapshot.sessions.get(id) else {
        return panel;
    };
    let done = thread.done.is_some_and(|at| at >= thread.activity());
    let running = s.snapshot.active.contains(id);
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
            if s.menus.pending.as_deref() == Some("unread") {
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
        panel = panel.child(super::button(s, name)
            .disabled(!s.snapshot.live || s.menus.pending.is_some() || (action == "done" && !done && running))
            .on_press(move |s: &mut State| {
                let Some(thread) = s.snapshot.sessions.get(&id) else { return };
                let (endpoint, body) = match action {
                    "pin" => ("focus", json!({"action": if thread.pinned.is_some() { "unpin" } else { "pin" }})),
                    "done" => ("focus", json!({"action": if done { "undone" } else { "done" }})),
                    "mute" => ("mute", json!({"muted": !thread.muted.unwrap_or(false)})),
                    _ => ("unread", json!({"action":"mark"})),
                };
                if s.prompt_request(oc_gateway::prompt::Request::Mutate {
                    tag: format!("menu-thread:{action}"), path: format!("sessions/{id}/{endpoint}"), body, delete: false,
                }) {
                    s.menus.pending = Some(action.into());
                    s.menus.error = None;
                }
            }));
    }
    for (name, format) in [
        ("Export as Markdown", "markdown"),
        ("Export as JSON", "json"),
    ] {
        let id = id.to_owned();
        panel = panel.child(
            super::button(
                s,
                if s.menus.pending.as_deref() == Some(format) {
                    "Exporting…"
                } else {
                    name
                },
            )
            .disabled(!s.snapshot.live || s.menus.pending.is_some())
            .on_press_tx(move |_: &mut State, tx| {
                let id = id.clone();
                tx.save_file(
                    rune::FileDialogOptions {
                        title: "Export conversation".into(),
                        ..Default::default()
                    },
                    move |s: &mut State, result, _| match result {
                        Ok(Some(path)) => {
                            if s.prompt_request(oc_gateway::prompt::Request::Export {
                                session: id.clone(),
                                format: format.into(),
                                destination: path.to_string_lossy().into_owned(),
                            }) {
                                s.menus.pending = Some(format.into());
                                s.menus.error = None;
                            }
                        }
                        Err(error) => s.menus.error = Some(error.to_string()),
                        _ => {}
                    },
                );
            }),
        );
    }
    if let Some(error) = &s.menus.error {
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

pub fn receive(s: &mut State, tag: &str, result: Result<serde_json::Value, String>) -> bool {
    let action = if let Some(action) = tag.strip_prefix("menu-thread:") {
        action
    } else if tag.starts_with("menu-export:") {
        "export"
    } else {
        return false;
    };
    s.menus.pending = None;
    match result {
        Ok(_) => {
            s.menus.open = None;
            if action != "export" {
                s.command(oc_gateway::Command::Refresh);
            }
        }
        Err(error) => {
            let message = match action {
                "unread" => "Could not mark this thread as unread.",
                "mute" => "Could not change this thread's notifications.",
                "export" => "Could not export this thread.",
                _ => "Could not update this thread.",
            };
            s.menus.error = Some(format!("{message} {error}"));
        }
    }
    true
}
