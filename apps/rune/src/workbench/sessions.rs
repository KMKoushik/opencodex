use super::{Panel, worker::Operation};
use crate::{State, sidebar::label};
use rune::{El, GrowthSpec, ScrollSpec, TextEdit, col, row};
use serde_json::json;

pub(super) fn poll_reader(s: &mut State, clock: f64, tx: &mut rune::Tx) -> bool {
    let mut changed = false;
    if let Some(data) = s
        .workbench
        .reader_worker
        .as_ref()
        .and_then(oc_gateway::Worker::take_messages)
    {
        if s.workbench.reader.as_deref() == Some(&data.session_id) {
            s.workbench.reader_chat.media.request(
                data.clone(),
                crate::sidecar::url(),
                s.waker.clone(),
            );
            s.workbench.reader_chat.accept(data);
            changed = true;
        }
    }
    if s.workbench.reader_chat.media.take() {
        s.workbench.reader_chat.disclosure_revision += 1;
        changed = true;
    }
    let visible = s.pages.route == crate::pages::Route::Chat
        && s.workbench.open
        && matches!(s.workbench.panel, Panel::Side | Panel::Subagents);
    let reader = &s.workbench.reader_chat;
    let position = reader.position.get();
    let reached_fork = s.workbench.panel == Panel::Side
        && reader.data.info.as_ref().is_some_and(|info| {
            reader
                .data
                .messages
                .iter()
                .any(|message| message.time.created < info.time.created)
        });
    if visible
        && position.viewport[1] > 0.0
        && position.offset[1] < 240.0
        && reader.data.cursor.is_some()
        && reader.data.error.is_none()
        && !reader.loading_earlier
        && !reached_fork
    {
        if let (Some(worker), Some(id)) = (&s.workbench.reader_worker, &s.workbench.reader) {
            match worker.command(oc_gateway::Command::EarlierMessages(id.clone())) {
                Ok(()) => {
                    s.workbench.reader_chat.loading_earlier = true;
                    changed = true;
                }
                Err(error) => s.workbench.error = Some(error),
            }
        }
    }
    let chat = &mut s.workbench.reader_chat;
    if crate::chat::follow::resume(&mut chat.jump, position.max[1] - position.offset[1]) {
        changed = true;
    }
    if visible && s.workbench.reader.is_some() && chat.data.running {
        if chat.tick_due.is_none_or(|due| clock >= due) {
            chat.tick_due = Some(clock + 1.0);
            chat.now_ms = crate::unix_ms() as f64;
            tx.wake_after(std::time::Duration::from_secs(1));
            changed = true;
        }
    } else {
        chat.tick_due = None;
    }
    // The reader's unrelated sidebar snapshot is disposable, not workbench state.
    if let Some(worker) = &s.workbench.reader_worker {
        let _ = worker.take();
    }
    changed
}

pub(super) fn reader(s: &State) -> El {
    crate::chat::reader(s, &s.workbench.reader_chat, s.panel_width().max(340.0))
}

