//! ResponseCopy: verify readback rather than merely acknowledging a queued write.
//!
//! Pinned Rune exposes no ordinary-write completion result. Readback is best effort:
//! a failed write with identical preexisting clipboard text is indistinguishable from
//! success (including an empty expected string and an unavailable/empty read).
//! Another application replacing clipboard contents before readback, or a successful
//! write followed by an unavailable read, can conversely produce a false failure.
use crate::{
    State,
    sidebar::{icon_button, label},
};
use rune::{El, row};

fn acknowledge(
    chat: &mut super::Chat,
    id: String,
    expected: &str,
    actual: &str,
    clock: f64,
) -> bool {
    if chat.copy_pending.as_deref() != Some(&id) {
        return false;
    }
    chat.copy_pending = None;
    if actual == expected {
        chat.copied = Some((id, clock + 2.0));
        true
    } else {
        chat.copy_error = Some(id);
        false
    }
}

pub fn view(s: &State, id: &str, source: &str, reader: bool) -> El {
    let chat = super::conversation(s, reader);
    let copied = chat.copied.as_ref().is_some_and(|(key, _)| key == id);
    let pending = chat.copy_pending.as_deref() == Some(id);
    let error = chat.copy_error.as_deref() == Some(id);
    let button_key = format!("response-copy-{reader}-{id}");
    let id = id.to_owned();
    let source = source.to_owned();
    let mut control = row()
        .gap(6.0)
        .center_y()
        .group_opacity(if copied || error { 1.0 } else { 0.0 }, 1.0)
        .child(
            icon_button(
                &s.theme,
                if copied {
                    &super::icons::CHECK
                } else {
                    &super::icons::COPY
                },
                if copied { "Copied" } else { "Copy response" },
            )
            .key(button_key)
            .label("Copy response")
            .disabled(copied || pending)
            .on_press_tx(move |s: &mut State, tx| {
                let chat = super::conversation_mut(s, reader);
                chat.copy_pending = Some(id.clone());
                chat.copy_error = None;
                tx.copy(source.clone());
                let id = id.clone();
                let source = source.clone();
                // Rune queues ordinary writes before reads on the same clipboard worker.
                // Unlike copy_secret this preserves response text in clipboard history and
                // never schedules a destructive wipe. Reads also work with headless memory.
                tx.read_clipboard(move |s: &mut State, content, tx| {
                    let chat = super::conversation_mut(s, reader);
                    if acknowledge(chat, id, &source, content.text(), tx.clock()) {
                        tx.wake_after(std::time::Duration::from_secs(2));
                    }
                });
            }),
        );
    if copied {
        control =
            control.child(label(&s.theme, "Copied", 12.0, 400.0, "text-secondary").role("status"));
    }
    if error {
        control = control.child(
            label(&s.theme, "Could not copy. Try again.", 12.0, 400.0, "error").role("alert"),
        );
    }
    control
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn readback_cannot_distinguish_an_identical_preexisting_clipboard() {
        let mut chat = super::super::Chat::default();
        chat.copy_pending = Some("answer".into());
        // No write occurred: this deliberately confirms the fallback's limitation.
        assert!(acknowledge(&mut chat, "answer".into(), "same", "same", 0.0));
        chat.copy_pending = Some("answer".into());
        // An intervening writer can conversely make a completed write look failed.
        assert!(!acknowledge(
            &mut chat,
            "answer".into(),
            "same",
            "other app",
            0.0
        ));
    }
    #[test]
    fn response_copy_acknowledges_memory_clipboard_and_reports_unavailable_clipboard() {
        crate::OPTIONS.get_or_init(|| crate::Options {
            gateway: None,
            preset: String::new(),
            dark: true,
            headless: true,
            session: None,
            scroll: "bottom".into(),
            work: None,
            composer_state: String::new(),
            page: String::new(),
            panel: None,
            file: None,
            size: (1280.0, 800.0),
        });
        fn render(s: &State, _: &mut rune::Cx<State>) -> El {
            rune::col()
                .hover_group()
                .w_full()
                .h_full()
                .child(view(s, "answer", "Copy 🚀", false))
        }
        for available in [true, false] {
            let clipboard = rune::clipboard::memory();
            let mut rt = rune::Runtime::new(
                State::new(),
                render,
                (400.0, 100.0),
                rune::Env::new(true, 2.0),
            );
            if available {
                rt.use_clipboard(&clipboard);
            }
            rt.frame(0.0);
            rt.pointer_move(14.0, 14.0);
            rt.frame(0.1);
            rt.pointer_down(14.0, 14.0);
            rt.pointer_up(14.0, 14.0);
            rt.frame(0.2);
            rt.frame(0.3);
            if !available {
                // A native clipboard read that is rejected/unavailable resolves to
                // empty ClipboardContent; bare headless Runtime has no OS shell to
                // deliver that reply. Exercise that exact result without OS access.
                rt.update(|s, _| {
                    assert!(!acknowledge(
                        &mut s.chat,
                        "answer".into(),
                        "Copy 🚀",
                        "",
                        0.3
                    ))
                });
                rt.frame(0.4);
            }
            assert!(rt.state.chat.copy_pending.is_none());
            if available {
                assert_eq!(
                    clipboard.text().map(|s| s.to_string()).as_deref(),
                    Some("Copy 🚀")
                );
                assert_eq!(
                    rt.state.chat.copied.as_ref().map(|(id, _)| id.as_str()),
                    Some("answer")
                );
                assert!(rt.state.chat.copy_error.is_none());
            } else {
                assert!(rt.state.chat.copied.is_none());
                assert_eq!(rt.state.chat.copy_error.as_deref(), Some("answer"));
                assert!(
                    rt.elements()
                        .iter()
                        .any(|e| e.text.as_deref() == Some("Could not copy. Try again."))
                );
            }
        }
    }
}
