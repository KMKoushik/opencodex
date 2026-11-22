//! Gateway forms and permission requests, replacing the active composer's draft.
mod answer;
use answer::restore_input;
mod controls;
use controls::{button, indicator};
pub(crate) mod date;
mod format;
mod keyboard;
mod permission;
#[cfg(test)]
mod tests;
use crate::{State, sidebar::label};
use oc_gateway::prompt::Request;
use rune::{El, TextEdit, TextStyle, col, el, row, text_input};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
pub struct Docks {
    calendar: Option<date::Calendar>,
    pub revision: u64,
    forms: Vec<Value>,
    permissions: Vec<Value>,
    form_id: String,
    answers: BTreeMap<String, Value>,
    custom: TextEdit,
    custom_on: BTreeSet<String>,
    index: usize,
    active_key: Option<String>,
    reviewing: bool,
    collapsed: bool,
    error: Option<String>,
    pub sending: bool,
    pending_path: Option<String>,
    permission_pending: BTreeSet<String>,
    permission_errors: BTreeMap<String, String>,
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
            let changed = id != s.docks.form_id;
            if changed {
                s.docks.calendar = None;
                if s.composer.menu == Some(crate::composer::state::Menu::Calendar) {
                    s.composer.menu = None;
                }
                s.docks.form_id = id;
                s.docks.answers.clear();
                s.docks.custom_on.clear();
                s.docks.index = 0;
                s.docks.active_key = None;
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
            if changed {
                restore_input(&mut s.docks);
            }
        }
        "permissions" => {
            if s.docks.permissions != items {
                s.docks.permissions = items;
                s.docks.revision = s.docks.revision.wrapping_add(1);
            }
        }
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
        .filter(|f| f["hidden"] != true && answer::applies(f, &d.answers))
        .collect()
}
fn title(field: &Value) -> &str {
    field["description"]
        .as_str()
        .or_else(|| field["title"].as_str())
        .or_else(|| field["key"].as_str())
        .unwrap_or("Question")
}
fn current_index(d: &Docks) -> usize {
    fields(d)
        .iter()
        .position(|f| f["key"].as_str() == d.active_key.as_deref())
        .unwrap_or(0)
}

