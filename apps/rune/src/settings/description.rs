//! CSS's 12px sans strut and inline Menlo boxes have different baselines.
//! Only a line containing <code> gains the measured half-point leading.
use crate::{State, sidebar::label};
use rune::{El, Span, TextStyle, col, el, rich, text::TextSystem};
use std::{
    cell::RefCell,
    collections::HashMap,
    hash::{Hash, Hasher},
    ops::Range,
};

type Lines = Vec<(Range<usize>, bool)>;
thread_local! {
    static SHAPER: RefCell<TextSystem> = RefCell::new({
        let families = ("System Font, .SF NS, Segoe UI, sans-serif", "Menlo, Consolas, Liberation Mono, monospace");
        let _guard = rune::text::with_families(families.0, families.1);
        TextSystem::new(&[], families)
    });
    static LINES: RefCell<HashMap<u64, Lines>> = RefCell::default();
}

pub(super) fn view(s: &State, title: &str, text: &str, spans: Vec<Span>) -> El {
    if !spans.iter().any(|span| span.mono) {
        return label(&s.theme, text, 12.0, 400.0, "text-secondary")
            .spans(spans)
            .w_full()
            .wrap();
    }
    let key = format!("settings-description:{title}");
    let width = s.pages.anchors.get(&key).map(|rect| rect[0]);
    let font = TextStyle::new(12.0, 400.0).lh(18.0);
    let body = if let Some(width) = width {
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        text.hash(&mut hash);
        width.to_bits().hash(&mut hash);
        rune::text::font_epoch().hash(&mut hash);
        for span in &spans {
            (span.start, span.end, span.mono).hash(&mut hash);
        }
        let key = hash.finish();
        let lines = LINES
            .with_borrow(|cache| cache.get(&key).cloned())
            .unwrap_or_else(|| {
                let lines: Lines = SHAPER.with_borrow_mut(|shaper| {
                    let layout = shaper.layout_rich(text, &spans, font, 1.0, Some(width));
                    layout
                        .lines()
                        .map(|line| {
                            let range = line.text_range();
                            let code = spans.iter().any(|span| {
                                span.mono
                                    && (span.start as usize) < range.end
                                    && range.start < span.end as usize
                            });
                            (range, code)
                        })
                        .collect()
                });
                LINES.with_borrow_mut(|cache| {
                    if cache.len() >= 64 {
                        cache.clear();
                    }
                    cache.insert(key, lines.clone());
                });
                lines
            });
        let mut body = col().w_full();
        for (range, code) in lines {
            let local = spans
                .iter()
                .filter_map(|span| {
                    let start = (span.start as usize).max(range.start);
                    let end = (span.end as usize).min(range.end);
                    (start < end).then(|| Span {
                        start: (start - range.start) as u32,
                        end: (end - range.start) as u32,
                        ..span.clone()
                    })
                })
                .collect();
            let leading = if code { 0.5 } else { 0.0 };
            body = body.child(
                el().w_full().h(18.0 + leading).child(
                    rich(&text[range], local)
                        .font(font)
                        .color(s.theme.c("text-secondary"))
                        .w_full()
                        .exact_lines()
                        .absolute(0.0, leading),
                ),
            );
        }
        body
    } else {
        label(&s.theme, text, 12.0, 400.0, "text-secondary")
            .spans(spans)
            .w_full()
            .wrap()
    };
    body.key(&key).on_layout_tx(move |s: &mut State, rect, tx| {
        let width = rect[2];
        if s.pages.anchors.get(&key).is_some_and(|old| old[0] == width) {
            tx.live_only();
        } else {
            s.pages.anchors.insert(key.clone(), [width, 0.0, 0.0, 0.0]);
        }
    })
}
