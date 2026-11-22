//! All AppKit/WebKit ownership and unsafe messaging lives here. Main-thread invariant is
//! checked at construction; Rc handles cannot cross threads. Delegates never retain a surface.
use super::*;
use block2::{Block, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject};
use objc2::{
    ClassType, DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send, sel,
};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_foundation::{NSObject, NSObjectProtocol, NSString};
use objc2_web_kit::WKWebView;
use raw_window_handle::RawWindowHandle;
use std::{cell::RefCell, collections::VecDeque};

mod delegate;
use delegate::{Delegate, Shared};

const BRIDGE: &str = include_str!("bridge.js");
const OBSERVED: &[&str] = &[
    "title",
    "URL",
    "loading",
    "estimatedProgress",
    "canGoBack",
    "canGoForward",
];

pub struct Surface {
    options: RefCell<Options>,
    parent: RefCell<Option<Retained<AnyObject>>>,
    native: RefCell<Option<Native>>,
    pending: RefCell<Option<Content>>,
    placement: Cell<Option<(Rect, Rect)>>,
    covered: Cell<bool>,
    shared: Rc<Shared>,
    drawn: rune::Live<[f32; 4]>,
    observer: RefCell<
        Option<objc2_core_foundation::CFRetained<objc2_core_foundation::CFRunLoopObserver>>,
    >,
}

enum Content {
    Url(String),
    Html(String, Option<String>),
}
struct Native {
    view: Retained<AnyObject>,
    container: Retained<AnyObject>,
    delegate: Retained<Delegate>,
    monitor: Option<Retained<AnyObject>>,
    visible: bool,
}

pub(super) fn rect(r: Rect) -> CGRect {
    CGRect {
        origin: CGPoint { x: r[0], y: r[1] },
        size: CGSize {
            width: r[2],
            height: r[3],
        },
    }
}
pub(super) unsafe fn string(object: *mut AnyObject) -> String {
    if object.is_null() {
        return String::new();
    }
    unsafe { (&*object.cast::<NSString>()).to_string() }
}
pub(super) unsafe fn url_string(object: *mut AnyObject) -> String {
    if object.is_null() {
        return String::new();
    }
    unsafe { string(msg_send![object, absoluteString]) }
}
unsafe fn object(class: &std::ffi::CStr) -> Retained<AnyObject> {
    unsafe { msg_send![AnyClass::get(class).expect("system framework class"), new] }
}

impl Surface {
    pub fn new(options: Options) -> Self {
        assert!(
            MainThreadMarker::new().is_some(),
            "WebView requires the main thread"
        );
        let shared = Rc::new(Shared {
            events: RefCell::new(VecDeque::new()),
            state: RefCell::new(PageState::default()),
            navigation: options.navigation.clone(),
            wake: options.wake.clone(),
        });
        Self {
            options: RefCell::new(options),
            parent: RefCell::new(None),
            native: RefCell::new(None),
            pending: RefCell::new(None),
            placement: Cell::new(None),
            covered: Cell::new(false),
            shared,
            drawn: rune::Live::new([0.0; 4]),
            observer: RefCell::new(None),
        }
    }

    /// Rune's on_drawn_layout callback intentionally skips spring frames. The live rect
    /// binding does not: sample it at the runloop's pre-sleep boundary, after Rune's draw,
    /// before Core Animation commits. This requests no frames and does not rebuild the view.
    pub fn track(self: &Rc<Self>, mounts: Rc<Cell<usize>>) -> rune::Live<[f32; 4]> {
        use objc2_core_foundation::{
            CFRunLoop, CFRunLoopActivity, CFRunLoopObserver, kCFRunLoopCommonModes,
        };
        if self.observer.borrow().is_none() {
            let weak = Rc::downgrade(self);
            let block = RcBlock::new(move |_: *mut CFRunLoopObserver, _: CFRunLoopActivity| {
                if mounts.get() == 0 {
                    return;
                }
                if let Some(surface) = weak.upgrade() {
                    let r = surface.drawn.get().map(f64::from);
                    if surface.placement.get() != Some((r, r)) {
                        if let Err(error) = surface.present(r, r) {
                            surface.shared.emit(Event::Error(error));
                        }
                    }
                }
            });
            unsafe {
                let observer = CFRunLoopObserver::with_handler(
                    None,
                    CFRunLoopActivity::BeforeWaiting.0,
                    true,
                    0,
                    Some(&block),
                );
                let main = CFRunLoop::main().unwrap();
                main.add_observer(observer.as_deref(), kCFRunLoopCommonModes);
                *self.observer.borrow_mut() = observer;
            }
        }
        self.drawn.clone()
    }

