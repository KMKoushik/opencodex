//! Find searches only loaded transcript rows; history pagination remains gateway-owned.
use crate::{State, sidebar::label};
use oc_gateway::timeline::Kind;
use rune::{El, TextEdit, TextStyle, Tx, row, text_input};
#[derive(Default)]
pub struct Find {
    pub open: bool,
    pub query: TextEdit,
    pub rows: Vec<String>,
    pub current: usize,
    starts: Vec<usize>,
    total: usize,
    projector: oc_gateway::timeline::Projector,
    owners: std::collections::BTreeMap<String, String>,
    query_cache: String,
    counts: std::collections::BTreeMap<String, (u64, usize)>,
    return_focus: Option<String>,
    session: Option<String>,
}
pub fn open(s: &mut State, tx: &mut Tx) {
    if crate::apps::code::find::scoped(s) {
        crate::apps::code::find::open(s, tx);
        return;
    }
    if s.pages.route != crate::pages::Route::Chat || s.selected.is_none() {
        return;
    }
    if !s.find.open {
        s.find.return_focus = tx.focused().map(str::to_owned);
    }
    if let Some(selection) = tx
        .text_selection()
        .map(|v| v.text().trim())
        .filter(|v| !v.is_empty() && v.encode_utf16().count() <= 200 && !v.contains(['\r', '\n']))
    {
        s.find.query = TextEdit::new(selection);
    }
    s.find.open = true;
    let len = s.find.query.text.len();
    s.find.query.set_selection(0, len);
    s.find.session = s.selected.clone();
    refresh(s);
    s.chat.disclosure_revision += 1;
    tx.focus_when_shown("chat-find", true);
}
pub fn close(s: &mut State, tx: &mut Tx) {
    s.find.open = false;
    s.chat.disclosure_revision += 1;
    s.find.projector = Default::default();
    s.find.counts.clear();
    if let Some(key) = s.find.return_focus.take() {
        tx.return_focus(key, false);
    } else {
        tx.focus(
            format!("conversation-{}", s.selected.as_deref().unwrap_or("")),
            false,
        );
    }
}
pub fn refresh(s: &mut State) {
    if s.find.session.is_some() && s.find.session != s.selected {
        s.find.open = false;
        s.find.projector = Default::default();
        s.find.counts.clear();
        s.chat.disclosure_revision += 1;
        return;
    }
    let previous = target(s).map(|(id, occurrence)| (id.to_owned(), occurrence));
    let query = s.find.query.text.trim();
    let edited = s.find.query_cache != query;
    if edited {
        s.find.counts.clear();
        s.find.query_cache = query.into();
    }
    s.find.rows.clear();
    s.find.starts.clear();
    s.find.total = 0;
    s.find.owners.clear();
    if !query.is_empty() {
        let mut overrides = s.chat.overrides.clone();
        for row in &s.chat.rows {
            if matches!(row.kind, Kind::Turn { .. }) {
                overrides.insert(row.id.clone(), true);
            }
        }
        let projected = s.find.projector.project(&s.chat.data, &overrides);
        let mut owner: Option<String> = None;
        for row in &projected {
            match &row.kind {
                Kind::Message(message) if message.r#type == "user" => owner = None,
                Kind::Turn { .. } => owner = Some(row.id.clone()),
                _ => {}
            }
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
                    Kind::Text { text, .. } => {
                        rune_kit::markdown::find(text, query, rune_kit::markdown::Case::Insensitive)
                            .len()
                    }
                    Kind::Message(message) if message.r#type == "user" => {
                        rune_kit::search::Fold::default()
                            .find(
                                message
                                    .fields
                                    .get("text")
                                    .and_then(serde_json::Value::as_str)
                                    .unwrap_or(""),
                                query,
                            )
                            .len()
                    }
                    _ => 0,
                };
                s.find.counts.insert(row.id.clone(), (row.version, count));
                count
            };
            if count > 0 {
                s.find.starts.push(s.find.total);
                s.find.rows.push(row.id.clone());
                s.find.total += count;
                if let Some(owner) = &owner {
                    s.find.owners.insert(row.id.clone(), owner.clone());
                }
            }
        }
    }
    while s.find.counts.len() > 10000 {
        s.find.counts.pop_first();
    }
    s.find.current = s.find.current.min(s.find.total.saturating_sub(1));
    if edited {
        s.find.current = 0;
        s.chat.disclosure_revision += 1;
    } else if let Some((id, occurrence)) = previous {
        if let Some(unit) = s.find.rows.iter().position(|row| row == &id) {
            let start = s.find.starts[unit];
            let end = s.find.starts.get(unit + 1).copied().unwrap_or(s.find.total);
            s.find.current = start + occurrence.min(end - start - 1);
        }
    }
}
pub fn highlights(s: &State, text: &str, row: &str) -> Vec<rune::Span> {
    if !s.find.open {
        return vec![];
    }
    rune_kit::search::Fold::default()
        .find(text, s.find.query.text.trim())
        .into_iter()
        .enumerate()
        .map(|(occurrence, range)| {
            let mut span = rune::Span::new(range.start, range.end);
            span.bg = Some(
                s.theme
                    .c("warning")
                    .alpha(if active(s, row) == Some(occurrence) {
                        0.65
                    } else {
                        0.30
                    }),
            );
            span
        })
        .collect()
}
pub fn next(s: &mut State, tx: &mut Tx, back: bool) {
    if s.find.rows.is_empty() {
        return;
    }
    let count = s.find.total;
    s.find.current = (s.find.current + if back { count - 1 } else { 1 }) % count;
    s.chat.disclosure_revision += 1;
    reveal(s, tx);
}
pub fn active(s: &State, row: &str) -> Option<usize> {
    s.find
        .open
        .then(|| target(s))
        .flatten()
        .filter(|(id, _)| *id == row)
        .map(|(_, occurrence)| occurrence)
}
fn target(s: &State) -> Option<(&str, usize)> {
    let unit = s
        .find
        .starts
        .partition_point(|start| *start <= s.find.current)
        .checked_sub(1)?;
    Some((
        s.find.rows.get(unit)?.as_str(),
        s.find.current - s.find.starts[unit],
    ))
}
fn reveal(s: &mut State, tx: &mut Tx) {
    let Some((id, occurrence)) = target(s) else {
        return;
    };
    let id = id.to_owned();
    if !s.chat.rows.iter().any(|row| row.id == id) {
        if let Some(owner) = s.find.owners.get(&id) {
            s.chat.overrides.insert(owner.clone(), true);
            s.chat.disclosure_revision += 1;
            s.chat.rebuild();
        }
    }
    tx.scroll_into_view(id.clone());
    // Markdown already publishes one keyed geometry anchor per occurrence.
    // Scope it to its row, since every Markdown document uses the same keys.
    tx.scroll_center_in(id, rune_kit::Markdown::highlight_key(occurrence));
}
pub fn view(s: &State) -> El {
    let bar = row()
        .key("find-bar")
        .role("search")
        .label("Find in chat")
        .w(340.0)
        .h(38.0)
        .pl(12.0)
        .pr(4.0)
        .gap(2.0)
        .center_y()
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .radius(10.0)
        .child(
            text_input(&s.find.query, TextStyle::new(13.0, 400.0))
                .key("chat-find")
                .on_edit(|s: &mut State| &mut s.find.query)
                .single_line()
                .grow(1.0)
                .color(s.theme.c("text"))
                .placeholder("Find in chat", s.theme.c("text-tertiary"))
                .on_input_change(|s: &mut State, tx| {
                    refresh(s);
                    reveal(s, tx);
                })
                .on_input_key(|s: &mut State, event, tx| {
                    if event.key == rune::Key::Escape {
                        close(s, tx);
                        true
                    } else if event.key == rune::Key::Enter
                        || ((event.mods.cmd || event.mods.ctrl)
                            && matches!(&event.key, rune::Key::Text(key) if key.eq_ignore_ascii_case("g")))
                    {
                        next(s, tx, event.mods.shift);
                        true
                    } else {
                        false
                    }
                }),
        )
        .child(
            label(
                &s.theme,
                if s.find.query.text.is_empty() {
                    "".into()
                } else if s.find.rows.is_empty() {
                    "No results".into()
                } else {
                    format!("{}/{}", s.find.current + 1, s.find.total)
                },
                12.0,
                400.0,
                if !s.find.query.text.is_empty() && s.find.rows.is_empty() {
                    "error"
                } else {
                    "text-tertiary"
                },
            )
            .px(4.0),
        )
        .child(
            find_button(s, &crate::icons::FIND_UP, "Previous match")
                .disabled(s.find.rows.is_empty())
                .opacity(if s.find.rows.is_empty() { 0.45 } else { 1.0 })
                .on_press_tx(|s: &mut State, tx| next(s, tx, true)),
        )
        .child(
            find_button(s, &crate::icons::DOWN, "Next match")
                .disabled(s.find.rows.is_empty())
                .opacity(if s.find.rows.is_empty() { 0.45 } else { 1.0 })
                .on_press_tx(|s: &mut State, tx| next(s, tx, false)),
        )
        .child(
            find_button(s, &crate::icons::CLOSE, "Close find").on_press_tx(close),
        );
    row()
        .absolute(0.0, 10.0)
        .w_full()
        .pr(12.0)
        .justify_end()
        .child(crate::menus::overlay::raised(&s.theme, bar.border_layout()))
}
fn find_button(s: &State, icon: &'static rune::Icon, title: &str) -> El {
    crate::sidebar::icon_button_size(&s.theme, icon, title, 14.0).size(26.0, 26.0)
}
