use crate::State;
use oc_markdown::{Markdown, MarkdownStyle};
use rune::{El, ScrollSpec, TextStyle, col};

pub fn view(s: &State, index: usize) -> El {
    let doc = &s.workbench.docs[index];
    if doc.edit.text.len() > 200_000 {
        return col()
            .grow(1.0)
            .center()
            .gap(12.0)
            .child(super::view::empty(
                s,
                "This document is too large for rendered preview.",
            ))
            .child(
                super::documents::button(s, "View source")
                    .on_press(move |s: &mut State| s.workbench.docs[index].preview = false),
            );
    }
    let parent = std::path::Path::new(&doc.path)
        .parent()
        .unwrap_or(std::path::Path::new(""));
    let base = std::path::Path::new(&doc.directory)
        .join(parent)
        .to_string_lossy()
        .into_owned();
    let style = MarkdownStyle::neutral(s.theme.dark)
        .web_layout()
        .text(s.theme.c("text"))
        .muted(s.theme.c("text-secondary"))
        .link(s.theme.c("link"))
        .body_font(TextStyle::new(14.0, 400.0).lh(22.75))
        .text_width(
            (s.panel_width()
                - if s.workbench.tree_visible {
                    s.workbench.tree_width
                } else {
                    0.0
                }
                - 48.0)
                .max(100.0),
        )
        .syntax_highlight(false);
    col()
        .grow(1.0)
        .min_h(0.0)
        .padding(24.0)
        .role("region")
        .label(format!("Markdown preview: {}", doc.path))
        .focusable(true)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(
            Markdown::new(&doc.edit.text)
                .on_link_tx(move |s: &mut State, href, tx| {
                    if let Some((directory, path)) = super::file_target(href, &base) {
                        s.open_workspace_target(directory, path, false);
                    } else {
                        s.open_link(href, tx);
                    }
                })
                .selectable(true)
                .tasks_read_only()
                .render(&style),
        )
}