    pub fn attach(&self, handle: RawWindowHandle) -> Result<(), String> {
        let RawWindowHandle::AppKit(handle) = handle else {
            return Err("not an AppKit window".into());
        };
        // winit's borrowed NSView becomes a retained reference for the surface lifetime.
        let view = unsafe { Retained::retain(handle.ns_view.as_ptr().cast::<AnyObject>()) }
            .ok_or("missing NSView")?;
        if let Some(n) = self.native.borrow_mut().as_mut() {
            unsafe {
                let _: () = msg_send![&*n.container, removeFromSuperview];
                let _: () = msg_send![&*view, addSubview: &*n.container];
                if let Some(monitor) = n.monitor.take() {
                    let _: () = msg_send![AnyClass::get(c"NSEvent").unwrap(), removeMonitor: &*monitor];
                }
                n.monitor = delegate::key_monitor(&view, &n.view, self.shared.clone());
            }
        }
        *self.parent.borrow_mut() = Some(view);
        self.placement.set(None);
        Ok(())
    }

    fn create(&self) -> Result<(), String> {
        if self.native.borrow().is_some() {
            return Ok(());
        }
        let parent = self.parent.borrow();
        let parent = parent
            .as_deref()
            .ok_or("attach the surface before presenting")?;
        let options = self.options.borrow();
        // Every surface has its own nonpersistent store. No cookies, cache, process pools or
        // host script handlers are shared with a browser guest or another canvas.
        unsafe {
            let config = object(c"WKWebViewConfiguration");
            let store: Retained<AnyObject> = msg_send![
                AnyClass::get(c"WKWebsiteDataStore").unwrap(),
                nonPersistentDataStore
            ];
            let _: () = msg_send![&*config, setWebsiteDataStore: &*store];
            let delegate = Delegate::new(self.shared.clone());
            let controller: *mut AnyObject = msg_send![&*config, userContentController];
            let _: () = msg_send![controller, addScriptMessageHandler: &*delegate, name: &*NSString::from_str("ocFocus")];
            let alloc: *mut AnyObject = msg_send![AnyClass::get(c"WKUserScript").unwrap(), alloc];
            let focus: *mut AnyObject = msg_send![alloc, initWithSource: &*NSString::from_str(include_str!("focus.js")), injectionTime: 0isize, forMainFrameOnly: true];
            let focus = Retained::from_raw(focus).ok_or("focus script initialization failed")?;
            let _: () = msg_send![controller, addUserScript: &*focus];
            if options.bridge {
                let controller: *mut AnyObject = msg_send![&*config, userContentController];
                let name = NSString::from_str("ocHost");
                let _: () =
                    msg_send![controller, addScriptMessageHandler: &*delegate, name: &*name];
                let alloc: *mut AnyObject =
                    msg_send![AnyClass::get(c"WKUserScript").unwrap(), alloc];
                let script: *mut AnyObject = msg_send![alloc, initWithSource: &*NSString::from_str(BRIDGE), injectionTime: 0isize, forMainFrameOnly: true];
                let script =
                    Retained::from_raw(script).ok_or("WKUserScript initialization failed")?;
                let _: () = msg_send![controller, addUserScript: &*script];
            }
            let alloc: *mut AnyObject = msg_send![WKWebView::class(), alloc];
            let view: *mut AnyObject =
                msg_send![alloc, initWithFrame: rect([0.0; 4]), configuration: &*config];
            let view = Retained::from_raw(view).ok_or("WKWebView initialization failed")?;
            let _: () = msg_send![&*view, setNavigationDelegate: &*delegate];
            let _: () = msg_send![&*view, setUIDelegate: &*delegate];
            let _: () = msg_send![&*view, setWantsLayer: true];
            // A clipped NSView parent handles BOTH painting and native hit-testing. A layer
            // mask alone would leave invisible web controls clickable outside the clip.
            let container = object(c"NSView");
            let _: () = msg_send![&*container, setWantsLayer: true];
            let layer: *mut AnyObject = msg_send![&*container, layer];
            let _: () = msg_send![layer, setMasksToBounds: true];
            // Rune's material compositor uses z=1 for Metal. Our interactive surface is above it.
            let _: () = msg_send![layer, setZPosition: 2.0f64];
            if cfg!(debug_assertions) {
                let _: () = msg_send![&*view, setInspectable: true];
                let preferences: *mut AnyObject = msg_send![&*config, preferences];
                let _: () = msg_send![preferences, setValue: &*objc2_foundation::NSNumber::new_bool(true), forKey: &*NSString::from_str("developerExtrasEnabled")];
            }
            for key in OBSERVED {
                let _: () = msg_send![&*view, addObserver: &*delegate, forKeyPath: &*NSString::from_str(key), options: 0usize, context: std::ptr::null_mut::<std::ffi::c_void>()];
            }
            let _: () = msg_send![&*container, addSubview: &*view];
            let _: () = msg_send![parent, addSubview: &*container];
            let monitor = delegate::key_monitor(parent, &view, self.shared.clone());
            *self.native.borrow_mut() = Some(Native {
                view,
                container,
                delegate,
                monitor,
                visible: true,
            });
        }
        drop(options);
        let background = self.options.borrow().background;
        self.set_background(background);
        if let Some(content) = self.pending.borrow_mut().take() {
            self.load(content)?;
        }
        Ok(())
    }

