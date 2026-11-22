//! Native rune-edit source input. Number rows are virtual; editing/IME/undo remain Rune-owned.
use crate::{State, sidebar::label};
use rune::{El, GrowthSpec, TextStyle, col, row, text_input};

fn syntax_theme(s: &State) -> rune_kit::syntax::SyntaxTheme {
    use rune_kit::syntax::Syntax;
    let mut theme = rune_kit::syntax::SyntaxTheme::from_kit(&super::view::kit(s));
    for kind in [
        Syntax::Number,
        Syntax::Function,
        Syntax::Property,
        Syntax::Parameter,
        Syntax::Heading,
        Syntax::Link,
        Syntax::Attribute,
        Syntax::Variable,
        Syntax::Inserted,
        Syntax::Deleted,
    ] {
        theme = theme.with(kind, s.theme.c("text")).with_weight(kind, 400.0);
    }
    let weight = s
        .theme
        .tokens
        .get("syntax-keyword-weight")
        .and_then(|v| v.parse::<f32>().ok())
        .unwrap_or(400.0);
    for kind in [Syntax::Keyword, Syntax::Type] {
        theme = theme
            .with(kind, s.theme.c("syntax-keyword"))
            .with_weight(kind, weight);
    }
    for kind in [Syntax::String, Syntax::Regex] {
        theme = theme
            .with(kind, s.theme.c("syntax-string"))
            .with_weight(kind, 400.0);
    }
    theme
        .with(Syntax::Comment, s.theme.c("syntax-comment"))
        .with(Syntax::Punctuation, s.theme.c("syntax-punctuation"))
        .with(Syntax::Operator, s.theme.c("syntax-punctuation"))
}

