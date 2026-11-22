//! WorkspaceView connection states. HTTP connectivity and the event stream are
//! deliberately independent; an SSE reconnect must never replace a working chat.
use crate::{State, pages::primary_button as button, sidebar::label};
use rune::{El, col, el};
pub fn capture(s: &mut State) {
    if crate::OPTIONS.get().unwrap().page == "connection-checking" {
        return;
    }
    if let Some(url) = &crate::OPTIONS.get().unwrap().gateway {
        let url = url.clone();
        let result = std::thread::spawn(move || oc_gateway::capture_page(&url, "connection"))
            .join()
            .unwrap();
        s.pages.data.insert("connection".into(), result);
    }
}
pub fn capture_state(s: &mut State) {
    if crate::OPTIONS.get().unwrap().page == "connection-checking" {
        s.pages.route = crate::pages::Route::Chat;
        s.selected = None;
        s.prefs.project = None;
        s.pages.data.remove("connection");
    }
    if s.prefs.focus
        && let Some(url) = &crate::OPTIONS.get().unwrap().gateway
    {
        let url = url.clone();
        let pages = std::thread::spawn(move || {
            let mut pages = vec![];
            let mut cursor: Option<String> = None;
            for _ in 0..4 {
                let mut query = vec![("search", "")];
                if let Some(cursor) = cursor.as_deref() {
                    query.push(("cursor", cursor));
                }
                let page = oc_gateway::capture_page_query(&url, "session-search", &query);
                let next = page
                    .as_ref()
                    .ok()
                    .and_then(|v| v["nextCursor"].as_str())
                    .map(str::to_owned);
                let recent = page
                    .as_ref()
                    .ok()
                    .and_then(|v| v["sessions"].as_array())
                    .and_then(|rows| rows.last())
                    .and_then(|v| v["updatedAt"].as_f64())
                    .is_some_and(|time| time >= crate::unix_ms() as f64 - 3.0 * 86400000.0);
                pages.push(page);
                cursor = next;
                if cursor.is_none() || !recent {
                    break;
                }
            }
            pages
        })
        .join()
        .unwrap();
        for (index, page) in pages.into_iter().enumerate() {
            crate::sidebar::focus::receive(s, index > 0, page);
        }
    }
}
pub fn view(s: &State) -> El {
    let connection = s.pages.data.get("connection");
    let checking = connection.is_none();
    let unreachable = connection.is_some_and(Result::is_err);
    let connecting =
        s.pages.pending.contains("connection") && s.pages.errors.contains_key("connect-pending");
    let title = if checking {
        "Looking for OpenCode…"
    } else if unreachable {
        "Can’t reach the gateway"
    } else {
        "Connect to OpenCode"
    };
    let description = if checking {
        Some("Checking for your local service.")
    } else if unreachable {
        Some("Check that the OpenCodex server is running, then try again.")
    } else {
        crate::pages::data(s, "connection").and_then(|v| v["message"].as_str())
    };
    let mut body = col()
        .w_full()
        .max_w(520.0)
        .px(24.0)
        .pt(48.0)
        .pb(s.window_size.1 * 0.16)
        .items_center();
    if let Some(assets) = &s.assets {
        body = body.child(el().size(176.0, 176.0).pixels(assets.hero.pixels()).mb(4.0));
    }
    body = body.child(
        label(&s.theme, title, 30.0, 600.0, "text")
            .font(rune::TextStyle::new(30.0, 600.0).lh(37.5).tracking(-0.6)),
    );
    if let Some(description) = description {
        body = body.child(
            label(&s.theme, description, 14.5, 400.0, "text-secondary")
                .mt(10.0)
                .wrap(),
        );
    }
    if !checking {
        body = body.child(
            button(
                s,
                if connecting {
                    "Connecting…"
                } else if unreachable {
                    "Try again"
                } else {
                    "Connect"
                },
            )
            .mt(24.0)
            .disabled(s.pages.pending.contains("connection"))
            .on_press(|s: &mut State| {
                if s.pages.pending.contains("connection") {
                    return;
                }
                if s.pages.data.get("connection").is_some_and(Result::is_err) {
                    s.page_get("connection");
                } else {
                    s.pages
                        .errors
                        .insert("connect-pending".into(), String::new());
                    s.page_write("connection", "POST", serde_json::json!({}), "connection");
                }
            }),
        );
    }
    if let Some(error) = s.pages.errors.get("connection") {
        body = body.child(label(&s.theme, error, 13.0, 400.0, "error").role("alert"));
    }
    col().w_full().grow(1.0).center().child(body)
}

pub fn poll(s: &mut State, clock: f64, tx: &mut rune::Tx) -> bool {
    crate::menus::search::release_if_closed(s);
    if s.composer.worker.is_none() {
        return false;
    }
    if s.menus.connection_due.is_none_or(|due| clock >= due) {
        s.menus.connection_due = Some(clock + 15.0);
        s.page_get("connection");
        tx.wake_after(std::time::Duration::from_secs(15));
    }
    let connected = crate::menus::search::connected(s);
    let reconnected = connected && !s.menus.search_connected;
    s.menus.search_connected = connected;
    if reconnected && s.prefs.focus {
        crate::sidebar::focus::load(s, false);
    }
    if matches!(s.menus.open, Some(crate::menus::Menu::Search)) && connected {
        if reconnected || (!s.snapshot.live && s.menus.search_due.is_none_or(|due| clock >= due)) {
            crate::menus::search::load(s, false);
            s.menus.search_due = Some(clock + 15.0);
        }
        if !s.snapshot.live {
            tx.wake_after(std::time::Duration::from_secs(15));
        }
    } else {
        s.menus.search_due = None;
    }
    reconnected
}
