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
        Some(format!(
            "Unknown command /{name}. Type / to see available commands."
        ))
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
    if name == "undo" {
        let message = s
            .workbench
            .reader_chat
            .data
            .visible()
            .iter()
            .rev()
            .find(|m| m.r#type == "user");
        let Some(message) = message else {
            s.workbench.error = Some("There is nothing to undo in this side chat.".into());
            return true;
        };
        body["messageID"] = json!(message.id);
    }
    s.workbench.side_sending = Some((id.into(), revision));
    s.workspace_request(
        "side-send".into(),
        Operation::Post {
            path: format!("sessions/{id}/action"),
            body,
        },
    );
    true
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
    let mut area = col().w_full().px(16.0).py(12.0).gap(8.0).child(
        row()
            .gap(6.0)
            .center_y()
            .child(
                el().size(6.0, 6.0)
                    .radius(3.0)
                    .fill(t.c(if s.chat.data.running {
                        "accent"
                    } else {
                        "text-tertiary"
                    })),
            )
            .child(
                label(
                    t,
                    if s.chat.data.running {
                        "Main chat is working"
                    } else if s
                        .chat
                        .data
                        .info
                        .as_ref()
                        .is_some_and(|i| i.outcome.as_deref() == Some("failed"))
                    {
                        "Main chat’s last run failed"
                    } else {
                        "Main chat is idle"
                    },
                    12.0,
                    400.0,
                    "text-tertiary",
                )
                .role("status"),
            ),
    );
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
        .child(
            super::documents::button(
                s,
                model
                    .map(|m| m.name.as_str())
                    .or_else(|| selected.map(|m| m.id.as_str()))
                    .unwrap_or("Select model"),
            )
            .key("side-model")
            .disabled(s.workbench.side_sending.is_some())
            .on_press(|s: &mut State| s.workbench.side_model_open = !s.workbench.side_model_open),
        )
        .child(el().grow(1.0));
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
            .w(280.0)
            .max_h(300.0)
            .padding(6.0)
            .radius(12.0)
            .fill(t.c("elevated"))
            .border(1.0, t.c("border-heavy"))
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            });
        for m in catalog.into_iter().flat_map(|c| &c.data) {
            let key = id.to_owned();
            let selected = oc_gateway::types::ModelRef {
                provider_id: m.provider_id.clone(),
                id: m.id.clone(),
                variant: None,
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
    area
}
