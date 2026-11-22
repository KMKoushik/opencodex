//! Main-thread-only, lazy native web surfaces. See the crate README for embedding contracts.
use std::{cell::Cell, rc::Rc};

#[cfg(not(target_os = "macos"))]
mod fallback;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
use fallback as platform;
#[cfg(target_os = "macos")]
use macos as platform;

pub type Rect = [f64; 4];
pub fn browser_locale() -> String {
    platform::browser_locale()
}
/// Localized month/day and short time, matching the canvas list's Intl formatter.
pub fn updated_label(milliseconds: f64) -> String {
    platform::updated_label(milliseconds)
}
pub fn short_time(milliseconds: f64) -> String {
    platform::short_time(milliseconds)
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PageState {
    pub title: String,
    pub url: String,
    pub loading: bool,
    pub progress: f64,
    pub can_go_back: bool,
    pub can_go_forward: bool,
}

#[derive(Clone, Debug)]
pub enum Event {
    Changed(PageState),
    /// JSON from untrusted page code; includes the actual WK frame URL and main-frame flag.
    Message {
        json: String,
        url: String,
        main_frame: bool,
    },
    NewWindow(String),
    Blocked(String),
    External(String),
    Focus(FocusRequest),
    Error(String),
}

#[derive(Clone, Copy, Debug)]
pub enum FocusRequest {
    Location,
    Escape,
    Next,
    Previous,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Decision {
    Allow,
    Block,
    External,
}

#[derive(Clone)]
pub struct Navigation {
    /// Explicitly granted canonical local HTML directories, shared with the owning surface.
    pub files: Rc<std::cell::RefCell<Vec<(String, String)>>>,
    /// Empty allows HTTP(S); otherwise exact normalized origins (including ports).
    pub origins: Vec<String>,
    pub external_links: bool,
    pub hook: Option<Rc<dyn Fn(&str, bool) -> Decision>>,
}

impl Default for Navigation {
    fn default() -> Self {
        Self {
            files: Default::default(),
            origins: Vec::new(),
            external_links: false,
            hook: None,
        }
    }
}

impl Navigation {
    pub fn decide(&self, value: &str, main_frame: bool) -> Decision {
        if value == "about:blank" || (value == "about:srcdoc" && !main_frame) {
            return Decision::Allow;
        }
        let Ok(url) = url::Url::parse(value) else {
            return Decision::Block;
        };
        if url.scheme() == "opencodex-preview" {
            return if self
                .files
                .borrow()
                .iter()
                .any(|(token, _)| url.host_str() == Some(token.as_str()))
            {
                Decision::Allow
            } else {
                Decision::Block
            };
        }
        if !matches!(url.scheme(), "http" | "https") {
            return Decision::Block;
        }
        if let Some(hook) = &self.hook {
            return hook(value, main_frame);
        }
        if self.origins.is_empty()
            || self
                .origins
                .iter()
                .any(|o| *o == url.origin().ascii_serialization())
        {
            Decision::Allow
        } else if self.external_links && main_frame {
            Decision::External
        } else {
            Decision::Block
        }
    }
}

pub struct Options {
    pub navigation: Navigation,
    /// Browser tabs share WebKit's persistent application profile. Sandboxed hosts don't.
    pub persistent: bool,
    /// Enable only for trusted shell pages. Browser guests get no injected host channel.
    pub bridge: bool,
    pub background: [f64; 4],
    /// Called by native callbacks, not by a frame poll. Usually captures Rune's Waker.
    pub wake: Rc<dyn Fn()>,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            navigation: Navigation::default(),
            persistent: false,
            bridge: false,
            background: [0.08, 0.08, 0.09, 1.0],
            wake: Rc::new(|| {}),
        }
    }
}

/// Cloneable handle, deliberately !Send/!Sync. Construct and call on the AppKit main thread.
#[derive(Clone)]
pub struct WebView {
    inner: Rc<platform::Surface>,
    mounts: Rc<Cell<usize>>,
}