    pub fn present(&self, r: Rect, clip: Rect) -> Result<(), String> {
        if r.iter().chain(clip.iter()).any(|v| !v.is_finite()) {
            return Err("nonfinite webview rect".into());
        }
        if r[2] <= 0.0 || r[3] <= 0.0 {
            self.hide();
            return Ok(());
        }
        self.create()?;
        let changed = self.placement.get() != Some((r, clip));
        self.placement.set(Some((r, clip)));
        let mut native = self.native.borrow_mut();
        let Some(n) = native.as_mut() else {
            return Ok(());
        };
        // NSView points automatically follow the window's backing scale (don't multiply by DPR).
        // Use a layer mask to retain document viewport dimensions when ancestor clipping changes.
        if changed {
            let parent = self.parent.borrow();
            let parent = parent.as_deref().ok_or("missing parent")?;
            unsafe {
                let bounds: CGRect = msg_send![parent, bounds];
                let flipped: bool = msg_send![parent, isFlipped];
                let left = r[0].max(clip[0]);
                let top = r[1].max(clip[1]);
                let width = (r[0] + r[2]).min(clip[0] + clip[2]) - left;
                let height = (r[1] + r[3]).min(clip[1] + clip[3]) - top;
                let (width, height) = (width.max(0.0), height.max(0.0));
                let y = if flipped {
                    top
                } else {
                    bounds.size.height - top - height
                };
                let transaction = AnyClass::get(c"CATransaction").unwrap();
                let _: () = msg_send![transaction, begin];
                let _: () = msg_send![transaction, setDisableActions: true];
                let _: () = msg_send![&*n.container, setFrame: rect([left, y, width, height])];
                // The ordinary NSView container is unflipped. The child retains the full
                // viewport, offset under its parent's visible intersection.
                let _: () = msg_send![&*n.view, setFrame: rect([r[0] - left, top + height - r[1] - r[3], r[2], r[3]])];
                let _: () = msg_send![transaction, commit];
            }
        }
        Self::visibility(n, !self.covered.get());
        Ok(())
    }

