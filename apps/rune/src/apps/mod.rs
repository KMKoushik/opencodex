use crate::{
    State,
    pages::{self, button, data, heading},
    sidebar::label,
};
use rune::{El, ScrollSpec, col};
use serde_json::Value;

pub fn view(s: &State) -> El {
    let mut body = col().w_full().grow(1.0).min_h(0.0).padding(28.0).gap(16.0);
    if let Some(id) = &s.pages.app {
        body = body.child(button(s, "All apps").on_press(|s: &mut State| s.pages.app = None));
        body = body.child(canvas_host(s, id));
        if let Some(app) = data(s, "apps")
            .and_then(Value::as_array)
            .and_then(|apps| apps.iter().find(|app| app["id"] == *id))
        {
            for function in app["functions"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
            {
                let id = id.clone();
                let name = function.to_owned();
                body = body.child(button(s, &format!("Run {name}")).on_press(
                    move |s: &mut State| {
                        s.page_mutate(
                            &format!("canvases/{id}/functions/{name}"),
                            serde_json::json!({"args":[]}),
                            &format!("apps/{id}/runs"),
                            false,
                        );
                    },
                ));
            }
        }
        let path = format!("apps/{id}/runs");
        body = body.child(heading(s, "Runs", "Recent server function calls"));
        if let Some(status) = pages::status(s, &path) {
            return body.child(status);
        }
        for run in data(s, &path)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .take(100)
        {
            body = body.child(label(
                &s.theme,
                format!(
                    "{} · {}",
                    run["fn"].as_str().unwrap_or("Run"),
                    run["status"].as_str().unwrap_or("")
                ),
                13.0,
                400.0,
                "text",
            ));
            if let Some(error) = run["error"].as_str() {
                body = body.child(label(&s.theme, error, 12.0, 400.0, "error"));
            }
            for log in run["logs"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .take(100)
            {
                body = body.child(
                    label(&s.theme, log, 12.0, 400.0, "text-secondary")
                        .w_full()
                        .wrap()
                        .selectable(true),
                );
            }
            for session in run["sessions"].as_array().into_iter().flatten() {
                if let Some(id) = session["id"].as_str() {
                    let id = id.to_owned();
                    body = body.child(
                        button(s, session["title"].as_str().unwrap_or("Open thread"))
                            .on_press(move |s: &mut State| s.open_session(Some(id.clone()))),
                    );
                }
            }
        }
        return body;
    }
    body = body.scroll(ScrollSpec {
        stick_bottom: false,
    });
    if let Some(status) = pages::status(s, "apps") {
        return body.child(status);
    }
    let apps = data(s, "apps").and_then(Value::as_array);
    if apps.is_none_or(Vec::is_empty) {
        return col().w_full().grow(1.0).items_center().child(col().w_full().max_w(440.0).px(24.0).mt(s.window_size.1*0.18).gap(8.0).items_center()
            .child(rune::icon(&crate::icons::APPS,22.0).color(s.theme.c("text-tertiary")))
            .child(label(&s.theme,"No apps yet",15.0,600.0,"text"))
            .child(label(&s.theme,"An app is a canvas with code behind it that can call OpenCode. Ask for one in any chat, for example: “Every day, check open PRs and issues in my repo, fix the easy ones, and show me a dashboard of what needs my decision.”",13.0,400.0,"text-tertiary").w_full().wrap().align(rune::Align::Center)));
    }
    body = body.child(heading(s, "Apps", "Your canvases with code behind them."));
    for app in apps.into_iter().flatten().take(200) {
        let id = app["id"].as_str().unwrap_or("").to_owned();
        body = body.child(
            col()
                .w_full()
                .padding(16.0)
                .gap(8.0)
                .radius(10.0)
                .border(1.0, s.theme.c("border"))
                .child(label(
                    &s.theme,
                    app["title"].as_str().unwrap_or("Untitled app"),
                    14.0,
                    500.0,
                    "text",
                ))
                .child(button(s, "Open app").on_press(move |s: &mut State| {
                    s.pages.app = Some(id.clone());
                    s.page_get(&format!("apps/{id}/runs"));
                })),
        );
    }
    body
}
/// WKWebView integration point: mount the gateway canvas surface in this keyed rectangle.
/// The embedding agent should keep the native view's frame synchronized to this element.
pub fn canvas_host(s: &State, id: &str) -> El {
    crate::native::app_host(s, id).grow(1.0).min_h(0.0)
}
