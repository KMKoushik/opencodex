//! Gateway forms and permission requests, replacing the active composer's draft.
use crate::{State, sidebar::label};
use oc_gateway::prompt::Request;
use rune::{El, TextEdit, TextStyle, col, el, row, text_input};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
pub struct Docks {
    forms: Vec<Value>,
    permissions: Vec<Value>,
    form_id: String,
    answers: BTreeMap<String, Value>,
    custom: TextEdit,
    custom_on: BTreeSet<String>,
    index: usize,
    reviewing: bool,
    collapsed: bool,
    error: Option<String>,
    pub sending: bool,
}
impl State {
    pub fn refresh_docks(&mut self) {
        let Some(id) = self.selected.clone() else {
            return;
        };
        for kind in ["forms", "permissions"] {
            self.prompt_request(Request::Get {
                tag: format!("{kind}:{id}"),
                path: format!("sessions/{id}/{kind}"),
                query: vec![],
            });
        }
    }
}
pub fn receive(s: &mut State, tag: &str, value: Value) {
    let Some((kind, id)) = tag.split_once(':') else {
        return;
    };
    if s.selected.as_deref() != Some(id) {
        return;
    }
    let items = value.as_array().cloned().unwrap_or_default();
    match kind {
        "forms" => {
            let id = items
                .first()
                .and_then(|v| v["id"].as_str())
                .unwrap_or("")
                .to_owned();
            if id != s.docks.form_id {
                s.docks.form_id = id;
                s.docks.answers.clear();
                s.docks.custom_on.clear();
                s.docks.index = 0;
                s.docks.reviewing = false;
                s.docks.custom.clear();
                s.docks.error = None;
                if let Some(fields) = items.first().and_then(|f| f["fields"].as_array()) {
                    for field in fields {
                        if let (Some(key), Some(default)) =
                            (field["key"].as_str(), field.get("default"))
                        {
                            s.docks.answers.insert(key.into(), default.clone());
                        }
                    }
                }
            }
            s.docks.forms = items;
        }
        "permissions" => s.docks.permissions = items,
        _ => {}
    }
}
pub fn capture_selection(s: &mut State, reviewing: bool) {
    if let Some(field) = fields(&s.docks).first() {
        let key = field["key"].as_str().unwrap_or("").to_owned();
        let value = field["options"][0]["value"].clone();
        s.docks.answers.insert(key, value);
        s.docks.reviewing = reviewing;
    }
}
fn fields(d: &Docks) -> Vec<&Value> {
    d.forms
        .first()
        .and_then(|f| f["fields"].as_array())
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
fn title(field: &Value) -> &str {
    field["description"]
        .as_str()
        .or_else(|| field["title"].as_str())
        .or_else(|| field["key"].as_str())
        .unwrap_or("Question")
}
fn button(s: &State, title: &str) -> El {
    s.theme
        .paint(
            label(&s.theme, title, 12.5, 500.0, "text")
                .px(10.0)
                .py(7.0)
                .radius(8.0),
            "chip",
        )
        .hover(s.theme.c("hover"))
        .role("button")
        .label(title)
        .focusable(true)
}
fn validate(field: &Value, value: Option<&Value>) -> Option<String> {
    if field["type"] == "external" {
        return None;
    }
    let empty = value.is_none_or(|v| {
        v.is_null()
            || v.as_str().is_some_and(|s| s.trim().is_empty())
            || v.as_array().is_some_and(Vec::is_empty)
    });
    if empty {
        return (field["required"] == true)
            .then(|| "Choose or enter an answer to continue.".into());
    }
    let value = value.unwrap();
    if field["type"] == "multiselect" {
        let Some(items) = value.as_array() else {
            return Some("Choose one or more answers.".into());
        };
        if field["minItems"]
            .as_u64()
            .is_some_and(|n| items.len() < (n as usize))
            || field["maxItems"]
                .as_u64()
                .is_some_and(|n| items.len() > (n as usize))
        {
            return Some("Check the number of selected answers.".into());
        }
    }
    if let Some(text) = value.as_str() {
        if field["minLength"]
            .as_u64()
            .is_some_and(|n| text.chars().count() < (n as usize))
            || field["maxLength"]
                .as_u64()
                .is_some_and(|n| text.chars().count() > (n as usize))
        {
            return Some("Check the answer length.".into());
        }
    }
    None
}
fn reply(s: &mut State, path: String, body: Value, delete: bool) {
    if s.docks.sending {
        return;
    }
    if s.prompt_request(Request::Mutate {
        tag: "dock-reply".into(),
        path,
        body,
        delete,
    }) {
        s.docks.sending = true;
        s.docks.error = None;
    }
}
fn advance(s: &mut State) {
    if s.docks.sending {
        return;
    }
    if s.docks.collapsed {
        s.docks.collapsed = false;
        return;
    }
    let fs = fields(&s.docks);
    let index = s.docks.index.min(fs.len().saturating_sub(1));
    for (i, f) in fs.iter().enumerate() {
        if (s.docks.reviewing || i == index)
            && let Some(error) = validate(f, s.docks.answers.get(f["key"].as_str().unwrap_or("")))
        {
            s.docks.index = i;
            s.docks.reviewing = false;
            s.docks.error = Some(error);
            return;
        }
    }
    let count = fs.len();
    s.docks.error = None;
    if !s.docks.reviewing {
        if index + 1 < count {
            s.docks.index = index + 1;
            s.docks.custom.clear();
        } else {
            s.docks.reviewing = true;
        }
        return;
    }
    let Some(id) = s.selected.clone() else {
        return;
    };
    reply(
        s,
        format!("sessions/{id}/forms/{}", s.docks.form_id),
        json!({"answer":s.docks.answers}),
        false,
    );
}
pub fn active(s: &State) -> bool {
    s.selected.is_some() && (!s.docks.forms.is_empty() || !s.docks.permissions.is_empty())
}
pub fn waiting_label(s: &State) -> &'static str {
    if !s.docks.permissions.is_empty() {
        "Waiting for approval"
    } else {
        "Waiting for your answer"
    }
}
pub fn view(s: &State) -> El {
    if !active(s) {
        return el();
    }
    let t = &s.theme;
    let mut out = col().w_full().gap(8.0);
    if let Some(request) = s.docks.permissions.first() {
        let id = request["id"].as_str().unwrap_or("").to_owned();
        let mut actions = row().gap(6.0);
        for (name, decision) in [
            ("Allow once", "once"),
            ("Always allow", "always"),
            ("Reject", "reject"),
        ] {
            if decision == "always" && request["save"].as_array().is_none_or(Vec::is_empty) {
                continue;
            }
            let id = id.clone();
            actions = actions.child(button(s, name).on_press(move |s: &mut State| {
                if let Some(session) = &s.selected {
                    reply(
                        s,
                        format!("sessions/{session}/permissions/{id}"),
                        json!({"decision":decision}),
                        false,
                    );
                }
            }));
        }
        let resources = request["resources"]
            .as_array()
            .map(|r| {
                r.iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default();
        out = out.child(
            col()
                .w_full()
                .padding(16.0)
                .gap(10.0)
                .radius(14.0)
                .fill(t.c("surface"))
                .border(1.0, t.c("border"))
                .child(label(
                    t,
                    request["action"].as_str().unwrap_or("Permission request"),
                    14.0,
                    600.0,
                    "text",
                ))
                .child(
                    label(
                        t,
                        request["message"].as_str().unwrap_or(""),
                        13.0,
                        400.0,
                        "text-secondary",
                    )
                    .wrap(),
                )
                .child(label(t, &resources, 12.0, 400.0, "text-secondary").wrap())
                .child(actions),
        );
    }
    if s.docks.forms.is_empty() {
        return out;
    }
    let fs = fields(&s.docks);
    let index = s.docks.index.min(fs.len().saturating_sub(1));
    let mut dock = col()
        .key("question-dock")
        .w_full()
        .max_h((s.window_size.1 * 0.55).min(480.0))
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .radius(18.0)
        .fill(t.c("surface"))
        .border(1.0, t.c("border-heavy"))
        .padding(14.0)
        .gap(8.0);
    let header = if s.docks.reviewing {
        "Review answers".into()
    } else if fs.len() > 1 {
        format!("Question {} of {}", index + 1, fs.len())
    } else {
        "Question".into()
    };
    dock = dock.child(
        row()
            .w_full()
            .h(24.0)
            .justify_between()
            .child(
                row()
                    .gap(10.0)
                    .center_y()
                    .child(label(t, &header, 12.0, 500.0, "text-secondary"))
                    .child(label(
                        t,
                        if s.docks.reviewing {
                            ""
                        } else {
                            fs.get(index)
                                .and_then(|f| f["title"].as_str())
                                .unwrap_or("")
                        },
                        12.0,
                        400.0,
                        "text-tertiary",
                    )),
            )
            .child(
                crate::sidebar::icon_button_size(
                    t,
                    &crate::icons::DOWN,
                    if s.docks.collapsed {
                        "Expand"
                    } else {
                        "Collapse"
                    },
                    14.0,
                )
                .on_press(|s: &mut State| s.docks.collapsed = !s.docks.collapsed),
            ),
    );
    if !s.docks.collapsed {
        if s.docks.reviewing {
            dock = dock
                .child(label(t, "Check your answers before sending", 15.0, 600.0, "text").mb(12.0));
            for (i, f) in fs.iter().enumerate() {
                let answer = s.docks.answers.get(f["key"].as_str().unwrap_or(""));
                let answer = answer
                    .map(|v| {
                        v.as_str()
                            .map(str::to_owned)
                            .unwrap_or_else(|| v.to_string())
                    })
                    .unwrap_or("Not answered".into());
                dock = dock.child(
                    row()
                        .w_full()
                        .py(12.0)
                        .gap(12.0)
                        .child(
                            col()
                                .grow(1.0)
                                .child(label(t, title(f), 13.0, 500.0, "text").wrap())
                                .child(label(t, &answer, 13.0, 400.0, "text-secondary").wrap()),
                        )
                        .child(button(s, "Edit").on_press(move |s: &mut State| {
                            s.docks.index = i;
                            s.docks.reviewing = false;
                            s.docks.custom.clear();
                        })),
                );
            }
        } else if let Some(field) = fs.get(index) {
            let key = field["key"].as_str().unwrap_or("").to_owned();
            let multi = field["type"] == "multiselect";
            dock = dock.child(label(t, title(field), 14.0, 500.0, "text").wrap());
            if let Some(options) = field["options"].as_array() {
                dock = dock.child(label(
                    t,
                    if multi {
                        "Select one or more answers"
                    } else {
                        "Select one answer"
                    },
                    12.0,
                    400.0,
                    "text-tertiary",
                ));
                for (i, option) in options.iter().enumerate() {
                    let value = option["value"].clone();
                    let key = key.clone();
                    let selected = s.docks.answers.get(&key).is_some_and(|a| {
                        a == &value || a.as_array().is_some_and(|a| a.contains(&value))
                    });
                    let line = row()
                        .key(format!("question-option-{i}"))
                        .w_full()
                        .padding(10.0)
                        .gap(10.0)
                        .radius(9.0)
                        .fill(t.c(if selected { "selected" } else { "surface" }))
                        .role(if multi { "checkbox" } else { "radio" })
                        .focusable(true)
                        .child(label(
                            t,
                            if selected { "●" } else { "○" },
                            14.0,
                            500.0,
                            "text-secondary",
                        ))
                        .child(
                            col()
                                .grow(1.0)
                                .child(
                                    label(
                                        t,
                                        option["label"]
                                            .as_str()
                                            .or_else(|| value.as_str())
                                            .unwrap_or("Option"),
                                        13.0,
                                        500.0,
                                        "text",
                                    )
                                    .wrap(),
                                )
                                .child(
                                    label(
                                        t,
                                        option["description"].as_str().unwrap_or(""),
                                        12.0,
                                        400.0,
                                        "text-secondary",
                                    )
                                    .wrap(),
                                ),
                        )
                        .on_press(move |s: &mut State| {
                            if s.docks.sending {
                                return;
                            }
                            if multi {
                                let mut values = s
                                    .docks
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
                                s.docks.answers.insert(key.clone(), json!(values));
                            } else {
                                s.docks.answers.insert(key.clone(), value.clone());
                                s.docks.custom_on.remove(&key);
                            }
                            s.docks.error = None;
                        });
                    dock = dock.child(line);
                }
            }
            if field["custom"] == true {
                let custom_key = key.clone();
                let on = s.docks.custom_on.contains(&key);
                dock = dock.child(
                    row()
                        .w_full()
                        .padding(10.0)
                        .gap(10.0)
                        .radius(8.0)
                        .fill(t.c(if on { "selected" } else { "surface" }))
                        .role(if multi { "checkbox" } else { "radio" })
                        .focusable(true)
                        .child(label(
                            t,
                            if on { "●" } else { "○" },
                            14.0,
                            400.0,
                            "text-secondary",
                        ))
                        .child(label(t, "Type your own answer", 13.0, 400.0, "text"))
                        .on_press_tx(move |s: &mut State, tx| {
                            s.docks.custom_on.insert(custom_key.clone());
                            s.docks.custom.clear();
                            if !multi {
                                s.docks.answers.remove(&custom_key);
                            }
                            tx.focus("question-custom", false);
                        }),
                );
            }
            if field["options"].is_null() || s.docks.custom_on.contains(&key) {
                let option_values: Vec<_> = field["options"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|o| o["value"].clone())
                    .collect();
                dock = dock.child(
                    text_input(&s.docks.custom, TextStyle::new(13.0, 400.0))
                        .key("question-custom")
                        .w_full()
                        .min_h(36.0)
                        .padding(8.0)
                        .radius(8.0)
                        .border(1.0, t.c("border"))
                        .color(t.c("text"))
                        .placeholder("Type your own answer", t.c("text-tertiary"))
                        .on_edit(|s: &mut State| &mut s.docks.custom)
                        .on_input_change(move |s: &mut State, _| {
                            let text = s.docks.custom.text.clone();
                            let answer = if multi {
                                let mut values: Vec<_> = s
                                    .docks
                                    .answers
                                    .get(&key)
                                    .and_then(Value::as_array)
                                    .into_iter()
                                    .flatten()
                                    .filter(|v| option_values.contains(v))
                                    .cloned()
                                    .collect();
                                for line in text.lines().map(str::trim).filter(|s| !s.is_empty()) {
                                    let value = json!(line);
                                    if !values.contains(&value) {
                                        values.push(value);
                                    }
                                }
                                json!(values)
                            } else {
                                json!(text)
                            };
                            s.docks.answers.insert(key.clone(), answer);
                            s.docks.error = None;
                        })
                        .on_submit(|s: &mut State, _| advance(s)),
                );
            }
        }
    }
    if let Some(error) = &s.docks.error {
        dock = dock.child(label(t, error, 12.0, 400.0, "error").wrap());
    }
    let mut footer = row()
        .w_full()
        .gap(8.0)
        .child(button(s, "Dismiss").on_press(|s: &mut State| {
            if let Some(id) = &s.selected {
                reply(
                    s,
                    format!("sessions/{id}/forms/{}", s.docks.form_id),
                    Value::Null,
                    true,
                );
            }
        }))
        .child(el().grow(1.0));
    if s.docks.reviewing || index > 0 {
        footer = footer.child(button(s, "Back").on_press(|s: &mut State| {
            s.docks.reviewing = false;
            s.docks.index = s.docks.index.saturating_sub(1);
        }));
    }
    footer = footer.child(
        t.paint(
            button(
                s,
                if s.docks.sending {
                    "Sending…"
                } else if s.docks.reviewing {
                    "Send answers ↵"
                } else if index + 1 >= fs.len() {
                    "Review answers"
                } else {
                    "Next"
                },
            )
            .color(t.c("on-primary")),
            "primary-glaze",
        )
        .key("question-next")
        .on_press(advance),
    );
    out.child(dock.child(footer))
}
