use super::*;

pub struct Shared {
    pub events: RefCell<VecDeque<Event>>,
    pub state: RefCell<PageState>,
    pub navigation: Navigation,
    pub wake: Rc<dyn Fn()>,
}
impl Shared {
    pub fn emit(&self, event: Event) {
        // A hostile guest must not grow memory without bound while the app is hidden.
        let mut queue = self.events.borrow_mut();
        if matches!(event, Event::Changed(_)) {
            queue.retain(|e| !matches!(e, Event::Changed(_)));
        }
        if queue.len() >= 256 {
            queue.pop_front();
        }
        queue.push_back(event);
        drop(queue);
        (self.wake)();
    }
    unsafe fn changed(&self, view: *mut AnyObject) {
        let state = unsafe {
            PageState {
                title: string(msg_send![view, title]),
                url: url_string(msg_send![view, URL]),
                loading: msg_send![view, isLoading],
                progress: msg_send![view, estimatedProgress],
                can_go_back: msg_send![view, canGoBack],
                can_go_forward: msg_send![view, canGoForward],
            }
        };
        if *self.state.borrow() != state {
            *self.state.borrow_mut() = state.clone();
            self.emit(Event::Changed(state));
        }
    }
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = Rc<Shared>]
    pub struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    impl Delegate {
        #[unsafe(method(webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:))]
        unsafe fn media_permission(&self, _view: *mut AnyObject, _origin: *mut AnyObject, _frame: *mut AnyObject, _kind: isize, handler: &Block<dyn Fn(isize)>) {
            handler.call((2,)); // WKPermissionDecisionDeny; no silent camera/mic access.
        }

        #[unsafe(method(webView:requestDeviceOrientationAndMotionPermissionForOrigin:initiatedByFrame:decisionHandler:))]
        unsafe fn motion_permission(&self, _view: *mut AnyObject, _origin: *mut AnyObject, _frame: *mut AnyObject, handler: &Block<dyn Fn(isize)>) {
            handler.call((2,));
        }

        #[unsafe(method(observeValueForKeyPath:ofObject:change:context:))]
        unsafe fn observed(&self, _key: *mut AnyObject, object: *mut AnyObject, _change: *mut AnyObject, _context: *mut std::ffi::c_void) {
            unsafe { self.ivars().changed(object); }
        }

        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        unsafe fn decide(&self, _view: *mut AnyObject, action: *mut AnyObject, handler: &Block<dyn Fn(isize)>) {
            unsafe {
                let request: *mut AnyObject = msg_send![action, request];
                let url = url_string(msg_send![request, URL]);
                let frame: *mut AnyObject = msg_send![action, targetFrame];
                let main = frame.is_null() || { let yes: bool = msg_send![frame, isMainFrame]; yes };
                // nil target frames are handled by WKUIDelegate, never navigated here.
                let decision = self.ivars().navigation.decide(&url, main);
                match decision {
                    Decision::Allow => {let download:bool=msg_send![action,shouldPerformDownload];handler.call((if download{2}else{1},));},
                    Decision::Block => { self.ivars().emit(Event::Blocked(url)); handler.call((0,)); }
                    Decision::External => {
                        // Only HTTP(S) can reach this branch. Never pass arbitrary URL schemes
                        // (file:, javascript:, custom native handlers) to NSWorkspace.
                        let native_url: *mut AnyObject = msg_send![request, URL];
                        let workspace: Retained<AnyObject> = msg_send![AnyClass::get(c"NSWorkspace").unwrap(), sharedWorkspace];
                        let opened: bool = msg_send![&*workspace, openURL: native_url];
                        if !opened { self.ivars().emit(Event::Error("could not open system browser".into())); }
                        self.ivars().emit(Event::External(url)); handler.call((0,));
                    }
                }
            }
        }

        #[unsafe(method(webView:decidePolicyForNavigationResponse:decisionHandler:))]
        unsafe fn response_policy(&self,_view:*mut AnyObject,response:*mut AnyObject,handler:&Block<dyn Fn(isize)>) {
            let display:bool=unsafe{msg_send![response,canShowMIMEType]};
            handler.call((if display{1}else{2},));
        }
        #[unsafe(method(webView:navigationAction:didBecomeDownload:))]
        unsafe fn action_download(&self,_view:*mut AnyObject,_action:*mut AnyObject,download:*mut AnyObject){unsafe{let _:()=msg_send![download,setDelegate:self];}}
        #[unsafe(method(webView:navigationResponse:didBecomeDownload:))]
        unsafe fn response_download(&self,_view:*mut AnyObject,_response:*mut AnyObject,download:*mut AnyObject){unsafe{let _:()=msg_send![download,setDelegate:self];}}
        #[unsafe(method(download:decideDestinationUsingResponse:suggestedFilename:completionHandler:))]
        unsafe fn download_destination(&self,download:*mut AnyObject,_response:*mut AnyObject,name:*mut AnyObject,handler:&Block<dyn Fn(*mut AnyObject)>) {
            unsafe {
                let panel:Retained<AnyObject>=msg_send![AnyClass::get(c"NSSavePanel").unwrap(),savePanel];
                let _:()=msg_send![&*panel,setNameFieldStringValue:name];
                let manager: Retained<AnyObject> = msg_send![AnyClass::get(c"NSFileManager").unwrap(), defaultManager];
                let directories: Retained<AnyObject> = msg_send![&*manager, URLsForDirectory: 15usize, inDomains: 1usize];
                let directory: *mut AnyObject = msg_send![&*directories, firstObject];
                if !directory.is_null() { let _: () = msg_send![&*panel, setDirectoryURL: directory]; }
                let handler=handler.copy();let held=panel.clone();
                let completion=RcBlock::new(move|response:isize|{
                    let url=if response==1{msg_send![&*held,URL]}else{std::ptr::null_mut()};
                    handler.call((url,));
                });
                let view: *mut AnyObject = msg_send![download, webView];
                let window: *mut AnyObject = if view.is_null() { std::ptr::null_mut() } else { msg_send![view, window] };
                if window.is_null() {
                    let _:()=msg_send![&*panel,beginWithCompletionHandler:&*completion];
                } else {
                    let _:()=msg_send![&*panel,beginSheetModalForWindow:window,completionHandler:&*completion];
                }
            }
        }
        #[unsafe(method(download:didFailWithError:resumeData:))]
        unsafe fn download_failed(&self,_download:*mut AnyObject,error:*mut AnyObject,_data:*mut AnyObject){unsafe{self.ivars().emit(Event::Error(string(msg_send![error,localizedDescription])));}}

        #[unsafe(method(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        unsafe fn new_window(&self, _view: *mut AnyObject, _configuration: *mut AnyObject, action: *mut AnyObject, _features: *mut AnyObject) -> *mut AnyObject {
            unsafe {
                let request: *mut AnyObject = msg_send![action, request];
                let url = url_string(msg_send![request, URL]);
                if self.ivars().navigation.decide(&url, true) == Decision::Allow {
                    self.ivars().emit(Event::NewWindow(url));
                } else { self.ivars().emit(Event::Blocked(url)); }
            }
            std::ptr::null_mut()
        }

        #[unsafe(method(userContentController:didReceiveScriptMessage:))]
        unsafe fn message(&self, _controller: *mut AnyObject, message: *mut AnyObject) {
            unsafe {
                let body: *mut AnyObject = msg_send![message, body];
                let is_string: bool = msg_send![body, isKindOfClass: NSString::class()];
                if !is_string { return; }
                let json = string(body);
                let name = string(msg_send![message, name]);
                if name == "ocFocus" {
                    let request = match json.as_str() {
                        "next" => FocusRequest::Next,
                        "previous" => FocusRequest::Previous,
                        _ => return,
                    };
                    let view: *mut AnyObject = msg_send![message, webView];
                    let window: *mut AnyObject = msg_send![view, window];
                    let parent: *mut AnyObject = msg_send![window, contentView];
                    let _: bool = msg_send![window, makeFirstResponder: parent];
                    self.ivars().emit(Event::Focus(request));
                    return;
                }
                if json.len() > 1048576 || serde_json::from_str::<serde_json::Value>(&json).is_err() { return; }
                let frame: *mut AnyObject = msg_send![message, frameInfo];
                let main_frame: bool = msg_send![frame, isMainFrame];
                // The privileged bridge is main-frame-only. Subframes must go through the
                // sandbox shell's explicit postMessage forwarder instead.
                if !main_frame { return; }
                let request: *mut AnyObject = msg_send![frame, request];
                let url = url_string(msg_send![request, URL]);
                self.ivars().emit(Event::Message { json, url, main_frame });
            }
        }

        #[unsafe(method(webView:didFailProvisionalNavigation:withError:))]
        unsafe fn provisional_error(&self, _view: *mut AnyObject, _navigation: *mut AnyObject, error: *mut AnyObject) {
            unsafe { self.ivars().emit(Event::Error(string(msg_send![error, localizedDescription]))); }
        }
        #[unsafe(method(webView:didFailNavigation:withError:))]
        unsafe fn navigation_error(&self, _view: *mut AnyObject, _navigation: *mut AnyObject, error: *mut AnyObject) {
            unsafe { self.ivars().emit(Event::Error(string(msg_send![error, localizedDescription]))); }
        }
        #[unsafe(method(webViewWebContentProcessDidTerminate:))]
        fn terminated(&self, _view: *mut AnyObject) {
            self.ivars().emit(Event::Error("WebKit content process terminated".into()));
        }
    }
);

