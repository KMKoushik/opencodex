//! Shared document-pill geometry for the native guest/session panels.
use crate::{State, sidebar::label};
use rune::{El, icon, row};

pub fn strip(name: &str) -> El {
    row()
        .min_w(0.0)
        .h(39.0)
        .pl(10.0)
        .gap(4.0)
        .center_y()
        .role("tablist")
        .label(name)
}
pub fn viewport(tabs: El) -> El {
    row().h(39.0).grow(1.0).min_w(0.0).scroll_x().child(tabs)
}
pub fn button(s: &State, name: &str, glyph: &'static rune::Icon, active: bool) -> El {
    row()
        .min_w(0.0)
        .gap(7.0)
        .pl(10.0)
        .pr(6.0)
        .py(4.0)
        .center_y()
        .child(icon(glyph, 14.0).color(s.theme.c(if active { "text" } else { "text-tertiary" })))
        .child(
            label(
                &s.theme,
                name,
                12.5,
                400.0,
                if active { "text" } else { "text-tertiary" },
            )
            .truncate(),
        )
        .role("tab")
        .label(name)
        .checked(active)
        .focusable(true)
}
pub fn close(s: &State, name: &str) -> El {
    crate::sidebar::icon_button_ink(&s.theme, &crate::icons::CLOSE, name, 12.0, "text-tertiary")
        .size(18.0, 18.0)
        .radius(5.0)
}
pub fn pill(s: &State, active: bool, button: El, close: El) -> El {
    let tab = row()
        .h(28.0)
        .max_w(240.0)
        .pr(4.0)
        .gap(2.0)
        .center_y()
        .radius(8.0)
        .child(button)
        .child(close);
    if active {
        s.theme.shadow(s.theme.paint(tab, "glaze"), "glaze-shadow")
    } else {
        tab
    }
}
pub fn next(key: &rune::Key, index: usize, count: usize) -> Option<usize> {
    if count == 0 {
        return None;
    }
    match key {
        rune::Key::Left => Some((index + count - 1) % count),
        rune::Key::Right => Some((index + 1) % count),
        rune::Key::Home => Some(0),
        rune::Key::End => Some(count - 1),
        _ => None,
    }
}
