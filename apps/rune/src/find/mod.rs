//! Find searches only loaded transcript rows; history pagination remains gateway-owned.
use crate::{State, pages::button, sidebar::label};
use oc_gateway::timeline::Kind;
use rune::{El, TextEdit, TextStyle, Tx, row, text_input};
#[derive(Default)]
pub struct Find {
    pub open: bool,
    pub query: TextEdit,
    pub rows: Vec<String>,
    pub current: usize,
    query_cache: String,
    counts: std::collections::BTreeMap<String, (u64, usize)>,
}
pub fn open(s: &mut State, tx: &mut Tx) {
    s.find.open = true;
    s.chat.disclosure_revision += 1;
    tx.focus("chat-find", false);
}
pub fn refresh(s: &mut State) {
    let query = s.find.query.text.trim();
    let edited = s.find.query_cache != query;
    if edited {
        s.find.counts.clear();
        s.find.query_cache = query.into();
    }
    s.find.rows.clear();
    if !query.is_empty() {
        for row in &s.chat.rows {
            let count = if let Some((version, count)) = s
                .find
                .counts
                .get(&row.id)
                .filter(|(version, _)| *version == row.version)
            {
                let _ = version;
                *count
            } else {
                let count = match &row.kind {
                    Kind::Text { text, .. } | Kind::Reasoning { text, .. } => {
                        rune_kit::markdown::find(text, query, rune_kit::markdown::Case::Insensitive)
                            .len()
                    }
                    Kind::Message(message) => rune_kit::search::Fold::default()
                        .find(
                            message
                                .fields
                                .get("text")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or(""),
                            query,
                        )
                        .len(),
                    _ => 0,
                };
                s.find.counts.insert(row.id.clone(), (row.version, count));
                count
            };
            for _ in 0..count.min(1000) {
                s.find.rows.push(row.id.clone());
            }
            if s.find.rows.len() >= 10000 {
                break;
            }
        }
    }
    while s.find.counts.len() > 10000 {
        s.find.counts.pop_first();
    }
    s.find.current = s.find.current.min(s.find.rows.len().saturating_sub(1));
    if edited {
        s.chat.disclosure_revision += 1;
    }
}
pub fn highlights(s: &State, text: &str) -> Vec<rune::Span> {
    if !s.find.open {
        return vec![];
    }
    rune_kit::search::Fold::default()
        .find(text, s.find.query.text.trim())
        .into_iter()
        .map(|range| {
            let mut span = rune::Span::new(range.start, range.end);
            span.bg = Some(s.theme.c("accent").alpha(0.25));
            span
        })
        .collect()
}
fn next(s: &mut State, tx: &mut Tx, back: bool) {
    if s.find.rows.is_empty() {
        return;
    }
    let count = s.find.rows.len();
    s.find.current = (s.find.current + if back { count - 1 } else { 1 }) % count;
    tx.scroll_into_view(s.find.rows[s.find.current].clone());
}
pub fn view(s: &State) -> El {
    row()
        .key("find-bar")
        .w_full()
        .h(44.0)
        .px(12.0)
        .gap(8.0)
        .center_y()
        .fill(s.theme.c("elevated"))
        .border_sides([0.0, 0.0, 1.0, 0.0], s.theme.c("border"))
        .child(
            text_input(&s.find.query, TextStyle::new(13.0, 400.0))
                .key("chat-find")
                .on_edit(|s: &mut State| &mut s.find.query)
                .single_line()
                .grow(1.0)
                .color(s.theme.c("text"))
                .placeholder("Find in chat…", s.theme.c("text-tertiary"))
                .on_input_change(|s: &mut State, tx| {
                    refresh(s);
                    if let Some(id) = s.find.rows.first() {
                        tx.scroll_into_view(id.clone());
                    }
                })
                .on_input_key(|s: &mut State, event, tx| {
                    if event.key == rune::Key::Enter {
                        next(s, tx, event.mods.shift);
                        true
                    } else {
                        false
                    }
                }),
        )
        .child(label(
            &s.theme,
            if s.find.rows.is_empty() {
                "0 of 0".into()
            } else {
                format!("{} of {}", s.find.current + 1, s.find.rows.len())
            },
            12.0,
            400.0,
            "text-secondary",
        ))
        .child(button(s, "Previous").on_press_tx(|s: &mut State, tx| next(s, tx, true)))
        .child(button(s, "Next").on_press_tx(|s: &mut State, tx| next(s, tx, false)))
        .child(button(s, "Close").on_press(|s: &mut State| {
            s.find.open = false;
            s.chat.disclosure_revision += 1;
        }))
}