pub fn tabs(s: &State) -> El {
    use super::panel_tabs as tabs;
    let mut strip = tabs::strip("Side chats");
    for (index, v) in s.workbench.sides.iter().enumerate() {
        let id = v["id"].as_str().unwrap_or("").to_owned();
        let close = id.clone();
        let active = s.workbench.reader.as_ref() == Some(&id);
        let mut button = tabs::button(
            s,
            &format!("Side chat {}", index + 1),
            &crate::chat::icons::CHAT,
            active,
        )
        .key(format!("side-tab-{index}"))
        .help(v["title"].as_str().unwrap_or("Side chat"))
        .on_press(move |s: &mut State| {
            if s.workbench.reader.as_ref() != Some(&id) {
                s.open_workspace_reader(id.clone());
            }
        })
        .on_key(move |s: &mut State, key, tx| {
            let Some(next) = tabs::next(&key.key, index, s.workbench.sides.len()) else {
                return false;
            };
            if let Some(id) = s.workbench.sides[next]["id"].as_str().map(str::to_owned) {
                if s.workbench.reader.as_ref() != Some(&id) {
                    s.open_workspace_reader(id);
                }
                tx.focus(format!("side-tab-{next}"), false);
            }
            true
        });
        if v["id"]
            .as_str()
            .is_some_and(|id| s.snapshot.active.contains(id))
        {
            button = button.child(super::subagents::activity(s, "Responding"));
        }
        strip = strip.child(tabs::pill(
            s,
            active,
            button,
            tabs::close(s, &format!("Delete side chat {}", index + 1))
                .on_press(move |s: &mut State| s.workbench.delete_side = Some(close.clone())),
        ));
    }
    if s.workbench.sides.is_empty() {
        strip = strip.child(label(&s.theme, "Side chat", 12.0, 400.0, "text-tertiary"));
    }
    tabs::viewport(
        strip.child(
            crate::sidebar::icon_button(&s.theme, &crate::icons::PLUS, "New side chat")
                .disabled(
                    s.workbench.sides.len() >= 8
                        || s.workbench.pending.contains("side-create")
                        || s.workbench.pending.contains("sides"),
                )
                .on_press(|s: &mut State| s.create_workspace_side(String::new())),
        ),
    )
}