    fn visibility(n: &mut Native, shown: bool) {
        if n.visible == shown {
            return;
        }
        n.visible = shown;
        unsafe {
            let _: () = msg_send![&*n.view, setHidden: !shown];
            let _: () = msg_send![&*n.container, setHidden: !shown];
            let _: () = msg_send![&*n.view, setAllMediaPlaybackSuspended: !shown, completionHandler: None::<&Block<dyn Fn()>>];
        }
    }
    pub fn hide(&self) {
        self.placement.set(None);
        if let Some(n) = self.native.borrow_mut().as_mut() {
            Self::visibility(n, false);
        }
    }
    pub fn set_covered(&self, on: bool) {
        self.covered.set(on);
        if on {
            self.focus(false);
        }
        if let Some(n) = self.native.borrow_mut().as_mut() {
            Self::visibility(n, !on && self.placement.get().is_some());
        }
    }
    pub fn load_url(&self, url: &str) -> Result<(), String> {
        if self.shared.navigation.decide(url, true) != Decision::Allow {
            return Err("navigation denied".into());
        }
        self.load(Content::Url(url.into()))
    }
    pub fn load_html(&self, html: &str, base: Option<&str>) -> Result<(), String> {
        if let Some(base) = base {
            if self.shared.navigation.decide(base, true) != Decision::Allow {
                return Err("base URL denied".into());
            }
        }
        self.load(Content::Html(html.into(), base.map(str::to_owned)))
    }
    fn load(&self, content: Content) -> Result<(), String> {
        let native = self.native.borrow();
        let Some(n) = native.as_ref() else {
            *self.pending.borrow_mut() = Some(content);
            return Ok(());
        };
        unsafe {
            let url = |s: &str| -> *mut AnyObject {
                msg_send![AnyClass::get(c"NSURL").unwrap(), URLWithString: &*NSString::from_str(s)]
            };
            match content {
                Content::Url(s) => {
                    let request: Retained<AnyObject> =
                        msg_send![AnyClass::get(c"NSURLRequest").unwrap(), requestWithURL: url(&s)];
                    let _: *mut AnyObject = msg_send![&*n.view, loadRequest: &*request];
                }
                Content::Html(html, base) => {
                    let base = base.as_deref().map(url).unwrap_or(std::ptr::null_mut());
                    let _: *mut AnyObject = msg_send![&*n.view, loadHTMLString: &*NSString::from_str(&html), baseURL: base];
                }
            }
        }
        Ok(())
    }
    pub fn command(&self, command: &str) {
        if let Some(n) = self.native.borrow().as_ref() {
            unsafe {
                match command {
                    "goBack" => {
                        let _: *mut AnyObject = msg_send![&*n.view, goBack];
                    }
                    "goForward" => {
                        let _: *mut AnyObject = msg_send![&*n.view, goForward];
                    }
                    "reload" => {
                        let _: *mut AnyObject = msg_send![&*n.view, reload];
                    }
                    _ => {
                        let _: () = msg_send![&*n.view, stopLoading];
                    }
                }
            }
        }
    }
    pub fn state(&self) -> PageState {
        self.shared.state.borrow().clone()
    }
    pub fn drain_events(&self) -> Vec<Event> {
        self.shared.events.borrow_mut().drain(..).collect()
    }
    pub fn focus(&self, web: bool) {
        let parent = self.parent.borrow();
        if let Some(parent) = parent.as_deref() {
            unsafe {
                let window: *mut AnyObject = msg_send![parent, window];
                let native = self.native.borrow();
                let responder = if web {
                    native
                        .as_ref()
                        .filter(|n| n.visible)
                        .map(|n| &*n.view)
                        .unwrap_or(parent)
                } else {
                    parent
                };
                let _: bool = msg_send![window, makeFirstResponder: responder];
            }
        }
    }
    pub fn set_background(&self, rgba: [f64; 4]) {
        self.options.borrow_mut().background = rgba;
        if let Some(n) = self.native.borrow().as_ref() {
            unsafe {
                let color: Retained<AnyObject> = msg_send![AnyClass::get(c"NSColor").unwrap(), colorWithSRGBRed: rgba[0], green: rgba[1], blue: rgba[2], alpha: rgba[3]];
                let _: () = msg_send![&*n.view, setUnderPageBackgroundColor: &*color];
            }
        }
    }
    pub fn evaluate(&self, js: &str, callback: Completion) {
        let native = self.native.borrow();
        let Some(n) = native.as_ref() else {
            callback(Err("webview not created".into()));
            return;
        };
        let callback = RefCell::new(Some(callback));
        let block = RcBlock::new(move |value: *mut AnyObject, error: *mut AnyObject| {
            let result = unsafe {
                if !error.is_null() {
                    Err(string(msg_send![error, localizedDescription]))
                } else if value.is_null() {
                    Ok("null".into())
                } else {
                    Ok(string(msg_send![value, description]))
                }
            };
            if let Some(callback) = callback.borrow_mut().take() {
                callback(result);
            }
        });
        unsafe {
            let _: () = msg_send![&*n.view, evaluateJavaScript: &*NSString::from_str(js), completionHandler: &*block];
        }
    }
    pub fn snapshot(&self, callback: SnapshotCompletion) {
        let native = self.native.borrow();
        let Some(n) = native.as_ref() else {
            callback(Err("webview not created".into()));
            return;
        };
        let callback = RefCell::new(Some(callback));
        let block = RcBlock::new(move |image: *mut AnyObject, error: *mut AnyObject| {
            let result = unsafe {
                if !error.is_null() {
                    Err(string(msg_send![error, localizedDescription]))
                } else if image.is_null() {
                    Err("empty snapshot".into())
                } else {
                    encode_png(image)
                }
            };
            if let Some(callback) = callback.borrow_mut().take() {
                callback(result);
            }
        });
        unsafe {
            let _: () = msg_send![&*n.view, takeSnapshotWithConfiguration: std::ptr::null::<AnyObject>(), completionHandler: &*block];
        }
    }
    pub fn native_frame(&self) -> Option<Rect> {
        let parent = self.parent.borrow();
        let parent = parent.as_deref()?;
        self.native.borrow().as_ref().map(|n| unsafe {
            let bounds: CGRect = msg_send![&*n.view, bounds];
            let r: CGRect = msg_send![&*n.view, convertRect: bounds, toView: parent];
            [r.origin.x, r.origin.y, r.size.width, r.size.height]
        })
    }
    pub fn is_visible(&self) -> bool {
        self.native.borrow().as_ref().is_some_and(|n| unsafe {
            let hidden: bool = msg_send![&*n.view, isHidden];
            !hidden
        })
    }
}

