use super::state::Menu;
use crate::{State, sidebar::label};
use rune::{El, col};
use serde_json::{Value, json};

pub struct Pending {
    session: String,
    revision: u64,
    before: Option<String>,
    sending: bool,
    error: Option<String>,
}
pub fn open(s: &mut State) {
    let Some(session) = s.selected.clone() else {
        return;
    };
    s.composer.fork = Some(Pending {
        session,
        revision: s.draft().revision,
        before: None,
        sending: false,
        error: None,
    });
    s.composer.menu = Some(Menu::Fork);
}
fn send(s: &mut State, before: Option<String>) {
    let Some(pending) = s.composer.fork.as_ref().filter(|p| !p.sending) else {
        return;
    };
    let session = pending.session.clone();
    if s.prompt_request(oc_gateway::prompt::Request::Mutate {
        tag: "fork-reply".into(),
        path: format!("sessions/{session}/action"),
        body: json!({"action":"fork", "before":before}),
        delete: false,
    }) {
        let pending = s.composer.fork.as_mut().unwrap();
        pending.sending = true;
        pending.before = before;
        pending.error = None;
    }
}
pub fn receive(s: &mut State, result: Result<Value, String>) {
    let Some(mut pending) = s.composer.fork.take() else {
        return;
    };
    match result {
        Ok(value) => {
            s.composer
                .drafts
                .acknowledge(&pending.session, pending.revision);
            s.composer.menu = None;
            if s.selected.as_deref() == Some(&pending.session)
                && let Some(id) = value["id"].as_str()
            {
                s.open_session(Some(id.into()));
            }
        }
        Err(error) => {
            pending.sending = false;
            pending.error = Some(error);
            s.composer.fork = Some(pending);
        }
    }
}
pub fn view(s: &State) -> El {
    let Some(p) = &s.composer.fork else {
        return rune::el();
    };
    let t = &s.theme;
    let button = |name: &str| {
        label(t, name, 13.0, 500.0, "text")
            .w_full()
            .px(12.0)
            .h(32.0)
            .center_y()
            .focus_fill(t.c("selected"))
            .radius(8.0)
            .hover(t.c("hover"))
            .role("button")
            .label(name)
            .focusable(true)
            .disabled(p.sending)
    };
    let mut options = col()
        .w_full()
        .max_h(s.window_size.1 * 0.5)
        .gap(8.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .focus_group()
        .role("list")
        .on_key(|s: &mut State, event, tx| {
            if event.mods.alt || event.mods.ctrl || event.mods.cmd || event.mods.shift {
                return false;
            }
            let Some(index) = tx
                .focused()
                .and_then(|key| key.strip_prefix("fork-choice-"))
                .and_then(|n| n.parse::<usize>().ok())
            else {
                return false;
            };
            let count = 1
                + s.chat
                    .data
                    .visible()
                    .iter()
                    .filter(|m| m.r#type == "user")
                    .count()
                + usize::from(s.chat.data.cursor.is_some());
            let next = match event.key {
                rune::Key::Down => (index + 1) % count,
                rune::Key::Up => (index + count - 1) % count,
                rune::Key::Home => 0,
                rune::Key::End => count - 1,
                _ => return false,
            };
            let key = format!("fork-choice-{next}");
            tx.focus(key.clone(), true);
            tx.scroll_into_view(key);
            true
        })
        .child(
            button(if p.sending && p.before.is_none() {
                "Forking…"
            } else {
                "Fork from latest"
            })
            .key("fork-choice-0")
            .autofocus()
            .on_press(|s: &mut State| send(s, None)),
        );
    for (index, message) in s
        .chat
        .data
        .visible()
        .iter()
        .rev()
        .filter(|m| m.r#type == "user")
        .enumerate()
    {
        let id = message.id.clone();
        let title = if p.sending && p.before.as_ref() == Some(&id) {
            "Forking…".into()
        } else {
            format!(
                "Before: {}",
                message
                    .fields
                    .get("text")
                    .and_then(Value::as_str)
                    .filter(|v| !v.is_empty())
                    .unwrap_or("Attachments")
            )
        };
        options = options.child(
            button(&title)
                .key(format!("fork-choice-{}", index + 1))
                .truncate()
                .on_press(move |s: &mut State| send(s, Some(id.clone()))),
        );
    }
    if s.chat.data.cursor.is_some() {
        options = options.child(
            button("Load earlier messages")
                .key(format!(
                    "fork-choice-{}",
                    1 + s
                        .chat
                        .data
                        .visible()
                        .iter()
                        .filter(|m| m.r#type == "user")
                        .count()
                ))
                .disabled(s.chat.loading_earlier)
                .on_press(|s: &mut State| s.load_earlier()),
        );
    }
    let width = (s.window_size.0 - 32.0).min(440.0);
    let mut panel = col().w(width).padding(20.0).gap(16.0).radius(14.0).fill(t.c("elevated")).border(1.0, t.c("border-heavy"))
        .child(rune::row().w_full().justify_between().mb(4.0)
            .child(label(t, "Fork conversation", 16.0, 600.0, "text"))
            .child(label(t, "×", 18.0, 400.0, "text-secondary").role("button").label("Close").focusable(true).disabled(p.sending).on_press(|s: &mut State| { s.composer.menu = None; s.composer.fork = None; })))
        .child(label(t, "Continue in a new thread from the latest state, or fork just before an earlier message.", 13.0, 400.0, "text-secondary").wrap())
        .child(options);
    if let Some(error) = &p.error {
        panel = panel.child(label(t, error, 13.0, 400.0, "error").wrap());
    }
    rune::el()
        .absolute(0.0, 0.0)
        .size(s.window_size.0, s.window_size.1)
        .fill(t.c("scrim"))
        .center()
        .child(t.shadow(panel, "shadow").modal(true, |s: &mut State| {
            if s.composer.fork.as_ref().is_none_or(|p| !p.sending) {
                s.composer.menu = None;
                s.composer.fork = None;
            }
        }))
}
