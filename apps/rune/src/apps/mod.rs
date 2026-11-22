use crate::{
    State,
    pages::{self, data},
    sidebar::label,
};
use rune::{El, ScrollSpec, col};
use serde_json::Value;
mod detail;
pub(crate) use detail::run;
pub fn sidebar(s: &State) -> El {
    let mut apps: Vec<_> = data(s, "apps")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .collect();
    apps.sort_by(|a, b| b["created"].as_i64().cmp(&a["created"].as_i64()));
    let mut visible: Vec<_> = apps.iter().take(5).copied().collect();
    if let Some(open) = apps
        .iter()
        .find(|a| a["id"].as_str() == s.pages.app.as_deref())
    {
        if !visible.iter().any(|a| a["id"] == open["id"]) {
            visible.push(open);
        }
    }
    let mut rows = col().w_full().gap(1.0);
    for app in &visible {
        let id = app["id"].as_str().unwrap_or("").to_owned();
        let title = app["title"].as_str().unwrap_or("");
        rows = rows.child(
            rune::row()
                .key(format!("sidebar-app-{id}"))
                .w_full()
                .h(32.0)
                .pl(33.0)
                .pr(10.0)
                .gap(8.0)
                .center_y()
                .radius(8.0)
                .hover(s.theme.c("hover"))
                .fill(
                    if s.pages.route == pages::Route::Apps && s.pages.app.as_deref() == Some(&id) {
                        s.theme.c("selected")
                    } else {
                        rune::Color::TRANSPARENT
                    },
                )
                .role("button")
                .label(title)
                .focusable(true)
                .child(index::icon(s, app, 16.0))
                .child(
                    label(&s.theme, title, 13.0, 400.0, "text-secondary")
                        .grow(1.0)
                        .truncate(),
                )
                .on_press(move |s: &mut State| {
                    s.open_page(pages::Route::Apps);
                    select(s, id.clone());
                }),
        );
    }
    if apps.len() > visible.len() {
        rows = rows.child(
            crate::pages::controls::ghost(s, "All apps")
                .w_full()
                .on_press(|s: &mut State| {
                    s.pages.app = None;
                    s.open_page(pages::Route::Apps);
                }),
        );
    }
    rows
}
mod dialogs;
pub use dialogs::view as dialog;
mod glyphs;
mod index;
#[derive(Default)]
pub struct Apps {
    pub tab: String,
    pub runs_open: bool,
    pub open_runs: std::collections::BTreeSet<String>,
    pub closed_runs: std::collections::BTreeSet<String>,
    pub selected_file: String,
    pub dialog: Option<&'static str>,
    pub query: rune::TextEdit,
    pub glyph: String,
    pub color: String,
    pub busy: bool,
    pub error: Option<String>,
    pub scroll_icon: bool,
}
pub fn open_dialog(s: &mut State, kind: &'static str, tx: &mut rune::Tx) {
    s.menus.open = None;
    s.pages.apps.dialog = Some(kind);
    s.pages.apps.error = None;
    if kind == "icon" {
        s.pages.apps.scroll_icon = true;
        if let Some(app) = data(s, "apps")
            .and_then(Value::as_array)
            .and_then(|apps| {
                apps.iter()
                    .find(|a| Some(a["id"].as_str().unwrap_or("")) == s.pages.app.as_deref())
            })
            .cloned()
        {
            s.pages.apps.glyph = app["icon"]["glyph"].as_str().unwrap_or("").into();
            s.pages.apps.color = app["icon"]["color"].as_str().unwrap_or("blue").into();
            s.pages.apps.query.clear();
        }
    }
    tx.focus_when_shown(
        if kind == "model" {
            "App model"
        } else {
            "app-dialog-cancel"
        },
        false,
    );
}
pub fn close_dialog(s: &mut State) {
    if !s.pages.apps.busy {
        s.pages.apps.dialog = None;
    }
}
pub fn receive(s: &mut State, tag: &str, result: Result<Value, String>) {
    s.pages.apps.busy = false;
    match result {
        Err(error) => s.pages.apps.error = Some(error),
        Ok(_) => {
            if tag == "app-delete" {
                s.pages.app = None;
                s.pages.apps.dialog = None;
                s.page_get("apps");
            } else if tag == "app-icon" {
                s.pages.apps.dialog = None;
                s.page_get("apps");
            } else if let Some(id) = s.pages.app.clone() {
                s.page_get(&format!("apps/{id}/model"));
            }
        }
    }
}
fn write(s: &mut State, tag: &str, path: String, method: &str, body: Value) {
    if s.pages.apps.busy {
        return;
    }
    s.pages.apps.error = None;
    s.pages.apps.busy = s.prompt_request(oc_gateway::prompt::Request::Write {
        tag: tag.into(),
        path,
        method: method.into(),
        body,
    });
    if !s.pages.apps.busy {
        s.pages.apps.error = Some("Gateway is not connected".into());
    }
}
pub fn select(s: &mut State, id: String) {
    s.rows_revision += 1;
    s.pages.app = Some(id.clone());
    s.pages.apps = Default::default();
    s.page_get(&format!("apps/{id}/model"));
}
pub fn view(s: &State) -> El {
    let Some(apps) = data(s, "apps").and_then(Value::as_array) else {
        let message = match s.pages.data.get("apps") {
            Some(Err(e)) => e.as_str(),
            _ => "Loading apps…",
        };
        return label(&s.theme, message, 13.0, 400.0, "text-tertiary")
            .padding(24.0)
            .role("status");
    };
    if let Some(app) = s
        .pages
        .app
        .as_ref()
        .and_then(|id| apps.iter().find(|a| a["id"] == *id))
    {
        return detail::view(s, app);
    }
    if !apps.is_empty() {
        return index::view(s, apps);
    }
    col().w_full().grow(1.0).items_center().child(col().w_full().max_w(440.0).px(24.0).mt(s.window_size.1*0.18).gap(8.0).items_center()
        .child(rune::icon(&crate::icons::APPS,22.0).color(s.theme.c("text-tertiary")))
        .child(label(&s.theme,"No apps yet",15.0,600.0,"text"))
        .child(label(&s.theme,"An app is a canvas with code behind it that can call OpenCode. Ask for one in any chat, for example: “Every day, check open PRs and issues in my repo, fix the easy ones, and show me a dashboard of what needs my decision.”",13.0,400.0,"text-tertiary").w_full().wrap().align(rune::Align::Center)))
}
/// The embedding agent owns WKWebView; this route supplies only its frame/loading state.
pub fn canvas_host(s: &State, id: &str) -> El {
    col()
        .key(format!("canvas-host-{id}"))
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .justify_center()
        .items_center()
        .child(label(&s.theme, "Loading canvas…", 13.0, 400.0, "text-secondary").role("status"))
}
pub fn capture(s: &mut State, page: &str) -> bool {
    if !matches!(
        page,
        "app-detail"
            | "app-settings"
            | "app-code"
            | "app-runs-open"
            | "app-icon-open"
            | "app-model-open"
            | "app-delete-open"
    ) {
        return false;
    }
    let Some(url) = crate::OPTIONS.get().unwrap().gateway.as_ref() else {
        return true;
    };
    let fetch = |s: &mut State, path: &str| {
        let url = url.clone();
        let path = path.to_owned();
        let tag = format!("page:{path}");
        let result = std::thread::spawn(move || oc_gateway::capture_page(&url, &path))
            .join()
            .unwrap();
        pages::receive(s, &tag, result);
    };
    fetch(s, "apps");
    let Some(id) = data(s, "apps")
        .and_then(Value::as_array)
        .and_then(|apps| apps.first())
        .and_then(|a| a["id"].as_str())
        .map(str::to_owned)
    else {
        return true;
    };
    s.pages.route = pages::Route::Apps;
    s.pages.app = Some(id.clone());
    fetch(s, &format!("apps/{id}/model"));
    if let Some(directory) = data(s, &format!("apps/{id}/model"))
        .and_then(|v| v["directory"].as_str())
        .map(str::to_owned)
    {
        if !s.snapshot.models.contains_key(&directory) {
            let client = oc_gateway::Gateway::new(url, None).expect("capture gateway");
            s.snapshot = std::sync::Arc::new(
                oc_gateway::capture_details(client, directory, (*s.snapshot).clone())
                    .expect("capture model catalog"),
            );
        }
    }
    match page {
        "app-settings" => {
            s.pages.apps.tab = "settings".into();
            fetch(s, &format!("apps/{id}/runs"));
        }
        "app-code" => {
            s.pages.apps.tab = "code".into();
            fetch(s, &format!("canvases/{id}/files"));
        }
        "app-runs-open" => {
            s.pages.apps.runs_open = true;
            fetch(s, &format!("apps/{id}/runs"));
        }
        "app-model-open" => s.pages.apps.dialog = Some("model"),
        "app-delete-open" => s.pages.apps.dialog = Some("delete"),
        "app-icon-open" => {
            s.pages.apps.scroll_icon = true;
            s.pages.apps.dialog = Some("icon");
            let icon = data(s, "apps").and_then(Value::as_array).unwrap()[0]["icon"].clone();
            s.pages.apps.glyph = icon["glyph"].as_str().unwrap_or("").into();
            s.pages.apps.color = icon["color"].as_str().unwrap_or("blue").into();
        }
        _ => {}
    }
    true
}
