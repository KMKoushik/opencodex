//! The public AppKit hook is NSView::willOpenMenu:withEvent:, not WKUIDelegate.
//! Keep WebKit-owned text/spelling actions (their targets belong to WKContentView).
use super::*;

#[derive(Default)]
pub struct MenuState {
    browser: bool,
}
define_class!(
    #[unsafe(super(WKWebView))]
    #[thread_kind = MainThreadOnly]
    #[ivars = MenuState]
    pub struct BrowserView;
    unsafe impl NSObjectProtocol for BrowserView {}
    impl BrowserView {
        #[unsafe(method(willOpenMenu:withEvent:))]
        unsafe fn will_open(&self, menu: *mut AnyObject, event: *mut AnyObject) {
            unsafe {
                let _: () = msg_send![super(self), willOpenMenu: menu, withEvent: event];
                if !self.ivars().browser { return; }
                let count: isize = msg_send![menu, numberOfItems];
                // Do not fabricate new editing targets or guess whether a password has a
                // selection. WebKit's menu already knows the actual native editing state.
                for i in 0..count {
                    let item: *mut AnyObject = msg_send![menu, itemAtIndex: i];
                    let title = string(msg_send![item, title]);
                    let label = match title.as_str() {
                        "Open Link in New Window" => Some("Open Link in New Tab"),
                        "Download Linked File" | "Download Image" | "Open Image in New Window" => None,
                        "Copy Link" => Some("Copy Link"),
                        _ => continue,
                    };
                    // WebKit's New Window operation reaches createWebView... which emits
                    // NewWindow and is already routed to an owned tab by the application.
                    if let Some(label) = label {
                        let _: () = msg_send![item, setTitle: &*NSString::from_str(label)];
                    } else {
                        let _: () = msg_send![item, setHidden: true];
                    }
                }
            }
        }
    }
);
impl BrowserView {
    pub unsafe fn new(config: &AnyObject, browser: bool) -> Result<Retained<AnyObject>, String> {
        let alloc = Self::alloc(MainThreadMarker::new().unwrap()).set_ivars(MenuState { browser });
        let view: Option<Retained<Self>> = unsafe {
            msg_send![super(alloc), initWithFrame: rect([0.0; 4]), configuration: config]
        };
        view.and_then(|view| unsafe {
            Retained::retain((&*view as *const Self).cast_mut().cast::<AnyObject>())
        })
        .ok_or_else(|| "WKWebView initialization failed".into())
    }
}
