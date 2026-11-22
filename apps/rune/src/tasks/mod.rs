use crate::{
    State,
    pages::{self, data},
    sidebar::label,
};
use rune::{El, TextStyle, col};
use serde_json::{Value, json};
pub mod board;
pub fn view(s: &State) -> El {
    if let Some(plugin) = data(s, "tasks/plugin") {
        if plugin["state"] != "active" && plugin["state"] != "outdated" {
            return setup(s, plugin);
        }
    } else {
        let message = match s.pages.data.get("tasks/plugin") {
            Some(Err(error)) => error.as_str(),
            _ => "Loading tasks…",
        };
        return col().w_full().grow(1.0).padding(24.0).child(label(
            &s.theme,
            message,
            13.0,
            400.0,
            "text-tertiary",
        ));
    }
    board::view(s)
}
fn setup(s: &State, plugin: &Value) -> El {
    let state = plugin["state"].as_str().unwrap_or("");
    let mut content = col().w_full().max_w(440.0).mt(s.window_size.1 * 0.12)
        .items_center().gap(12.0)
        .child(s.theme.shadow(s.theme.paint(rune::el().size(44.0, 44.0).center().radius(12.0)
            .child(rune::icon(&crate::icons::TASKS, 22.0).color(s.theme.c("text"))), "glaze"), "glaze-shadow"))
        .child(label(&s.theme, "Tasks", 20.0, 600.0, "text"))
        .child(label(&s.theme, "Plan your day across Today, This week, and Someday. Tasks are saved in OpenCode by a small OpenCodex plugin, so agents can add and update them when you ask.", 14.0, 400.0, "text-secondary")
            .w_full().wrap().align(rune::Align::Center));
    if matches!(state, "failed" | "unavailable") {
        content = content.child(
            label(
                &s.theme,
                plugin["message"].as_str().unwrap_or(""),
                14.0,
                400.0,
                "error",
            )
            .role("alert")
            .w_full()
            .wrap(),
        );
    } else if state == "loading" {
        content = content.child(
            label(&s.theme, "Starting Tasks…", 14.0, 400.0, "text-secondary").role("status"),
        );
    } else {
        let pending = s.pages.pending.contains("tasks/plugin");
        content = content.child(
            pages::primary_button(
                s,
                if pending {
                    "Turning on…"
                } else {
                    "Turn on Tasks"
                },
            )
            .disabled(pending)
            .on_press(|s: &mut State| {
                s.page_write("tasks/plugin", "PUT", json!({}), "tasks/plugin")
            }),
        );
    }
    if let Some(path) = plugin["path"].as_str() {
        content = content.child(
            label(&s.theme, path, 12.0, 400.0, "text-tertiary")
                .font(TextStyle::new(12.0, 400.0).mono().lh(18.0))
                .w_full()
                .wrap()
                .align(rune::Align::Center),
        );
    }
    col()
        .w_full()
        .grow(1.0)
        .px(24.0)
        .pt(24.0)
        .pb(32.0)
        .items_center()
        .child(content)
}
