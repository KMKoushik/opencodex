//! macOS's native color panel, used by the web's color input as well. AppKit
//! stays on the main thread; callbacks publish only the latest value and wake.
use std::sync::Mutex;
pub mod notifications;
static CHANGED: Mutex<Option<(String, String)>> = Mutex::new(None);
static ACTIVE: Mutex<Option<(String, rune::Waker)>> = Mutex::new(None);
pub fn take_color() -> Option<(String, String)> {
    CHANGED.lock().unwrap().take()
}
pub fn open_color(key: String, color: &str, wake: rune::Waker) {
    #[cfg(target_os = "macos")]
    native::open(key, color, wake);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (key, color, wake);
    }
}
#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use objc2::rc::Retained;
    use objc2::{MainThreadMarker, MainThreadOnly, define_class, msg_send, sel};
    use objc2_app_kit::{NSColor, NSColorPanel, NSColorSpace};
    use objc2_foundation::NSObject;
    use std::cell::RefCell;
    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        struct ColorTarget;
        impl ColorTarget {
            #[unsafe(method(changeColor:))]
            fn change_color(&self,panel:&NSColorPanel) {
                let color=panel.color();
                let Some(color)=color.colorUsingColorSpace(&NSColorSpace::sRGBColorSpace()) else { return };
                let hex=format!("#{:02x}{:02x}{:02x}",(color.redComponent()*255.0).round() as u8,(color.greenComponent()*255.0).round() as u8,(color.blueComponent()*255.0).round() as u8);
                if let Some((key,wake))=ACTIVE.lock().unwrap().as_ref() { *CHANGED.lock().unwrap()=Some((key.clone(),hex)); wake(); }
            }
        }
    );
    thread_local! { static TARGET: RefCell<Option<Retained<ColorTarget>>> = const {RefCell::new(None)}; }
    pub fn open(key: String, hex: &str, wake: rune::Waker) {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        if hex.len() != 7
            || !hex.starts_with('#')
            || !hex[1..].bytes().all(|c| c.is_ascii_hexdigit())
        {
            return;
        }
        let components =
            [1, 3, 5].map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap() as f64 / 255.0);
        *ACTIVE.lock().unwrap() = Some((key, wake));
        TARGET.with(|slot| {
            let mut slot = slot.borrow_mut();
            let target =
                slot.get_or_insert_with(|| unsafe { msg_send![ColorTarget::alloc(mtm), init] });
            let panel = NSColorPanel::sharedColorPanel(mtm);
            let color = NSColor::colorWithSRGBRed_green_blue_alpha(
                components[0],
                components[1],
                components[2],
                1.0,
            );
            panel.setColor(&color);
            panel.setShowsAlpha(false);
            panel.setContinuous(true);
            unsafe {
                let _: () = msg_send![&panel,setTarget:&**target];
                let _: () = msg_send![&panel,setAction:sel!(changeColor:)];
            }
            panel.orderFront(None);
        });
    }
}
