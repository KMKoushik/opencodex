//! Side/subagent conversations use the same rows and disclosures as the main
//! timeline. No generic "Agent activity" placeholder hides the actual tool calls.
use super::Chat;
use crate::State;
use rune::{El, GrowthSpec, ScrollSpec, col, row};

pub fn reader(s: &State, chat: &Chat, width: f32) -> El {
    let side = !chat.read_only();
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
                    chat.rows.len() + if side { 2 } else { 0 },
                    80.0,
                    move |s: &State, n| {
                        if side && n == 0 { return "reader-history".into(); }
                        let i = n - usize::from(side);
                        if i == s.workbench.reader_chat.rows.len() { return "reader-footer".into(); }
                        format!("reader-{}", s.workbench.reader_chat.rows[i].id).into()
                    },
                    move |s: &State, n| {
                        let chat = &s.workbench.reader_chat;
                        if side && n == 0 {
                            return row().w_full().h(44.0).center().role("status").child(
                                crate::sidebar::label(&s.theme, chat.data.error.as_deref().unwrap_or(if chat.data.cursor.is_none() { "Beginning of conversation" } else { "" }), 11.0, 400.0, "text-tertiary"),
                            );
                        }
                        let i = n - usize::from(side);
                        if i == chat.rows.len() {
                            // Side Timeline's footer contains its 20px status
                            // strut plus 20px bottom padding. It is scroll content,
                            // not composer chrome; omitting it shifts every block.
                            return col().w_full().h(40.0).role("status");
                        }
                        super::conversation_row(s, &chat.rows[i], width, true)
                    },
                )
                .virtual_rows_version(chat.data.revision.wrapping_add(chat.disclosure_revision)),
        )
        .child(super::user::popover(s, true))
}
