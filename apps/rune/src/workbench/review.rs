use crate::{State, chat::comments, sidebar::label};
use rune::El;
use rune_kit::diff::{Annotation, LineRange, LineRef, Side};
use serde_json::json;

pub fn begin(s: &mut State, range: LineRange) {
    let Some(index) = s.workbench.selected else {
        return;
    };
    let mode = s.workbench.mode.clone();
    let doc = &mut s.workbench.docs[index];
    doc.diff.set_selection(Some(range));
    let quote = doc.diff.selected_text().unwrap_or_default();
    let mut target = json!({"path":doc.path,"directory":doc.directory,"start":range.start.line.min(range.end.line),"end":range.start.line.max(range.end.line),"side":if range.start.side==Side::Old{"old"}else{"new"},"quote":quote,"diffMode":mode,"anchor":{"line":range.end.line,"side":if range.end.side==Side::Old{"deletions"}else{"additions"}}});
    if range.start.side != range.end.side {
        let value = target.as_object_mut().unwrap();
        value.remove("start");
        value.remove("end");
        value.remove("side");
        value.insert(
            "quote".into(),
            json!(format!(
                "Diff selection: {} line {} to {} line {}.",
                if range.start.side == Side::Old {
                    "old"
                } else {
                    "new"
                },
                range.start.line,
                if range.end.side == Side::Old {
                    "old"
                } else {
                    "new"
                },
                range.end.line
            )),
        );
    }
    comments::begin(s, target);
    refresh(s);
}
pub fn source_selection(s: &mut State) {
    let Some(index) = s.workbench.selected else {
        return;
    };
    let doc = &s.workbench.docs[index];
    let a = doc.edit.anchor.min(doc.edit.focus);
    let b = doc.edit.anchor.max(doc.edit.focus);
    let text = &doc.edit.text;
    if b > text.len() {
        return;
    }
    let start = text[..a].bytes().filter(|b| *b == b'\n').count() + 1;
    let end = start
        + text[a..b]
            .trim_end_matches('\n')
            .bytes()
            .filter(|b| *b == b'\n')
            .count();
    let first = text[..a].rfind('\n').map_or(0, |i| i + 1);
    let boundary = if b > a && text[..b].ends_with('\n') {
        b - 1
    } else {
        b
    };
    let last = text[boundary..]
        .find('\n')
        .map_or(text.len(), |i| boundary + i);
    comments::begin(
        s,
        json!({"path":doc.path,"directory":doc.directory,"version":doc.value["version"],"start":start,"end":end,"quote":text[first..last].chars().take(8000).collect::<String>()}),
    );
}
pub fn refresh(s: &mut State) {
    let mut comments = s.draft().comments.clone();
    if let Some(editor) = &s.chat.comment_editor {
        comments.retain(|c| c.id != editor.id);
        comments.push(comments::Comment {
            id: editor.id.clone(),
            target: editor.target.clone(),
            text: String::new(),
        });
    }
    for doc in &mut s.workbench.docs {
        if !doc.is_diff {
            continue;
        }
        let mut annotations = Vec::new();
        for comment in &comments {
            let target = &comment.target;
            if target["path"] != doc.path
                || target["directory"] != doc.directory
                || target["diffMode"] != s.workbench.mode
            {
                continue;
            }
            if let Some(start) = target["start"].as_u64() {
                let side = if target["side"] == "old" {
                    Side::Old
                } else {
                    Side::New
                };
                let saved = doc.diff.selection();
                doc.diff.set_selection(Some(LineRange {
                    file: 0,
                    start: LineRef::new(side, start as u32),
                    end: LineRef::new(side, target["end"].as_u64().unwrap_or(start) as u32),
                }));
                let quote = doc.diff.selected_text().unwrap_or_default();
                doc.diff.set_selection(saved);
                if quote != target["quote"].as_str().unwrap_or("") {
                    continue;
                }
            }
            let Some(line) = target["anchor"]["line"].as_u64() else {
                continue;
            };
            let side = if target["anchor"]["side"] == "deletions" {
                Side::Old
            } else {
                Side::New
            };
            annotations.push(Annotation::new(
                0,
                LineRef::new(side, line as u32),
                comment.id.clone(),
            ));
        }
        doc.diff.set_annotations(annotations);
    }
}
pub fn card(s: &State, annotation: &Annotation) -> El {
    if s.chat
        .comment_editor
        .as_ref()
        .is_some_and(|e| e.id == annotation.id)
    {
        return comments::inline_editor(s);
    }
    let Some(comment) = s.draft().comments.iter().find(|c| c.id == annotation.id) else {
        return rune::el();
    };
    let edit = comment.clone();
    let id = comment.id.clone();
    rune::row()
        .w_full()
        .padding(10.0)
        .gap(8.0)
        .radius(8.0)
        .fill(s.theme.c("secondary"))
        .child(
            rune::col()
                .grow(1.0)
                .gap(4.0)
                .child(label(
                    &s.theme,
                    comments::source(&comment.target),
                    12.0,
                    500.0,
                    "text-secondary",
                ))
                .child(label(&s.theme, &comment.text, 13.0, 400.0, "text").wrap())
                .role("button")
                .focusable(true)
                .label(format!(
                    "Edit comment on {}",
                    comments::source(&comment.target)
                ))
                .on_press(move |s: &mut State| {
                    s.chat.comment_editor = Some(comments::Editor {
                        id: edit.id.clone(),
                        target: edit.target.clone(),
                        text: rune::TextEdit::new(edit.text.clone()),
                        existing: true,
                    });
                    refresh(s);
                }),
        )
        .child(
            crate::sidebar::icon_button(
                &s.theme,
                &crate::icons::CLOSE,
                &format!("Remove comment on {}", comments::source(&comment.target)),
            )
            .on_press(move |s: &mut State| {
                s.draft_mut().comments.retain(|c| c.id != id);
                s.touch_draft();
                refresh(s);
            }),
        )
}
