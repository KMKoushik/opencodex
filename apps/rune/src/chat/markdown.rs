use crate::State;
use oc_markdown::{Markdown, MarkdownStyle};
use rune::{El, TextStyle};

pub fn render(s: &State, source: &str, streaming: bool, width: f32) -> El {
    let t = &s.theme;
    let font_size = s.prefs.chat_font_size.unwrap_or(14.0);
    let mut style = MarkdownStyle::neutral(t.dark)
        .web_layout()
        .text(t.c("text"))
        .muted(t.c("text-secondary"))
        .body_font(TextStyle::new(font_size, 400.0).lh(font_size * 1.625))
        .link(t.c("link"))
        .link_underline(t.c("link-underline"))
        .file_link_icon(&super::icons::SOURCE, 13.0, 4.0)
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
        .table_font(TextStyle::new(font_size, 400.0).lh(font_size * 1.625))
        .table_tabular_figures(true)
        .table_column_align(false)
        .table_margin(16.0, 0.0)
        .code_margin(16.0, 0.0)
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
    let images = s.chat.media.images.clone();
    let reader_images = s.workbench.reader_chat.media.images.clone();
    let border = t.c("border");
    Markdown::new(source)
        .on_link_tx(|s: &mut State, href, tx| s.open_link(href, tx))
        .highlights(if s.find.open {
            oc_markdown::find(
                source,
                s.find.query.text.trim(),
                oc_markdown::Case::Insensitive,
            )
        } else {
            vec![]
        })
        .images(move |source| {
            images
                .get(source)
                .or_else(|| reader_images.get(source))
                .and_then(|image| image.as_ref().ok())
                .cloned()
        })
        .image_frame(|body, frame| {
            let source = frame.src.to_owned();
            body.size(96.0, 76.0)
                .max_w(96.0)
                .radius(10.0)
                .pixels_fit(frame.image.pixels(), rune::SurfaceFit::Fill)
                .role("button")
                .focusable(true)
                .on_press(move |s: &mut State| s.chat.preview = Some(source.clone()))
        })
        .selectable(true)
        .tasks_read_only()
        .streaming(streaming)
        // StreamText uses react-markdown's default pre/code nodes: no invented
        // language heading, syntax colouring or per-fence copy control.
        .code_frame(move |body, _| body.radius(10.0).border(1.0, border).border_layout())
        .render(&style)
}
