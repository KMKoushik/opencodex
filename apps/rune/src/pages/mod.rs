//! Presentation routes; authoritative page data stays in the gateway.
use crate::{State, sidebar::label};
use rune::{El, TextEdit, col, el};
use serde_json::Value;
use std::collections::BTreeMap;
pub mod controls;
pub mod offline;
pub fn after_frame(rt: &rune::Runtime<State>, handle: &rune::AppHandle<State>) {
    crate::menus::projects::after_frame(rt, handle);
    crate::settings::appearance::after_frame(rt, handle);
    crate::tasks::board::after_frame(rt, handle);
}
pub fn invalidate(s: &mut State, changes: Vec<String>) {
    if changes.is_empty() {
        return;
    }
    if changes
        .iter()
        .any(|k| k == "all" || k == "apps" || k.starts_with("app:") || k.starts_with("source:"))
    {
        s.page_get("apps");
    }
    if s.pages.route == Route::Tasks && changes.iter().any(|k| k == "all" || k == "tasks") {
        s.page_get("tasks");
    }
    if let Some(id) = s.pages.app.clone() {
        if changes
            .iter()
            .any(|k| k == "all" || k == &format!("app:{id}") || k == &format!("source:{id}"))
        {
            s.page_get(&format!("apps/{id}/model"));
            if s.pages.apps.runs_open || s.pages.apps.tab == "settings" {
                s.page_get(&format!("apps/{id}/runs"));
            }
            if s.pages.apps.tab == "code" {
                s.page_get(&format!("canvases/{id}/files"));
            }
        }
    }
    if let Some(crate::settings::projects::Dialog::Worktrees(id)) = &s.pages.projects.dialog {
        if changes
            .iter()
            .any(|k| k == "all" || k == &format!("worktree:{id}"))
        {
            s.page_get(&format!("projects/{id}/worktrees"));
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub enum Route {
    #[default]
    Chat,
    ProjectSetup,
    Settings(String),
    Tasks,
    Apps,
}
#[derive(Default)]
pub struct Pages {
    pub route: Route,
    pub data: BTreeMap<String, Result<Value, String>>,
    pub pending: std::collections::BTreeSet<String>,
    pub errors: BTreeMap<String, String>,
    pub plugin_checks: BTreeMap<String, (f64, u8)>,
    pub anchors: BTreeMap<String, [f32; 4]>,
    pub appearance: crate::settings::appearance::Appearance,
    pub projects: crate::settings::projects::Projects,
    pub task_title: TextEdit,
    pub tasks: crate::tasks::board::Board,
    pub app: Option<String>,
    pub apps: crate::apps::Apps,
    pub instructions: TextEdit,
    pub instructions_dirty: bool,
    pub instructions_project: Option<String>,
    pub project_notice: Option<String>,
    pub remote: crate::settings::remote::Remote,
}
impl State {
    pub fn page_write(&mut self, path: &str, method: &str, body: Value, refresh: &str) {
        self.pages.errors.remove(refresh);
        if self.prompt_request(oc_gateway::prompt::Request::Write {
            tag: format!("page-refresh:{refresh}"),
            path: path.into(),
            method: method.into(),
            body,
        }) {
            self.pages.pending.insert(refresh.into());
        }
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
            _ => {}
        }
        self.rows_revision += 1;
    }
    pub fn page_get(&mut self, path: &str) {
        self.pages.errors.remove(path);
        if !self.pages.pending.insert(path.into()) {
            return;
        }
        let query = if matches!(path, "side-chat-plugin" | "canvas-plugin") {
            self.project()
                .map(|p| vec![("directory".into(), p.canonical.clone())])
                .unwrap_or_default()
        } else {
            vec![]
        };
        if !self.prompt_request(oc_gateway::prompt::Request::Get {
            tag: format!("page:{path}"),
            path: path.into(),
            query,
        }) {
            self.pages.pending.remove(path);
            self.pages
                .data
                .insert(path.into(), Err("Gateway is not connected".into()));
        }
    }
    pub fn page_mutate(&mut self, path: &str, body: Value, refresh: &str, delete: bool) {
        self.pages.errors.remove(refresh);
        if self.prompt_request(oc_gateway::prompt::Request::Mutate {
            tag: format!("page-refresh:{refresh}"),
            path: path.into(),
            body,
            delete,
        }) {
            self.pages.pending.insert(refresh.into());
        }
    }
}
pub fn receive(s: &mut State, tag: &str, result: Result<Value, String>) -> bool {
    if tag.starts_with("menu-thread:") || tag.starts_with("menu-export:") {
        return crate::menus::thread::receive(s, tag, result);
    }
    if let Some(path) = tag.strip_prefix("page:") {
        if path == "apps" {
            s.rows_revision += 1;
        }
        if let Ok(value) = &result {
            crate::settings::remote::receive(s, path, value);
            if path.starts_with("apps/") && path.ends_with("/model") {
                if let Some(directory) = value["directory"]
                    .as_str()
                    .filter(|d| !s.snapshot.models.contains_key(*d))
                {
                    s.command(oc_gateway::Command::Details(directory.into()));
                }
            }
        }
        s.pages.pending.remove(path);
        if path.ends_with("/instructions") && !s.pages.instructions_dirty {
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
        s.pages.pending.remove(path);
        if path == "session-background" {
            if let Err(error) = result {
                s.error = Some(format!("Could not move work to the background. {error}"));
            }
            if let Some(id) = s.selected.clone() {
                s.command(oc_gateway::Command::OpenSession(id));
            }
            return true;
        }
        match result {
            Ok(value) => {
                if path.starts_with("apps/") && path.ends_with("/runs") {
                    s.page_get("apps");
                }
                if path == "remote" {
                    s.pages.remote.dirty = false;
                }
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
                s.pages.errors.insert(path.into(), e);
            }
        }
        return true;
    }
    false
}
/// Follow OpenCode's plugin reload only while a relevant page is visible. No
/// redraw timer: a wake can issue a read, and only its changed reply redraws.
pub fn poll(s: &mut State, clock: f64, tx: &mut rune::Tx) {
    if s.pages.route == Route::Tasks {
        let minute = chrono::Local::now().timestamp() / 60;
        if s.pages.tasks.minute != minute {
            s.pages.tasks.minute = minute;
        }
        tx.wake_after(std::time::Duration::from_secs(60));
    }
    let paths: &[&str] = match &s.pages.route {
        Route::Settings(section) if section == "general" => &["side-chat-plugin", "canvas-plugin"],
        Route::Tasks => &["tasks/plugin"],
        _ => return,
    };
    for &path in paths {
        if !data(s, path).is_some_and(|v| v["state"] == "loading") {
            s.pages.plugin_checks.remove(path);
            continue;
        }
        let (due, count) = *s
            .pages
            .plugin_checks
            .entry(path.into())
            .or_insert((clock + 2.0, 0));
        if count >= 30 {
            continue;
        }
        if s.pages.pending.contains(path) {
            continue;
        }
        if clock >= due {
            s.pages
                .plugin_checks
                .insert(path.into(), (clock + 2.0, count + 1));
            s.page_get(path);
            continue;
        }
        tx.wake_after(std::time::Duration::from_secs_f64((due - clock).max(0.05)));
    }
}
pub fn view(s: &State) -> El {
    match &s.pages.route {
        Route::Settings(section) => crate::settings::view(s, section),
        Route::Tasks => crate::tasks::view(s),
        Route::Apps => crate::apps::view(s),
        Route::ProjectSetup => crate::settings::projects::setup(s),
        Route::Chat => el(),
    }
}
pub fn button(s: &State, title: &str) -> El {
    s.theme.shadow(
        s.theme.paint(
            el().role("button")
                .key(format!("page-action-{title}"))
                .label(title)
                .focusable(true)
                .px(10.0)
                .h(28.0)
                .center()
                .radius(8.0)
                .border(1.0, s.theme.c("chip-border"))
                .hover(s.theme.c("hover"))
                .child(label(&s.theme, title, 12.0, 500.0, "text")),
            "chip",
        ),
        "chip-shadow",
    )
}
pub fn primary_button(s: &State, title: &str) -> El {
    s.theme.shadow(
        s.theme.paint(
            el().role("button")
                .key(format!("page-action-{title}"))
                .label(title)
                .focusable(true)
                .px(14.0)
                .h(32.0)
                .center()
                .radius(8.0)
                .child(label(&s.theme, title, 13.0, 600.0, "on-primary")),
            "primary-glaze",
        ),
        "primary-shadow",
    )
}
pub fn status(s: &State, path: &str) -> Option<El> {
    if let Some(error) = s.pages.errors.get(path) {
        return Some(
            label(&s.theme, error, 13.0, 400.0, "error")
                .role("alert")
                .w_full()
                .wrap(),
        );
    }
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
