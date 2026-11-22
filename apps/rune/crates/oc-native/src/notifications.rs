//! Permission-only native boundary. rune-notify handles delivery but does not
//! expose the authorization result; never send a test banner to request access.
use std::sync::Mutex;
static RESULT: Mutex<Option<Result<bool, String>>> = Mutex::new(None);

pub fn take_permission() -> Option<Result<bool, String>> {
    RESULT.lock().unwrap().take()
}
pub fn request_permission(wake: rune::Waker) {
    #[cfg(target_os = "macos")]
    native::request(wake);
    #[cfg(not(target_os = "macos"))]
    {
        *RESULT.lock().unwrap() =
            Some(Err("Notifications are unavailable on this platform.".into()));
        wake();
    }
}
#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use objc2::{
        class, msg_send,
        runtime::{AnyObject, Bool},
    };
    #[link(name = "UserNotifications", kind = "framework")]
    unsafe extern "C" {}
    pub fn request(wake: rune::Waker) {
        // SAFETY: Foundation getters are thread-safe; the .app gate avoids the
        // exception raised by currentNotificationCenter in an unbundled binary.
        unsafe {
            let bundle: *mut AnyObject = msg_send![class!(NSBundle), mainBundle];
            let path: *mut AnyObject = msg_send![bundle, bundlePath];
            let id: *mut AnyObject = msg_send![bundle, bundleIdentifier];
            let bytes: *const std::ffi::c_char = msg_send![path, UTF8String];
            if id.is_null()
                || bytes.is_null()
                || !std::ffi::CStr::from_ptr(bytes)
                    .to_string_lossy()
                    .ends_with(".app")
            {
                *RESULT.lock().unwrap() = Some(Err(
                    "Notifications are available in installed builds, not development.".into(),
                ));
                wake();
                return;
            }
            let done = block2::RcBlock::new(move |granted: Bool, error: *mut AnyObject| {
                *RESULT.lock().unwrap() = Some(if error.is_null() {
                    Ok(granted.as_bool())
                } else {
                    Err("Notifications are unavailable in this app.".into())
                });
                wake();
            });
            let center: *mut AnyObject =
                msg_send![class!(UNUserNotificationCenter), currentNotificationCenter];
            // Alert only: match Electron's silent banners, never sound or badge.
            let _: () = msg_send![center, requestAuthorizationWithOptions: 4_usize, completionHandler: &*done];
        }
    }
}