impl State {
    pub fn open_workspace_reader(&mut self, id: String) {
        self.workbench.reader = Some(id.clone());
        self.workbench.reader_chat = Default::default();
        self.workbench
            .side_drafts
            .entry(id.clone())
            .or_insert_with(|| TextEdit::new(""));
        if self.workbench.reader_worker.is_none() {
            if let (Some(url), Some(wake)) = (crate::sidecar::url(), self.waker.clone()) {
                match oc_gateway::Gateway::new(url, None) {
                    Ok(client) => {
                        self.workbench.reader_worker = Some(oc_gateway::Worker::start(
                            client,
                            Some(self.workspace_directory()),
                            move || wake(),
                        ))
                    }
                    Err(e) => self.workbench.error = Some(e),
                }
            }
        }
        if let Some(worker) = &self.workbench.reader_worker {
            if let Err(e) = worker.command(oc_gateway::Command::OpenSession(id)) {
                self.workbench.error = Some(e);
            }
        }
    }
    pub fn create_workspace_side(&mut self, text: String) {
        let Some(id) = self.selected.clone() else {
            return;
        };
        self.workbench.open = true;
        self.workbench.panel = Panel::Side;
        self.workbench.side_quote = Some(text);
        self.workspace_request("side-create".into(), Operation::CreateSide(id));
    }
    pub fn send_workspace_side(&mut self) {
        if self.workbench.side_sending.is_some() {
            return;
        }
        let Some(id) = self.workbench.reader.clone() else {
            return;
        };
        let Some(edit) = self.workbench.side_drafts.get(&id) else {
            return;
        };
        let text = edit.text.clone();
        let draft = self.composer.drafts.get(&id);
        if self.composer.attachment_pending.contains_key(&id) {
            return;
        }
        if text.trim().is_empty() && draft.attachments.is_empty() && draft.comments.is_empty() {
            return;
        }
        let revision = self.workbench.side_revisions.get(&id).copied().unwrap_or(0);
        self.workbench.side_context_revision = Some(draft.revision);
        if super::side_composer::slash(self, &id, &text, revision) {
            return;
        }
        let draft = self.composer.drafts.get(&id);
        let model = draft
            .model
            .as_ref()
            .or_else(|| {
                self.workbench
                    .reader_chat
                    .data
                    .info
                    .as_ref()
                    .and_then(|i| i.model.as_ref())
            })
            .or_else(|| self.selected_model())
            .cloned();
        let Some(model) = model else {
            self.workbench.error = Some("Select a model before sending.".into());
            return;
        };
        let attachments = draft.attachments.clone();
        let slash = super::side_restore::parse_slash(&text);
        let prompt = slash
            .as_ref()
            .map(|(_, args)| args.as_str())
            .unwrap_or(&text);
        let draft = self.composer.drafts.get(&id);
        let (text, annotations) = crate::chat::comments::annotated(prompt, &draft.comments);
        let mentions = super::side_restore::prompt_mentions(&text, &draft.mentions);
        self.workbench.side_sending = Some((id.clone(), revision));
        self.workspace_request(
            "side-send".into(),
            Operation::SendSide {
                id,
                body: json!({"text":text,"model":model,"mentions":mentions,"annotations":annotations,"__sideSlash":slash.map(|(name,_)|name)}),
                attachments,
            },
        );
    }
}
pub fn view(s: &State, side: bool) -> El {
    if !side {
        return super::subagents::view(s);
    }
    let t = &s.theme;
    let mut body = col().grow(1.0).min_h(0.0).w_full();
    let mut bar = row()
        .h(36.0)
        .px(10.0)
        .center_y()
        .gap(8.0)
        .w_full()
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"));
    if s.workbench.reader.is_some() {
        bar = bar.child(
            super::documents::button(s, "‹ Back").on_press(|s: &mut State| {
                s.workbench.reader = None;
                s.workbench.reader_chat = Default::default();
            }),
        );
    }
    bar = bar.child(
        label(
            t,
            if side {
                "Ask without interrupting the main chat"
            } else {
                "Agent conversations"
            },
            11.5,
            400.0,
            "text-tertiary",
        )
        .grow(1.0)
        .truncate(),
    );
    if side {
        if let Some(id) = &s.workbench.reader {
            let id = id.clone();
            bar = bar.child(
                super::documents::button(s, "Delete side chat")
                    .on_press(move |s: &mut State| s.workbench.delete_side = Some(id.clone())),
            );
        }
        bar = bar.child(
            super::documents::button(s, "+ New side chat")
                .on_press(|s: &mut State| s.create_workspace_side(String::new())),
        );
    }
    if !side {
        body = body.child(bar);
    }
    if let Some(id) = &s.workbench.reader {
        let data = &s.workbench.reader_chat.data;
        let empty = side
            && data.info.as_ref().is_some_and(|info| info.revert.is_none())
            && data.visible().is_empty()
            && !data.running
            && data.error.is_none()
            && s.workbench.requests.permissions.is_empty();
        body = body.child(if empty {
            let start = data.info.as_ref().map(|info| oc_webview::short_time(info.time.created))
                .unwrap_or_else(|| "now".into());
            col().grow(1.0).w_full().px(16.0).py(24.0)
                .child(label(t, "Side chat", 14.0, 500.0, "text").mb(8.0))
                .child(label(t, format!("It knows the main chat up to {start}. Questions here don’t interrupt the main chat. Edits ask for approval first."), 14.0, 400.0, "text-secondary").wrap())
        } else { reader(s).child(super::reader_requests::permissions(s).px(16.0)) });
        if side {
            body = body.child(
                super::reader_requests::form(s)
                    .map(|form| {
                        col()
                            .w_full()
                            .px(16.0)
                            .py(12.0)
                            .gap(8.0)
                            .child(super::side_composer::main_status(s))
                            .child(form)
                    })
                    .unwrap_or_else(|| super::side_composer::view(s, id)),
            );
        } else {
            body = body.child(
                label(
                    t,
                    "Read-only subagent conversation",
                    11.0,
                    400.0,
                    "text-tertiary",
                )
                .padding(12.0),
            );
        }
        return body.child(delete_dialog(s));
    }
    let items = if side {
        &s.workbench.sides
    } else {
        &s.workbench.agents
    };
    if items.is_empty() {
        if side {
            return body.child(super::view::empty_state(s,&crate::chat::icons::CHAT,"Ask on the side","A side chat starts from this chat’s history, so you can ask questions or explore without interrupting the main chat.")
                .child(super::documents::button(s,"New side chat").mt(12.0).border(1.0,t.c("border-heavy")).fill(t.c("secondary")).on_press(|s:&mut State|s.create_workspace_side(String::new()))));
        }
        return body.child(super::view::empty_state(
            s,
            &crate::chat::icons::SUBAGENTS,
            "No subagents yet",
            "Delegated sessions will appear here as the agent starts them.",
        ));
    }
    body = body.child(
        col()
            .grow(1.0)
            .min_h(0.0)
            .scroll(ScrollSpec {
                stick_bottom: false,
            })
            .child(col().growth(GrowthSpec::default()).w_full().virtual_rows(
                items.len(),
                62.0,
                move |s: &State, n| {
                    format!(
                        "workspace-session-{}",
                        if side {
                            &s.workbench.sides[n]["id"]
                        } else {
                            &s.workbench.agents[n]["id"]
                        }
                    )
                    .into()
                },
                move |s: &State, n| {
                    let v = if side {
                        &s.workbench.sides[n]
                    } else {
                        &s.workbench.agents[n]
                    };
                    let id = v["id"].as_str().unwrap_or("").to_owned();
                    let running = s.snapshot.active.contains(&id);
                    let delete_id = id.clone();
                    row()
                        .w_full()
                        .min_h(62.0)
                        .px(14.0)
                        .gap(10.0)
                        .center_y()
                        .hover(s.theme.c("hover"))
                        .child(label(
                            &s.theme,
                            if running { "◌" } else { "○" },
                            14.0,
                            400.0,
                            if running {
                                "accent-text"
                            } else {
                                "text-tertiary"
                            },
                        ))
                        .child(
                            col()
                                .grow(1.0)
                                .gap(4.0)
                                .child(
                                    label(
                                        &s.theme,
                                        v["title"].as_str().unwrap_or("Untitled conversation"),
                                        12.5,
                                        500.0,
                                        "text",
                                    )
                                    .truncate(),
                                )
                                .child(label(
                                    &s.theme,
                                    if running { "Working" } else { "Completed" },
                                    11.0,
                                    400.0,
                                    "text-tertiary",
                                )),
                        )
                        .role("button")
                        .focusable(true)
                        .on_press(move |s: &mut State| s.open_workspace_reader(id.clone()))
                        .child(if side {
                            super::documents::button(s, "Delete")
                                .label("Delete side chat")
                                .on_press(move |s: &mut State| {
                                    s.workbench.delete_side = Some(delete_id.clone())
                                })
                        } else {
                            rune::el()
                        })
                },
            )),
    );
    if !side && s.workbench.agent_cursor.is_some() {
        body = body.child(
            super::documents::button(s, "Load more").on_press(|s: &mut State| {
                if let (Some(id), Some(cursor)) =
                    (s.selected.clone(), s.workbench.agent_cursor.clone())
                {
                    s.workspace_get(
                        "agents-more",
                        format!("sessions/{id}/subagents"),
                        vec![("cursor".into(), cursor)],
                        true,
                    );
                }
            }),
        );
    }
    body.child(delete_dialog(s))
}
fn delete_dialog(s: &State) -> El {
    let Some(id) = &s.workbench.delete_side else {
        return rune::el();
    };
    let id = id.clone();
    let pending = s.workbench.pending.contains(&format!("side-delete:{id}"));
    let width = (s.panel_width() - 24.0).clamp(220.0, 420.0);
    col()
        .w(width)
        .padding(20.0)
        .gap(16.0)
        .radius(12.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .role("alertdialog")
        .label("Delete side chat?")
        .child(label(&s.theme, "Delete side chat?", 16.0, 600.0, "text"))
        .child(
            label(
                &s.theme,
                "This deletes the side chat and its messages. The main chat isn’t affected.",
                13.0,
                400.0,
                "text-secondary",
            )
            .wrap(),
        )
        .child(
            row()
                .gap(8.0)
                .child(
                    super::documents::button(s, "Cancel")
                        .disabled(pending)
                        .on_press(|s: &mut State| s.workbench.delete_side = None),
                )
                .child(
                    super::documents::button(s, if pending { "Deleting…" } else { "Delete" })
                        .disabled(pending)
                        .autofocus()
                        .on_press(move |s: &mut State| {
                            if let Some(parent) = s.selected.clone() {
                                s.workspace_request(
                                    format!("side-delete:{id}"),
                                    Operation::Delete(format!("sessions/{parent}/side-chats/{id}")),
                                );
                            }
                        }),
                ),
        )
        .absolute(12.0, 80.0)
        .modal(true, |s: &mut State| s.workbench.delete_side = None)
}
