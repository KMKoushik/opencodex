use crate::State;
use oc_markdown::{Markdown, MarkdownStyle};
use rune::{El, TextStyle};

pub fn render(s: &State, source: &str, streaming: bool, width: f32) -> El {
    render_marked(s, source, streaming, width, Vec::new())
}
pub fn response(
    s: &State,
    source: &str,
    streaming: bool,
    width: f32,
    message: &str,
    ordinal: usize,
) -> El {
    let mut marks = Vec::new();
    for comment in &s.draft().comments {
        if comment.target["messageID"] != message
            || comment.target["ordinal"].as_u64() != Some(ordinal as u64)
        {
            continue;
        }
        let Some(quote) = comment.target["quote"].as_str().filter(|s| !s.is_empty()) else {
            continue;
        };
        if let Some(ranges) = oc_markdown::find(source, quote, oc_markdown::Case::Sensitive)
            .into_iter()
            .next()
        {
            marks.push((
                ranges,
                oc_markdown::Highlight::new()
                    .bg(s.theme.c("accent-soft"))
                    .radius(0.0)
                    .pad(0.0)
                    .vpad(0.0),
            ));
        }
    }
    render_marked(s, source, streaming, width, marks)
}
fn render_marked(
    s: &State,
    source: &str,
    streaming: bool,
    width: f32,
    mut highlights: Vec<(Vec<std::ops::Range<usize>>, oc_markdown::Highlight)>,
) -> El {
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
        // En-space advance gives CSS's 5pt inset without inflating ascender metrics.
        .inline_code_pad(5.0)
        .list_markers_outside(true)
        .code_block(t.c("surface-under"), t.c("border"))
        .code_block_font(TextStyle::new(13.0, 400.0).mono().lh(22.75))
        .code_block_padding(16.0, 14.0)
        .text_width(width)
        .list(24.0, 6.0)
        .task_checkbox(
            13.0,
            2.0,
            0.0,
            Some(3.0),
            t.c("text-tertiary"),
            t.c("surface"),
            t.c("secondary"),
            t.c("border-heavy"),
        )
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
        // CSS table-layout:auto keeps each column's longest word intact and
        // scrolls the table; rune-kit's default 96pt cap crushes long paths.
        .table_min_column(f32::MAX)
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
    for (level, scale) in [(1, 1.75), (2, 1.5), (3, 1.25), (4, 1.0)] {
        let size = font_size * scale;
        style = style.heading_font(level, TextStyle::new(size, 600.0).lh(size * 1.4));
    }
    let images = s.chat.media.images.clone();
    let reader_images = s.workbench.reader_chat.media.images.clone();
    let failures = images.clone();
    let reader_failures = reader_images.clone();
    let media_failed =
        s.chat.media.error.is_some() || s.workbench.reader_chat.media.error.is_some();
    let ink = t.c("text-secondary");
    let retry_ink = t.c("text");
    let border = t.c("border");
    if s.find.open {
        highlights.extend(
            oc_markdown::find(
                source,
                s.find.query.text.trim(),
                oc_markdown::Case::Insensitive,
            )
            .into_iter()
            .map(|ranges| (ranges, oc_markdown::Highlight::new())),
        );
    }
    Markdown::new(source)
        .on_link_tx(|s: &mut State, href, tx| s.open_link(href, tx))
        .highlights(highlights)
        .images(move |source| {
            images
                .get(source)
                .or_else(|| reader_images.get(source))
                .and_then(|image| image.as_ref().ok())
                .cloned()
        })
        .missing_image(move |source, alt| {
            let name = if alt.is_empty() { "Image" } else { alt };
            if source.is_empty() {
                return rune::text(format!("Image unavailable: {name}"))
                    .font(TextStyle::new(12.0, 400.0))
                    .color(ink);
            }
            let failed = media_failed
                || failures
                    .get(source)
                    .or_else(|| reader_failures.get(source))
                    .is_some_and(Result::is_err);
            if !failed {
                return rune::el()
                    .size(96.0, 76.0)
                    .radius(10.0)
                    .border(1.0, border)
                    .role("image")
                    .label(name);
            }
            let source = source.to_owned();
            rune::row()
                .gap(8.0)
                .center_y()
                .role("status")
                .child(
                    rune::text(format!("Could not load image: {name}"))
                        .font(TextStyle::new(13.0, 400.0))
                        .color(ink),
                )
                .child(
                    rune::row()
                        .min_h(44.0)
                        .px(8.0)
                        .center_y()
                        .child(
                            rune::rich("Retry", vec![rune::Span::new(0, 5).underline(retry_ink)])
                                .font(TextStyle::new(13.0, 400.0))
                                .color(retry_ink),
                        )
                        .role("button")
                        .focusable(true)
                        .on_press(move |s: &mut State| {
                            s.chat.disclosure_revision += 1;
                            s.workbench.reader_chat.disclosure_revision += 1;
                            if s.workbench.reader_chat.media.images.contains_key(&source) {
                                let data = s.workbench.reader_chat.data.clone();
                                s.workbench.reader_chat.media.retry(
                                    &source,
                                    data,
                                    crate::sidecar::url(),
                                    s.waker.clone(),
                                );
                            } else {
                                s.chat.media.retry(
                                    &source,
                                    s.chat.data.clone(),
                                    crate::sidecar::url(),
                                    s.waker.clone(),
                                );
                            }
                        }),
                )
        })
        .image_frame(|body, frame| {
            let source = frame.src.to_owned();
            let name = if frame.alt.is_empty() {
                "Image"
            } else {
                frame.alt
            }
            .to_owned();
            body.size(96.0, 76.0)
                .max_w(96.0)
                .radius(10.0)
                .pixels_fit(frame.image.pixels(), rune::SurfaceFit::Fill)
                .role("button")
                .focusable(true)
                .on_press_tx(move |s: &mut State, tx| {
                    if crate::workbench::file_target(&source, &s.workspace_directory()).is_some() {
                        s.open_link(&source, tx);
                        return;
                    }
                    s.chat.preview_name = name.clone();
                    s.chat.preview = Some(source.clone());
                })
        })
        .selectable(true)
        .tasks_read_only()
        .streaming(streaming)
        // StreamText uses react-markdown's default pre/code nodes: no invented
        // language heading, syntax colouring or per-fence copy control.
        .code_frame(move |body, _| body.radius(10.0).border(1.0, border).border_layout())
        .render(&style)
}