pub fn view(s: &State, index: usize) -> El {
    let doc = &s.workbench.docs[index];
    let t = &s.theme;
    let digits = doc.lines.len().max(1).ilog10() + 1;
    let gutter = 18.0 + digits as f32 * 7.5 + 12.0;
    let available = s.panel_width()
        - if s.workbench.tree_visible {
            s.workbench.tree_width
        } else {
            0.0
        };
    let width = (doc.line_columns as f32 * 7.5 + 16.0).max(available - gutter);
    let height = doc.lines.len() as f32 * 20.0 + 8.0;
    let first_byte = doc
        .lines
        .get(doc.visible_source.start)
        .map_or(0, |line| line.0);
    let last_byte = doc
        .lines
        .get(
            doc.visible_source
                .end
                .saturating_sub(1)
                .min(doc.lines.len().saturating_sub(1)),
        )
        .map_or(0, |line| line.1);
    let first_span = doc
        .highlights
        .partition_point(|(range, _)| range.end <= first_byte);
    let visible_highlights: Vec<_> = doc.highlights[first_span..]
        .iter()
        .take_while(|(range, _)| range.start <= last_byte)
        .cloned()
        .collect();
    let input = text_input(&doc.edit, TextStyle::new(12.5, 400.0).mono().lh(20.0))
        .key("workspace-editor")
        .label(format!("File contents: {}", doc.path))
        .size(width, height)
        .px(0.0)
        .py(4.0)
        .color(t.c("text"))
        .caret(t.c("text"), t.c("selected"))
        .decorations(syntax_theme(s).spans(&visible_highlights, 0))
        .on_edit(move |s: &mut State| &mut s.workbench.docs[index].edit)
        .on_submit(move |s: &mut State, tx| {
            let newline = if s.workbench.docs[index].value["text"]
                .as_str()
                .is_some_and(|t| t.contains("\r\n"))
            {
                "\r\n"
            } else {
                "\n"
            };
            s.workbench.docs[index].edit.insert(newline);
            changed(s, index, tx);
        })
        .on_input_change(move |s: &mut State, tx| changed(s, index, tx))
        .on_input_key(move |s: &mut State, key, tx| {
            if key.is_command('m') && key.mods.shift {
                super::review::source_selection(s);
                tx.focus("review-comment", false);
                return true;
            }
            if key.is_command('s') {
                s.save_workspace_file();
                tx.instant();
                return true;
            }
            if key.key == rune::Key::Tab && !key.mods.cmd && !key.mods.ctrl && !key.mods.alt {
                indent(s, index, key.mods.shift, tx);
                return true;
            }
            false
        });
    let active = doc
        .lines
        .partition_point(|(_, end)| *end < doc.edit.focus)
        .min(doc.lines.len().saturating_sub(1));
    let numbers = col()
        .w(gutter)
        .min_h(height)
        .growth(GrowthSpec::default())
        .pt(4.0)
        .virtual_rows(
            doc.lines.len(),
            20.0,
            move |_: &State, n| format!("source-line-{index}-{n}").into(),
            move |s: &State, n| {
                row()
                    .w(gutter)
                    .h(20.0)
                    .center_y()
                    .pr(10.0)
                    .gap(2.0)
                    .hover_group()
                    .fill(if n == active {
                        s.theme.c("secondary")
                    } else {
                        s.theme.c("surface")
                    })
                    .child(
                        label(&s.theme, "+", 11.0, 400.0, "text-tertiary")
                            .w(16.0)
                            .group_opacity(0.0, 1.0)
                            .role("button")
                            .label(format!("Comment on line {}", n + 1))
                            .focusable(true)
                            .on_press_tx(move |s: &mut State, tx| {
                                let doc = &mut s.workbench.docs[index];
                                let (a, b) = doc.lines[n];
                                doc.edit.anchor = a;
                                doc.edit.focus = b;
                                super::review::source_selection(s);
                                tx.focus("review-comment", false);
                            }),
                    )
                    .child(
                        label(&s.theme, format!("{}", n + 1), 12.5, 400.0, "text-tertiary")
                            .font(TextStyle::new(12.5, 400.0).mono().lh(20.0))
                            .align(rune::Align::End)
                            .grow(1.0)
                            .on_drag(move |s: &mut State, d, tx| {
                                let doc = &mut s.workbench.docs[index];
                                if d.cancelled() {
                                    return;
                                }
                                let end = ((n as f32 + d.dy / 20.0).floor().max(0.0) as usize)
                                    .min(doc.lines.len() - 1);
                                doc.edit.anchor = doc.lines[n.min(end)].0;
                                doc.edit.focus = doc.lines[n.max(end)].1;
                                tx.focus("workspace-editor", false);
                            }),
                    )
            },
        );
    let numbers = numbers.on_visible_rows(move |s: &mut State, range| {
        let doc = &mut s.workbench.docs[index];
        if doc.visible_source == range {
            false
        } else {
            doc.visible_source = range;
            true
        }
    });
    let content = col()
        .w(width + gutter)
        .min_h(height)
        .child(numbers)
        .child(
            rune::el()
                .size(width, 20.0)
                .fill(t.c("secondary"))
                .absolute(gutter, 4.0 + active as f32 * 20.0)
                .inert(),
        )
        .child(input.absolute(gutter, 0.0));
    let mut editor = col()
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .scroll_xy()
        .child(content);
    // Rune exposes no native text-input block-widget API. Retain accessible review cards in
    // a dock below the source instead of mutating source bytes with comment UI.
    let comments: Vec<_> = s
        .draft()
        .comments
        .iter()
        .filter(|c| {
            let target = &c.target;
            if target["path"] != doc.path
                || target["directory"] != doc.directory
                || !target["diffMode"].is_null()
                || target["version"] != doc.value["version"]
            {
                return false;
            }
            let start = target["start"].as_u64().unwrap_or(0) as usize;
            let end = target["end"].as_u64().unwrap_or(0) as usize;
            if start == 0 || end < start || end > doc.lines.len() {
                return false;
            }
            doc.edit.text[doc.lines[start - 1].0..doc.lines[end - 1].1]
                .chars()
                .take(8000)
                .collect::<String>()
                == target["quote"].as_str().unwrap_or("")
        })
        .collect();
    if !comments.is_empty() {
        let mut cards = col().w_full().gap(6.0).padding(8.0);
        for comment in comments {
            let annotation = rune_kit::diff::Annotation::new(
                0,
                rune_kit::diff::LineRef::new(
                    rune_kit::diff::Side::New,
                    comment.target["start"].as_u64().unwrap_or(1) as u32,
                ),
                comment.id.clone(),
            );
            cards = cards.child(super::review::card(s, &annotation));
        }
        editor = col()
            .grow(1.0)
            .min_h(0.0)
            .child(editor)
            .child(cards.max_h(200.0).scroll(rune::ScrollSpec {
                stick_bottom: false,
            }));
    }
    editor
}
pub fn changed(s: &mut State, index: usize, tx: &mut rune::Tx) {
    let dirty_count = s.workbench.docs.iter().filter(|d| d.dirty()).count();
    let doc = &mut s.workbench.docs[index];
    let error = if doc.edit.text.len() > 2 * 1024 * 1024 {
        Some("This edit would exceed the file size limit. Keep this document under 2 MiB.")
    } else if !doc.dirty() && dirty_count >= 8 {
        Some("Save or discard an open edit before editing another file (8-file limit).")
    } else {
        None
    };
    if let Some(error) = error {
        doc.edit.undo();
        s.workbench.error = Some(error.into());
    } else {
        doc.revision += 1;
        doc.pinned = true;
        s.workbench.error = None;
        remap_syntax(doc);
        doc.highlight_due = Some(tx.clock() + 0.12);
        tx.wake_after(std::time::Duration::from_millis(120));
    }
    super::documents::reindex(doc);
}
pub(super) fn syntax_prefix(text: &str) -> &str {
    let mut end = text.len().min(128 * 1024);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}
