//! Virtual, no-wrap source rows; native line fields retain Rune's selection and IME.
use crate::State;
use rune::TextEdit;

mod rows;
pub use rows::sync;
pub use rows::view;

#[derive(Default)]
pub struct SourceInput {
    pub line: usize,
    pub edit: TextEdit,
    pub start: usize,
    pub end: usize,
    pub global_selection: bool,
}

pub fn activate(doc: &mut super::documents::Document, line: usize) {
    let line = line.min(doc.lines.len().saturating_sub(1));
    let (start, end) = doc.lines[line];
    let focused = doc.source_input.edit.focused;
    doc.source_input = SourceInput {
        line,
        edit: TextEdit::new(&doc.edit.text[start..end]),
        start,
        end,
        global_selection: false,
    };
    doc.source_input.edit.focused = focused;
}

pub fn selection(doc: &mut super::documents::Document) {
    if !doc.source_input.global_selection {
        doc.edit.anchor = doc.source_input.start + doc.source_input.edit.anchor;
        doc.edit.focus = doc.source_input.start + doc.source_input.edit.focus;
    }
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

pub(super) fn syntax_theme(s: &State) -> rune_kit::syntax::SyntaxTheme {
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
