//! Web overlay primitives. The renderer uses CSS-sized shadows (blur = 2σ).
//! These policies mirror the actual web controls: fixed context menus shift but
//! never flip; CSS anchored pickers flip; model/project pickers choose most room.
use crate::theme::Theme;
use rune::{Align, El, Side};

pub fn surface(t: &Theme, panel: El, radius: f32, fill: &str, border: &str) -> El {
    panel
        .radius(radius)
        .fill(t.c(fill))
        .border(1.0, t.c(border))
        .border_layout()
}

pub fn raised(t: &Theme, panel: El) -> El {
    t.shadow(panel, "shadow")
}

pub fn anchored(t: &Theme, panel: El, key: &str, side: Side, align: Align, gap: f32) -> El {
    raised(t, panel).anchored(key, side, align, gap)
}

#[derive(Clone, Copy)]
pub enum Collision {
    Shift,
    MostRoom,
}

pub fn position(
    anchor: [f32; 4],
    size: [f32; 2],
    window: (f32, f32),
    side: Side,
    align: Align,
    gap: f32,
    collision: Collision,
) -> [f32; 2] {
    let [x, y, w, h] = anchor;
    let [pw, ph] = size;
    let top = match collision {
        Collision::MostRoom => y > window.1 - y - h,
        Collision::Shift => matches!(side, Side::Top),
    };
    let left = match align {
        Align::End => x + w - pw,
        Align::Center => x + (w - pw) / 2.0,
        _ => x,
    };
    let y = if top { y - ph - gap } else { y + h + gap };
    [
        left.clamp(8.0, (window.0 - pw - 8.0).max(8.0)),
        y.clamp(8.0, (window.1 - ph - 8.0).max(8.0)),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn web_context_menus_shift_and_pickers_choose_the_roomier_side() {
        let window = (1280.0, 800.0);
        assert_eq!(
            position(
                [1112.0, 5.5, 28.0, 28.0],
                [180.0, 202.0],
                window,
                Side::Bottom,
                Align::End,
                4.0,
                Collision::Shift
            ),
            [960.0, 37.5]
        );
        assert_eq!(
            position(
                [1275.0, 795.0, 0.0, 0.0],
                [180.0, 202.0],
                window,
                Side::Bottom,
                Align::Start,
                0.0,
                Collision::Shift
            ),
            [1092.0, 590.0]
        );
        assert_eq!(
            position(
                [600.0, 600.0, 100.0, 30.0],
                [360.0, 216.0],
                window,
                Side::Bottom,
                Align::Center,
                4.0,
                Collision::MostRoom
            ),
            [470.0, 380.0]
        );
    }
}
