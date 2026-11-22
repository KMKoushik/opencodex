//! Side/subagent conversations use the same rows and disclosures as the main
//! timeline. No generic "Agent activity" placeholder hides the actual tool calls.
use super::Chat;
use crate::State;
use rune::{El, GrowthSpec, ScrollSpec, col};

pub fn reader(s: &State, chat: &Chat, width: f32) -> El {
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
                        super::conversation_row(s, &s.workbench.reader_chat.rows[n], width, true)
                    },
                )
                .virtual_rows_version(chat.data.revision.wrapping_add(chat.disclosure_revision)),
        )
        .child(super::user::popover(s, true))
}
