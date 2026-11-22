//! Finite, offscreen export. No display link, native redraw loop or screen capture.
use super::*;
use std::time::{Duration, Instant};

pub fn capture(
    html: &str,
    base: &str,
    size: [f64; 2],
    init: serde_json::Value,
) -> Result<Vec<u8>, String> {
    let _main = MainThreadMarker::new().ok_or("capture must run on the main thread")?;
    unsafe {
        let app: *mut AnyObject =
            msg_send![AnyClass::get(c"NSApplication").unwrap(), sharedApplication];
        let _: () = msg_send![app, finishLaunching];
        let alloc: *mut AnyObject = msg_send![AnyClass::get(c"NSWindow").unwrap(), alloc];
        let window: *mut AnyObject = msg_send![alloc, initWithContentRect: rect([0.0, 0.0, size[0], size[1]]), styleMask: 0usize, backing: 2usize, defer: false];
        let window = Retained::from_raw(window).ok_or("capture window initialization failed")?;
        let _: () = msg_send![&*window, setReleasedWhenClosed: false];
        let parent: *mut AnyObject = msg_send![&*window, contentView];
        let web = WebView::new(Options {
            bridge: true,
            navigation: Navigation {
                origins: vec![
                    url::Url::parse(base)
                        .map_err(|e| e.to_string())?
                        .origin()
                        .ascii_serialization(),
                ],
                ..Default::default()
            },
            ..Default::default()
        });
        *web.inner.parent.borrow_mut() = Retained::retain(parent);
        web.load_html(html, Some(base))?;
        web.present([0.0, 0.0, size[0], size[1]], [0.0, 0.0, size[0], size[1]])?;
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut initialized = false;
        let mut rendered = false;
        while !rendered {
            if Instant::now() >= deadline {
                return Err(format!(
                    "native canvas render timed out (initialized={initialized})"
                ));
            }
            pump();
            for event in web.drain_events() {
                match event {
                    Event::Message { json, .. } => {
                        let m: serde_json::Value = serde_json::from_str(&json).unwrap_or_default();
                        if m["channel"] != "opencodex-canvas" {
                            continue;
                        }
                        if m["type"] == "ready" && !initialized {
                            web.post_message(&init);
                            initialized = true;
                        } else if m["type"] == "capture-rendered" {
                            rendered = true;
                        } else if m["type"] == "error" {
                            return Err(m["message"].to_string());
                        }
                    }
                    Event::Error(e) | Event::Blocked(e) => return Err(e),
                    _ => {}
                }
            }
        }
        let result = Rc::new(RefCell::new(None));
        let out = result.clone();
        web.snapshot(move |value| *out.borrow_mut() = Some(value));
        loop {
            if let Some(value) = result.borrow_mut().take() {
                return value;
            }
            if Instant::now() >= deadline {
                return Err("native snapshot timed out".into());
            }
            pump();
        }
    }
}

fn pump() {
    // WebKit dispatches loading and snapshot completions on the AppKit run loop.
    // This is bounded by the one-shot capture deadline, never app frame work.
    unsafe {
        let run: *mut AnyObject = msg_send![AnyClass::get(c"NSRunLoop").unwrap(), currentRunLoop];
        let date: *mut AnyObject =
            msg_send![AnyClass::get(c"NSDate").unwrap(), dateWithTimeIntervalSinceNow: 0.01f64];
        let _: bool = msg_send![run, runMode: &*NSString::from_str("kCFRunLoopDefaultMode"), beforeDate: date];
    }
}