impl Delegate {
    pub fn new(shared: Rc<Shared>) -> Retained<Self> {
        use objc2::MainThreadOnly;
        let this = Self::alloc(MainThreadMarker::new().unwrap()).set_ivars(shared);
        unsafe { msg_send![super(this), init] }
    }
}

/// AppKit delivers keys to WKContentView rather than winit. Intercept only app shortcuts
/// while the responder is inside THIS surface. Standard browser editing/IME stays native.
pub unsafe fn key_monitor(
    parent: &AnyObject,
    view: &AnyObject,
    shared: Rc<Shared>,
) -> Option<Retained<AnyObject>> {
    let parent = unsafe { Retained::retain(parent as *const _ as *mut AnyObject) }?;
    let view = unsafe { Retained::retain(view as *const _ as *mut AnyObject) }?;
    let block = RcBlock::new(move |event: *mut AnyObject| -> *mut AnyObject {
        unsafe {
            let window: *mut AnyObject = msg_send![&*parent, window];
            let event_window: *mut AnyObject = msg_send![event, window];
            if window.is_null() || event_window != window {
                return event;
            }
            let responder: *mut AnyObject = msg_send![window, firstResponder];
            if responder.is_null() {
                return event;
            }
            let is_view: bool =
                msg_send![responder, isKindOfClass: AnyClass::get(c"NSView").unwrap()];
            if !is_view {
                return event;
            }
            let descendant: bool = msg_send![responder, isDescendantOf: &*view];
            if !descendant {
                return event;
            }
            let code: u16 = msg_send![event, keyCode];
            let flags: usize = msg_send![event, modifierFlags];
            let command = flags & (1 << 20) != 0;
            let request = if code == 37 && command {
                Some(FocusRequest::Location)
            } else if code == 53 {
                let supports: bool = msg_send![responder, respondsToSelector: sel!(hasMarkedText)];
                let composing: bool = supports && {
                    let marked: bool = msg_send![responder, hasMarkedText];
                    marked
                };
                if composing {
                    None
                } else {
                    Some(FocusRequest::Escape)
                }
            } else {
                None
            };
            if let Some(request) = request {
                let _: bool = msg_send![window, makeFirstResponder: &*parent];
                shared.emit(Event::Focus(request));
                std::ptr::null_mut()
            } else {
                event
            }
        }
    });
    unsafe {
        msg_send![AnyClass::get(c"NSEvent").unwrap(), addLocalMonitorForEventsMatchingMask: 1usize << 10, handler: &*block]
    }
}
