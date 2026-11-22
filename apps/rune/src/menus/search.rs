//! Gateway-ranked title/message search, with at most one in-flight read. Stale
//! results never replace the visible query, and typing never queues N reads.
use crate::{State, sidebar::label};
use rune::{El, col, row};
use serde_json::Value;
#[derive(Default)]
pub struct Pagination {
    pub query: String,
    pub pages: usize,
    pub success: bool,
    more: bool,
    more_queued: bool,
    target: usize,
    received: usize,
    staged: Vec<Value>,
}

pub fn connected(s: &State) -> bool {
    crate::pages::data(s, "connection").is_some_and(|v| v["status"] == "connected")
}
pub fn close(s: &mut State) {
    s.menus.open = None;
    s.menus.error = None;
    s.menus.search = Default::default();
    release_if_closed(s);
}
pub fn release_if_closed(s: &mut State) {
    if !matches!(s.menus.open, Some(super::Menu::Search)) {
        s.menus.results = Vec::new();
        s.menus.cursor = None;
        s.menus.notice = None;
        s.menus.pagination = Default::default();
        s.menus.search_before = None;
    }
}

pub fn dialog(s: &State) -> El {
    let t = &s.theme;
    let header = row()
        .w_full()
        .h(28.0)
        .center_y()
        .mb(20.0)
        .child(label(t, "Search threads", 16.0, 600.0, "text").grow(1.0))
        .child(
            crate::sidebar::icon_button(t, &crate::icons::CLOSE, "Close search threads")
                .on_press(close),
        );
    let input = row()
        .w_full()
        .h(39.0)
        .px(10.0)
        .gap(8.0)
        .center_y()
        .mb(8.0)
        .radius(8.0)
        .fill(t.c("control"))
        .border(1.0, t.c("border-heavy"))
        .border_layout()
        .child(rune::icon(&crate::icons::SEARCH, 16.0).color(t.c("text-tertiary")))
        .child(
            rune::text_input(&s.menus.search, rune::TextStyle::new(14.0, 400.0).lh(21.0))
                .key("navigation-search")
                .label("Search threads")
                .single_line()
                .grow(1.0)
                .on_edit(|s: &mut State| {
                    // Rune calls this accessor both before and after an edit.
                    // Keep only the last valid editor, including its selection,
                    // composition and shared undo history; never snapshot overflow.
                    if s.menus.search.text.encode_utf16().count() <= 256 {
                        s.menus.search_before = Some(s.menus.search.clone());
                    }
                    &mut s.menus.search
                })
                .on_input_key(|s: &mut State, e, _| {
                    let handled = crate::pages::controls::limit_key(&mut s.menus.search, e, 256);
                    if handled {
                        changed(s);
                    }
                    handled
                })
                .on_input_paste(|s: &mut State, c, _| {
                    let handled =
                        crate::pages::controls::limit_input(&mut s.menus.search, c.text(), 256);
                    if handled {
                        changed(s);
                    }
                    handled
                })
                .on_input_change(|s: &mut State, _| changed(s))
                .placeholder("Search titles and messages…", t.c("text-tertiary"))
                .color(t.c("text")),
        );
    let panel = super::overlay::surface(
        t,
        col()
            .w(440.0f32.min(s.window_size.0 - 32.0))
            .padding(20.0)
            .child(header)
            .child(input)
            .child(view(s, col().w_full())),
        14.0,
        "elevated",
        "border-heavy",
    );
    rune::el()
        .key("thread-search-dialog")
        .absolute(0.0, 0.0)
        .size(s.window_size.0, s.window_size.1)
        .center()
        .modal(true, close)
        .child(
            rune::el()
                .absolute(0.0, 0.0)
                .size(s.window_size.0, s.window_size.1)
                .fill(t.c("scrim"))
                .on_press(close),
        )
        .child(super::overlay::raised(t, panel))
}

