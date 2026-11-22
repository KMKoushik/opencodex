//! Native web guests. Gateway HTML remains inside the runtime's opaque sandbox.
mod annotations;
mod browser;
pub use browser::{browser_panel, browser_tabs};
mod canvas;
pub mod capture;
mod icons;
mod storage;
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
use storage::{restore_tabs, save_tabs, sync_chat_tabs};

pub struct Browser {
    key: u64,
    pub web: WebView,
    pub address: TextEdit,
    pub error: Option<String>,
}
fn browser_key() -> u64 {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}
#[derive(Default)]
struct ChatTabs {
    browsers: Vec<Browser>,
    browser: usize,
    canvases: Vec<String>,
    canvas: Option<String>,
}
#[derive(Default)]
pub struct Native {
    empty_address: TextEdit,
    annotations: annotations::Annotations,
    pub tooltip: bool,
    pub window: Option<rune::WindowHandle>,
    pub canvas: Option<canvas::Canvas>,
    pub canvases: Vec<Value>,
    pub canvas_tabs: Vec<String>,
    pub selected_canvas: Option<String>,
    delete_canvas: Option<(String, String)>,
    pub browsers: Vec<Browser>,
    pub browser: usize,
    worker: Option<Worker>,
    pending: std::collections::BTreeSet<String>,
    epoch: u64,
    list_loaded: bool,
    revision: [u64; 6],
    session: Option<String>,
    retained: std::collections::HashMap<Option<String>, ChatTabs>,
    storage: Option<storage::Storage>,
    preferences_loaded: bool,
    saved: storage::Saved,
    tabs_dirty: bool,
    browser_lru: Vec<u64>,
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
        persistent: !bridge,
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
    s.native.storage = Some(storage::Storage::start(wake.clone()));
    s.native.worker = Some(Worker::start(client, wake));
}
pub fn capture(s: &mut State) -> Result<(), String> {
    sync_chat_tabs(s);
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
    fn navigate_browser(&mut self) {
        let Some(b) = self.native.browsers.get_mut(self.native.browser) else {
            return;
        };
        let Some(url) = address_url(&b.address.text) else {
            return;
        };
        b.address = TextEdit::new(url.clone());
        // A late filesystem reply must not replace a more recent navigation.
        let old_key = b.key;
        b.key = browser_key();
        let key = b.key;
        for entry in &mut self.native.browser_lru {
            if *entry == old_key {
                *entry = key;
            }
        }
        if url.starts_with("file:") {
            self.native_request(format!("browser-file:{key}"), Operation::LocalHTML(url));
        } else {
            b.error = b.web.load_url(&url).err();
        }
        self.native.tabs_dirty = true;
    }
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
        sync_chat_tabs(self);
        if let Some(i) = self
            .native
            .browsers
            .iter()
            .position(|b| !force && b.web.state().url == url)
        {
            self.native.browser = i;
        } else {
            if self.native.browsers.len() >= 12 {
                let oldest = usize::from(self.native.browser == 0);
                self.native.browsers.remove(oldest);
                if self.native.browser > oldest {
                    self.native.browser -= 1;
                }
            }
            let web = web(self, false);
            let error = if url.starts_with("file:") {
                None
            } else {
                web.load_url(&url).err()
            };
            let index = if force {
                (self.native.browser + 1).min(self.native.browsers.len())
            } else {
                self.native.browsers.len()
            };
            self.native.browsers.insert(
                index,
                Browser {
                    key: browser_key(),
                    web,
                    address: TextEdit::new(if url == "about:blank" {
                        String::new()
                    } else {
                        url.clone()
                    }),
                    error,
                },
            );
            self.native.browser = index;
        }
        self.workbench.open = true;
        self.workbench.panel = Panel::Browser;
        if url.starts_with("file:") {
            let key = self.native.browsers[self.native.browser].key;
            self.native_request(format!("browser-file:{key}"), Operation::LocalHTML(url));
        }
        self.native.tabs_dirty = true;
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
            if path
                .rsplit('.')
                .next()
                .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"))
            {
                if let Ok(url) =
                    url::Url::from_file_path(std::path::Path::new(&directory).join(&path))
                {
                    self.open_browser(url.as_str());
                    return;
                }
            }
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
        sync_chat_tabs(self);
        if !self.native.canvas_tabs.contains(&id) {
            if self.native.canvas_tabs.len() >= 12 {
                self.native.canvas_tabs.remove(0);
            }
            self.native.canvas_tabs.push(id.clone());
        }
        self.native.selected_canvas = Some(id);
        self.workbench.open = true;
        self.workbench.panel = Panel::Canvas;
        self.native.tabs_dirty = true;
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
        return (matches!(u.scheme(), "http" | "https")
            || (u.scheme() == "file"
                && u.host_str().is_none_or(|h| h == "localhost")
                && u.path().rsplit('.').next().is_some_and(|e| {
                    e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm")
                })))
        .then(|| u.into());
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
    let mut changed = annotations::poll(s);
    let loaded = s
        .native
        .storage
        .as_ref()
        .and_then(|w| w.loaded.lock().unwrap().take());
    if let Some(result) = loaded {
        s.native.preferences_loaded = true;
        match result {
            Ok(saved) => {
                s.native.saved = saved;
                if !s.native.tabs_dirty
                    && s.native.browsers.is_empty()
                    && s.native.canvas_tabs.is_empty()
                {
                    restore_tabs(s);
                }
            }
            Err(e) => s.native.error = Some(e),
        }
        changed = true;
    }
    if let Some(error) = s
        .native
        .storage
        .as_ref()
        .and_then(|w| w.error.lock().unwrap().take())
    {
        s.native.error = Some(error);
        changed = true;
    }
    if s.native.session != s.selected {
        sync_chat_tabs(s);
        changed = true;
    }
    let panel = s.pages.route == crate::pages::Route::Chat && s.workbench.open;
    let canvas_visible = panel && s.workbench.panel == Panel::Canvas;
    if panel && s.workbench.panel == Panel::Browser {
        browser::limit_live(s);
    }
    if let Some(target) = s.native.annotations.target.as_ref() {
        let visible = if let Some(id) = target.strip_prefix("canvas:") {
            canvas_visible && s.native.selected_canvas.as_deref() == Some(id)
        } else {
            panel
                && s.workbench.panel == Panel::Browser
                && target == &format!("browser:{}", s.native.browser)
        };
        if !visible || s.native.session != s.selected {
            annotations::cancel(s);
        }
    }
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
        if let Some(key) = r
            .tag
            .strip_prefix("browser-file:")
            .and_then(|i| i.parse::<u64>().ok())
        {
            if let Some(browser) = s
                .native
                .browsers
                .iter_mut()
                .chain(
                    s.native
                        .retained
                        .values_mut()
                        .flat_map(|tabs| tabs.browsers.iter_mut()),
                )
                .find(|b| b.key == key)
            {
                match r.result {
                    Ok(p) => {
                        browser.error = browser
                            .web
                            .load_local_file(
                                p.value["url"].as_str().unwrap_or(""),
                                p.value["root"].as_str().unwrap_or(""),
                            )
                            .err();
                    }
                    Err(error) => browser.error = Some(error),
                }
            }
        } else if let Some(id) = r.tag.strip_prefix("canvas-delete:") {
            match r.result {
                Ok(_) => {
                    s.native.tabs_dirty = true;
                    s.native.canvases.retain(|c| c["id"] != id);
                    s.native.canvas_tabs.retain(|c| c != id);
                    if s.native.selected_canvas.as_deref() == Some(id) {
                        s.native.selected_canvas = None;
                    }
                    for tabs in s.native.retained.values_mut() {
                        tabs.canvases.retain(|c| c != id);
                        if tabs.canvas.as_deref() == Some(id) {
                            tabs.canvas = None;
                        }
                    }
                    for tabs in s.native.saved.values_mut() {
                        tabs.canvases.retain(|c| c != id);
                        if tabs.canvas.as_deref() == Some(id) {
                            tabs.canvas = None;
                        }
                    }
                    s.native.delete_canvas = None;
                }
                Err(error) => s.native.error = Some(error),
            }
        } else if r.tag == "canvases" {
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
                    // Progress KVO is not a persistence event. Capture WebKit history
                    // at settled navigation, not once per progress update.
                    s.native.tabs_dirty |= !p.loading;
                    if p.loading {
                        b.error = None;
                    }
                    if tx.focused() != Some("browser-address") {
                        b.address = TextEdit::new(if p.url == "about:blank" {
                            String::new()
                        } else {
                            p.url
                        });
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
    if s.native.tabs_dirty && s.native.preferences_loaded {
        save_tabs(s);
        s.native.tabs_dirty = false;
    }
    changed
}
pub fn coverage(s: &State) {
    // Hide before painting Rune overlays; no readbacks, timers or redraw loop.
    let covered = s.native.tooltip
        || s.pages.update_confirming
        || s.menus.open.is_some()
        || s.composer.menu.is_some()
        || s.chat.preview.is_some()
        || s.chat.details
        || s.chat.context;
    let covered = covered
        || s.workbench.file_actions.is_some()
        || s.chat.comment_editor.is_some()
        || s.workbench.delete_side.is_some()
        || s.workbench.side_model_open
        || s.workbench.side_thinking_open
        || s.native.delete_canvas.is_some();
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
    let mut list = col()
        .grow(1.0)
        .w_full()
        .min_h(0.0)
        .padding(8.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        });
    if let Some(e) = &s.native.error {
        list = list.child(label(&s.theme, e, 12.0, 400.0, "error"));
    }
    if own.is_empty() {
        return list.child(if s.native.list_loaded {
            crate::workbench::empty_state(
                s,
                &crate::chat::icons::CANVAS,
                "No canvases in this chat",
                "Ask the agent for a dashboard, chart, diagram, or report and it can make one.",
            )
        } else {
            label(&s.theme, "Loading canvases…", 14.0, 400.0, "text-tertiary").role("status")
        });
    }
    for c in own.into_iter().take(200) {
        let id = c["id"].as_str().unwrap_or("").to_owned();
        let delete_id = id.clone();
        let title = c["title"].as_str().unwrap_or("Canvas").to_owned();
        let delete_title = title.clone();
        list = list.child(
            row()
                .w_full()
                .gap(4.0)
                .pr(6.0)
                .radius(8.0)
                .center_y()
                .hover_group()
                .hover_group_focus()
                .hover(s.theme.c("hover"))
                .child(
                    row()
                        .px(10.0)
                        .py(8.0)
                        .gap(10.0)
                        .center_y()
                        .child(
                            rune::icon(&crate::chat::icons::CANVAS, 16.0)
                                .color(s.theme.c("text-secondary")),
                        )
                        .child(
                            col()
                                .min_w(0.0)
                                .child(label(&s.theme, &title, 14.0, 400.0, "text").truncate())
                                .child(label(
                                    &s.theme,
                                    oc_webview::updated_label(c["updated"].as_f64().unwrap_or(0.0)),
                                    12.0,
                                    400.0,
                                    "text-tertiary",
                                )),
                        )
                        .grow(1.0)
                        .role("button")
                        .focusable(true)
                        .on_press(move |s: &mut State| s.open_canvas(id.clone())),
                )
                .child(
                    crate::sidebar::icon_button(
                        &s.theme,
                        &icons::DELETE,
                        &format!("Delete {title}"),
                    )
                    .group_opacity(0.0, 1.0)
                    .on_press(move |s: &mut State| {
                        s.native.delete_canvas = Some((delete_id.clone(), delete_title.clone()))
                    }),
                ),
        );
    }
    list.child(delete_canvas_dialog(s))
}
fn delete_canvas_dialog(s: &State) -> El {
    let Some((id, title)) = &s.native.delete_canvas else {
        return rune::el();
    };
    let id = id.clone();
    let pending = s.native.pending.contains(&format!("canvas-delete:{id}"));
    col().w((s.panel_width()-24.0).clamp(220.0,420.0)).padding(20.0).gap(16.0).radius(12.0).fill(s.theme.c("elevated")).border(1.0,s.theme.c("border-heavy"))
        .role("alertdialog").label("Delete canvas?")
        .child(label(&s.theme,"Delete canvas?",16.0,600.0,"text"))
        .child(label(&s.theme,format!("“{title}” and its data files will be deleted. Links to it in chats will stop working."),13.0,400.0,"text-secondary").wrap())
        .child(row().gap(8.0).child(crate::pages::button(s,"Cancel").autofocus().disabled(pending).on_press(|s: &mut State| s.native.delete_canvas=None))
            .child(crate::pages::button(s,if pending{"Deleting…"}else{"Delete"}).disabled(pending).on_press(move |s: &mut State| {s.native_request(format!("canvas-delete:{id}"),Operation::Delete(format!("canvases/{id}")));})))
        .absolute(12.0,80.0).modal(true,|s: &mut State| s.native.delete_canvas=None)
}
pub fn canvas_tabs(s: &State) -> El {
    use crate::workbench::panel_tabs as tab;
    let mut tabs = tab::strip("Canvases");
    for (index, id) in s.native.canvas_tabs.iter().enumerate() {
        let title = s
            .native
            .canvases
            .iter()
            .find(|v| v["id"] == *id)
            .and_then(|v| v["title"].as_str())
            .unwrap_or("Canvas");
        let select = id.clone();
        let close = id.clone();
        let active = s.native.selected_canvas.as_ref() == Some(id);
        tabs = tabs.child(tab::pill(
            s,
            active,
            tab::button(s, title, &crate::chat::icons::CANVAS, active)
                .key(format!("canvas-tab-{index}"))
                .on_press(move |s: &mut State| {
                    s.native.selected_canvas = Some(select.clone());
                    s.native.tabs_dirty = true;
                })
                .on_key(move |s: &mut State, key, tx| {
                    if !matches!(key.key, rune::Key::Left | rune::Key::Right) {
                        return false;
                    }
                    let Some(next) = tab::next(&key.key, index, s.native.canvas_tabs.len()) else {
                        return false;
                    };
                    s.native.selected_canvas = Some(s.native.canvas_tabs[next].clone());
                    s.native.tabs_dirty = true;
                    tx.focus(format!("canvas-tab-{next}"), false);
                    true
                }),
            tab::close(s, &format!("Close {title}")).on_press(move |s: &mut State| {
                s.native.canvas_tabs.retain(|id| id != &close);
                if s.native.selected_canvas.as_ref() == Some(&close) {
                    s.native.selected_canvas = s
                        .native
                        .canvas_tabs
                        .get(index.min(s.native.canvas_tabs.len().saturating_sub(1)))
                        .cloned();
                }
                s.native.tabs_dirty = true;
            }),
        ));
    }
    let mut header = row()
        .grow(1.0)
        .min_w(0.0)
        .center_y()
        .gap(8.0)
        .child(tab::viewport(tabs));
    if s.native.selected_canvas.is_some() {
        header = header.child(
            crate::sidebar::icon_button(
                &s.theme,
                &icons::COMMENT,
                if s.native.annotations.target.is_some() {
                    "Cancel comment"
                } else {
                    "Comment on canvas"
                },
            )
            .on_press(|s: &mut State| annotations::toggle(s, true)),
        );
    }
    header.child(
        crate::sidebar::icon_button(&s.theme, &crate::icons::PLUS, "Canvases in this chat")
            .checked(s.native.selected_canvas.is_none())
            .on_press(|s: &mut State| {
                s.native.selected_canvas = None;
                s.native.tabs_dirty = true;
            }),
    )
}
