use super::{Panel, worker::Operation};
use crate::{State, sidebar::label};
use rune::{El, GrowthSpec, ScrollSpec, TextEdit, TextStyle, col, row, text_input};
use serde_json::json;

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
        if text.trim().is_empty() {
            return;
        }
        let model = self
            .model_info()
            .map(|m| json!({"providerID":m.provider_id,"id":m.id}));
        let Some(model) = model else {
            self.workbench.error = Some("Select a model in the main composer first.".into());
            return;
        };
        let revision = self.workbench.side_revisions.get(&id).copied().unwrap_or(0);
        self.workbench.side_sending = Some((id.clone(), revision));
        self.workspace_request(
            "side-send".into(),
            Operation::SendSide {
                id,
                body: json!({"text":text,"model":model,"files":[],"mentions":[]}),
            },
        );
    }
}
pub fn view(s: &State, side: bool) -> El {
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
        bar = bar.child(
            super::documents::button(s, "+ New side chat")
                .on_press(|s: &mut State| s.create_workspace_side(String::new())),
        );
    }
    if !side || !s.workbench.sides.is_empty() || s.workbench.reader.is_some() {
        body = body.child(bar);
    }
    if let Some(id) = &s.workbench.reader {
        body = body.child(crate::chat::reader(
            s,
            &s.workbench.reader_chat,
            s.panel_width().max(340.0),
        ));
        if side {
            let edit = &s.workbench.side_drafts[id];
            let id = id.clone();
            body = body.child(
                col()
                    .w_full()
                    .padding(12.0)
                    .gap(8.0)
                    .child(
                        text_input(edit, TextStyle::new(14.0, 400.0).lh(21.0))
                            .key("side-message")
                            .label("Message side chat")
                            .placeholder("Ask a follow-up…", t.c("text-tertiary"))
                            .w_full()
                            .min_h(52.0)
                            .max_h(160.0)
                            .padding(12.0)
                            .radius(14.0)
                            .fill(t.c("surface-under"))
                            .color(t.c("text"))
                            .on_edit(move |s: &mut State| {
                                s.workbench.side_drafts.get_mut(&id).expect("side draft")
                            })
                            .on_input_change(|s: &mut State, _| {
                                if let Some(id) = s.workbench.reader.clone() {
                                    *s.workbench.side_revisions.entry(id).or_default() += 1;
                                }
                            })
                            .on_submit(|s: &mut State, _| s.send_workspace_side()),
                    )
                    .child(
                        row()
                            .w_full()
                            .child(super::documents::button(s, "Open in main view").on_press(
                                |s: &mut State| s.open_session(s.workbench.reader.clone()),
                            ))
                            .child(rune::el().grow(1.0))
                            .child(
                                super::documents::button(
                                    s,
                                    if s.workbench.side_sending.is_some() {
                                        "Sending…"
                                    } else {
                                        "Send ↑"
                                    },
                                )
                                .on_press(|s: &mut State| s.send_workspace_side()),
                            ),
                    ),
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
        return body;
    }
    let items = if side {
        &s.workbench.sides
    } else {
        &s.workbench.agents
    };
    if items.is_empty() {
        if side {
            return body.child(super::view::empty_state(s,&crate::chat::icons::CHAT,"Ask on the side","A side chat starts from this chat’s history, so you can ask questions or explore without interrupting the main chat.")
                .child(super::documents::button(s,"New side chat").mt(4.0).border(1.0,t.c("border-heavy")).fill(t.c("secondary")).on_press(|s:&mut State|s.create_workspace_side(String::new()))));
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
    body
}
