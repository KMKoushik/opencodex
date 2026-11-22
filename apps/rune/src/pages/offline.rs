use crate::{State, pages::button, sidebar::label};
use rune::{El, col, el};
pub fn view(s: &State) -> El {
    let mut body = col().w_full().grow(1.0).center().gap(16.0);
    if let Some(assets) = &s.assets {
        body = body.child(el().size(144.0, 144.0).pixels(assets.hero.pixels()).mb(8.0));
    }
    body.child(label(
        &s.theme,
        "Can’t reach the gateway",
        28.0,
        600.0,
        "text",
    ))
    .child(label(
        &s.theme,
        "Check that the OpenCodex server is running, then try again.",
        14.0,
        400.0,
        "text-secondary",
    ))
    .child(button(s, "Try again").mt(12.0).on_press(|s: &mut State| {
        s.command(oc_gateway::Command::Refresh);
        s.page_get("connection");
    }))
}
