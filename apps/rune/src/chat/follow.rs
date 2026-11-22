//! Match Timeline's gesture-owned follow state. A distance report may resume
//! following, but must never mistake list measurement for a reading gesture.
use crate::State;
use rune::{El, Key};

pub fn viewport(view: El, reader: bool) -> El {
    view.on_wheel(move |s: &mut State, e, _| {
        let chat = super::conversation_mut(s, reader);
        if e.dy > 0.0 && !e.mods.ctrl && chat.position.get().offset[1] > 0.0 {
            chat.jump = true;
        }
        false
    })
    .on_key(move |s: &mut State, e, _| {
        if !e.mods.cmd && !e.mods.ctrl && matches!(e.key, Key::PageUp | Key::Home | Key::Up) {
            super::conversation_mut(s, reader).jump = true;
        }
        false
    })
    .on_background_press(move |s: &mut State| {
        let chat = super::conversation_mut(s, reader);
        let at = chat.position.get();
        if at.max[1] - at.offset[1] > 40.0 {
            chat.jump = true;
        }
    })
    .press_on_down()
}

pub fn resume(jump: &mut bool, distance: f32) -> bool {
    let changed = *jump && distance <= 40.0;
    if changed {
        *jump = false;
    }
    changed
}

#[cfg(test)]
mod tests {
    #[test]
    fn layout_never_stops_following_and_end_band_resumes_it() {
        let mut jump = false;
        assert!(!super::resume(&mut jump, 600.0));
        assert!(!jump);
        jump = true;
        assert!(!super::resume(&mut jump, 40.01));
        assert!(jump);
        assert!(super::resume(&mut jump, 40.0));
        assert!(!jump);
    }
}
