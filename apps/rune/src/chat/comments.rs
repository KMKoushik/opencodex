//! Structured draft context; nothing is sent until the user's next explicit send.
use crate::{
    State,
    sidebar::{icon_button, label},
};
use rune::{El, TextEdit, TextStyle, col, row, text_input};
use serde_json::{Value, json};

#[derive(Clone)]
pub struct Comment {
    pub id: String,
    pub target: Value,
    pub text: String,
}
pub struct Editor {
    pub id: String,
    pub target: Value,
    pub text: TextEdit,
    pub existing: bool,
}
pub fn source(target: &Value) -> String {
    if target.get("messageID").is_some() {
        return "Assistant response".into();
    }
    if let Some(url) = target["url"].as_str() {
        return target["title"]
            .as_str()
            .filter(|s| !s.is_empty())
            .unwrap_or(url)
            .into();
    }
    let path = target["path"].as_str().unwrap_or("");
    let mut result = path.to_owned();
    if let Some(start) = target["start"].as_u64() {
        result += &format!(":{start}");
        if let Some(end) = target["end"].as_u64().filter(|end| *end != start) {
            result += &format!("–{end}");
        }
    }
    if target["side"] == "old" {
        result += " (old)";
    }
    result
}
pub fn begin(s: &mut State, target: Value) {
    s.chat.comment_editor = Some(Editor {
        id: format!("comment-{}", crate::unix_ms()),
        target,
        text: TextEdit::new(""),
        existing: false,
    });
    s.chat.selected_response = None;
}
pub fn save(s: &mut State) {
    let Some(editor) = &s.chat.comment_editor else {
        return;
    };
    let text = editor.text.text.trim();
    if text.is_empty() || text.chars().count() > 8000 {
        return;
    }
    let comment = Comment {
        id: editor.id.clone(),
        target: editor.target.clone(),
        text: text.into(),
    };
    let draft = s.draft_mut();
    if let Some(old) = draft.comments.iter_mut().find(|c| c.id == comment.id) {
        *old = comment;
    } else if draft.comments.len() < 32 {
        draft.comments.push(comment);
    } else {
        s.error = Some("Add up to 32 comments per message.".into());
        return;
    }
    s.touch_draft();
    s.chat.comment_editor = None;
    crate::workbench::refresh_comment_annotations(s);
}
pub fn annotated(text: &str, comments: &[Comment]) -> (String, Option<Value>) {
    if comments.is_empty() {
        return (text.into(), None);
    }
    let mut prompt = text.to_owned();
    let mut counts = [0usize; 2];
    let mut items = Vec::new();
    for comment in comments {
        let target = &comment.target;
        let file = target.get("path").is_some();
        let kind = if file { "comment" } else { "annotation" };
        counts[usize::from(file)] += 1;
        let origin = if let Some(message) = target["messageID"].as_str() {
            format!(
                "Assistant response ({message}, part {})",
                target["ordinal"].as_u64().unwrap_or(0) + 1
            )
        } else if let Some(url) = target["url"].as_str() {
            format!(
                "{} {url}{}",
                if url.starts_with("canvas:") {
                    "canvas"
                } else {
                    "page"
                },
                target["title"]
                    .as_str()
                    .map(|t| format!(" (\"{t}\")"))
                    .unwrap_or_default()
            )
        } else {
            format!(
                "{}{}{}",
                target["directory"]
                    .as_str()
                    .map(|d| format!("{d}/"))
                    .unwrap_or_default(),
                source(target),
                target["diffMode"]
                    .as_str()
                    .map(|m| format!(" [{m} diff]"))
                    .unwrap_or_default()
            )
        };
        if !prompt.is_empty() {
            prompt += "\n\n";
        }
        prompt += &format!(
            "{} {} on {origin}:\n",
            if file { "Comment" } else { "Annotation" },
            counts[usize::from(file)]
        );
        let quote = target["previewQuote"]
            .as_str()
            .or_else(|| target["quote"].as_str())
            .unwrap_or("");
        let quote_range = if !quote.is_empty() {
            let start = prompt.encode_utf16().count();
            prompt += &quote
                .split('\n')
                .map(|l| format!("> {l}"))
                .collect::<Vec<_>>()
                .join("\n");
            Some([start, prompt.encode_utf16().count()])
        } else {
            None
        };
        if !quote.is_empty() && !comment.text.is_empty() {
            prompt += "\n\n";
        }
        let start = prompt.encode_utf16().count();
        prompt += &comment.text;
        let mut item = json!({"kind":kind,"label":source(target),"comment":[start,prompt.encode_utf16().count()]});
        if let Some(range) = quote_range {
            item["quote"] = json!(range);
        }
        items.push(item);
    }
    (
        prompt,
        Some(json!({"end":text.encode_utf16().count(),"items":items})),
    )
}
pub fn editor(s: &State) -> El {
    if s.chat
        .comment_editor
        .as_ref()
        .is_some_and(|e| e.target.get("anchor").is_some())
    {
        return rune::el();
    }
    editor_view(s, false)
}
pub fn inline_editor(s: &State) -> El {
    editor_view(s, true)
}
fn editor_view(s: &State, inline: bool) -> El {
    let Some(editor) = &s.chat.comment_editor else {
        return rune::el();
    };
    let t = &s.theme;
    let width = if inline {
        (s.panel_width() - 100.0).max(180.0).min(520.0)
    } else {
        (s.window_size.0 - 48.0).min(520.0)
    };
    let mut panel = col()
        .w(width)
        .padding(16.0)
        .gap(10.0)
        .radius(12.0)
        .fill(t.c("elevated"))
        .border(1.0, t.c("border-heavy"))
        .role("group")
        .label("Comment editor")
        .child(label(
            t,
            source(&editor.target),
            12.0,
            500.0,
            "text-secondary",
        ));
    if editor.target.get("messageID").is_some() || editor.target.get("previewQuote").is_some() {
        panel = panel.child(
            label(
                t,
                editor.target["previewQuote"]
                    .as_str()
                    .or_else(|| editor.target["quote"].as_str())
                    .unwrap_or(""),
                12.0,
                400.0,
                "text-secondary",
            )
            .max_lines(6)
            .wrap(),
        );
    }
    panel = panel
        .child(
            text_input(&editor.text, TextStyle::new(13.0, 400.0).lh(20.0))
                .key("review-comment")
                .label("Review comment")
                .placeholder("What should change?", t.c("text-tertiary"))
                .w_full()
                .min_h(64.0)
                .max_h(200.0)
                .padding(10.0)
                .radius(8.0)
                .fill(t.c("secondary"))
                .color(t.c("text"))
                .autofocus()
                .on_edit(|s: &mut State| &mut s.chat.comment_editor.as_mut().unwrap().text)
                .on_input_key(|s: &mut State, key, _| {
                    if key.key == rune::Key::Enter && (key.mods.cmd || key.mods.ctrl) {
                        save(s);
                        true
                    } else {
                        false
                    }
                }),
        )
        .child(
            row()
                .gap(8.0)
                .center_y()
                .child(
                    label(
                        t,
                        "Send with your next message",
                        11.0,
                        400.0,
                        "text-tertiary",
                    )
                    .grow(1.0),
                )
                .child(
                    crate::workbench::comment_button(s, "Cancel").on_press(|s: &mut State| {
                        s.chat.comment_editor = None;
                        crate::workbench::refresh_comment_annotations(s);
                    }),
                )
                .child(
                    crate::workbench::comment_button(
                        s,
                        if editor.existing {
                            "Save"
                        } else {
                            "Add comment"
                        },
                    )
                    .disabled(editor.text.text.trim().is_empty())
                    .on_press(save),
                ),
        );
    if inline {
        return panel;
    }
    t.shadow(panel, "shadow")
        .absolute(
            (s.window_size.0 - width) / 2.0,
            (s.window_size.1 - 260.0).max(24.0) / 2.0,
        )
        .modal(true, |s: &mut State| s.chat.comment_editor = None)
}
pub fn chips(s: &State) -> El {
    let mut chips = col().w_full().gap(6.0);
    for comment in &s.draft().comments {
        let id = comment.id.clone();
        let edit = comment.clone();
        chips = chips.child(
            row()
                .w_full()
                .gap(6.0)
                .center_y()
                .radius(8.0)
                .fill(s.theme.c("secondary"))
                .child(
                    label(
                        &s.theme,
                        format!("{} · {}", source(&comment.target), comment.text),
                        12.0,
                        400.0,
                        "text-secondary",
                    )
                    .truncate()
                    .grow(1.0)
                    .role("button")
                    .focusable(true)
                    .label(format!("Edit comment on {}", source(&comment.target)))
                    .on_press(move |s: &mut State| {
                        s.chat.comment_editor = Some(Editor {
                            id: edit.id.clone(),
                            target: edit.target.clone(),
                            text: TextEdit::new(edit.text.clone()),
                            existing: true,
                        });
                    }),
                )
                .child(
                    icon_button(
                        &s.theme,
                        &crate::icons::CLOSE,
                        &format!("Remove comment on {}", source(&comment.target)),
                    )
                    .on_press(move |s: &mut State| {
                        s.draft_mut().comments.retain(|c| c.id != id);
                        s.touch_draft();
                        crate::workbench::refresh_comment_annotations(s);
                    }),
                ),
        );
    }
    chips.mb(if s.draft().comments.is_empty() {
        0.0
    } else {
        12.0
    })
}
pub fn selected_actions(s: &State) -> El {
    let Some(target) = &s.chat.selected_response else {
        return rune::el();
    };
    let comment = target.clone();
    let quote = target["quote"].as_str().unwrap_or("").to_owned();
    let copy = quote.clone();
    s.theme
        .shadow(
            row()
                .gap(4.0)
                .padding(4.0)
                .radius(10.0)
                .fill(s.theme.c("elevated"))
                .border(1.0, s.theme.c("border-heavy"))
                .role("group")
                .label("Selected response actions")
                .child(
                    crate::workbench::comment_button(s, "Copy")
                        .on_press_tx(move |_: &mut State, tx| tx.copy(copy.clone())),
                )
                .child(
                    crate::workbench::comment_button(s, "Add comment")
                        .on_press(move |s: &mut State| begin(s, comment.clone())),
                )
                .child(
                    crate::workbench::comment_button(s, "Ask in side chat").on_press(
                        move |s: &mut State| {
                            s.chat.selected_response = None;
                            s.create_workspace_side(
                                quote
                                    .split('\n')
                                    .map(|l| format!("> {l}"))
                                    .collect::<Vec<_>>()
                                    .join("\n")
                                    + "\n\n",
                            );
                        },
                    ),
                ),
            "shadow",
        )
        .absolute(24.0, 12.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn annotation_ranges_use_gateway_utf16_and_omit_absent_quotes() {
        let comments = [Comment {
            id: "a".into(),
            target: json!({"path":"a.rs","directory":"/project"}),
            text: "Fix 🚀".into(),
        }];
        let (text, annotations) = annotated("Hello 🌍", &comments);
        let annotations = annotations.unwrap();
        assert_eq!(annotations["end"], 8);
        let item = &annotations["items"][0];
        assert!(item.get("quote").is_none());
        let bytes: Vec<u16> = text.encode_utf16().collect();
        let range = item["comment"].as_array().unwrap();
        assert_eq!(
            String::from_utf16(
                &bytes[range[0].as_u64().unwrap() as usize..range[1].as_u64().unwrap() as usize]
            )
            .unwrap(),
            "Fix 🚀"
        );
    }
}
