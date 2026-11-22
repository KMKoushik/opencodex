use super::*;

pub fn view(s: &State, request: &Value) -> El {
    let t = &s.theme;
    let id = request["id"].as_str().unwrap_or("").to_owned();
    let path = format!(
        "sessions/{}/permissions/{id}",
        s.selected.as_deref().unwrap_or("")
    );
    let pending = s.docks.permission_pending.contains(&path) || s.composer.access_pending;
    let mut actions = row().w_full().gap(8.0).mt(16.0);
    for (name, decision) in [
        ("Allow once", "once"),
        ("Always allow", "always"),
        ("Reject", "reject"),
    ] {
        if decision == "always" && request["save"].as_array().is_none_or(Vec::is_empty) {
            continue;
        }
        let id = id.clone();
        let control = label(
            t,
            name,
            12.0,
            500.0,
            if decision == "once" {
                "on-primary"
            } else {
                "text"
            },
        )
        .px(10.0)
        .h(28.0)
        .center_y()
        .radius(7.0)
        .role("button")
        .label(name)
        .focusable(true);
        let control = if decision == "once" {
            t.paint(control, "primary-glaze")
        } else if decision == "always" {
            t.paint(control, "chip")
        } else {
            control.hover(t.c("hover"))
        };
        actions = actions.child(control.disabled(pending).on_press(move |s: &mut State| {
            if let Some(session) = &s.selected {
                reply(
                    s,
                    format!("sessions/{session}/permissions/{id}"),
                    json!({"decision":decision}),
                    false,
                );
            }
        }));
    }
    actions = actions.child(
        label(t, "Enable full access…", 12.0, 500.0, "text-secondary")
            .h(28.0)
            .px(10.0)
            .center_y()
            .radius(7.0)
            .hover(t.c("hover"))
            .role("button")
            .label("Enable full access for this thread")
            .focusable(true)
            .disabled(pending)
            .on_press(|s: &mut State| {
                s.composer.menu = Some(crate::composer::state::Menu::ConfirmAccess)
            }),
    );
    let resources = request["resources"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join("\n");
    let mut card = col()
        .w_full()
        .padding(16.0)
        .radius(12.0)
        .border(1.0, t.c("border-heavy"))
        .role("group")
        .label("Permission request")
        .child(
            label(
                t,
                request["action"].as_str().unwrap_or(""),
                14.0,
                600.0,
                "text",
            )
            .mb(8.0),
        );
    if let Some(message) = request["message"].as_str().filter(|v| !v.is_empty()) {
        card = card.child(label(t, message, 13.0, 400.0, "text").wrap());
    }
    card = card
        .child(
            label(t, resources, 12.0, 400.0, "text")
                .font(TextStyle::new(12.0, 400.0).family(rune::Family::Mono))
                .wrap(),
        )
        .child(actions);
    if let Some(error) = s.docks.permission_errors.get(&path) {
        card = card.child(label(t, error, 13.0, 400.0, "error").wrap());
    }
    card
}
