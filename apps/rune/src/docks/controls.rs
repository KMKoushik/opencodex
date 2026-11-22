use crate::{State, sidebar::label};
use rune::{El, el};

pub(super) fn button(s: &State, title: &str) -> El {
    label(&s.theme, title, 12.0, 500.0, "text")
        .px(10.0)
        .h(28.0)
        .center_y()
        .radius(7.0)
        .hover(s.theme.c("hover"))
        .role("button")
        .label(title)
        .focusable(true)
        .disabled(s.docks.sending)
        .opacity(if s.docks.sending { 0.45 } else { 1.0 })
}
pub(super) fn indicator(s: &State, selected: bool, multi: bool) -> El {
    let t = &s.theme;
    let mut mark = el()
        .size(15.0, 15.0)
        .mt(2.0)
        .radius(if multi { 3.0 } else { 7.5 })
        .border(
            1.0,
            t.c(if selected {
                "accent-text"
            } else {
                "text-tertiary"
            }),
        )
        .center();
    if selected {
        mark = mark.fill(t.c("accent-text")).child(if multi {
            label(t, "✓", 11.0, 600.0, "surface")
        } else {
            el().size(5.0, 5.0).radius(2.5).fill(t.c("surface"))
        });
    }
    mark
}
