//! Native web guests. Gateway HTML remains inside the runtime's opaque sandbox.
mod canvas;
use crate::{
    OPTIONS, State,
    sidebar::label,
    workbench::{
        Panel,
        worker::{Operation, Request, Worker},
    },
};
pub use canvas::app_host;
use oc_webview::{Event, FocusRequest, WebView};
use rune::{El, TextEdit, TextStyle, Tx, col, row, text_input};
use serde_json::{Value, json};
use std::rc::Rc;

pub struct Browser {
    pub web: WebView,
    pub address: TextEdit,
    pub error: Option<String>,
}
#[derive(Default)]
pub struct Native {
    pub tooltip: bool,
    pub window: Option<rune::WindowHandle>,
    pub canvas: Option<canvas::Canvas>,
    pub canvases: Vec<Value>,
    pub canvas_tabs: Vec<String>,
    pub selected_canvas: Option<String>,
    pub browsers: Vec<Browser>,
    pub browser: usize,
    worker: Option<Worker>,
    pending: std::collections::BTreeSet<String>,
    epoch: u64,
    list_loaded: bool,
    revision: [u64; 6],
    session: Option<String>,
    pub error: Option<String>,
}
pub fn attach_window(s: &mut State, w: rune::WindowHandle) {
    if let Some(c) = &s.native.canvas {
        if let Err(e) = c.web.attach(&w) {
            s.native.error = Some(e);
        }
    }
    for b in &s.native.browsers {
        if let Err(e) = b.web.attach(&w) {
            s.native.error = Some(e);
        }
    }
    s.native.window = Some(w);
}
fn web(s: &State, bridge: bool) -> WebView {
    let wake = s.waker.clone();
    let origin = crate::sidecar::url()
        .and_then(|v| url::Url::parse(v).ok())
        .map(|u| u.origin().ascii_serialization());
    let web = WebView::new(oc_webview::Options {
        bridge,
        navigation: oc_webview::Navigation {
            origins: if bridge {
                origin.into_iter().collect()
            } else {
                vec![]
            },
            external_links: bridge,
            ..Default::default()
        },
        wake: Rc::new(move || {
            if let Some(w) = &wake {
                w();
            }
        }),
        ..Default::default()
    });
    let hex = s
        .theme
        .tokens
        .get("surface")
        .map(|s| s.trim_start_matches('#'))
        .unwrap_or("");
    if hex.len() == 6 {
        if let Ok(n) = u32::from_str_radix(hex, 16) {
            web.set_background([
                ((n >> 16) & 255) as f64 / 255.0,
                ((n >> 8) & 255) as f64 / 255.0,
                (n & 255) as f64 / 255.0,
                1.0,
            ]);
        }
    }
    if let Some(w) = &s.native.window {
        if let Err(e) = web.attach(w) {
            eprintln!("WebView attach: {e}");
        }
    }
    web
}
pub fn start(s: &mut State, client: oc_gateway::Gateway, wake: rune::Waker) {
    s.native.worker = Some(Worker::start(client, wake));
}
pub fn capture(s: &mut State) -> Result<(), String> {
    if s.workbench.panel == Panel::Canvas && s.workbench.open {
        if let Some(url) = &OPTIONS.get().unwrap().gateway {
            s.native.canvases = crate::workbench::capture_get(url, "canvases".into(), vec![])?
                .value
                .as_array()
                .cloned()
                .unwrap_or_default();
            s.native.list_loaded = true;
        }
        if let Ok(id) = std::env::var("OPENCODEX_CANVAS") {
            s.open_canvas(id);
        }
    }
    if let Ok(url) = std::env::var("OPENCODEX_BROWSER_URL") {
        s.open_browser(&url);
    }
    Ok(())
}
impl State {
    pub fn open_browser(&mut self, value: &str) {
        self.add_browser(value, false);
    }
    pub fn new_browser_tab(&mut self, value: &str) {
        self.add_browser(value, true);
    }
    fn add_browser(&mut self, value: &str, force: bool) {
        let Some(url) = address_url(value) else {
            return;
        };
        self.open_page(crate::pages::Route::Chat);
        if let Some(i) = self
            .native
            .browsers
            .iter()
            .position(|b| !force && b.web.state().url == url)
        {
            self.native.browser = i;
        } else {
            if self.native.browsers.len() >= 16 {
                self.native.error = Some("Close a browser tab before opening another.".into());
                return;
            }
            let web = web(self, false);
            let error = web.load_url(&url).err();
            self.native.browsers.push(Browser {
                web,
                address: TextEdit::new(url),
                error,
            });
            self.native.browser = self.native.browsers.len() - 1;
        }
        self.workbench.open = true;
        self.workbench.panel = Panel::Browser;
    }
    pub fn open_link(&mut self, href: &str, tx: &mut Tx) {
        if let Some(id) = href
            .strip_prefix("canvas:")
            .filter(|id| canvas::valid_id(id))
        {
            self.open_canvas(id.to_owned());
            return;
        }
        if let Some((directory, path)) =
            crate::workbench::file_target(href, &self.workspace_directory())
        {
            self.workbench.open = true;
            self.workbench.panel = Panel::Files;
            self.open_workspace_target(directory, path, false);
            self.load_panel(false);
            return;
        }
        let Ok(url) = url::Url::parse(href) else {
            return;
        };
        if !matches!(url.scheme(), "http" | "https") {
            if matches!(url.scheme(), "mailto" | "irc" | "ircs" | "xmpp") {
                if let Err(error) = tx.open_url(href) {
                    self.error = Some(error.to_string());
                }
            }
            return;
        }
        let host = url.host_str().unwrap_or("");
        let local = host == "localhost"
            || host.ends_with(".localhost")
            || host == "[::1]"
            || host == "0.0.0.0"
            || host
                .parse::<std::net::Ipv4Addr>()
                .is_ok_and(|ip| ip.is_loopback());
        if local && !tx.mods().cmd && !tx.mods().ctrl {
            self.open_browser(href);
        } else if let Err(e) = tx.open_url(href) {
            self.error = Some(e.to_string());
        }
    }
    pub fn open_canvas(&mut self, id: String) {
        if !canvas::valid_id(&id) {
            return;
        }
        if !self.native.canvas_tabs.contains(&id) {
            if self.native.canvas_tabs.len() >= 32 {
                self.native.error = Some("Close a canvas tab before opening another.".into());
                return;
            }
            self.native.canvas_tabs.push(id.clone());
        }
        self.native.selected_canvas = Some(id);
        self.native.session = self.selected.clone();
        self.workbench.open = true;
        self.workbench.panel = Panel::Canvas;
    }
    fn native_request(&mut self, tag: String, op: Operation) -> bool {
        if self.native.pending.contains(&tag) {
            return false;
        }
        if let Some(w) = &self.native.worker {
            match w.request(Request {
                epoch: self.native.epoch,
                tag: tag.clone(),
                op,
            }) {
                Ok(()) => {
                    self.native.pending.insert(tag);
                    return true;
                }
                Err(e) => {
                    canvas::request_failed(&mut self.native, &tag, &e);
                    self.native.error = Some(e);
                }
            }
        }
        false
    }
    fn native_get(&mut self, tag: &str, path: String) -> bool {
        self.native_request(
            tag.into(),
            Operation::Get {
                path,
                query: vec![],
            },
        )
    }
}
pub fn address_url(value: &str) -> Option<String> {
    let text = value.trim();
    if text == "about:blank" {
        return Some(text.into());
    }
    if text.is_empty() {
        return None;
    }
    if text.contains("://") {
        let u = url::Url::parse(text).ok()?;
        return matches!(u.scheme(), "http" | "https").then(|| u.into());
    }
    let local = url::Url::parse(&format!("http://{text}"))
        .ok()
        .is_some_and(|u| {
            let host = u.host_str().unwrap_or("");
            host == "localhost"
                || host.ends_with(".localhost")
                || host == "[::1]"
                || host.parse::<std::net::Ipv4Addr>().is_ok()
        });
    if local {
        return Some(format!("http://{text}"));
    }
    if !text.contains(char::is_whitespace)
        && text.split('/').next().is_some_and(|s| s.contains('.'))
    {
        return Some(format!("https://{text}"));
    }
    let mut u = url::Url::parse("https://www.google.com/search").unwrap();
    u.query_pairs_mut().append_pair("q", text);
    Some(u.into())
}
pub fn poll(s: &mut State, tx: &mut Tx) -> bool {
    let mut changed = false;
    if s.native.session != s.selected {
        s.native.session = s.selected.clone();
        s.native.list_loaded = false;
        s.native.selected_canvas = None;
        s.native.canvas_tabs.clear();
    }
    let panel = s.pages.route == crate::pages::Route::Chat && s.workbench.open;
    let canvas_visible = panel && s.workbench.panel == Panel::Canvas;
    let target = if s.pages.route == crate::pages::Route::Apps {
        s.pages.app.clone()
    } else if canvas_visible {
        s.native.selected_canvas.clone()
    } else {
        None
    };
    if canvas_visible
        && (!s.native.list_loaded || s.native.revision[0] != s.snapshot.native_revisions[0])
    {
        if s.native_get("canvases", "canvases".into()) {
            s.native.list_loaded = true;
            s.native.revision[0] = s.snapshot.native_revisions[0];
        }
    }
    if let Some(id) = target {
        if s.native.canvas.as_ref().is_none_or(|c| c.id != id) {
            canvas::open(s, id);
            changed = true;
        }
        canvas::refresh_changed(s);
    }
    let replies = s
        .native
        .worker
        .as_ref()
        .map(Worker::take)
        .unwrap_or_default();
    for r in replies {
        if r.epoch != s.native.epoch {
            continue;
        }
        s.native.pending.remove(&r.tag);
        changed = true;
        if r.tag == "canvases" {
            match r.result {
                Ok(p) => s.native.canvases = p.value.as_array().cloned().unwrap_or_default(),
                Err(e) => s.native.error = Some(e),
            };
        } else {
            canvas::reply(s, &r.tag, r.result.map(|p| p.value));
        }
    }
    if let Some(c) = &s.native.canvas {
        let events = c.web.drain_events();
        for event in events {
            changed = true;
            canvas::event(s, event, tx);
        }
        canvas::theme(s);
    }
    let mut popups = vec![];
    for b in &mut s.native.browsers {
        for event in b.web.drain_events() {
            changed = true;
            match event {
                Event::Changed(p) => {
                    if p.loading {
                        b.error = None;
                    }
                    if tx.focused() != Some("browser-address") {
                        b.address = TextEdit::new(p.url);
                    }
                }
                Event::NewWindow(url) => popups.push(url),
                Event::Focus(f) => {
                    b.web.focus_rune();
                    tx.focus(
                        if matches!(f, FocusRequest::Location) {
                            "browser-address"
                        } else {
                            "browser-page-focus"
                        },
                        true,
                    );
                }
                Event::Error(e) => b.error = Some(e),
                Event::Blocked(url) => {
                    b.error = Some(format!("Blocked unsupported navigation: {url}"))
                }
                _ => {}
            }
        }
    }
    for url in popups {
        s.new_browser_tab(&url);
    }
    changed
}
pub fn coverage(s: &State) {
    // Hide before painting Rune overlays; no readbacks, timers or redraw loop.
    let covered = s.native.tooltip
        || s.menus.open.is_some()
        || s.composer.menu.is_some()
        || s.chat.preview.is_some()
        || s.chat.details
        || s.chat.context;
    if let Some(c) = &s.native.canvas {
        c.web.set_covered(covered);
    }
    for b in &s.native.browsers {
        b.web.set_covered(covered);
    }
}
pub fn canvas_panel(s: &State) -> El {
    if let Some(id) = &s.native.selected_canvas {
        return canvas::host(s, id, "canvas-panel");
    }
    let own: Vec<_> = s
        .native
        .canvases
        .iter()
        .filter(|c| c["sessionID"].as_str() == s.selected.as_deref())
        .collect();
    let mut list = col().grow(1.0).w_full().min_h(0.0).padding(12.0).gap(8.0);
    if let Some(e) = &s.native.error {
        list = list.child(label(&s.theme, e, 12.0, 400.0, "error"));
    }
    if own.is_empty() {
        return list.child(label(
            &s.theme,
            if s.native.list_loaded {
                "No canvases in this chat"
            } else {
                "Loading canvases…"
            },
            14.0,
            500.0,
            "text",
        ));
    }
    for c in own.into_iter().take(200) {
        let id = c["id"].as_str().unwrap_or("").to_owned();
        list = list.child(
            crate::pages::button(s, c["title"].as_str().unwrap_or("Canvas"))
                .on_press(move |s: &mut State| s.open_canvas(id.clone())),
        );
    }
    list
}
pub fn canvas_tabs(s: &State) -> El {
    let mut tabs = row().grow(1.0).min_w(0.0).h(40.0).gap(4.0).center_y();
    for id in &s.native.canvas_tabs {
        let title = s
            .native
            .canvases
            .iter()
            .find(|v| v["id"] == *id)
            .and_then(|v| v["title"].as_str())
            .unwrap_or("Canvas");
        let select = id.clone();
        let close = id.clone();
        tabs = tabs
            .child(
                crate::pages::button(s, title)
                    .on_press(move |s: &mut State| s.native.selected_canvas = Some(select.clone())),
            )
            .child(
                crate::pages::button(s, "×")
                    .label("Close canvas tab")
                    .on_press(move |s: &mut State| {
                        s.native.canvas_tabs.retain(|id| id != &close);
                        if s.native.selected_canvas.as_ref() == Some(&close) {
                            s.native.selected_canvas = s.native.canvas_tabs.last().cloned();
                        }
                    }),
            );
    }
    tabs.child(
        crate::pages::button(s, "+")
            .label("Canvases in this chat")
            .on_press(|s: &mut State| s.native.selected_canvas = None),
    )
}
pub fn browser_panel(s: &State) -> El {
    let mut body = col().grow(1.0).w_full().min_h(0.0);
    let mut tabs = row().w_full().h(32.0).gap(4.0).center_y();
    for (i, b) in s.native.browsers.iter().enumerate() {
        let p = b.web.state();
        tabs = tabs
            .child(
                crate::pages::button(
                    s,
                    if p.title.is_empty() {
                        "New tab"
                    } else {
                        &p.title
                    },
                )
                .max_w(160.0)
                .on_press(move |s: &mut State| s.native.browser = i),
            )
            .child(
                crate::pages::button(s, "×")
                    .label("Close browser tab")
                    .on_press(move |s: &mut State| {
                        s.native.browsers.remove(i);
                        s.native.browser = s
                            .native
                            .browser
                            .min(s.native.browsers.len().saturating_sub(1));
                    }),
            );
    }
    body = body.child(
        tabs.child(
            crate::pages::button(s, "+")
                .label("New browser tab")
                .on_press(|s: &mut State| s.new_browser_tab("about:blank")),
        ),
    );
    let Some(b) = s.native.browsers.get(s.native.browser) else {
        return body.child(
            crate::pages::button(s, "Open a page")
                .on_press(|s: &mut State| s.open_browser("https://example.org")),
        );
    };
    body = body.child(
        row()
            .w_full()
            .h(40.0)
            .px(8.0)
            .gap(4.0)
            .center_y()
            .child(
                crate::pages::button(s, "←")
                    .label("Back")
                    .disabled(!b.web.state().can_go_back)
                    .on_press(|s: &mut State| s.native.browsers[s.native.browser].web.back()),
            )
            .child(
                crate::pages::button(s, "→")
                    .label("Forward")
                    .disabled(!b.web.state().can_go_forward)
                    .on_press(|s: &mut State| s.native.browsers[s.native.browser].web.forward()),
            )
            .child(
                crate::pages::button(s, "↻")
                    .label("Reload")
                    .on_press(|s: &mut State| s.native.browsers[s.native.browser].web.reload()),
            )
            .child(
                text_input(&b.address, TextStyle::new(12.0, 400.0))
                    .key("browser-address")
                    .grow(1.0)
                    .min_w(0.0)
                    .h(28.0)
                    .px(8.0)
                    .radius(6.0)
                    .fill(s.theme.c("control"))
                    .color(s.theme.c("text"))
                    .on_edit(|s: &mut State| &mut s.native.browsers[s.native.browser].address)
                    .on_submit(|s: &mut State, _| {
                        let b = &mut s.native.browsers[s.native.browser];
                        if let Some(url) = address_url(&b.address.text) {
                            b.error = b.web.load_url(&url).err();
                        }
                    }),
            ),
    );
    if let Some(e) = &b.error {
        body = body.child(label(&s.theme, e, 12.0, 400.0, "error"));
    }
    body.child(
        b.web
            .host::<State>("browser-page")
            .grow(1.0)
            .min_h(0.0)
            .w_full()
            .focusable(true)
            .key("browser-page-focus")
            .on_press(|s: &mut State| s.native.browsers[s.native.browser].web.focus()),
    )
}
