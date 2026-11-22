use super::*;
pub struct Surface;
impl Surface {
    pub fn new(_: Options) -> Self {
        Self
    }
    pub fn track(self: &Rc<Self>, _: Rc<Cell<usize>>) -> rune::Live<[f32; 4]> {
        rune::Live::new([0.0; 4])
    }
    pub fn attach(&self, _: raw_window_handle::RawWindowHandle) -> Result<(), String> {
        Ok(())
    }
    pub fn present(&self, _: Rect, _: Rect) -> Result<(), String> {
        Ok(())
    }
    pub fn hide(&self) {}
    pub fn set_covered(&self, _: bool) {}
    pub fn load_url(&self, _: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn load_html(&self, _: &str, _: Option<&str>) -> Result<(), String> {
        Ok(())
    }
    pub fn command(&self, _: &str) {}
    pub fn state(&self) -> PageState {
        PageState::default()
    }
    pub fn drain_events(&self) -> Vec<Event> {
        Vec::new()
    }
    pub fn focus(&self, _: bool) {}
    pub fn set_background(&self, _: [f64; 4]) {}
    pub fn evaluate(&self, _: &str, callback: Completion) {
        callback(Err("WKWebView requires macOS".into()));
    }
    pub fn snapshot(&self, callback: SnapshotCompletion) {
        callback(Err("WKWebView requires macOS".into()));
    }
    pub fn native_frame(&self) -> Option<Rect> {
        None
    }
    pub fn is_visible(&self) -> bool {
        false
    }
}
