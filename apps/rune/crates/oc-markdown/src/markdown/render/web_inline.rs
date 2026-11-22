//! CSS inline boxes on top of Rune's shaper. Keep the real selectable/link text;
//! paint baseline-positioned decorations as inert native children. Only lines
//! containing monospace code gain Chromium's extra ascent, not the whole prose.
use super::super::*;
use rune::text::{BareIcon, PillChip, TextSystem};

thread_local! {
    static BASELINES: RefCell<std::collections::HashMap<u64, (f32, f32)>> = RefCell::default();
    static SHAPER: RefCell<TextSystem> = RefCell::new({
        let families=("System Font, .SF NS, Segoe UI, sans-serif", "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace");
        // TextSystem::new publishes measurement fonts. Keep this auxiliary
        // shaper scoped, so it cannot change another window/test's font epoch.
        let _guard=rune::text::with_families(families.0,families.1);
        TextSystem::new(&[],families)
    });
}
const ANCHOR: &str = "\u{2060}";

pub(super) fn inline_baseline(font: TextStyle) -> f32 {
    let baseline = baselines(font).0;
    // Blink's inline replaced boxes align on the half-point grid on macOS.
    (baseline * 2.0).round() * 0.5
}

pub(in crate::markdown) fn code_line_height(font: TextStyle, strut: TextStyle) -> f32 {
    font.line_px() + (baselines(strut).1 - baselines(font).1).abs()
}

fn baselines(font: TextStyle) -> (f32, f32) {
    let key = super::hash_of(font);
    if let Some(value) = BASELINES.with_borrow(|cache| cache.get(&key).copied()) { return value; }
    let value = SHAPER.with_borrow_mut(|s| {
        let layout = s.layout_blocks("x", &[], &[], &[], font, 1.0, None, parley::Alignment::Start);
        let line = layout.lines().next().unwrap();
        for item in line.items() {
            if let parley::PositionedLayoutItem::GlyphRun(run) = item {
                let m = run.run().font_metrics();
                return ((font.line_px() + m.ascent - m.descent) * 0.5,
                    (font.line_px() + m.ascent.round() - m.descent.round()) * 0.5);
            }
        }
        (font.line_px() * 0.5, font.line_px() * 0.5)
    });
    BASELINES.with_borrow_mut(|cache| {
        if cache.len() >= 64 { cache.clear(); }
        cache.insert(key, value);
    });
    value
}

fn portion(inl: &Inline, a: usize, b: usize) -> Inline {
    Inline {
        text: inl.text[a..b].to_owned(),
        spans: inl
            .spans
            .iter()
            .filter_map(|&(x, y, st)| {
                let (x, y) = (x.max(a), y.min(b));
                (x < y).then(|| (x - a, y - a, st))
            })
            .collect(),
        links: inl
            .links
            .iter()
            .filter_map(|(x, y, url)| {
                let (x, y) = ((*x).max(a), (*y).min(b));
                (x < y).then(|| (x - a, y - a, url.clone()))
            })
            .collect(),
    }
}

