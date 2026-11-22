//! Presentation routes; authoritative page data stays in the gateway.
use crate::{State, sidebar::label};
use rune::{El, TextEdit, col, el, row};
use serde_json::Value;
use std::collections::BTreeMap;
pub mod offline;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum Route {
    #[default]
    Chat,
    Settings(String),
    Tasks,
    Apps,
    Worktrees(String),
}
#[derive(Default)]
pub struct Pages {
    pub route: Route,
    pub data: BTreeMap<String, Result<Value, String>>,
    pub pending: std::collections::BTreeSet<String>,
    pub task_title: TextEdit,
    pub app: Option<String>,
    pub instructions: TextEdit,
    pub instructions_project: Option<String>,
    pub remote: crate::settings::remote::Remote,
}
impl State {
    pub fn page_write(&mut self, path: &str, method: &str, body: Value, refresh: &str) {
        self.prompt_request(oc_gateway::prompt::Request::Write {
            tag: format!("page-refresh:{refresh}"),
            path: path.into(),
            method: method.into(),
            body,
        });
    }
    pub fn open_page(&mut self, route: Route) {
        self.composer.menu = None;
        self.pages.route = route.clone();
        match route {
            Route::Tasks => {
                self.page_get("tasks/plugin");
                self.page_get("tasks");
            }
            Route::Apps => self.page_get("apps"),
            Route::Settings(ref section) if section == "usage" => self.page_get("usage/limits"),
            Route::Settings(ref section) if section == "remote" => self.page_get("remote"),
            Route::Settings(ref section) if section == "general" => {
                self.page_get("connection");
                self.page_get("side-chat-plugin");
                self.page_get("canvas-plugin");
            }
            Route::Worktrees(ref id) => self.page_get(&format!("projects/{id}/worktrees")),
            _ => {}
        }
        self.rows_revision += 1;
    }
    pub fn page_get(&mut self, path: &str) {
        if !self.pages.pending.insert(path.into()) {
            return;
        }
        if !self.prompt_request(oc_gateway::prompt::Request::Get {
            tag: format!("page:{path}"),
            path: path.into(),
            query: vec![],
        }) {
            self.pages.pending.remove(path);
            self.pages
                .data
                .insert(path.into(), Err("Gateway is not connected".into()));
        }
    }
    pub fn page_mutate(&mut self, path: &str, body: Value, refresh: &str, delete: bool) {
        self.prompt_request(oc_gateway::prompt::Request::Mutate {
            tag: format!("page-refresh:{refresh}"),
            path: path.into(),
            body,
            delete,
        });
    }
}
pub fn receive(s: &mut State, tag: &str, result: Result<Value, String>) -> bool {
    if let Some(path) = tag.strip_prefix("page:") {
        if let Ok(value) = &result {
            crate::settings::remote::receive(s, path, value);
        }
        s.pages.pending.remove(path);
        if path.ends_with("/instructions") {
            if let Ok(value) = &result {
                s.pages.instructions = TextEdit::new(value["text"].as_str().unwrap_or(""));
            }
        }
        s.pages.data.insert(path.into(), result);
        if path == "tasks/plugin" {
            s.page_get("tasks");
        }
        // Small bounded page cache, never persisted.
        while s.pages.data.len() > 24 {
            s.pages.data.pop_first();
        }
        return true;
    }
    if let Some(path) = tag.strip_prefix("page-refresh:") {
        match result {
            Ok(value) => {
                if path == "task-start" {
                    if let Some(id) = value["session"]["id"].as_str() {
                        s.open_session(Some(id.into()));
                    }
                    s.page_get("tasks");
                } else if path == "sessions" || path == "projects" {
                    s.command(oc_gateway::Command::Refresh);
                } else if path == "fork" {
                    if let Some(id) = value["id"].as_str() {
                        s.open_session(Some(id.into()));
                    }
                } else {
                    s.page_get(path);
                }
            }
            Err(e) => {
                s.error = Some(e.clone());
                s.pages.data.insert(path.into(), Err(e));
            }
        }
        return true;
    }
    false
}
pub fn view(s: &State) -> El {
    match &s.pages.route {
        Route::Settings(section) => crate::settings::view(s, section),
        Route::Tasks => crate::tasks::view(s),
        Route::Apps => crate::apps::view(s),
        Route::Worktrees(id) => worktrees(s, id),
        Route::Chat => el(),
    }
}
pub fn button(s: &State, title: &str) -> El {
    el().role("button")
        .key(format!("page-action-{title}"))
        .label(title)
        .focusable(true)
        .px(12.0)
        .h(30.0)
        .center()
        .radius(6.0)
        .border(1.0, s.theme.c("border"))
        .hover(s.theme.c("hover"))
        .child(label(&s.theme, title, 12.0, 500.0, "text"))
}
pub fn heading(s: &State, title: &str, description: &str) -> El {
    col()
        .w_full()
        .gap(6.0)
        .mb(24.0)
        .child(label(&s.theme, title, 20.0, 600.0, "text"))
        .child(label(&s.theme, description, 13.0, 400.0, "text-secondary"))
}
pub fn status(s: &State, path: &str) -> Option<El> {
    match s.pages.data.get(path) {
        None => Some(label(&s.theme, "Loading…", 13.0, 400.0, "text-secondary")),
        Some(Err(e)) => Some(
            col()
                .gap(12.0)
                .child(label(&s.theme, e, 13.0, 400.0, "error"))
                .child(button(s, "Retry").on_press({
                    let path = path.to_owned();
                    move |s: &mut State| s.page_get(&path)
                })),
        ),
        Some(Ok(_)) => None,
    }
}
pub fn data<'a>(s: &'a State, path: &str) -> Option<&'a Value> {
    s.pages.data.get(path)?.as_ref().ok()
}
fn worktrees(s: &State, id: &str) -> El {
    let path = format!("projects/{id}/worktrees");
    let mut body = col().w_full().grow(1.0).padding(32.0).child(heading(
        s,
        "Worktrees",
        "Manage isolated workspaces for your threads.",
    ));
    if let Some(status) = status(s, &path) {
        return body.child(status);
    }
    let entries = data(s, &path).and_then(Value::as_array);
    if entries.is_none_or(Vec::is_empty) {
        return body.child(label(
            &s.theme,
            "No worktrees yet",
            14.0,
            400.0,
            "text-secondary",
        ));
    }
    for item in entries.into_iter().flatten().take(200) {
        body = body.child(
            row()
                .w_full()
                .py(12.0)
                .gap(12.0)
                .child(label(
                    &s.theme,
                    item["directory"].as_str().unwrap_or("Worktree"),
                    13.0,
                    400.0,
                    "text",
                ))
                .child(label(
                    &s.theme,
                    item["branch"].as_str().unwrap_or(""),
                    12.0,
                    400.0,
                    "text-secondary",
                )),
        );
    }
    body
}