pub fn replied(s: &mut State, path: &str, result: Result<Value, String>) {
    if s.docks.permission_pending.remove(path) {
        s.docks.revision = s.docks.revision.wrapping_add(1);
        if let Err(error) = result {
            s.docks.permission_errors.insert(path.into(), error);
        } else {
            s.refresh_docks();
        }
        return;
    }
    if s.docks.pending_path.as_deref() != Some(path) {
        return;
    }
    s.docks.pending_path = None;
    s.docks.sending = false;
    match result {
        Err(error) => s.docks.error = Some(error),
        Ok(_) => {
            if path.contains("/forms/") {
                s.docks.forms.retain(|form| {
                    !path.ends_with(&format!("/{}", form["id"].as_str().unwrap_or("")))
                });
            }
            s.refresh_docks();
        }
    }
}
fn reply(s: &mut State, path: String, body: Value, delete: bool) {
    s.docks.revision = s.docks.revision.wrapping_add(1);
    let permission = path.contains("/permissions/");
    if s.composer.access_pending
        || if permission {
            s.docks.permission_pending.contains(&path)
        } else {
            s.docks.sending
        }
    {
        return;
    }
    if s.prompt_request(Request::Mutate {
        tag: format!("dock-reply:{path}"),
        path: path.clone(),
        body,
        delete,
    }) {
        if permission {
            s.docks.permission_errors.remove(&path);
            s.docks.permission_pending.insert(path);
        } else {
            s.docks.sending = true;
            s.docks.pending_path = Some(path);
            s.docks.error = None;
        }
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
    let index = current_index(&s.docks);
    for (i, f) in fs.iter().enumerate() {
        if (s.docks.reviewing || index + 1 >= fs.len() || i == index)
            && let Some(error) =
                answer::validate(f, s.docks.answers.get(f["key"].as_str().unwrap_or("")))
        {
            s.docks.index = i;
            s.docks.reviewing = false;
            s.docks.error = Some(error);
            restore_input(&mut s.docks);
            return;
        }
    }
    let count = fs.len();
    s.docks.error = None;
    if !s.docks.reviewing {
        if index + 1 < count {
            s.docks.index = index + 1;
            restore_input(&mut s.docks);
        } else {
            s.docks.reviewing = true;
        }
        return;
    }
    let Some(id) = s.selected.clone() else {
        return;
    };
    let answers: BTreeMap<_, _> = s.docks.forms[0]["fields"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|f| answer::applies(f, &s.docks.answers))
        .filter_map(|f| {
            let key = f["key"].as_str()?;
            Some((key.to_owned(), s.docks.answers.get(key)?.clone()))
        })
        .collect();
    reply(
        s,
        format!("sessions/{id}/forms/{}", s.docks.form_id),
        json!({"answer":answers}),
        false,
    );
}
pub fn active(s: &State) -> bool {
    s.selected.is_some() && (!s.docks.forms.is_empty() || !s.docks.permissions.is_empty())
}
pub fn has_question(s: &State) -> bool {
    s.selected.is_some() && !s.docks.forms.is_empty()
}
pub fn waiting_label(s: &State) -> &'static str {
    if !s.docks.permissions.is_empty() {
        "Waiting for permission"
    } else {
        "Waiting for your answer"
    }
}
pub fn permissions(s: &State) -> El {
    let mut out = col().w_full().gap(8.0);
    for request in &s.docks.permissions {
        out = out.child(permission::view(s, request));
    }
    out
}
pub fn has_permissions(s: &State) -> bool {
    s.selected.is_some() && !s.docks.permissions.is_empty()
}
pub fn view(s: &State) -> El {
    if !has_question(s) {
        return el();
    }
    let t = &s.theme;
    let out = col().w_full().gap(8.0);
    let fs = fields(&s.docks);
    let index = current_index(&s.docks);
    let mut dock = col()
        .key("question-dock")
        .on_key(keyboard::handle)
        .w_full()
        .radius(18.0)
        .fill(t.c("surface"))
        .border(1.0, t.c("border-heavy"))
        .border_layout();
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
            .h(44.0)
            .px(14.0)
            .py(8.0)
            .justify_between()
            .child(
                row()
                    .gap(10.0)
                    .center_y()
                    .child(label(t, &header, 12.0, 400.0, "text-secondary"))
                    .child(label(
                        t,
                        if s.docks.reviewing
                            || fs
                                .get(index)
                                .is_none_or(|f| f["description"].as_str().is_none_or(str::is_empty))
                        {
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
                    if s.docks.collapsed {
                        &crate::icons::UP
                    } else {
                        &crate::icons::DOWN
                    },
                    if s.docks.collapsed {
                        "Expand question"
                    } else {
                        "Collapse question"
                    },
                    16.0,
                )
                .on_press(|s: &mut State| s.docks.collapsed = !s.docks.collapsed),
            ),
    );
    let frame = dock;
    let mut dock = col()
        .key(format!(
            "question-body-{}-{}-{}",
            s.docks.form_id,
            s.docks.active_key.as_deref().unwrap_or(""),
            s.docks.reviewing
        ))
        .w_full()
        .px(10.0)
        .pt(4.0)
        .pb(12.0)
        .gap(0.0)
        .max_h((s.window_size.1 * 0.55).min(480.0))
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        });
    if s.docks.collapsed {
        dock = dock.child(
            label(
                t,
                if s.docks.reviewing {
                    "Your answers are ready to send"
                } else {
                    fs.get(index).map(|f| title(f)).unwrap_or("Question")
                },
                13.0,
                400.0,
                "text-secondary",
            )
            .wrap(),
        );
    } else {
        if s.docks.reviewing {
            dock = dock.child(
                label(t, "Check your answers before sending", 14.0, 500.0, "text")
                    .mx(8.0)
                    .mb(12.0),
            );
            for (i, f) in fs.iter().enumerate() {
                let answer = s.docks.answers.get(f["key"].as_str().unwrap_or(""));
                let answer = answer::review(f, answer);
                dock = dock.child(
                    row()
                        .mx(8.0)
                        .py(12.0)
                        .border_sides([1.0, 0.0, 0.0, 0.0], t.c("border"))
                        .border_layout()
                        .gap(12.0)
                        .child(
                            col()
                                .grow(1.0)
                                .gap(6.0)
                                .child(label(t, title(f), 13.0, 400.0, "text-secondary").wrap())
                                .child(label(t, &answer, 13.0, 400.0, "text").wrap()),
                        )
                        .child(
                            button(s, "Edit")
                                .key(format!("question-edit-{i}"))
                                .on_press(move |s: &mut State| {
                                    s.docks.index = i;
                                    s.docks.reviewing = false;
                                    restore_input(&mut s.docks);
                                }),
                        ),
                );
            }
        } else if let Some(field) = fs.get(index) {
            let key = field["key"].as_str().unwrap_or("").to_owned();
            let multi = field["type"] == "multiselect";
            let numeric = field["type"] == "number" || field["type"] == "integer";
            dock = dock.child(
                label(t, title(field), 14.0, 500.0, "text")
                    .wrap()
                    .mx(8.0)
                    .mb(12.0),
            );
            if field["type"] == "boolean" {
                for (i, value) in [true, false].into_iter().enumerate() {
                    let key = key.clone();
                    let selected =
                        s.docks.answers.get(&key).and_then(Value::as_bool) == Some(value);
                    dock = dock.child(
                        row()
                            .w_full()
                            .min_h(40.0)
                            .mb(if i == 0 { 3.0 } else { 0.0 })
                            .padding(10.0)
                            .gap(10.0)
                            .radius(8.0)
                            .fill(t.c(if selected { "selected" } else { "surface" }))
                            .hover(t.c("hover"))
                            .focusable(true)
                            .label(if value { "Yes" } else { "No" })
                            .child(indicator(s, selected, false))
                            .child(label(
                                t,
                                if value { "Yes" } else { "No" },
                                13.0,
                                400.0,
                                "text",
                            ))
                            .key(format!("question-option-{i}"))
                            .role("radio")
                            .checked(selected)
                            .tab_index(
                                if selected || (i == 0 && !s.docks.answers.contains_key(&key)) {
                                    0
                                } else {
                                    -1
                                },
                            )
                            .disabled(s.docks.sending)
                            .on_press(move |s: &mut State| {
                                s.docks.answers.insert(key.clone(), json!(value));
                                s.docks.error = None;
                            }),
                    );
                }
            }
            if field["type"] == "external" {
                let url = field["url"].as_str().unwrap_or("").to_owned();
                if url.to_lowercase().starts_with("http://")
                    || url.to_lowercase().starts_with("https://")
                {
                    dock = dock.child(
                        button(
                            s,
                            &format!(
                                "{} ↗",
                                field["title"]
                                    .as_str()
                                    .filter(|v| !v.is_empty())
                                    .unwrap_or("Open link")
                            ),
                        )
                        .on_press_tx(move |_: &mut State, tx| {
                            let _ = tx.open_url(&url);
                        }),
                    );
                } else {
                    dock = dock.child(label(
                        t,
                        "Open this request in OpenCode to continue.",
                        13.0,
                        400.0,
                        "text-secondary",
                    ));
                }
            }
            if let Some(options) = field["options"].as_array() {
                dock = dock.child(
                    label(
                        t,
                        if multi {
                            "Select one or more answers"
                        } else {
                            "Select one answer"
                        },
                        12.0,
                        400.0,
                        "text-tertiary",
                    )
                    .mx(8.0)
                    .mt(-4.0)
                    .mb(8.0),
                );
                for (i, option) in options.iter().enumerate() {
                    let value = option["value"].clone();
                    let key = key.clone();
                    let selected = (multi || !s.docks.custom_on.contains(&key))
                        && s.docks.answers.get(&key).is_some_and(|a| {
                            a == &value || a.as_array().is_some_and(|a| a.contains(&value))
                        });
                    let autofocus = selected || (i == 0 && !s.docks.answers.contains_key(&key));
                    let mut line = row()
                        .key(format!("question-option-{i}"))
                        .w_full()
                        .min_h(40.0)
                        .mb(if i + 1 < options.len() || field["custom"] == true {
                            3.0
                        } else {
                            0.0
                        })
                        .padding(10.0)
                        .gap(10.0)
                        .radius(8.0)
                        .hover(t.c("hover"))
                        .fill(t.c(if selected { "selected" } else { "surface" }))
                        .role(if multi { "checkbox" } else { "radio" })
                        .checked(selected)
                        .tab_index(
                            if multi || selected || (i == 0 && !s.docks.answers.contains_key(&key))
                            {
                                0
                            } else {
                                -1
                            },
                        )
                        .disabled(s.docks.sending)
                        .focusable(true)
                        .child(indicator(s, selected, multi))
                        .child(
                            col()
                                .gap(3.0)
                                .grow(1.0)
                                .child(
                                    label(
                                        t,
                                        option["label"]
                                            .as_str()
                                            .or_else(|| value.as_str())
                                            .unwrap_or("Option"),
                                        13.0,
                                        400.0,
                                        "text",
                                    )
                                    .font(TextStyle::new(13.0, 400.0).lh(18.2))
                                    .wrap(),
                                )
                                .children(
                                    option["description"]
                                        .as_str()
                                        .filter(|v| !v.is_empty())
                                        .map(|description| {
                                            label(t, description, 12.0, 400.0, "text-tertiary")
                                                .font(TextStyle::new(12.0, 400.0).lh(16.8))
                                                .wrap()
                                        }),
                                ),
                        )
                        .child(
                            label(
                                t,
                                if i < 9 {
                                    (i + 1).to_string()
                                } else {
                                    String::new()
                                },
                                11.0,
                                400.0,
                                "text-tertiary",
                            )
                            .font(TextStyle::new(11.0, 400.0).lh(20.0)),
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
                    if autofocus {
                        line = line.autofocus();
                    }
                    dock = dock.child(line);
                }
            }
            if field["custom"] == true {
                let custom_key = key.clone();
                let on = s.docks.custom_on.contains(&key);
                dock = dock.child(
                    row()
                        .key(format!(
                            "question-option-{}",
                            field["options"].as_array().map_or(0, Vec::len)
                        ))
                        .w_full()
                        .min_h(40.0)
                        .padding(10.0)
                        .gap(10.0)
                        .radius(8.0)
                        .fill(t.c(if on { "selected" } else { "surface" }))
                        .role(if multi { "checkbox" } else { "radio" })
                        .focusable(true)
                        .checked(on)
                        .disabled(s.docks.sending)
                        .child(indicator(s, on, multi))
                        .child(
                            label(t, "Type your own answer", 13.0, 400.0, "text")
                                .font(TextStyle::new(13.0, 400.0).lh(18.2)),
                        )
                        .on_press_tx(move |s: &mut State, tx| {
                            if multi && s.docks.custom_on.remove(&custom_key) {
                                let options: Vec<_> = fields(&s.docks)
                                    .get(current_index(&s.docks))
                                    .and_then(|f| f["options"].as_array())
                                    .into_iter()
                                    .flatten()
                                    .map(|o| o["value"].clone())
                                    .collect();
                                if let Some(Value::Array(values)) =
                                    s.docks.answers.get_mut(&custom_key)
                                {
                                    values.retain(|v| options.contains(v));
                                }
                                return;
                            }
                            s.docks.custom_on.insert(custom_key.clone());
                            if !multi {
                                s.docks
                                    .answers
                                    .insert(custom_key.clone(), json!(s.docks.custom.text));
                            }
                            tx.focus("question-custom", false);
                        }),
                );
            }
            if (field["options"].as_array().is_none_or(Vec::is_empty)
                || s.docks.custom_on.contains(&key))
                && field["type"] != "boolean"
                && field["type"] != "external"
            {
                let option_values: Vec<_> = field["options"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|o| o["value"].clone())
                    .collect();
                let input = text_input(&s.docks.custom, TextStyle::new(13.0, 400.0))
                    .key("question-custom")
                    .autofocus()
                    .w_full()
                    .min_h(if multi || s.docks.custom_on.contains(&key) {
                        60.0
                    } else {
                        40.0
                    })
                    .max_h(140.0)
                    .my(6.0)
                    .px(12.0)
                    .py(10.0)
                    .fill(t.c("secondary"))
                    .radius(8.0)
                    .border(1.0, t.c("border"))
                    .color(t.c("text"))
                    .placeholder(
                        field["placeholder"].as_str().unwrap_or(if multi {
                            "One answer per line…"
                        } else {
                            "Type your answer…"
                        }),
                        t.c("text-tertiary"),
                    )
                    .disabled(s.docks.sending)
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
                        } else if numeric && !text.is_empty() {
                            text.parse::<f64>()
                                .ok()
                                .filter(|n| n.is_finite())
                                .map(|n| json!(n))
                                .unwrap_or(Value::Null)
                        } else {
                            json!(text)
                        };
                        s.docks.answers.insert(key.clone(), answer);
                        s.docks.error = None;
                    })
                    .on_input_key(keyboard::handle);
                dock = dock.child(date::input(s, field, input));
            }
        }
    }
    if let Some(error) = &s.docks.error {
        dock = dock.child(label(t, error, 12.0, 400.0, "error").wrap());
    }
    let mut footer = row()
        .w_full()
        .px(14.0)
        .py(10.0)
        .border_sides([1.0, 0.0, 0.0, 0.0], t.c("border"))
        .border_layout()
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
    if (s.docks.reviewing || index > 0) && !s.docks.collapsed && !fs.is_empty() {
        footer = footer.child(
            button(s, "Back")
                .key("question-back")
                .on_press(|s: &mut State| {
                    let last = fields(&s.docks).len().saturating_sub(1);
                    s.docks.index = if s.docks.reviewing {
                        last
                    } else {
                        current_index(&s.docks).saturating_sub(1)
                    };
                    s.docks.reviewing = false;
                    s.docks.error = None;
                    restore_input(&mut s.docks);
                }),
        );
    }
    footer = footer.child(
        t.paint(
            button(
                s,
                if s.docks.sending {
                    "Sending…"
                } else if s.docks.collapsed {
                    "Continue"
                } else if s.docks.reviewing {
                    "Send answers ↵"
                } else if index + 1 >= fs.len() {
                    "Review answers"
                } else {
                    "Next"
                },
            )
            .font(TextStyle::new(12.0, 600.0).lh(18.0))
            .color(t.c("on-primary")),
            "primary-glaze",
        )
        .key("question-next")
        .on_press(advance),
    );
    let dock = if s.docks.sending { dock.inert() } else { dock };
    out.child(frame.child(dock).child(footer))
}
