//! Independent request state for side/subagent readers; mutations never target the main chat.
use super::worker::Operation;
use crate::{State, sidebar::label};
use rune::{El, TextEdit, TextStyle, col, row, text_input};
use serde_json::{Value, json};
use std::collections::BTreeMap;
#[derive(Default)]
pub struct Requests {
    session: String,
    revision: u64,
    pub forms: Vec<Value>,
    pub permissions: Vec<Value>,
    answers: BTreeMap<String, Value>,
    edits: BTreeMap<String, TextEdit>,
    index: usize,
    review: bool,
}
pub fn poll(s: &mut State) {
    if !s.workbench.open
        || !matches!(
            s.workbench.panel,
            super::Panel::Side | super::Panel::Subagents
        )
    {
        return;
    }
    let Some(id) = s.workbench.reader.clone() else {
        return;
    };
    if s.workbench.requests.session == id && s.workbench.requests.revision == s.snapshot.revision {
        return;
    }
    if s.workbench.requests.session != id {
        s.workbench.requests = Requests {
            session: id.clone(),
            ..Default::default()
        };
    }
    s.workbench.requests.revision = s.snapshot.revision;
    for kind in ["forms", "permissions"] {
        s.workspace_get(
            &format!("reader-{kind}:{id}"),
            format!("sessions/{id}/{kind}"),
            vec![],
            true,
        );
    }
}
pub fn receive(s: &mut State, tag: &str, v: Value) -> bool {
    let Some((kind, id)) = tag.split_once(':') else {
        return false;
    };
    if !["reader-forms", "reader-permissions", "reader-reply"].contains(&kind) {
        return false;
    }
    if s.workbench.reader.as_deref() != Some(id) {
        return true;
    }
    let d = &mut s.workbench.requests;
    if kind == "reader-reply" {
        d.revision = u64::MAX;
        return true;
    }
    let values = v.as_array().cloned().unwrap_or_default();
    if kind == "reader-permissions" {
        d.permissions = values;
        return true;
    }
    if d.forms.first().map(|f| &f["id"]) != values.first().map(|f| &f["id"]) {
        d.index = 0;
        d.review = false;
        d.answers.clear();
        d.edits.clear();
        for f in values
            .first()
            .and_then(|f| f["fields"].as_array())
            .into_iter()
            .flatten()
        {
            let key = f["key"].as_str().unwrap_or("").to_owned();
            if let Some(default) = f.get("default") {
                d.answers.insert(key.clone(), default.clone());
            }
            d.edits
                .insert(key, TextEdit::new(f["default"].as_str().unwrap_or("")));
        }
    }
    d.forms = values;
    true
}
fn fields(d: &Requests) -> Vec<&Value> {
    d.forms
        .first()
        .and_then(|v| v["fields"].as_array())
        .into_iter()
        .flatten()
        .filter(|f| {
            f["hidden"] != true
                && f["when"].as_array().is_none_or(|conditions| {
                    conditions.iter().all(|c| {
                        let equal =
                            d.answers.get(c["key"].as_str().unwrap_or("")) == Some(&c["value"]);
                        if c["op"] == "eq" { equal } else { !equal }
                    })
                })
        })
        .collect()
}
pub fn status(s: &State) -> Option<&'static str> {
    let d = &s.workbench.requests;
    if !d.permissions.is_empty() {
        Some("Waiting for permission")
    } else if !d.forms.is_empty() {
        Some("Waiting for an answer")
    } else {
        None
    }
}
pub fn permissions(s: &State) -> El {
    let mut body = col().w_full().gap(8.0);
    for request in &s.workbench.requests.permissions {
        let mut actions = row().gap(6.0);
        let id = request["id"].as_str().unwrap_or("");
        for (name, decision) in [
            ("Allow once", "once"),
            ("Always allow", "always"),
            ("Reject", "reject"),
        ] {
            if decision == "always" && request["save"].as_array().is_none_or(Vec::is_empty) {
                continue;
            }
            let id = id.to_owned();
            actions = actions.child(
                super::documents::button(s, name)
                    .disabled(
                        s.workbench
                            .pending
                            .iter()
                            .any(|t| t.starts_with("reader-reply:")),
                    )
                    .on_press(move |s: &mut State| {
                        if let Some(session) = s.workbench.reader.clone() {
                            s.workspace_request(
                                format!("reader-reply:{session}"),
                                Operation::Post {
                                    path: format!("sessions/{session}/permissions/{id}"),
                                    body: json!({"decision":decision}),
                                },
                            );
                        }
                    }),
            );
        }
        body = body.child(
            col()
                .w_full()
                .padding(16.0)
                .gap(10.0)
                .radius(14.0)
                .fill(s.theme.c("surface"))
                .border(1.0, s.theme.c("border"))
                .child(label(
                    &s.theme,
                    request["action"].as_str().unwrap_or("Permission request"),
                    14.0,
                    600.0,
                    "text",
                ))
                .child(
                    label(
                        &s.theme,
                        request["message"].as_str().unwrap_or(""),
                        13.0,
                        400.0,
                        "text-secondary",
                    )
                    .wrap(),
                )
                .child(
                    label(
                        &s.theme,
                        request["resources"]
                            .as_array()
                            .into_iter()
                            .flatten()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join("\n"),
                        12.0,
                        400.0,
                        "text-secondary",
                    )
                    .wrap(),
                )
                .child(actions),
        );
    }
    body
}
pub fn form(s: &State) -> Option<El> {
    let d = &s.workbench.requests;
    let form = d.forms.first()?;
    let fs = fields(d);
    let mut card = col()
        .w_full()
        .padding(16.0)
        .radius(18.0)
        .gap(12.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border"));
    let title = if d.review {
        "Review your answers"
    } else {
        "Question"
    };
    card = card.child(label(&s.theme, title, 14.0, 500.0, "text"));
    if d.review {
        for f in &fs {
            let key = f["key"].as_str().unwrap_or("");
            card = card.child(
                label(
                    &s.theme,
                    format!(
                        "{}: {}",
                        f["title"].as_str().unwrap_or(key),
                        d.answers
                            .get(key)
                            .map(|v| v
                                .as_str()
                                .map(str::to_owned)
                                .unwrap_or_else(|| v.to_string()))
                            .unwrap_or_default()
                    ),
                    13.0,
                    400.0,
                    "text-secondary",
                )
                .wrap(),
            );
        }
    } else if let Some(f) = fs.get(d.index) {
        let key = f["key"].as_str().unwrap_or("").to_owned();
        card = card.child(
            label(
                &s.theme,
                f["description"]
                    .as_str()
                    .or_else(|| f["title"].as_str())
                    .unwrap_or(&key),
                14.0,
                500.0,
                "text",
            )
            .wrap(),
        );
        let kind = f["type"].as_str().unwrap_or("text");
        let options = if kind == "boolean" {
            vec![
                json!({"label":"Yes","value":true}),
                json!({"label":"No","value":false}),
            ]
        } else {
            f["options"].as_array().cloned().unwrap_or_default()
        };
        for (index, option) in options.into_iter().enumerate() {
            let key = key.clone();
            let value = option["value"].clone();
            let multi = kind == "multiselect";
            let selected = d.answers.get(&key).is_some_and(|v| {
                if multi {
                    v.as_array().is_some_and(|a| a.contains(&value))
                } else {
                    v == &value
                }
            });
            card = card.child(
                super::documents::button(
                    s,
                    &format!("{}  {}", index + 1, option["label"].as_str().unwrap_or("")),
                )
                .checked(selected)
                .fill(s.theme.c(if selected { "selected" } else { "surface" }))
                .on_press(move |s: &mut State| {
                    let d = &mut s.workbench.requests;
                    if multi {
                        let mut values = d
                            .answers
                            .get(&key)
                            .and_then(Value::as_array)
                            .cloned()
                            .unwrap_or_default();
                        if values.contains(&value) {
                            values.retain(|v| v != &value);
                        } else {
                            values.push(value.clone());
                        }
                        d.answers.insert(key.clone(), json!(values));
                    } else {
                        d.answers.insert(key.clone(), value.clone());
                    }
                }),
            );
        }
        if !matches!(kind, "select" | "multiselect" | "boolean" | "external") {
            if let Some(edit) = d.edits.get(&key) {
                let change = key.clone();
                let numeric = kind == "number";
                card = card.child(
                    text_input(edit, TextStyle::new(14.0, 400.0))
                        .label("Your answer")
                        .w_full()
                        .min_h(38.0)
                        .padding(8.0)
                        .fill(s.theme.c("surface-under"))
                        .color(s.theme.c("text"))
                        .on_edit(move |s: &mut State| {
                            s.workbench.requests.edits.get_mut(&key).unwrap()
                        })
                        .on_input_change(move |s: &mut State, _| {
                            let text = &s.workbench.requests.edits[&change].text;
                            let value = if numeric {
                                text.parse::<f64>()
                                    .ok()
                                    .map(|v| json!(v))
                                    .unwrap_or(Value::Null)
                            } else {
                                json!(text)
                            };
                            s.workbench.requests.answers.insert(change.clone(), value);
                        }),
                );
            }
        }
    }
    let id = form["id"].as_str().unwrap_or("").to_owned();
    let dismiss = id.clone();
    let mut actions = row().w_full().gap(8.0);
    if d.review || d.index > 0 {
        actions = actions.child(
            super::documents::button(s, "Back").on_press(|s: &mut State| {
                let d = &mut s.workbench.requests;
                if d.review {
                    d.review = false;
                } else {
                    d.index = d.index.saturating_sub(1);
                }
            }),
        );
    }
    actions = actions
        .child(
            super::documents::button(s, "Dismiss").on_press(move |s: &mut State| {
                if let Some(session) = s.workbench.reader.clone() {
                    s.workspace_request(
                        format!("reader-reply:{session}"),
                        Operation::Delete(format!("sessions/{session}/forms/{dismiss}")),
                    );
                }
            }),
        )
        .child(rune::el().grow(1.0))
        .child(
            super::documents::button(
                s,
                if d.review {
                    "Submit answers"
                } else {
                    "Continue"
                },
            )
            .disabled(
                s.workbench
                    .pending
                    .iter()
                    .any(|t| t.starts_with("reader-reply:")),
            )
            .on_press(move |s: &mut State| {
                let d = &mut s.workbench.requests;
                let fs = fields(d);
                let index = d.index;
                let invalid = fs
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| d.review || *i == index)
                    .find(|(_, f)| {
                        let value = d.answers.get(f["key"].as_str().unwrap_or(""));
                        f["required"] == true
                            && value.is_none_or(|v| {
                                v.is_null()
                                    || v.as_str().is_some_and(|s| s.trim().is_empty())
                                    || v.as_array().is_some_and(Vec::is_empty)
                            })
                    })
                    .map(|(i, _)| i);
                if let Some(index) = invalid {
                    d.index = index;
                    d.review = false;
                    s.workbench.error = Some("Choose or enter an answer to continue.".into());
                    return;
                }
                if !d.review {
                    if index + 1 < fs.len() {
                        d.index += 1;
                    } else {
                        d.review = true;
                    }
                    return;
                }
                let body = json!({"answer":d.answers});
                if let Some(session) = s.workbench.reader.clone() {
                    s.workspace_request(
                        format!("reader-reply:{session}"),
                        Operation::Post {
                            path: format!("sessions/{session}/forms/{id}"),
                            body,
                        },
                    );
                }
            }),
        );
    Some(card.child(actions))
}