fn remap_syntax(doc: &mut super::documents::Document) {
    // Preserve unaffected colours until the worker catches up; never scan/copy the full
    // multi-megabyte file again just to shift lexer offsets around a local edit.
    let old = &doc.syntax_source;
    let new = syntax_prefix(&doc.edit.text);
    let mut first = old
        .bytes()
        .zip(new.bytes())
        .take_while(|(a, b)| a == b)
        .count();
    while !old.is_char_boundary(first) || !new.is_char_boundary(first) {
        first -= 1;
    }
    let mut suffix = old[first..]
        .bytes()
        .rev()
        .zip(new[first..].bytes().rev())
        .take_while(|(a, b)| a == b)
        .count();
    while !old.is_char_boundary(old.len() - suffix) || !new.is_char_boundary(new.len() - suffix) {
        suffix -= 1;
    }
    let old_end = old.len() - suffix;
    let new_end = new.len() - suffix;
    let delta = new_end as isize - old_end as isize;
    doc.highlights.retain_mut(|(range, _)| {
        if range.end <= first {
            return true;
        }
        if range.start >= old_end {
            range.start = range.start.saturating_add_signed(delta);
            range.end = range.end.saturating_add_signed(delta);
            range.end <= new.len()
                && new.is_char_boundary(range.start)
                && new.is_char_boundary(range.end)
        } else {
            false
        }
    });
    doc.syntax_source.clear();
    doc.syntax_source.push_str(new);
}
fn indent(s: &mut State, index: usize, outdent: bool, tx: &mut rune::Tx) {
    let doc = &mut s.workbench.docs[index];
    if doc.edit.anchor == doc.edit.focus && !outdent {
        doc.edit.insert("  ");
    } else {
        let a = doc.edit.anchor.min(doc.edit.focus);
        let b = doc.edit.anchor.max(doc.edit.focus);
        let first = doc.edit.text[..a].rfind('\n').map_or(0, |i| i + 1);
        let last = doc.edit.text[b..]
            .find('\n')
            .map_or(doc.edit.text.len(), |i| b + i);
        let replacement = doc.edit.text[first..last]
            .split('\n')
            .map(|line| {
                if outdent {
                    line.strip_prefix("  ")
                        .or_else(|| line.strip_prefix('\t'))
                        .unwrap_or(line)
                        .to_owned()
                } else {
                    format!("  {line}")
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        doc.edit.anchor = first;
        doc.edit.focus = last;
        doc.edit.insert(&replacement);
        doc.edit.anchor = first;
    }
    changed(s, index, tx);
}
