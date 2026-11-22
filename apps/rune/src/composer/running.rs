use crate::{State, sidebar::label};
use oc_gateway::prompt::Request;
use rune::{El, col, row};
use serde_json::{Value, json};

#[derive(Default)]
pub struct Running {
    pub inbox: Vec<oc_gateway::timeline::Row>,
    pub session: String,
    pub moving: bool,
    pub error: Option<String>,
    pub expanded: bool,
}
pub fn blocking(s: &State) -> Vec<&Value> {
    if !s.chat.data.running {
        return vec![];
    }
    let Some(last) = s
        .chat
        .data
        .visible()
        .iter()
        .rev()
        .find(|m| m.r#type == "assistant")
        .filter(|m| m.time.completed.is_none())
    else {
        return vec![];
    };
    last.fields
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|part| {
            part["type"] == "tool"
                && part["state"]["status"] == "running"
                && (part["name"] == "shell" || part["name"] == "subagent")
        })
        .collect()
}
pub fn background(s: &mut State) {
    if s.composer.running.moving {
        return;
    }
    if let Some(id) = s.selected.clone()
        && s.prompt_request(Request::Mutate {
            tag: format!("background:{id}"),
            path: format!("sessions/{id}/background"),
            body: json!({}),
            delete: false,
        })
    {
        s.composer.running.moving = true;
        s.composer.running.error = None;
    }
}
pub fn receive(s: &mut State, tag: &str, result: Result<Value, String>) {
    let Some((kind, id)) = tag.split_once(':') else {
        return;
    };
    if s.selected.as_deref() != Some(id) {
        return;
    }
    if kind == "background" {
        s.composer.running.moving = false;
    }
    match result {
        Ok(Value::Array(items)) if kind == "inbox" => {
            s.composer.running.session = id.into();
            s.composer.running.inbox = items
                .into_iter()
                .filter(|item| item["type"] == "user")
                .filter_map(|mut item| {
                    let mut payload = item["payload"].take();
                    payload["id"] = item["id"].take();
                    payload["time"] = item["time"].take();
                    payload["type"] = json!("user");
                    let message: oc_gateway::types::Message =
                        serde_json::from_value(payload).ok()?;
                    Some(oc_gateway::timeline::Row {
                        id: message.id.clone(),
                        version: s.snapshot.revision,
                        kind: oc_gateway::timeline::Kind::Message(std::sync::Arc::new(message)),
                    })
                })
                .collect();
        }
        Err(e) => {
            s.composer.running.error = Some(if kind == "background" {
                format!("Could not move work to the background. {e}")
            } else {
                e
            })
        }
        _ => {}
    }
}
pub fn view(s: &State) -> El {
    let t = &s.theme;
    let mut out = col().w_full().gap(8.0);
    if s.selected.as_deref() == Some(&s.composer.running.session) {
        for item in s
            .composer
            .running
            .inbox
            .iter()
            .filter(|i| !s.chat.data.messages.iter().any(|m| i.id == m.id))
        {
            out = out.child(
                col()
                    .w_full()
                    .items_end()
                    .child(crate::chat::conversation_row(
                        s,
                        item,
                        (s.window_size.0 - s.sidebar_width() - 44.0).min(768.0),
                        false,
                    ))
                    .child(label(
                        t,
                        "Pending in OpenCode",
                        12.0,
                        400.0,
                        "text-tertiary",
                    )),
            );
        }
    }
    let parts = blocking(s);
    if !parts.is_empty() {
        let shells = parts.iter().filter(|p| p["name"] == "shell").count();
        let subagents = parts.len() - shells;
        let mut tray = col().w_full().gap(4.0).child(
            row()
                .w_full()
                .gap(12.0)
                .center_y()
                .child(label(
                    t,
                    format!("Subagents {subagents}"),
                    12.0,
                    500.0,
                    "text-secondary",
                ))
                .child(label(
                    t,
                    format!("Shell {shells}"),
                    12.0,
                    500.0,
                    "text-secondary",
                ))
                .child(rune::el().grow(1.0))
                .child(
                    label(
                        t,
                        if s.composer.running.moving {
                            "Moving…"
                        } else {
                            "Move to background"
                        },
                        12.0,
                        500.0,
                        "text-secondary",
                    )
                    .padding(6.0)
                    .role("button")
                    .focusable(true)
                    .disabled(s.composer.running.moving)
                    .on_press(background),
                )
                .child(
                    crate::sidebar::icon_button_size(
                        t,
                        &crate::icons::DOWN,
                        if s.composer.running.expanded {
                            "Collapse running activity"
                        } else {
                            "Expand running activity"
                        },
                        14.0,
                    )
                    .on_press(|s: &mut State| {
                        s.composer.running.expanded = !s.composer.running.expanded
                    }),
                ),
        );
        if s.composer.running.expanded {
            for part in parts {
                tray = tray.child(
                    label(
                        t,
                        part["state"]["input"]["command"]
                            .as_str()
                            .or_else(|| part["state"]["input"]["description"].as_str())
                            .unwrap_or(""),
                        12.0,
                        400.0,
                        "text-secondary",
                    )
                    .truncate(),
                );
            }
        }
        out = out.child(tray);
    }
    if let Some(error) = &s.composer.running.error {
        out = out.child(label(t, error, 12.0, 400.0, "error").wrap());
    }
    out
}