fn changed(s: &mut State) {
    if s.menus.search.text.encode_utf16().count() > 256 {
        if let Some(mut before) = s.menus.search_before.take() {
            let (a, b) = before.range();
            let suffix = before.text.len() - b;
            let full = &s.menus.search.text;
            if full.starts_with(&before.text[..a])
                && full.ends_with(&before.text[b..])
                && full.len() >= a + suffix
            {
                let inserted = &full[a..full.len() - suffix];
                if !crate::pages::controls::limit_input(&mut before, inserted, 256) {
                    before.ime(&rune::Ime::Commit(inserted.into()));
                } else {
                    // Clear the restored preedit without committing it a second time.
                    before.ime(&rune::Ime::Commit(String::new()));
                }
            }
            s.menus.search = before;
        }
    }
    if s.menus.search.text.trim() != s.menus.pagination.query {
        load(s, false);
    }
}
pub fn load(s: &mut State, more: bool) {
    start(s, more, more);
}
fn retry(s: &mut State) {
    start(s, false, true);
}
fn start(s: &mut State, more: bool, force: bool) {
    if !connected(s) && !force {
        if s.menus.search.text.trim() != s.menus.pagination.query {
            s.menus.results = Vec::new();
            s.menus.cursor = None;
            s.menus.notice = None;
            s.menus.error = None;
            s.menus.pagination = Pagination {
                query: s.menus.search.text.trim().into(),
                ..Default::default()
            };
        }
        return;
    }
    if s.menus.search_pending.is_some() {
        if more && !s.menus.pagination.more {
            s.menus.pagination.more_queued = true;
        }
        if !more && s.menus.search_pending.as_deref() != Some(s.menus.search.text.trim()) {
            s.menus.results.clear();
            s.menus.cursor = None;
            s.menus.notice = None;
            s.menus.search_revision += 1;
        }
        return;
    }
    let search = s.menus.search.text.trim().to_owned();
    if search != s.menus.pagination.query {
        s.menus.results.clear();
        s.menus.cursor = None;
        s.menus.notice = None;
        s.menus.pagination = Pagination {
            query: search.clone(),
            ..Default::default()
        };
    }
    let cursor = if more { s.menus.cursor.clone() } else { None };
    s.menus.pagination.more = more;
    if !more {
        s.menus.pagination.target = s.menus.pagination.pages.max(1);
        s.menus.pagination.received = 0;
        s.menus.pagination.staged.clear();
    }
    request(s, search, cursor);
}
fn request(s: &mut State, search: String, cursor: Option<String>) {
    let mut query = vec![("search".into(), search.clone())];
    if let Some(cursor) = cursor {
        query.push(("cursor".into(), cursor));
    }
    s.menus.error = None;
    if s.prompt_request(oc_gateway::prompt::Request::Get {
        tag: format!("menu-search:{}:{search}", s.menus.search_generation),
        path: "session-search".into(),
        query,
    }) {
        s.menus.search_pending = Some(search);
    } else {
        s.menus.error = Some(
            s.error
                .clone()
                .unwrap_or_else(|| "Gateway is not connected".into()),
        );
    }
}
pub fn receive(s: &mut State, query: &str, result: Result<Value, String>) {
    let (generation, query) = query.split_once(':').unwrap_or(("0", query));
    s.menus.search_revision += 1;
    s.menus.search_pending = None;
    if !matches!(s.menus.open, Some(super::Menu::Search)) {
        release_if_closed(s);
        return;
    }
    if query != s.menus.search.text.trim()
        || generation.parse::<u64>().ok() != Some(s.menus.search_generation)
    {
        load(s, false);
        return;
    }
    match result {
        Ok(value) => {
            let cursor = value["nextCursor"].as_str().map(str::to_owned);
            if s.menus.pagination.received == 0 && !s.menus.pagination.more {
                s.menus.notice = value["searchNotice"].as_str().map(str::to_owned);
            }
            if let Some(rows) = value["sessions"].as_array() {
                if s.menus.pagination.more {
                    s.menus.results.extend(rows.iter().cloned());
                    s.menus.pagination.pages += 1;
                } else {
                    s.menus.pagination.staged.extend(rows.iter().cloned());
                    s.menus.pagination.received += 1;
                    if cursor.is_some() && s.menus.pagination.received < s.menus.pagination.target {
                        request(s, query.into(), cursor);
                        return;
                    }
                    s.menus.results = std::mem::take(&mut s.menus.pagination.staged);
                    s.menus.pagination.pages = s.menus.pagination.received;
                }
                s.menus.cursor = cursor;
                s.menus.pagination.success = true;
            } else {
                s.menus.error = Some("The gateway returned an invalid thread search page.".into());
            }
        }
        Err(error) => s.menus.error = Some(error),
    }
    if std::mem::take(&mut s.menus.pagination.more_queued) {
        load(s, true);
    }
}
pub fn view(s: &State, mut list: El) -> El {
    if !connected(s) {
        list = list.child(note(s, "Connect to OpenCode to search threads.", "error").role("alert"));
    }
    if connected(s) && s.menus.search_pending.is_some() && s.menus.results.is_empty() {
        list = list.child(note(s, "Searching…", "text-tertiary").role("status"));
    }
    if let Some(notice) = &s.menus.notice {
        list = list.child(note(s, notice, "text-tertiary").role("status"));
    }
    if let Some(error) = &s.menus.error {
        list = list.child(
            col()
                .w_full()
                .px(8.0)
                .py(6.0)
                .role("alert")
                .child(label(&s.theme, error, 12.0, 400.0, "error").w_full().wrap())
                .child(
                    crate::pages::button(s, "Retry")
                        .self_start()
                        .mt(8.0)
                        .on_press(retry),
                ),
        );
    } else if s.menus.pagination.success
        && s.menus.search_pending.is_none()
        && s.menus.results.is_empty()
    {
        list = list.child(note(s, "No threads match your search.", "text-tertiary"));
    }
    if !s.menus.results.is_empty() {
        list = list.child(
            col()
                .w_full()
                .h(360.0)
                .scroll(rune::ScrollSpec {
                    stick_bottom: false,
                })
                .child(
                    col()
                        .key("search-results")
                        .growth(rune::GrowthSpec::default())
                        .w_full()
                        .virtual_rows(
                            s.menus.results.len(),
                            80.0,
                            |s: &State, n| {
                                format!(
                                    "search-thread-{}",
                                    s.menus.results[n]["id"].as_str().unwrap_or("")
                                )
                                .into()
                            },
                            render_result,
                        )
                        .virtual_rows_version(s.menus.search_revision),
                ),
        );
    }
    if s.menus.cursor.is_some() {
        list = list.child(
            crate::pages::controls::ghost(s, "Show more")
                .self_start()
                .disabled(
                    s.menus.search_pending.is_some() && s.menus.pagination.more
                        || s.menus.pagination.more_queued,
                )
                .on_press(|s: &mut State| load(s, true)),
        );
    }
    list
}
fn note(s: &State, value: &str, tone: &str) -> El {
    label(&s.theme, value, 12.0, 400.0, tone)
        .w_full()
        .px(8.0)
        .py(6.0)
        .wrap()
}
fn render_result(s: &State, n: usize) -> El {
    let thread = &s.menus.results[n];
    let Some(id) = thread["id"].as_str() else {
        return rune::el();
    };
    let id = id.to_owned();
    let mut result = col()
        .w_full()
        .h(80.0)
        .justify_center()
        .px(10.0)
        .py(8.0)
        .gap(4.0)
        .radius(8.0)
        .role("button")
        .key(format!("search-thread-{id}"))
        .label(thread["title"].as_str().unwrap_or(""))
        .focusable(true)
        .focus_fill(s.theme.c("hover"))
        .no_focus_ring()
        .hover(s.theme.c("hover"))
        .child(
            label(
                &s.theme,
                thread["title"].as_str().unwrap_or(""),
                13.0,
                400.0,
                "text",
            )
            .truncate(),
        );
    if let Some(excerpt) = thread["match"]["excerpt"].as_str() {
        result = result.child(label(&s.theme, excerpt, 12.0, 400.0, "text-secondary").truncate());
    }
    result = result.child(
        row()
            .w_full()
            .gap(6.0)
            .center_y()
            .child(rune::icon(&crate::icons::FOLDER, 12.0).color(s.theme.c("text-tertiary")))
            .child(
                label(
                    &s.theme,
                    thread["directory"].as_str().unwrap_or(""),
                    11.0,
                    400.0,
                    "text-tertiary",
                )
                .truncate(),
            ),
    );
    result.on_press(move |s: &mut State| {
        close(s);
        s.open_session(Some(id.clone()));
    })
}
