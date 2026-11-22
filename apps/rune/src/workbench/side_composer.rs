use super::worker::Operation;
use crate::{
    State,
    sidebar::{icon_button, label},
};
use rune::{El, TextStyle, col, el, row, text_input};
use serde_json::json;

pub fn slash(s: &mut State, id: &str, text: &str, revision: u64) -> bool {
    let Some(command) = text.trim().strip_prefix('/') else {
        return false;
    };
    let (name, args) = command
        .split_once(char::is_whitespace)
        .unwrap_or((command, ""));
    if name.contains('/') || name.is_empty() {
        return false;
    }
    let error = if ["side", "fork", "new", "rename", "export"].contains(&name) {
        Some(format!(
            "/{name} isn’t available in side chats. Use it in the main chat."
        ))
    } else if !["undo", "redo", "compact"].contains(&name) {
        // Server commands and skills are resolved from a fresh catalog on the worker.
        return false;
    } else if !args.trim().is_empty() {
        Some(format!("/{name} does not take arguments."))
    } else if name == "compact"
        && (!s.composer.drafts.get(id).attachments.is_empty()
            || !s.composer.drafts.get(id).comments.is_empty())
    {
        Some("Send or remove attached context before running a thread action.".into())
    } else if name != "compact" && s.workbench.reader_chat.data.running {
        Some("Stop the current response before undoing or redoing.".into())
    } else if name == "redo"
        && s.workbench
            .reader_chat
            .data
            .info
            .as_ref()
            .is_none_or(|i| i.revert.is_none())
    {
        Some("There is nothing to redo.".into())
    } else {
        None
    };
    if let Some(error) = error {
        s.workbench.error = Some(error);
        return true;
    }
    let mut body = json!({"action":name});
    let mut undone = None;
    if name == "undo" {
        let start = s
            .workbench
            .reader_chat
            .data
            .info
            .as_ref()
            .map(|info| info.time.created);
        let message = s
            .workbench
            .reader_chat
            .data
            .visible()
            .iter()
            .rev()
            .find(|m| m.r#type == "user" && start.is_some_and(|start| m.time.created >= start));
        let Some(message) = message else {
            let reached_fork = start.is_some_and(|start| {
                s.workbench
                    .reader_chat
                    .data
                    .messages
                    .iter()
                    .any(|m| m.time.created < start)
            });
            s.workbench.error = Some(
                if reached_fork {
                    "There is nothing to undo in this side chat."
                } else {
                    "No earlier user message is loaded. Load earlier history to undo."
                }
                .into(),
            );
            return true;
        };
        body["messageID"] = json!(message.id);
        undone = Some(message.clone());
    }
    s.workbench.side_sending = Some((id.into(), revision));
    s.workspace_request(
        "side-send".into(),
        if let Some(message) = undone {
            Operation::UndoSide {
                id: id.into(),
                message,
            }
        } else {
            Operation::Post {
                path: format!("sessions/{id}/action"),
                body,
            }
        },
    );
    true
}
pub(super) fn main_status(s: &State) -> El {
    let t = &s.theme;
    let waiting = crate::docks::active(s);
    let failed = s
        .chat
        .data
        .info
        .as_ref()
        .is_some_and(|i| i.outcome.as_deref() == Some("failed"));
    row()
        .gap(6.0)
        .center_y()
        .child(el().size(6.0, 6.0).radius(3.0).fill(t.c(if waiting {
            "warning"
        } else if s.chat.data.running {
            "accent"
        } else if failed {
            "error"
        } else {
            "text-tertiary"
        })))
        .child(
            label(
                t,
                if waiting {
                    if crate::docks::waiting_label(s) == "Waiting for permission" {
                        "Main chat needs approval"
                    } else {
                        "Main chat has a question"
                    }
                } else if s.chat.data.running {
                    "Main chat is working"
                } else if failed {
                    "Main chat’s last run failed"
                } else {
                    "Main chat is idle"
                },
                12.0,
                400.0,
                if waiting { "warning" } else { "text-tertiary" },
            )
            .role("status"),
        )
}
pub fn view(s: &State, id: &str) -> El {
    let t = &s.theme;
    let draft = s.composer.drafts.get(id);
    let selected = draft
        .model
        .as_ref()
        .or_else(|| {
            s.workbench
                .reader_chat
                .data
                .info
                .as_ref()
                .and_then(|i| i.model.as_ref())
        })
        .or_else(|| s.selected_model());
    let catalog = s.snapshot.models.get(&s.workspace_directory());
    let model = selected.and_then(|r| {
        catalog.and_then(|c| {
            c.data
                .iter()
                .find(|m| m.id == r.id && m.provider_id == r.provider_id)
        })
    });
    let mut area = col()
        .w_full()
        .px(16.0)
        .py(12.0)
        .gap(8.0)
        .child(main_status(s));
    let mut card = t.shadow(
        t.paint(
            col()
                .w_full()
                .pt(14.0)
                .pr(10.0)
                .pb(10.0)
                .pl(14.0)
                .radius(18.0),
            "composer",
        ),
        "composer-shadow",
    );
    let mut attachments = row().w_full().gap(8.0);
    for (index, a) in draft.attachments.iter().enumerate() {
        let key = id.to_owned();
        attachments = attachments.child(
            row()
                .gap(6.0)
                .radius(8.0)
                .padding(6.0)
                .fill(t.c("secondary"))
                .child(label(t, &a.name, 12.0, 400.0, "text").truncate())
                .child(
                    icon_button(t, &crate::icons::CLOSE, &format!("Remove {}", a.name))
                        .size(18.0, 18.0)
                        .on_press(move |s: &mut State| {
                            let d = s.composer.drafts.edit(&key);
                            d.attachments.remove(index);
                            if index < d.images.len() {
                                d.images.remove(index);
                            }
                            s.composer.drafts.touch(&key);
                        }),
                ),
        );
    }
    if !draft.attachments.is_empty() {
        card = card.child(attachments);
    }
    let key = id.to_owned();
    card = card.child(
        text_input(
            &s.workbench.side_drafts[id],
            TextStyle::new(14.0, 400.0).lh(21.0),
        )
        .key("side-message")
        .label("Message")
        .placeholder("Ask a side question", t.c("text-tertiary"))
        .w_full()
        .min_h(52.0)
        .max_h(240.0)
        .padding(2.0)
        .color(t.c("text"))
        .on_edit(move |s: &mut State| s.workbench.side_drafts.get_mut(&key).expect("side draft"))
        .on_input_change(|s: &mut State, _| {
            if let Some(id) = s.workbench.reader.clone() {
                *s.workbench.side_revisions.entry(id).or_default() += 1;
            }
        })
        .on_input_key(|s: &mut State, key, _| {
            if key.key == rune::Key::Enter && !key.mods.shift {
                s.send_workspace_side();
                true
            } else {
                false
            }
        })
        .on_submit(|s: &mut State, _| s.send_workspace_side())
        .on_input_paste(|s: &mut State, content, _| {
            let (Some(image), Some(key)) = (content.image(), s.workbench.reader.clone()) else {
                return false;
            };
            s.prompt_request(oc_gateway::prompt::Request::PrepareAttachment {
                key,
                item: oc_gateway::prompt::Attachment {
                    name: "Pasted image.png".into(),
                    mime: "image/png".into(),
                    bytes: std::sync::Arc::new(image.png().to_vec()),
                    thumbnail: None,
                },
            });
            true
        }),
    );
    let mut controls = row()
        .w_full()
        .gap(8.0)
        .center_y()
        .child(
            icon_button(t, &crate::icons::PLUS, "Attach files").on_press_tx(|s: &mut State, tx| {
                let Some(key) = s.workbench.reader.clone() else {
                    return;
                };
                tx.open_file(
                    rune::FileDialogOptions {
                        title: "Attach file".into(),
                        ..Default::default()
                    },
                    move |s: &mut State, result, _| match result {
                        Ok(Some(path)) => {
                            s.prompt_request(oc_gateway::prompt::Request::ReadAttachment {
                                key: key.clone(),
                                path: path.to_string_lossy().into_owned(),
                            });
                        }
                        Err(e) => s.workbench.error = Some(e.to_string()),
                        _ => {}
                    },
                );
            }),
        )
        .child(el().grow(1.0))
        .child(
            row()
                .h(28.0)
                .px(8.0)
                .gap(6.0)
                .center_y()
                .radius(6.0)
                .fill(t.c("control"))
                .border(1.0, t.c("border"))
                .child(
                    selected
                        .map(|m| super::subagents::provider(s, &m.provider_id, 14.0))
                        .unwrap_or_else(el),
                )
                .child(
                    label(
                        t,
                        model
                            .map(|m| m.name.as_str())
                            .or_else(|| selected.map(|m| m.id.as_str()))
                            .unwrap_or("Choose model"),
                        12.0,
                        400.0,
                        "text",
                    )
                    .truncate(),
                )
                .child(rune::icon(&crate::icons::DOWN, 14.0).color(t.c("text-tertiary")))
                .key("side-model")
                .role("button")
                .label("Model")
                .focusable(true)
                .disabled(s.workbench.side_sending.is_some())
                .on_press(|s: &mut State| {
                    s.workbench.side_model_search.clear();
                    s.workbench.side_model_open = !s.workbench.side_model_open;
                }),
        );
    let has_variants = model.is_some_and(|m| !m.variants.is_empty());
    let variant = selected
        .and_then(|m| m.variant.as_deref())
        .filter(|v| *v != "default")
        .unwrap_or("Default");
    let variant = variant
        .chars()
        .next()
        .map(|c| c.to_uppercase().to_string() + &variant[c.len_utf8()..])
        .unwrap_or_default();
    controls = controls.child(
        row()
            .h(28.0)
            .px(8.0)
            .gap(6.0)
            .center_y()
            .radius(6.0)
            .child(
                label(
                    t,
                    if has_variants {
                        &variant
                    } else {
                        "No thinking options"
                    },
                    12.0,
                    400.0,
                    "text-secondary",
                )
                .truncate(),
            )
            .child(rune::icon(&crate::icons::DOWN, 14.0).color(t.c("text-tertiary")))
            .key("side-thinking")
            .role("button")
            .label("Thinking level")
            .focusable(true)
            .disabled(!has_variants || s.workbench.side_sending.is_some())
            .on_press(|s: &mut State| {
                s.workbench.side_thinking_open = !s.workbench.side_thinking_open
            }),
    );
    if s.workbench.reader_chat.data.running {
        controls = controls.child(
            super::documents::button(s, "Stop").on_press(|s: &mut State| {
                if let Some(id) = s.workbench.reader.clone() {
                    s.workspace_request(
                        "side-stop".into(),
                        Operation::Post {
                            path: format!("sessions/{id}/interrupt"),
                            body: json!({}),
                        },
                    );
                }
            }),
        );
    }
    controls = controls.child(
        icon_button(t, &crate::icons::UP, "Send message")
            .size(34.0, 34.0)
            .radius(12.0)
            .disabled(
                s.workbench.side_sending.is_some()
                    || s.composer.attachment_pending.contains_key(id)
                    || (s.workbench.side_drafts[id].text.trim().is_empty()
                        && draft.attachments.is_empty()),
            )
            .on_press(|s: &mut State| s.send_workspace_side()),
    );
    area = area.child(card.child(controls));
    if s.workbench.side_model_open {
        let mut menu = col()
            .w(360.0)
            .max_h(420.0)
            .padding(6.0)
            .radius(12.0)
            .fill(t.c("elevated"))
            .border(1.0, t.c("border-heavy"))
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            });
        menu = menu.child(
            text_input(&s.workbench.side_model_search, TextStyle::new(13.0, 400.0))
                .key("side-model-search")
                .label("Search models")
                .placeholder("Search models", t.c("text-tertiary"))
                .autofocus()
                .w_full()
                .h(36.0)
                .px(8.0)
                .color(t.c("text"))
                .on_edit(|s: &mut State| &mut s.workbench.side_model_search),
        );
        let terms: Vec<_> = s
            .workbench
            .side_model_search
            .text
            .split_whitespace()
            .map(str::to_lowercase)
            .collect();
        let mut models: Vec<_> = catalog
            .into_iter()
            .flat_map(|c| &c.data)
            .filter(|m| m.enabled)
            .filter(|m| {
                let hay = format!("{} {} {}", m.provider_id, m.name, m.id).to_lowercase();
                terms.iter().all(|term| hay.contains(term))
            })
            .collect();
        models.sort_by(|a, b| {
            a.provider_id
                .cmp(&b.provider_id)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        for m in models {
            let key = id.to_owned();
            let selected = oc_gateway::types::ModelRef {
                provider_id: m.provider_id.clone(),
                id: m.id.clone(),
                variant: s
                    .prefs
                    .model_variants
                    .get(&format!("{}/{}", m.provider_id, m.id))
                    .cloned()
                    .flatten(),
            };
            menu = menu.child(super::documents::button(s, &m.name).on_press(
                move |s: &mut State| {
                    s.composer.drafts.edit(&key).model = Some(selected.clone());
                    s.composer.drafts.touch(&key);
                    s.workbench.side_model_open = false;
                },
            ));
        }
        area = area.child(
            menu.anchored("side-model", rune::Side::Top, rune::Align::Start, 6.0)
                .modal(true, |s: &mut State| s.workbench.side_model_open = false),
        );
    }
    if s.workbench.side_thinking_open {
        let mut menu = col()
            .w(200.0)
            .padding(5.0)
            .radius(10.0)
            .fill(t.c("elevated"))
            .border(1.0, t.c("border-heavy"));
        for (variant, title) in std::iter::once((None, "Default".to_owned())).chain(
            model.into_iter().flat_map(|m| &m.variants).map(|v| {
                let title =
                    v.id.chars()
                        .next()
                        .map(|c| c.to_uppercase().to_string() + &v.id[c.len_utf8()..])
                        .unwrap_or_default();
                (Some(v.id.clone()), title)
            }),
        ) {
            let key = id.to_owned();
            let chosen = selected.cloned();
            menu = menu.child(super::documents::button(s, &title).on_press(
                move |s: &mut State| {
                    if let Some(mut model) = chosen.clone() {
                        model.variant = variant.clone();
                        s.prefs.model_variants.insert(
                            format!("{}/{}", model.provider_id, model.id),
                            variant.clone(),
                        );
                        s.composer.drafts.edit(&key).model = Some(model);
                        s.composer.drafts.touch(&key);
                        s.save();
                    }
                    s.workbench.side_thinking_open = false;
                },
            ));
        }
        area = area.child(
            menu.anchored("side-thinking", rune::Side::Top, rune::Align::End, 6.0)
                .modal(true, |s: &mut State| s.workbench.side_thinking_open = false),
        );
    }
    area
}