unsafe fn encode_png(image: *mut AnyObject) -> Result<Vec<u8>, String> {
    unsafe {
        let tiff: Option<Retained<AnyObject>> = msg_send![image, TIFFRepresentation];
        let tiff = tiff.ok_or("snapshot has no bitmap representation")?;
        let bitmap: Option<Retained<AnyObject>> =
            msg_send![AnyClass::get(c"NSBitmapImageRep").unwrap(), imageRepWithData: &*tiff];
        let bitmap = bitmap.ok_or("snapshot bitmap decode failed")?;
        let dict = object(c"NSDictionary");
        let data: Option<Retained<AnyObject>> =
            msg_send![&*bitmap, representationUsingType: 4usize, properties: &*dict];
        let data = data.ok_or("snapshot PNG encoding failed")?;
        let len: usize = msg_send![&*data, length];
        let bytes: *const std::ffi::c_void = msg_send![&*data, bytes];
        if bytes.is_null() || len == 0 {
            return Err("empty snapshot PNG".into());
        }
        Ok(std::slice::from_raw_parts(bytes.cast::<u8>(), len).to_vec())
    }
}

impl Drop for Native {
    fn drop(&mut self) {
        unsafe {
            for key in OBSERVED {
                let _: () = msg_send![&*self.view, removeObserver: &*self.delegate, forKeyPath: &*NSString::from_str(key)];
            }
            let config: *mut AnyObject = msg_send![&*self.view, configuration];
            let controller: *mut AnyObject = msg_send![config, userContentController];
            let _: () = msg_send![controller, removeScriptMessageHandlerForName: &*NSString::from_str("ocHost")];
            let _: () = msg_send![controller, removeScriptMessageHandlerForName: &*NSString::from_str("ocFocus")];
            let _: () =
                msg_send![&*self.view, setNavigationDelegate: std::ptr::null::<AnyObject>()];
            let _: () = msg_send![&*self.view, setUIDelegate: std::ptr::null::<AnyObject>()];
            let _: () = msg_send![&*self.view, stopLoading];
            let _: () = msg_send![&*self.view, removeFromSuperview];
            let _: () = msg_send![&*self.container, removeFromSuperview];
            if let Some(monitor) = self.monitor.take() {
                let _: () = msg_send![AnyClass::get(c"NSEvent").unwrap(), removeMonitor: &*monitor];
            }
        }
    }
}

impl Drop for Surface {
    fn drop(&mut self) {
        if let Some(observer) = self.observer.get_mut().take() {
            observer.invalidate();
        }
    }
}