impl Renderer {
    pub(in crate::markdown) fn web_para(
        &self,
        inl: &Inline,
        map: Option<&SpanMap>,
        font: TextStyle,
        color: Color,
    ) -> El {
        let [extra, vpad, radius, icon_baseline] = self.s.web_inline.unwrap();
        let mut inl = inl.clone();
        let mut mapping = map.cloned();
        // A zero-width anchor makes icon room precede even a code label's
        // padding (Rune's inline_icon intentionally rejects whitespace starts).
        let mut anchors: Vec<usize> = inl
            .links
            .iter()
            .filter(|(_, _, u)| link_icon::file_link(u))
            .map(|l| l.0)
            .collect();
        anchors.sort_unstable();
        anchors.dedup();
        for at in anchors.into_iter().rev() {
            inl.text.insert_str(at, ANCHOR);
            for (a, b, style) in &mut inl.spans {
                if *a > at || (*a == at && *style != Style::Link) {
                    *a += ANCHOR.len();
                }
                if *b > at {
                    *b += ANCHOR.len();
                }
            }
            for (a, b, _) in &mut inl.links {
                if *a > at {
                    *a += ANCHOR.len();
                }
                if *b > at {
                    *b += ANCHOR.len();
                }
            }
            if let Some(map) = &mut mapping {
                for (_, out) in &mut map.0 {
                    if out.start >= at {
                        out.start += ANCHOR.len();
                    }
                    if out.end > at {
                        out.end += ANCHOR.len();
                    }
                }
            }
            inl.spans.push((at, at + ANCHOR.len(), Style::CodePad));
        }
        let spans = self.spans(&inl, font);
        let mut pills = Vec::new();
        if let Some((glyph, [size, gap])) = self.s.file_link_icon {
            for &(a, b, ref url) in &inl.links {
                if !link_icon::file_link(url) || a == b {
                    continue;
                }
                let word = inl.text[a..]
                    .find(char::is_whitespace)
                    .unwrap_or(inl.text.len() - a);
                if word == 0 {
                    continue;
                }
                pills.push(PillChip {
                    start: a as u32,
                    end: (a + word) as u32,
                    icon: Some(glyph),
                    bg: None,
                    fg: Some(Color::TRANSPARENT),
                    bare: Some(Box::new(BareIcon {
                        size,
                        gap,
                        radius: 0.0,
                        image: None,
                    })),
                });
            }
        }
        let width = self
            .s
            .text_width
            .map(|w| (w - self.flow.get().inset).max(1.0));
        let layout = SHAPER.with_borrow_mut(|s| {
            s.layout_blocks(
                &inl.text,
                &spans,
                &[],
                &pills,
                font,
                1.0,
                width,
                parley::Alignment::Start,
            )
        });
        let mut result = col().w_full();
        for (number, line) in layout.lines().enumerate() {
            let range = line.text_range();
            if range.start >= range.end {
                continue;
            }
            let local = portion(&inl, range.start, range.end);
            let code = local.spans.iter().any(|s| s.2 == Style::Code);
            let extra = if code { extra } else { 0.0 };
            let mut row = el().w_full().h(font.line_height + extra);
            let metrics = line.metrics();
            let baseline = metrics.baseline - metrics.block_min_coord;
            for &(a, b, st) in &inl.spans {
                let (start, end) = (a.max(range.start), b.min(range.end));
                if start >= end {
                    continue;
                }
                if st != Style::Code {
                    continue;
                }
                let mut ascent = 0.0f32;
                let mut descent = 0.0f32;
                for item in line.items() {
                    if let parley::PositionedLayoutItem::GlyphRun(gr) = item {
                        let r = gr.run().text_range();
                        if r.start < end && start < r.end {
                            let fm = gr.run().font_metrics();
                            ascent = ascent.max(fm.ascent);
                            descent = descent.max(fm.descent.abs());
                        }
                    }
                }
                for (r, ln) in rune::text::range_boxes(&layout, start, end, false) {
                    if ln != number {
                        continue;
                    }
                    row = row.child(
                        el().absolute(
                            r.x0 as f32 - self.s.inline_code_pad,
                            baseline - ascent - vpad,
                        )
                        .size(
                            (r.x1 - r.x0) as f32 + self.s.inline_code_pad * 2.0,
                            ascent + descent + vpad * 2.0,
                        )
                        .radius(radius)
                        .fill(self.s.code_bg)
                        .inert(),
                    );
                }
            }
            let mut local_spans = self.spans(&local, font);
            for &(a, b, st) in &local.spans {
                if matches!(st, Style::Sub | Style::Sup | Style::Small) {
                    local_spans.push(Span::new(a, b).color(Color::TRANSPARENT));
                }
            }
            let mut text = rich(local.text.clone(), local_spans)
                .font(font)
                .color(color)
                .w_full()
                .exact_lines();
            for p in &pills {
                if (p.start as usize) >= range.start && (p.start as usize) < range.end {
                    let bare = p.bare.as_ref().unwrap();
                    text = text.inline_icon(
                        p.start as usize - range.start,
                        rune::InlineIcon::glyph(p.icon.unwrap())
                            .color(Color::TRANSPARENT)
                            .size(bare.size)
                            .gap(bare.gap),
                    );
                }
            }
            for &(a, b, st) in &local.spans {
                if st == Style::Strike {
                    text = text.strike(a, b, None);
                }
            }
            let local_map = mapping.as_ref().map(|m| {
                SpanMap(
                    m.0.iter()
                        .filter_map(|(src, out)| {
                            let (a, b) = (out.start.max(range.start), out.end.min(range.end));
                            if a >= b {
                                return None;
                            }
                            let src = if src.len() == out.len() {
                                src.start + a - out.start..src.start + b - out.start
                            } else {
                                src.clone()
                            };
                            Some((src, a - range.start..b - range.start))
                        })
                        .collect(),
                )
            });
            text = text.text_highlights(self.text_highlights_for(&local.text, local_map.as_ref()));
            text = self.select(self.wire_link(text, &local));
            text = if number == 0 {
                match self.flow.get().lead {
                    Some((cols, lead, before)) => text
                        .copy_prefix(format!("{}{}", " ".repeat(cols), lead.marker()))
                        .copy_breaks(before, 0),
                    None => text.copy_breaks(2, 0),
                }
            } else {
                text.copy_breaks(0, 0)
            };
            for &(a, b, st) in &local.spans {
                if st == Style::CodePad {
                    text = text.uncopied(a..b);
                }
            }
            row = row.child(self.with_reveal(text));
            for &(a, b, st) in &inl.spans {
                if !matches!(st, Style::Sub | Style::Sup | Style::Small) {
                    continue;
                }
                let (a, b) = (a.max(range.start), b.min(range.end));
                if a >= b {
                    continue;
                }
                let scale = if st == Style::Small { 0.5 } else { 0.75 };
                let small = TextStyle {
                    size: font.size * scale,
                    ..font
                };
                let shift = match st {
                    Style::Sub => small.size * 0.25,
                    Style::Sup => -small.size * 0.5,
                    _ => -font.size * 0.5,
                };
                let label = unpadded(&inl.text[a..b]);
                let child_base = SHAPER.with_borrow_mut(|s| {
                    s.layout_rich(&label, &[], small, 1.0, None)
                        .lines()
                        .next()
                        .map_or(0.0, |l| l.metrics().baseline)
                });
                for (r, ln) in rune::text::range_boxes(&layout, a, b, false) {
                    if ln == number {
                        row = row.child(
                            rune::text(label.clone())
                                .font(small)
                                .color(color)
                                .absolute(r.x0 as f32, baseline - child_base + shift)
                                .inert(),
                        );
                    }
                }
            }
            if let Some((glyph, [size, _])) = self.s.file_link_icon {
                for pill in &pills {
                    if pill.start as usize >= range.start && (pill.start as usize) < range.end {
                        if let Some((r, _)) = rune::text::range_boxes(
                            &layout,
                            pill.start as usize,
                            pill.end as usize,
                            true,
                        )
                        .into_iter()
                        .find(|(_, ln)| *ln == number)
                        {
                            row = row.child(
                                icon(glyph, size)
                                    .color(self.s.accent)
                                    .absolute(r.x0 as f32, baseline + icon_baseline - size)
                                    .inert(),
                            );
                        }
                    }
                }
            }
            result = result.child(row);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn web_nested_blocks_and_replaced_boxes_keep_css_heights() {
        fn view(_: &(), _: &mut rune::Cx<()>) -> El {
            Markdown::new("##### Five\n\n###### Six\n\n> first\n>\n> second\n\n- outer\n  - inner\n\n```text\none\ntwo\n```\n\n- [ ] first\n- [x] second\n\n---\n\n| Head |\n| --- |\n| Body |")
                .scroll_wide(true)
                .code_frame(|body, _| body.border(1.0, Color::TRANSPARENT).border_layout())
                .render(&MarkdownStyle::neutral(true)
                    .web_layout()
                    .body_font(TextStyle::new(14.0, 400.0).lh(22.75))
                    .code_block_font(TextStyle::new(13.0, 400.0).mono().lh(22.75))
                    .code_block_strut(TextStyle::new(14.0, 400.0).mono().lh(22.75))
                    .code_block_padding(16.0, 14.0)
                    .list(24.0, 6.0)
                    .task_inline_height(28.0)
                    .table_outline(None)
                    .table_cell_padding(12.0, 10.0)
                    .text_width(500.0))
        }
        let mut runtime = rune::Runtime::new((), view, (500.0, 1000.0), rune::Env::new(true, 2.0));
        runtime.frame(0.0);
        let elements = runtime.elements();
        // Measured against Electron/Chromium, including its 14px pre strut,
        // 13px code child, and workbench's 28px checkbox input override.
        for (key, height) in [("b0", 22.75), ("b1", 22.75), ("b2", 45.5), ("b3", 45.5), ("b4", 76.5), ("b5", 74.5), ("b6", 1.0), ("b7", 87.5), ("th", 43.25), ("r0", 43.75)] {
            let block = elements.iter().find(|e| e.key.as_deref() == Some(key)).unwrap();
            assert!((block.rect[3] - height).abs() < 0.01, "{key}: {:?}, expected {height}", block.rect);
        }
    }
    #[test]
    fn css_code_line_box_does_not_inflate_the_following_plain_line() {
        fn view(_: &(), _: &mut rune::Cx<()>) -> El {
            Markdown::new("`code` and [path](src/lib.rs)  \nplain tail")
                .on_link(|_: &mut (), _| {})
                .render(
                    &MarkdownStyle::neutral(true)
                        .web_layout()
                        .body_font(TextStyle::new(14.0, 400.0).lh(22.75))
                        .inline_code_font(13.0 / 14.0, 400.0)
                        .inline_code_pad(5.0)
                        .file_link_icon(&link_icon::GLOBE, 13.0, 4.0)
                        .web_inline_metrics(1.0, 1.0, 5.0, 2.0)
                        .text_width(500.0),
                )
        }
        let mut runtime = rune::Runtime::new((), view, (500.0, 200.0), rune::Env::new(true, 2.0));
        runtime.frame(0.0);
        let elements = runtime.elements();
        let paragraph = elements
            .iter()
            .find(|e| e.key.as_deref() == Some("b0"))
            .unwrap();
        assert_eq!(paragraph.rect[3], 46.5);
        let tail = elements
            .iter()
            .find(|e| e.text.as_deref() == Some("plain tail"))
            .unwrap();
        assert_eq!(tail.rect[3], 22.75);
    }
}
