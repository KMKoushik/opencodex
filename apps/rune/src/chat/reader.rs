//! Side/subagent conversations use the same rows and disclosures as the main
//! timeline. No generic "Agent activity" placeholder hides the actual tool calls.
use super::Chat;
use crate::State;
use rune::{El, GrowthSpec, ScrollSpec, col, row};

pub fn reader(s: &State, chat: &Chat, width: f32, footer: Option<El>) -> El {
    let side = !chat.read_only();
    let row_width = (width - 1.0).min(768.0);
    let position = chat.position.clone();
    let mut scroll = col()
        .key("workspace-conversation")
        .role("log")
        .label("Conversation")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .scroll(ScrollSpec { stick_bottom: true })
        .clip_fade_linear(0.0, 0.0, 0.0, if side { 32.0 } else { 0.0 })
        .on_scroll_offset(move |at| position.set(at))
        .child(
            col()
                .key("workspace-conversation-rows")
                .w_full()
                .items_center()
                .growth(GrowthSpec::default())
                .whole_rows()
                .virtual_rows(
                    chat.rows.len() + if side { 2 } else { 1 },
                    80.0,
                    move |s: &State, n| {
                        if n == 0 {
                            return "reader-history".into();
                        }
                        let i = n - 1;
                        if i == s.workbench.reader_chat.rows.len() {
                            return "reader-footer".into();
                        }
                        format!("reader-{}", s.workbench.reader_chat.rows[i].id).into()
                    },
                    move |s: &State, n| {
                        let chat = &s.workbench.reader_chat;
                        if n == 0 {
                            return row().w_full().h(44.0).center().role("status").child(
                                crate::sidebar::label(
                                    &s.theme,
                                    chat.data.error.as_deref().unwrap_or(
                                        if chat.data.cursor.is_none() {
                                            "Beginning of conversation"
                                        } else {
                                            ""
                                        },
                                    ),
                                    11.0,
                                    400.0,
                                    "text-tertiary",
                                ),
                            );
                        }
                        let i = n - 1;
                        if i == chat.rows.len() {
                            // `.chat > .timeline .timeline-footer` overrides the
                            // row's 20px padding with 32px, below a 20px status
                            // strut. It is scroll content,
                            // not composer chrome; omitting it shifts every block.
                            return col().w(row_width).h(52.0).role("status");
                        }
                        super::conversation_row(s, &chat.rows[i], row_width, true)
                    },
                )
                .virtual_rows_version(chat.data.revision.wrapping_add(chat.disclosure_revision)),
        )
        .child(super::user::popover(s, true));
    // Callers supply subagent status/permission content here, not as a child
    // of the timeline wrapper: it must scroll immediately after the rows.
    if let Some(footer) = footer {
        scroll = scroll.child(footer);
    }
    let mut timeline = col().key("reader-timeline").grow(1.0).min_h(0.0).w_full()
        .child(super::follow::viewport(scroll, true));
    if chat.jump {
        let size = rune::memo::layout_size("reader-timeline").unwrap_or([width - 1.0, 0.0]);
        timeline = timeline.child(super::jump_pill(s, size[0], size[1], true));
    }
    timeline
}
