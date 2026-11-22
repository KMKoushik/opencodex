//! Compact transcript surface for workspace conversations. Uses the same native timeline
//! projector and Markdown renderer as the main chat; it never mounts a main-chat composer.
use super::{Chat, markdown};
use crate::{State, sidebar::label};
use oc_gateway::timeline::Kind;
use rune::{El, GrowthSpec, ScrollSpec, col};

pub fn reader(_s: &State, chat: &Chat, width: f32) -> El {
    col()
        .key("workspace-conversation")
        .role("log")
        .label("Conversation")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .scroll(ScrollSpec { stick_bottom: true })
        .child(
            col()
                .key("workspace-conversation-rows")
                .w_full()
                .growth(GrowthSpec::default())
                .virtual_rows(
                    chat.rows.len(),
                    80.0,
                    |s: &State, n| format!("reader-{}", s.workbench.reader_chat.rows[n].id).into(),
                    move |s: &State, n| {
                        let r = &s.workbench.reader_chat.rows[n];
                        let body = match &r.kind {
                            Kind::Text { text, .. } => {
                                markdown::render(s, text, false, (width - 48.0).max(200.0))
                            }
                            Kind::Message(message) if message.r#type == "user" => {
                                let text = message
                                    .fields
                                    .get("text")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");
                                label(&s.theme, text, 14.0, 400.0, "text")
                                    .wrap()
                                    .padding(12.0)
                                    .radius(12.0)
                                    .fill(s.theme.c("secondary"))
                            }
                            Kind::Turn { status, .. } => label(
                                &s.theme,
                                if *status == "working" {
                                    "Working…"
                                } else {
                                    "Work completed"
                                },
                                11.0,
                                400.0,
                                "text-tertiary",
                            ),
                            Kind::Activity { .. } => {
                                label(&s.theme, "Agent activity", 11.0, 400.0, "text-tertiary")
                            }
                            _ => rune::el().h(0.0),
                        };
                        col()
                            .key(format!("reader-{}", r.id))
                            .w_full()
                            .padding(16.0)
                            .child(body)
                    },
                )
                .virtual_rows_version(chat.data.revision.wrapping_add(chat.disclosure_revision)),
        )
}
