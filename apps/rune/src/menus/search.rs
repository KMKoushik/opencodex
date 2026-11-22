//! Gateway-ranked title/message search, with at most one in-flight read. Stale
//! results never replace the visible query, and typing never queues N reads.
use crate::{State, sidebar::label};
use rune::{El, col, row};
use serde_json::Value;

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
                .on_press(|s: &mut State| s.menus.open = None),
        );
    let input = row()
        .w_full()
        .h(38.0)
        .px(10.0)
        .gap(8.0)
        .center_y()
        .mb(8.0)
        .radius(8.0)
        .fill(t.c("control"))
        .border(1.0, t.c("border-heavy"))
        .child(rune::icon(&crate::icons::SEARCH, 16.0).color(t.c("text-tertiary")))
        .child(
            rune::text_input(&s.menus.search, rune::TextStyle::new(13.0, 400.0))
                .key("navigation-search")
                .label("Search threads")
                .single_line()
                .grow(1.0)
                .on_edit(|s: &mut State| &mut s.menus.search)
                .on_input_change(|s: &mut State, _| load(s, false))
                .placeholder("Search titles and messages…", t.c("text-tertiary"))
                .color(t.c("text")),
        );
    let panel = col()
        .w(440.0)
        .padding(20.0)
        .radius(14.0)
        .fill(t.c("elevated"))
        .border(1.0, t.c("border-heavy"))
        .child(header)
        .child(input)
        .child(view(s, col().w_full()));
    rune::el()
        .key("thread-search-dialog")
        .absolute(0.0, 0.0)
        .size(s.window_size.0, s.window_size.1)
        .center()
        .modal(true, |s: &mut State| s.menus.open = None)
        .child(
            rune::el()
                .absolute(0.0, 0.0)
                .size(s.window_size.0, s.window_size.1)
                .fill(t.c("scrim"))
                .on_press(|s: &mut State| s.menus.open = None),
        )
        .child(t.shadow(panel, "shadow"))
}

pub fn load(s: &mut State, more: bool) {
    if s.menus.search_pending.is_some() {
        return;
    }
    let search = s.menus.search.text.trim().to_owned();
    let cursor = if more { s.menus.cursor.clone() } else { None };
    let mut query = vec![("search".into(), search.clone())];
    if let Some(cursor) = cursor {
        query.push(("cursor".into(), cursor));
    }
    if !more {
        s.menus.results.clear();
        s.menus.cursor = None;
        s.menus.notice = None;
    }
    s.menus.error = None;
    if s.prompt_request(oc_gateway::prompt::Request::Get {
        tag: format!("menu-search:{search}"),
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
    s.menus.search_revision += 1;
    s.menus.search_pending = None;
    if !matches!(s.menus.open, Some(super::Menu::Search)) {
        return;
    }
    if query != s.menus.search.text.trim() {
        load(s, false);
        return;
    }
    match result {
        Ok(value) => {
            s.menus.cursor = value["nextCursor"].as_str().map(str::to_owned);
            s.menus.notice = value["searchNotice"].as_str().map(str::to_owned);
            if let Some(rows) = value["sessions"].as_array() {
                s.menus.results.extend(rows.iter().cloned());
            } else {
                s.menus.error = Some("The gateway returned an invalid thread search page.".into());
            }
        }
        Err(error) => s.menus.error = Some(error),
    }
}
pub fn view(s: &State, mut list: El) -> El {
    if s.menus.search_pending.is_some() && s.menus.results.is_empty() {
        list = list.child(label(&s.theme, "Searching…", 13.0, 400.0, "text-tertiary"));
    }
    if let Some(notice) = &s.menus.notice {
        list = list.child(
            label(&s.theme, notice, 13.0, 400.0, "text-tertiary")
                .w_full()
                .wrap()
                .role("status"),
        );
    }
    if let Some(error) = &s.menus.error {
        list = list
            .child(
                label(&s.theme, error, 13.0, 400.0, "error")
                    .w_full()
                    .wrap()
                    .role("alert"),
            )
            .child(super::button(s, "Retry").on_press(|s: &mut State| load(s, false)));
    } else if s.menus.search_pending.is_none() && s.menus.results.is_empty() {
        list = list.child(label(
            &s.theme,
            "No threads match your search.",
            13.0,
            400.0,
            "text-tertiary",
        ));
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
            super::button(s, "Show more")
                .disabled(s.menus.search_pending.is_some())
                .on_press(|s: &mut State| load(s, true)),
        );
    }
    list
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
        .radius(6.0)
        .role("button")
        .key(format!("search-thread-{id}"))
        .label(thread["title"].as_str().unwrap_or(""))
        .focusable(true)
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
            .gap(5.0)
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
        s.menus.open = None;
        s.open_session(Some(id.clone()));
    })
}
