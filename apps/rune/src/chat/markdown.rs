use crate::State;
use rune::{El, TextStyle, el};
use rune_kit::{Markdown, MarkdownStyle};

pub fn render(s: &State, source: &str, streaming: bool, width: f32) -> El {
    let t = &s.theme;
    let mut style = MarkdownStyle::neutral(t.dark)
        .text(t.c("text"))
        .muted(t.c("text-secondary"))
        .body_font(TextStyle::new(14.0, 400.0).lh(22.75))
        .link(t.c("link"))
        .link_underline(t.c("link-underline"))
        .inline_code_bg(t.c("code-bg"))
        .inline_code_font(13.0 / 14.0, 400.0)
        // Rune represents chip padding with sized narrow-space glyphs. Five points
        // inflates SF Pro's line metrics; keep it below the body's ascender height.
        .inline_code_pad(2.0)
        .list_markers_outside(true)
        .code_block(t.c("surface-under"), t.c("border"))
        .code_block_font(TextStyle::new(13.0, 400.0).mono().lh(22.75))
        .code_block_padding(16.0, 14.0)
        .text_width(width)
        .list(24.0, 6.0)
        .strong_weight(600.0)
        .quote(t.c("border-heavy"), 2.0, 16.0, t.c("text-secondary"))
        .rule(t.c("border-heavy"))
        .table_outline(None)
        .table_header_fill(rune::Color::TRANSPARENT)
        .table_rules(t.c("border"))
        .table_header_rule(t.c("border-heavy"))
        .table_header_weight(600.0)
        .table_header_text(t.c("text"))
        .table_cell_padding(12.0, 10.0)
        .table_full_width(true)
        .syntax(rune_kit::markdown::Syntax::Keyword, t.c("syntax-keyword"))
        .syntax(rune_kit::markdown::Syntax::String, t.c("syntax-string"))
        .syntax(rune_kit::markdown::Syntax::Comment, t.c("syntax-comment"))
        .syntax(
            rune_kit::markdown::Syntax::Punctuation,
            t.c("syntax-punctuation"),
        )
        .syntax_highlight(false)
        .diff(rune::Color::TRANSPARENT, rune::Color::TRANSPARENT)
        .diff_text(t.c("text"), t.c("text"));
    for (level, size) in [(1, 24.5), (2, 21.0), (3, 17.5), (4, 14.0)] {
        style = style.heading_font(level, TextStyle::new(size, 600.0).lh(size * 1.4));
    }
    let ink = t.c("text-secondary");
    let hover = t.c("hover");
    let images = s.chat.media.images.clone();
    Markdown::new(source)
        .images(move |source| {
            images
                .get(source)
                .and_then(|image| image.as_ref().ok())
                .cloned()
        })
        .image_frame(|body, frame| {
            let source = frame.src.to_owned();
            body.on_press(move |s: &mut State| s.chat.preview = Some(source.clone()))
        })
        .selectable(true)
        .streaming(streaming)
        .code_frame(move |body, frame| {
            let copy = frame.source.to_owned();
            body.radius(10.0).hover_group().child(
                el().size(26.0, 26.0)
                    .absolute(width - 34.0, 6.0)
                    .radius(6.0)
                    .center()
                    .hover(hover)
                    .child(rune::icon(&super::icons::COPY, 14.0).color(ink))
                    .group_opacity(0.0, 1.0)
                    .label("Copy code")
                    .role("button")
                    .focusable(true)
                    .on_press_tx(move |_: &mut State, tx| tx.copy(copy.clone())),
            )
        })
        .render(&style)
}
