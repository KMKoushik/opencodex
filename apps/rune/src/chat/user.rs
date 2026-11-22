//! UserPrompt's metadata is presentation context, not part of the user's bubble.
use crate::{State, sidebar::label};
use rune::{Align, El, Side, Span, TextStyle, col, icon, row};
use serde_json::Value;
type Fields = std::collections::BTreeMap<String, Value>;

/// Convert a JavaScript UTF-16 boundary to a Rust byte boundary. Invalid boundaries
/// never slice through a scalar (malformed metadata falls back to ordinary text).
pub fn boundary(text: &str, offset: usize) -> Option<usize> {
    let mut at = 0;
    for (byte, ch) in text.char_indices() {
        if at == offset {
            return Some(byte);
        }
        at += ch.len_utf16();
    }
    (at == offset).then_some(text.len())
}
fn range<'a>(text: &'a str, value: &Value) -> Option<&'a str> {
    let values = value.as_array()?;
    if values.len() != 2 {
        return None;
    }
    let from = boundary(text, values[0].as_u64()? as usize)?;
    let to = boundary(text, values[1].as_u64()? as usize)?;
    text.get(from..to)
}
fn annotations<'a>(text: &str, fields: &'a Fields) -> Option<&'a Value> {
    let value = &fields.get("metadata")?["opencodexAnnotations"];
    boundary(text, value["end"].as_u64()? as usize)?;
    let items = value["items"].as_array()?;
    if items.is_empty() || items.len() > 64 {
        return None;
    }
    for item in items {
        if !matches!(item["kind"].as_str(), Some("annotation" | "comment"))
            || item["label"].as_str()?.encode_utf16().count() > 4096
        {
            return None;
        }
        for key in ["quote", "comment"] {
            if item.get(key).is_some() {
                range(text, &item[key])?;
            }
        }
    }
    Some(value)
}
pub fn own<'a>(text: &'a str, fields: &Fields) -> &'a str {
    annotations(text, fields)
        .and_then(|a| boundary(text, a["end"].as_u64()? as usize))
        .map(|end| text[..end].trim_end())
        .unwrap_or(text)
}
pub fn spans(s: &State, text: &str, fields: &Fields) -> Vec<Span> {
    let mut mentions = Vec::new();
    for key in ["files", "skills"] {
        for item in fields
            .get(key)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let mention = &item["mention"];
            let Some(start) = mention["start"]
                .as_u64()
                .and_then(|v| boundary(text, v as usize))
            else {
                continue;
            };
            let Some(end) = mention["end"]
                .as_u64()
                .and_then(|v| boundary(text, v as usize))
            else {
                continue;
            };
            if text.get(start..end) == mention["text"].as_str() && end > start {
                mentions.push((start, end));
            }
        }
    }
    mentions.sort_by_key(|v| v.0);
    let mut end = 0;
    let mut spans = crate::find::highlights(s, text);
    for (from, to) in mentions {
        if from < end {
            continue;
        }
        end = to;
        spans.push(
            Span::new(from, to)
                .color(s.theme.c("accent-text"))
                .bg(s.theme.c("accent-soft"), 2.0),
        );
    }
    spans
}
pub fn chip(
    s: &State,
    message: &std::sync::Arc<oc_gateway::types::Message>,
    reader: bool,
) -> Option<El> {
    build(s, message, reader, false)
}
pub fn popover(s: &State, reader: bool) -> El {
    super::conversation(s, reader)
        .annotation_preview
        .as_ref()
        .and_then(|message| build(s, message, reader, true))
        .unwrap_or_else(rune::el)
}
fn build(
    s: &State,
    message: &std::sync::Arc<oc_gateway::types::Message>,
    reader: bool,
    preview: bool,
) -> Option<El> {
    let fields = &message.fields;
    let text = fields.get("text").and_then(Value::as_str).unwrap_or("");
    let id = &message.id;
    let a = annotations(text, fields)?;
    let items = a["items"].as_array()?;
    let count = |kind: &str| items.iter().filter(|i| i["kind"] == kind).count();
    let summary = [
        (count("annotation"), "annotation"),
        (count("comment"), "comment"),
    ]
    .into_iter()
    .filter(|(n, _)| *n > 0)
    .map(|(n, kind)| format!("{n} {kind}{}", if n == 1 { "" } else { "s" }))
    .collect::<Vec<_>>()
    .join(", ");
    let key = format!("annotations-{reader}-{id}");
    let captured = message.clone();
    let body = col().items_end().child(
        row()
            .key(key.clone())
            .h(30.0)
            .px(12.0)
            .gap(6.0)
            .center_y()
            .radius(999.0)
            .fill(s.theme.c("user-message"))
            .hover(s.theme.c("secondary-hover"))
            .border(1.0, s.theme.c("border"))
            .role("button")
            .label(&summary)
            .focusable(true)
            .child(icon(&super::icons::COMMENT, 14.0).color(s.theme.c("text-secondary")))
            .child(label(
                &s.theme,
                &summary,
                s.prefs.chat_font_size.unwrap_or(14.0),
                400.0,
                "text",
            ))
            .on_press(move |s: &mut State| {
                let chat = super::conversation_mut(s, reader);
                chat.annotation_preview = if chat
                    .annotation_preview
                    .as_ref()
                    .is_some_and(|m| m.id == captured.id)
                {
                    None
                } else {
                    Some(captured.clone())
                };
                chat.disclosure_revision += 1;
            }),
    );
    if !preview {
        return Some(body);
    }
    let mut popup = col()
        .w((s.window_size.0 - 32.0).min(400.0))
        .max_h((s.window_size.1 - 32.0).min(320.0))
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .radius(12.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .role("dialog")
        .label(summary);
    let mut numbers = [0usize; 2];
    for (index, item) in items.iter().enumerate() {
        let code = item["kind"] == "comment";
        numbers[usize::from(code)] += 1;
        let mut entry = col().w_full().px(12.0).py(10.0).gap(4.0);
        if index > 0 {
            entry = entry.border_sides([1.0, 0.0, 0.0, 0.0], s.theme.c("border"));
        }
        entry = entry.child(label(
            &s.theme,
            format!(
                "{} {}",
                if code { "Comment" } else { "Annotation" },
                numbers[usize::from(code)]
            ),
            12.0,
            500.0,
            "text-secondary",
        ));
        if let Some(source) = item["label"].as_str().filter(|s| !s.is_empty()) {
            entry = entry.child(label(&s.theme, source, 11.0, 400.0, "text-tertiary").truncate());
        }
        if let Some(quote) = range(text, &item["quote"]).filter(|s| !s.is_empty()) {
            let quote = quote
                .lines()
                .map(|line| {
                    line.strip_prefix("> ")
                        .or_else(|| line.strip_prefix('>'))
                        .unwrap_or(line)
                })
                .collect::<Vec<_>>()
                .join("\n");
            entry = entry
                .child(label(&s.theme, "Selected text:", 11.0, 500.0, "text-tertiary").mt(4.0))
                .child(
                    rune::text(quote)
                        .font(if code {
                            TextStyle::new(12.0, 400.0).mono().lh(19.5)
                        } else {
                            TextStyle::new(13.0, 400.0).lh(19.5)
                        })
                        .color(s.theme.c("text-secondary"))
                        .wrap()
                        .selectable(true)
                        .pl(10.0)
                        .border_sides([0.0, 0.0, 0.0, 2.0], s.theme.c("border-heavy"))
                        .max_h(120.0)
                        .scroll(rune::ScrollSpec {
                            stick_bottom: false,
                        }),
                );
        }
        if let Some(comment) = range(text, &item["comment"]).filter(|s| !s.is_empty()) {
            entry = entry
                .child(label(&s.theme, "User comment:", 11.0, 500.0, "text-tertiary").mt(4.0))
                .child(
                    label(&s.theme, comment, 13.0, 400.0, "text")
                        .wrap()
                        .selectable(true)
                        .max_h(120.0)
                        .scroll(rune::ScrollSpec {
                            stick_bottom: false,
                        }),
                );
        }
        popup = popup.child(entry);
    }
    Some(
        s.theme
            .shadow(popup, "shadow")
            .anchored(key, Side::Bottom, Align::End, 6.0)
            .modal(true, move |s: &mut State| {
                let chat = super::conversation_mut(s, reader);
                chat.annotation_preview = None;
                chat.disclosure_revision += 1;
            }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sent_context_uses_utf16_and_invalid_metadata_is_plain_text() {
        let text = "Hi 🌍\n\nComment";
        let fields: Fields = serde_json::from_value(serde_json::json!({"metadata":{"opencodexAnnotations":{"end":5,"items":[{"kind":"annotation","label":"Assistant response","comment":[7,14]}]}}})).unwrap();
        assert_eq!(own(text, &fields), "Hi 🌍");
        assert_eq!(boundary(text, 4), None);
        assert_eq!(own(text, &Fields::new()), text);
    }
}
