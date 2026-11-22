//! All native copy actions share a serialized AppKit writer. No subprocess or
//! readback: setString's BOOL is the only successful-write acknowledgement.
use std::sync::{
    OnceLock,
    atomic::{AtomicBool, Ordering},
    mpsc,
};

static ENABLED: AtomicBool = AtomicBool::new(false);
static WRITES: OnceLock<mpsc::SyncSender<String>> = OnceLock::new();

pub fn enable() {
    ENABLED.store(cfg!(target_os = "macos"), Ordering::Relaxed);
}

pub fn copy(tx: &mut rune::Tx, text: impl Into<String>) {
    let text = text.into();
    if !ENABLED.load(Ordering::Relaxed) {
        tx.copy(text);
        return;
    }
    let worker = WRITES.get_or_init(|| {
        let (send, receive) = mpsc::sync_channel::<String>(16);
        std::thread::spawn(move || {
            while let Ok(text) = receive.recv() {
                if !write(&text) {
                    eprintln!("Could not write to the system clipboard");
                }
            }
        });
        send
    });
    if worker.try_send(text).is_err() {
        eprintln!("Clipboard writer is busy or unavailable");
    }
}

#[cfg(target_os = "macos")]
pub fn write(text: &str) -> bool {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
    use objc2_foundation::NSString;
    objc2::rc::autoreleasepool(|_| {
        // SAFETY: NSPasteboard supports use from background threads; retained
        // objects stay in this autorelease scope. No native pointer escapes.
        unsafe {
            let board = NSPasteboard::generalPasteboard();
            board.clearContents();
            board.setString_forType(&NSString::from_str(text), NSPasteboardTypeString)
        }
    })
}

#[cfg(not(target_os = "macos"))]
pub fn write(_: &str) -> bool {
    false
}