impl WebView {
    pub fn new(options: Options) -> Self {
        Self {
            inner: Rc::new(platform::Surface::new(options)),
            mounts: Rc::new(Cell::new(0)),
        }
    }
    /// Call from `App::on_window`, once for each native window creation. Does not create WebKit.
    pub fn attach(&self, window: &rune::WindowHandle) -> Result<(), String> {
        window.with_raw_handle(|h| self.inner.attach(h.as_raw()))?
    }
    /// Native view is created only at the first nonempty presentation. Coordinates are logical
    /// window points, top-left. Clip must already include all ancestor clips.
    pub fn present(&self, rect: Rect, clip: Rect) -> Result<(), String> {
        self.inner.present(rect, clip)
    }
    pub fn hide(&self) {
        self.inner.hide();
    }
    /// Hide before showing any Rune menu/modal intersecting this surface; restore on dismissal.
    pub fn set_covered(&self, covered: bool) {
        self.inner.set_covered(covered);
    }
    pub fn load_url(&self, url: &str) -> Result<(), String> {
        self.inner.load_url(url)
    }
    pub fn load_html(&self, html: &str, base_url: Option<&str>) -> Result<(), String> {
        self.inner.load_html(html, base_url)
    }
    /// Paths must be canonicalized and checked off-thread by the host before granting.
    pub fn load_local_file(&self, url: &str, directory_url: &str) -> Result<(), String> {
        self.inner.load_local_file(url, directory_url)
    }
    pub fn back(&self) {
        self.inner.command("goBack");
    }
    pub fn forward(&self) {
        self.inner.command("goForward");
    }
    pub fn reload(&self) {
        self.inner.command("reload");
    }
    pub fn stop(&self) {
        self.inner.command("stopLoading");
    }
    pub fn state(&self) -> PageState {
        self.inner.state()
    }
    /// Opaque WebKit-owned session history, bounded to 64 KiB per tab.
    pub fn interaction_state(&self) -> Option<Vec<u8>> {
        self.inner.interaction_state()
    }
    pub fn restore_interaction(&self, bytes: &[u8]) -> Result<(), String> {
        self.inner.restore_interaction(bytes)
    }
    pub fn drain_events(&self) -> Vec<Event> {
        self.inner.drain_events()
    }
    pub fn focus(&self) {
        self.inner.focus(true);
    }
    pub fn focus_rune(&self) {
        self.inner.focus(false);
    }
    pub fn set_background(&self, rgba: [f64; 4]) {
        self.inner.set_background(rgba);
    }
    pub fn evaluate(&self, js: &str, callback: impl FnOnce(Result<String, String>) + 'static) {
        self.inner.evaluate(js, Box::new(callback));
    }
    /// Async body in a private content world, sharing DOM but no page JavaScript globals.
    pub fn evaluate_isolated(
        &self,
        js: &str,
        callback: impl FnOnce(Result<String, String>) + 'static,
    ) {
        self.inner.evaluate_isolated(js, Box::new(callback));
    }
    /// Delivers to the sandbox iframe of the existing gateway frame shell (not a replacement
    /// for that shell or its CSP). A top-level canvas-like page receives a normal MessageEvent.
    pub fn post_message(&self, value: &serde_json::Value) {
        let js = format!(
            "(()=>{{const m={value};const f=document.querySelector('iframe');if(f)f.contentWindow.postMessage(m,'*');else window.postMessage(m,'*')}})()"
        );
        self.evaluate(&js, |_| {});
    }
    /// PNG encoding occurs in WebKit's asynchronous snapshot completion, never per frame.
    pub fn snapshot(&self, callback: impl FnOnce(Result<Vec<u8>, String>) + 'static) {
        self.inner.snapshot(None, Box::new(callback));
    }
    pub fn snapshot_region(
        &self,
        rect: Rect,
        callback: impl FnOnce(Result<Vec<u8>, String>) + 'static,
    ) {
        self.inner.snapshot(Some(rect), Box::new(callback));
    }
    pub fn native_frame(&self) -> Option<Rect> {
        self.inner.native_frame()
    }
    pub fn is_visible(&self) -> bool {
        self.inner.is_visible()
    }

    /// A Rune element with mount lifetime tracking and animated, drawn-layout positioning.
    /// Unmounting the last host hides it. One host per WebView; don't clone into two windows.
    pub fn host<S: 'static>(&self, key: &'static str) -> rune::El {
        self.mounts.set(self.mounts.get() + 1);
        let lease = Mount(self.clone());
        let live = self.inner.track(self.mounts.clone());
        rune::el()
            .key(key)
            .drawn_rect_into(&live)
            .on_drawn_layout_tx(move |_: &mut S, _, tx| {
                let _keep_mounted = &lease;
                tx.live_only();
            })
    }
}

struct Mount(WebView);
impl Drop for Mount {
    fn drop(&mut self) {
        let count = self.0.mounts.get() - 1;
        self.0.mounts.set(count);
        if count == 0 {
            self.0.hide();
        }
    }
}

pub(crate) type Completion = Box<dyn FnOnce(Result<String, String>)>;
pub(crate) type SnapshotCompletion = Box<dyn FnOnce(Result<Vec<u8>, String>)>;

#[cfg(test)]
mod tests;
