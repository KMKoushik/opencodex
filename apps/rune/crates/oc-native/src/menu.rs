//! Electron 44.4.5's default macOS menu, without invented application commands.
//! Responder roles target AppKit/Rune's first responder, never a second editor.
pub fn install() {
    #[cfg(target_os = "macos")]
    mac::install();
}
pub fn look_up(text: &str, point: (f32, f32)) {
    #[cfg(target_os = "macos")]
    mac::look_up(text, point);
    #[cfg(not(target_os = "macos"))]
    let _ = (text, point);
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, Sel};
    use objc2::{MainThreadMarker, class, msg_send, sel};
    use objc2_foundation::NSString;

    const CMD: usize = 1 << 20;
    const SHIFT: usize = 1 << 17;
    const ALT: usize = 1 << 19;
    const CTRL: usize = 1 << 18;

    pub fn look_up(text: &str, point: (f32, f32)) {
        if MainThreadMarker::new().is_none() {
            return;
        }
        unsafe {
            let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let window: *mut AnyObject = msg_send![app, keyWindow];
            if window.is_null() {
                return;
            }
            let view: *mut AnyObject = msg_send![window, contentView];
            if view.is_null() {
                return;
            }
            let allocated: *mut AnyObject = msg_send![class!(NSAttributedString), alloc];
            let attributed: *mut AnyObject =
                msg_send![allocated, initWithString: &*NSString::from_str(text)];
            let attributed = Retained::from_raw(attributed).expect("lookup attributed string");
            let flipped: bool = msg_send![view, isFlipped];
            let bounds: objc2_foundation::NSRect = msg_send![view, bounds];
            let y = if flipped {
                point.1 as f64
            } else {
                bounds.size.height - point.1 as f64
            };
            let _: () = msg_send![view, showDefinitionForAttributedString: &*attributed, atPoint: objc2_foundation::NSPoint::new(point.0 as f64, y)];
        }
    }

    unsafe fn menu(title: &str) -> Retained<AnyObject> {
        unsafe {
            let allocated: *mut AnyObject = msg_send![class!(NSMenu), alloc];
            let initialized: *mut AnyObject =
                msg_send![allocated, initWithTitle: &*NSString::from_str(title)];
            Retained::from_raw(initialized).expect("NSMenu allocation")
        }
    }
    unsafe fn item(
        menu: &AnyObject,
        title: &str,
        action: Option<Sel>,
        key: &str,
        mods: usize,
    ) -> Retained<AnyObject> {
        unsafe {
            let allocated: *mut AnyObject = msg_send![class!(NSMenuItem), alloc];
            let initialized: *mut AnyObject = msg_send![allocated,
                initWithTitle: &*NSString::from_str(title),
                action: action,
                keyEquivalent: &*NSString::from_str(key)];
            let item = Retained::from_raw(initialized).expect("NSMenuItem allocation");
            let _: () = msg_send![&item, setKeyEquivalentModifierMask: mods];
            let _: () = msg_send![menu, addItem: &*item];
            item
        }
    }
    unsafe fn separator(menu: &AnyObject) {
        unsafe {
            let line: Retained<AnyObject> = msg_send![class!(NSMenuItem), separatorItem];
            let _: () = msg_send![menu, addItem: &*line];
        }
    }
    unsafe fn submenu(root: &AnyObject, title: &str) -> Retained<AnyObject> {
        unsafe {
            let child = menu(title);
            let entry = item(root, title, None, "", 0);
            let _: () = msg_send![&entry, setSubmenu: &*child];
            child
        }
    }
    pub fn install() {
        if MainThreadMarker::new().is_none() {
            return;
        }
        unsafe {
            let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let root = menu("");
            let application = submenu(&root, "OpenCodex");
            item(
                &application,
                "About OpenCodex",
                Some(sel!(orderFrontStandardAboutPanel:)),
                "",
                0,
            );
            separator(&application);
            let services = submenu(&application, "Services");
            let _: () = msg_send![app, setServicesMenu: &*services];
            separator(&application);
            item(&application, "Hide OpenCodex", Some(sel!(hide:)), "h", CMD);
            item(
                &application,
                "Hide Others",
                Some(sel!(hideOtherApplications:)),
                "h",
                CMD | ALT,
            );
            item(
                &application,
                "Show All",
                Some(sel!(unhideAllApplications:)),
                "",
                0,
            );
            separator(&application);
            item(
                &application,
                "Quit OpenCodex",
                Some(sel!(terminate:)),
                "q",
                CMD,
            );
            let file = submenu(&root, "File");
            item(&file, "Close Window", Some(sel!(performClose:)), "w", CMD);
            let edit = submenu(&root, "Edit");
            item(&edit, "Undo", Some(sel!(undo:)), "z", CMD);
            item(&edit, "Redo", Some(sel!(redo:)), "z", CMD | SHIFT);
            separator(&edit);
            item(&edit, "Cut", Some(sel!(cut:)), "x", CMD);
            item(&edit, "Copy", Some(sel!(copy:)), "c", CMD);
            item(&edit, "Paste", Some(sel!(paste:)), "v", CMD);
            item(
                &edit,
                "Paste and Match Style",
                Some(sel!(pasteAsPlainText:)),
                "v",
                CMD | ALT | SHIFT,
            );
            item(&edit, "Delete", Some(sel!(delete:)), "", 0);
            item(&edit, "Select All", Some(sel!(selectAll:)), "a", CMD);
            separator(&edit);
            let substitutions = submenu(&edit, "Substitutions");
            item(
                &substitutions,
                "Show Substitutions",
                Some(sel!(orderFrontSubstitutionsPanel:)),
                "",
                0,
            );
            separator(&substitutions);
            item(
                &substitutions,
                "Smart Quotes",
                Some(sel!(toggleAutomaticQuoteSubstitution:)),
                "",
                0,
            );
            item(
                &substitutions,
                "Smart Dashes",
                Some(sel!(toggleAutomaticDashSubstitution:)),
                "",
                0,
            );
            item(
                &substitutions,
                "Text Replacement",
                Some(sel!(toggleAutomaticTextReplacement:)),
                "",
                0,
            );
            let speech = submenu(&edit, "Speech");
            item(&speech, "Start Speaking", Some(sel!(startSpeaking:)), "", 0);
            item(&speech, "Stop Speaking", Some(sel!(stopSpeaking:)), "", 0);
            let view = submenu(&root, "View");
            // Rune has no Chromium document, reload/cache, DevTools or document zoom.
            // Preserve the source menu, but don't advertise a fabricated operation.
            for (title, key, mods) in [
                ("Reload", "r", CMD),
                ("Force Reload", "r", CMD | SHIFT),
                ("Toggle Developer Tools", "i", CMD | ALT),
            ] {
                item(&view, title, None, key, mods);
            }
            separator(&view);
            for (title, key) in [("Actual Size", "0"), ("Zoom In", "+"), ("Zoom Out", "-")] {
                item(&view, title, None, key, CMD);
            }
            separator(&view);
            item(
                &view,
                "Toggle Full Screen",
                Some(sel!(toggleFullScreen:)),
                "f",
                CMD | CTRL,
            );
            let window = submenu(&root, "Window");
            item(
                &window,
                "Minimize",
                Some(sel!(performMiniaturize:)),
                "m",
                CMD,
            );
            item(&window, "Zoom", Some(sel!(performZoom:)), "", 0);
            separator(&window);
            item(
                &window,
                "Bring All to Front",
                Some(sel!(arrangeInFront:)),
                "",
                0,
            );
            let _: () = msg_send![app, setWindowsMenu: &*window];
            let _: () = msg_send![app, setMainMenu: &*root];
        }
    }
}
