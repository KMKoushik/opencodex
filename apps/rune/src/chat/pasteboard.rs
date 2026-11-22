//! AppKit writes with their actual BOOL result, isolated from the UI thread.
//! Unsafe AppKit access lives in the narrow oc-native boundary.
use rune::{Latest, Waker};
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct Writer {
    pending: Latest<(String, bool)>,
    pub result: Option<(String, bool)>,
    pub due: Option<Instant>,
}
impl Writer {
    pub fn request(&mut self, id: String, text: String, wake: Option<Waker>) {
        self.result = None;
        self.due = None;
        if let Some(wake) = wake {
            self.pending.set_waker(wake);
        }
        self.pending.request((id, text), |(id, text)| {
            let success = oc_native::clipboard::write(&text);
            (id, success)
        });
    }
    pub fn take(&mut self) -> bool {
        if let Some(result) = self.pending.take() {
            self.due = result.1.then(|| Instant::now() + Duration::from_secs(2));
            self.result = Some(result);
            return true;
        }
        if self.due.is_some_and(|due| Instant::now() >= due) {
            self.due = None;
            return true;
        }
        false
    }
}
