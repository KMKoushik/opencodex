use crate::{
    State,
    pages::{self, Route, button, data},
    sidebar::label,
    theme::Theme,
};
use rune::{El, ScrollSpec, col, el, row};
pub mod appearance;
pub mod projects;
pub mod remote;

pub const SECTIONS: &[(&str, &str)] = &[
    ("general", "General"),
    ("appearance", "Appearance"),
    ("shortcuts", "Shortcuts"),
    ("projects", "Projects"),
    ("usage", "Usage"),
    ("remote", "Remote access"),
];
pub fn view(s: &State, section: &str) -> El {
    let title = SECTIONS
        .iter()
        .find(|(id, _)| *id == section)
        .map(|(_, name)| *name)
        .unwrap_or("Settings");
    let mut body = col()
        .w_full()
        .max_w(if section == "projects" { 900.0 } else { 720.0 })
        .px(24.0)
        .pt(24.0)
        .pb(64.0)
        .gap(16.0);
    if section != "projects" {
        body = body.child(
            label(&s.theme, title, 20.0, 600.0, "text")
                .font(rune::TextStyle::new(20.0, 600.0).lh(26.0))
                .mb(8.0),
        );
    }
    body = match section {
        "appearance" => appearance::view(s, body),
        "shortcuts" => {
            body=body.child(label(&s.theme,"Shortcuts work while OpenCodex is focused. Chat actions are available in an open conversation. Close a menu before using app shortcuts. Hold ⌘ to show thread numbers: pinned chats first, then chats in Focus.",14.0,400.0,"text-secondary").w_full().wrap().mb(24.0));
            let mut app = group(s, "App");
            for n in 1..=9 {
                app = app.child(shortcut_row(
                    s,
                    &format!("Open pinned / Focus thread {n}"),
                    &format!("⌘{n}"),
                ));
            }
            for &(name, chord, _) in crate::shortcuts::COMMANDS {
                if matches!(
                    name,
                    "Focus message"
                        | "Choose model"
                        | "Choose thinking level"
                        | "Cycle thinking level"
                        | "Move running work to the background"
                ) || chord == "mod+alt+n"
                {
                    continue;
                }
                let keys = chord
                    .replace("mod+", "⌘")
                    .replace("ctrl+", "⌃")
                    .replace("alt+", "⌥")
                    .replace("shift+", "⇧")
                    .to_uppercase();
                if name == "Focus thread navigation" {
                    app = app.child(shortcut_row(
                        s,
                        "Close sidebar overlay / leave settings or tasks",
                        "Esc",
                    ));
                }
                app = app.child(shortcut_row(
                    s,
                    name,
                    if name == "New chat" {
                        "⌘N / ⌘⌥N"
                    } else {
                        &keys
                    },
                ));
            }
            let mut chat = group(s, "Chat");
            for (name, keys) in [
                ("Focus message", "⌘⇧L"),
                ("Choose model", "⌘⇧M"),
                ("Choose thinking level", "⌘⇧E"),
                ("Cycle thinking level", "⌃T"),
                ("Move running work to the background", "⌃B"),
                ("Stop response", "Esc Esc"),
            ] {
                chat = chat.child(shortcut_row(s, name, keys));
            }
            body.child(app).child(chat).child(
                group(s, "Message input")
                    .child(shortcut_row(s, "Send message", "Enter"))
                    .child(shortcut_row(s, "Insert a new line", "Shift+Enter")),
            )
        }
        "projects" => projects::view(s, body),
        "usage" => usage(s, body),
        "remote" => remote::view(s, body),
        _ => general(s, body),
    };
    col()
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .center_y()
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(body)
}
pub fn navigation(s: &State, section: &str) -> El {
    let mut nav = col().w_full().gap(1.0).child(
        crate::sidebar::nav(&s.theme, &crate::icons::BACK, "Back to app")
            .mb(12.0)
            .on_press(|s: &mut State| s.open_page(Route::Chat)),
    );
    for &(id, name) in SECTIONS {
        let icon = match id {
            "general" => &crate::icons::GENERAL,
            "appearance" => &crate::icons::APPEARANCE,
            "shortcuts" => &crate::icons::KEYBOARD,
            "remote" => &crate::icons::GLOBE,
            "projects" => &crate::icons::FOLDER,
            "usage" => &crate::icons::USAGE,
            _ => &crate::icons::SETTINGS,
        };
        nav = nav.child(
            crate::sidebar::nav(&s.theme, icon, name)
                .fill(if id == section {
                    s.theme.c("selected")
                } else {
                    rune::Color::TRANSPARENT
                })
                .on_press(move |s: &mut State| s.open_page(Route::Settings(id.into()))),
        );
    }
    nav
}
fn shortcut_row(s: &State, title: &str, chord: &str) -> El {
    row()
        .w_full()
        .h(52.0)
        .px(16.0)
        .center_y()
        .border_sides([1.0, 0.0, 0.0, 0.0], s.theme.c("border"))
        .child(label(&s.theme, title, 13.0, 400.0, "text").grow(1.0))
        .child(
            label(&s.theme, chord, 13.0, 400.0, "text-secondary")
                .px(8.0)
                .py(4.0)
                .radius(5.0)
                .border(1.0, s.theme.c("border")),
        )
}
pub(crate) fn setting_row(s: &State, title: &str, description: &str) -> El {
    setting_row_styled(s, title, description, vec![])
}
fn setting_row_styled(s: &State, title: &str, description: &str, spans: Vec<rune::Span>) -> El {
    let mut content = col()
        .grow(1.0)
        .min_w(0.0)
        .gap(2.0)
        .child(label(&s.theme, title, 13.0, 400.0, "text"));
    if !description.is_empty() {
        content = content.child(
            label(&s.theme, description, 12.0, 400.0, "text-secondary")
                .spans(spans)
                .w_full()
                .wrap(),
        );
    }
    row()
        .w_full()
        .min_h(52.0)
        .py(10.0)
        .px(16.0)
        .gap(16.0)
        .center_y()
        .border_sides([1.0, 0.0, 0.0, 0.0], s.theme.c("border"))
        .child(content)
}
fn general(s: &State, mut body: El) -> El {
    let connection = data(s, "connection");
    let connected = connection.is_some_and(|v| v["status"] == "connected");
    let status = match s.pages.data.get("connection") {
        Some(Err(_)) => "The local gateway is unavailable.".into(),
        _ if connected => format!(
            "Connected · v{}",
            connection.unwrap()["version"].as_str().unwrap_or("")
        ),
        _ => connection
            .and_then(|v| v["message"].as_str())
            .unwrap_or("Checking…")
            .into(),
    };
    let mut service = group(s, "OpenCode")
        .child(
            setting_row(
                s,
                "Service",
                s.pages
                    .errors
                    .get("connection")
                    .map(String::as_str)
                    .unwrap_or(&status),
            )
            .child(
                button(s, if connected { "Check" } else { "Connect" })
                    .disabled(s.pages.pending.contains("connection"))
                    .on_press(|s: &mut State| {
                        if data(s, "connection").is_some_and(|v| v["status"] == "connected") {
                            s.page_get("connection");
                        } else {
                            s.page_mutate("connection", serde_json::json!({}), "connection", false);
                        }
                    }),
            ),
        )
        .child(setting_row(
            s,
            "Live updates",
            if !connected {
                "Unavailable"
            } else if s.snapshot.live {
                "Connected"
            } else {
                "Reconnecting…"
            },
        ));
    for (path, title, description) in [
        (
            "side-chat-plugin",
            "Side chat live context",
            "Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they can also check its latest progress. It’s hidden in all other sessions.",
        ),
        (
            "canvas-plugin",
            "Canvases",
            "Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and small tools shown beside the chat in your theme.",
        ),
    ] {
        if connected {
            service = service.child(plugin_row(s, path, title, description));
        }
    }
    body = body.child(service);
    let mut notifications = group(s, "Notifications");
    for (kind, title, description) in [
        (
            "reply",
            "Finished replies",
            "When a chat finishes or fails.",
        ),
        ("question", "Questions", "When a chat asks you a question."),
        (
            "permission",
            "Permission requests",
            "When a chat is blocked on your approval.",
        ),
    ] {
        let enabled = s.prefs.notifications.get(kind).copied().unwrap_or(false);
        let mut toggle = s.theme.shadow(
            s.theme
                .paint(row().gap(2.0).padding(2.0).radius(9.0), "well"),
            "well-shadow",
        );
        for (value, name) in [(false, "Off"), (true, "On")] {
            let option = el()
                .role("radio")
                .label(name)
                .focusable(true)
                .h(26.0)
                .px(10.0)
                .center()
                .radius(7.0)
                .child(label(
                    &s.theme,
                    name,
                    12.0,
                    500.0,
                    if enabled == value {
                        "text"
                    } else {
                        "text-secondary"
                    },
                ));
            let option = if enabled == value {
                s.theme
                    .shadow(s.theme.paint(option, "glaze"), "glaze-shadow")
            } else {
                option
            };
            toggle = toggle.child(option.on_press(move |s: &mut State| {
                s.prefs.notifications.insert(kind.into(), value);
                s.save();
            }));
        }
        notifications = notifications.child(setting_row(s, title, description).child(toggle));
    }
    body = body.child(notifications);
    if let Some(p) = s.project() {
        let directory = p.canonical.clone();
        body = body.child(group(s, "Project").child(
            setting_row(s, p.display_name(), &p.canonical).child(
                button(s, "Close project").on_press(move |s: &mut State| {
                    s.prefs.closed_projects.push(directory.clone());
                    s.prefs.project = None;
                    s.open_session(None);
                    s.open_page(Route::Settings("general".into()));
                    crate::sidebar::rebuild(s);
                    s.save();
                }),
            ),
        ));
    } else {
        body = body.child(group(s, "Project").child(setting_row(s, "No project open", "")));
    }
    body
}
fn plugin_row(s: &State, path: &'static str, title: &str, missing: &str) -> El {
    let value = data(s, path);
    let state = value.and_then(|v| v["state"].as_str()).unwrap_or("");
    let description = match state {
        "missing" => missing,
        "outdated" => {
            "An older version is installed. Update it to match this version of OpenCodex."
        }
        "loading" => "Installed. Waiting for OpenCode to load it…",
        "active" if path == "side-chat-plugin" => {
            "Active. Side chats can read the main chat’s latest progress."
        }
        "active" => "Active. Agents can make canvases.",
        "failed" => "OpenCode couldn’t load the plugin.",
        "unavailable" => "",
        _ => "Checking…",
    };
    let mut parts = vec![description];
    if let Some(value) = value {
        parts.push(value["message"].as_str().unwrap_or(""));
        if state == "loading"
            && s.pages
                .plugin_checks
                .get(path)
                .is_some_and(|(_, count)| *count >= 30)
        {
            parts.push("If it doesn’t load, restart OpenCode with opencode service restart.");
        }
        parts.push(value["path"].as_str().unwrap_or(""));
    }
    let text = if let Some(error) = s.pages.errors.get(path) {
        error.clone()
    } else {
        match s.pages.data.get(path) {
            Some(Err(error)) => error.clone(),
            _ => parts
                .into_iter()
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
                .join(" "),
        }
    };
    let spans = value
        .and_then(|v| v["path"].as_str())
        .filter(|_| !s.pages.errors.contains_key(path))
        .and_then(|path| {
            text.rfind(path).map(|start| {
                vec![
                    rune::Span::new(start, start + path.len())
                        .mono()
                        .color(s.theme.c("text-tertiary")),
                ]
            })
        })
        .unwrap_or_default();
    let mut result = setting_row_styled(s, title, &text, spans);
    if matches!(state, "missing" | "outdated") {
        result = result.child(
            button(
                s,
                if state == "missing" {
                    "Install"
                } else {
                    "Update"
                },
            )
            .disabled(s.pages.pending.contains(path))
            .on_press(move |s: &mut State| s.page_write(path, "PUT", serde_json::json!({}), path)),
        );
    }
    if matches!(state, "loading" | "active" | "failed" | "outdated") {
        result = result.child(
            button(s, "Remove")
                .disabled(s.pages.pending.contains(path))
                .on_press(move |s: &mut State| {
                    s.page_mutate(path, serde_json::Value::Null, path, true)
                }),
        );
    }
    result
}
pub(crate) fn group(s: &State, title: &str) -> El {
    group_action(s, title, None)
}
fn group_action(s: &State, title: &str, action: Option<El>) -> El {
    let mut header = row()
        .w_full()
        .h(52.0)
        .px(16.0)
        .center_y()
        .child(label(&s.theme, title, 13.0, 600.0, "text").grow(1.0));
    if let Some(action) = action {
        header = header.child(action);
    }
    col()
        .w_full()
        .radius(12.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border"))
        .padding(1.0)
        .child(header)
}
pub fn restored_theme(prefs: &crate::profile::Preferences, dark: bool) -> Theme {
    if let Some(p) = &prefs.theme {
        let dark = match p.mode.as_str() {
            "light" => false,
            "dark" => true,
            _ => dark,
        };
        return appearance::derive(dark, p.variant(dark));
    }
    let dark = prefs.dark.unwrap_or(dark);
    let theme = Theme::new(dark, &prefs.preset);
    if let Some(accent) = prefs
        .accent
        .as_ref()
        .filter(|v| rune::color::hex(v).is_some())
    {
        let mut seed = theme.preset.seed.clone();
        seed.accent = accent.clone();
        Theme::derive(dark, theme.preset, seed, false)
    } else {
        theme
    }
}
fn usage(s: &State, mut body: El) -> El {
    if let Some(status) = pages::status(s, "usage/limits") {
        return body.child(status);
    }
    if let Some(value) = data(s, "usage/limits") {
        let providers = value["providers"].as_array();
        if providers.is_none_or(Vec::is_empty) {
            body=body.child(label(&s.theme,"No plan limits to show. Sign in with ChatGPT or add an OpenCode Go key in OpenCode, or sign in to Claude Code, to see your remaining usage here.",13.0,400.0,"text-secondary"));
        }
        for provider in providers.into_iter().flatten() {
            let mut card = group(s, provider["name"].as_str().unwrap_or("Provider"));
            if let Some(error) = provider["error"].as_str() {
                card = card.child(label(&s.theme, error, 12.0, 400.0, "error").padding(16.0));
            }
            for window in provider["windows"].as_array().into_iter().flatten() {
                let left =
                    (100.0 - window["usedPercent"].as_f64().unwrap_or(0.0)).clamp(0.0, 100.0);
                card = card
                    .child(setting_row(
                        s,
                        window["label"].as_str().unwrap_or("Limit"),
                        &format!("{left:.0}% left"),
                    ))
                    .child(
                        el().h(6.0)
                            .w_full()
                            .fill(s.theme.c("hover"))
                            .child(el().h(6.0).w(left as f32 * 4.0).fill(s.theme.c("accent"))),
                    );
            }
            body = body.child(card);
        }
    }
    body.child(button(s, "Refresh").on_press(|s: &mut State| s.page_get("usage/limits")))
}
pub fn capture(s: &mut State) {
    let page = &crate::OPTIONS.get().unwrap().page;
    if page.is_empty() {
        return;
    }
    if crate::apps::capture(s, page) {
        return;
    }
    if matches!(
        page.as_str(),
        "project-add-open"
            | "project-edit-open"
            | "project-instructions-open"
            | "worktrees-open"
            | "worktrees-confirm-open"
    ) {
        s.pages.projects.capture_focus = true;
    }
    match page.as_str() {
        "home-empty" => return,
        "sidebar-project-collapsed" => {
            if let Some(id) = s.project().map(|p| p.id.clone()) {
                s.folded.insert(id);
            }
            return;
        }
        "thread-search-open" => {
            s.menus.open = Some(crate::menus::Menu::Search);
            if let Some(url) = &crate::OPTIONS.get().unwrap().gateway {
                let url = url.clone();
                let result =
                    std::thread::spawn(move || oc_gateway::capture_page(&url, "session-search"))
                        .join()
                        .unwrap();
                crate::menus::search::receive(s, "", result);
            }
            return;
        }
        "project-open-dialog" => {
            s.prefs.project = None;
            s.pages.route = Route::ProjectSetup;
            return;
        }
        "project-picker-open"
        | "project-picker-path"
        | "project-picker-empty"
        | "project-switcher-dialog" => {
            s.menus.projects.active = s.project().map(|p| p.canonical.clone()).unwrap_or_default();
            s.menus.projects.focus_on_show = true;
            s.menus.open = Some(crate::menus::Menu::Projects);
            if page == "project-picker-path" {
                s.menus.projects.query = rune::TextEdit::new("/tmp/ocr-parity/proj/new-folder");
            }
            if page == "project-picker-empty" {
                s.menus.projects.query = rune::TextEdit::new("no-matching-project");
            }
            if page == "project-switcher-dialog" {
                s.menus.open = None;
                s.pages.projects.dialog = Some(projects::Dialog::Open(false));
                s.pages.projects.capture_focus = true;
            }
            return;
        }
        "app-menu-open" => {
            s.menus.open = Some(crate::menus::Menu::Brand);
            return;
        }
        "sidebar-hidden" => {
            s.prefs.sidebar_closed = true;
            return;
        }
        "sidebar-focus-view" => {
            s.prefs.focus = true;
            return;
        }
        "thread-context-menu" | "thread-actions-open" => {
            s.menus.point = std::env::var("OCR_MENU_POINT").ok().and_then(|point| {
                let (x, y) = point.split_once(',')?;
                Some((x.parse().ok()?, y.parse().ok()?))
            });
            if let Some(id) = s
                .selected
                .as_ref()
                .or_else(|| s.snapshot.sessions.keys().next())
            {
                s.menus.open = Some(crate::menus::Menu::Thread(id.clone()));
            }
            return;
        }
        "project-add-open" => {
            s.pages.route = Route::Settings("projects".into());
            s.pages.projects.dialog = Some(projects::Dialog::Open(true));
            return;
        }
        "project-actions-open"
        | "project-edit-open"
        | "project-instructions-open"
        | "worktrees-open"
        | "worktrees-confirm-open" => {
            s.pages.route = Route::Settings("projects".into());
            s.menus.point = std::env::var("OCR_MENU_POINT").ok().and_then(|p| {
                let (x, y) = p.split_once(',')?;
                Some((x.parse().ok()?, y.parse().ok()?))
            });
            if let Some(p) = s.project().cloned() {
                let id = p.id.clone();
                if page == "project-instructions-open" || page.starts_with("worktrees-") {
                    let kind = if page.starts_with("worktrees-") {
                        "worktrees"
                    } else {
                        "instructions"
                    };
                    if let Some(url) = &crate::OPTIONS.get().unwrap().gateway {
                        let url = url.clone();
                        let path = format!("projects/{id}/{kind}");
                        let fetchpath = path.clone();
                        let result =
                            std::thread::spawn(move || oc_gateway::capture_page(&url, &fetchpath))
                                .join()
                                .unwrap();
                        pages::receive(s, &format!("page:{path}"), result);
                    }
                    if page == "worktrees-confirm-open" {
                        s.pages.projects.removing =
                            pages::data(s, &format!("projects/{id}/worktrees"))
                                .and_then(serde_json::Value::as_array)
                                .and_then(|v| {
                                    v.iter().find(|t| {
                                        t["strategy"] == "git" && t["directory"] != p.canonical
                                    })
                                })
                                .and_then(|t| t["directory"].as_str())
                                .map(str::to_owned);
                    }
                    s.pages.projects.dialog = Some(if page.starts_with("worktrees-") {
                        projects::Dialog::Worktrees(id)
                    } else {
                        projects::Dialog::Instructions(id)
                    });
                    return;
                }
                s.menus.search = rune::TextEdit::new(p.display_name());
                if page == "project-edit-open" {
                    s.pages.projects.name = rune::TextEdit::new(p.display_name());
                    s.pages.projects.color = p
                        .icon
                        .as_ref()
                        .and_then(|i| i.color.clone())
                        .unwrap_or_default();
                    s.pages.projects.image = p
                        .icon
                        .as_ref()
                        .and_then(|i| i.r#override.clone())
                        .unwrap_or_default();
                    s.pages.projects.dialog = Some(projects::Dialog::Edit(id));
                } else {
                    s.menus.open = Some(crate::menus::Menu::Project(id));
                }
            }
            return;
        }
        "connection-offline" => {
            let snapshot = std::sync::Arc::make_mut(&mut s.snapshot);
            snapshot.live = false;
            snapshot.error = Some("Gateway unavailable".into());
            return;
        }
        "find-chat-open" | "find-markdown-open" | "find-long-open" => {
            s.find.open = true;
            return;
        }
        _ => {}
    }
    s.pages.route = match page.as_str() {
        "tasks" | "tasks-empty" => Route::Tasks,
        "apps" | "apps-empty" => Route::Apps,
        "usage-limits-open" => Route::Settings("usage".into()),
        "settings-remote-access" => Route::Settings("remote".into()),
        _ => Route::Settings(page.trim_start_matches("settings-").into()),
    };
    if matches!(&s.pages.route, Route::Settings(v) if v == "general")
        || s.pages.route == Route::Tasks
    {
        let paths: &[&str] = if s.pages.route == Route::Tasks {
            &["tasks/plugin"]
        } else {
            &["connection", "side-chat-plugin", "canvas-plugin"]
        };
        if let Some(url) = &crate::OPTIONS.get().unwrap().gateway {
            for path in paths {
                let url = url.clone();
                let tag = format!("page:{path}");
                let path = path.to_string();
                let result = std::thread::spawn(move || oc_gateway::capture_page(&url, &path))
                    .join()
                    .unwrap();
                pages::receive(s, &tag, result);
            }
        }
    }
    // Snapshot capture fetches real data before advancing the virtual clock.
    let path = match &s.pages.route {
        Route::Tasks => Some("tasks"),
        Route::Apps => Some("apps"),
        Route::Settings(v) if v == "remote" => Some("remote"),
        Route::Settings(v) if v == "usage" => Some("usage/limits"),
        _ => None,
    };
    if let (Some(path), Some(url)) = (path, &crate::OPTIONS.get().unwrap().gateway) {
        let path = path.to_owned();
        let url = url.clone();
        let result = std::thread::spawn(move || oc_gateway::capture_page(&url, &path))
            .join()
            .unwrap();
        let path = match &s.pages.route {
            Route::Tasks => "tasks",
            Route::Apps => "apps",
            Route::Settings(v) if v == "remote" => "remote",
            _ => "usage/limits",
        };
        pages::receive(s, &format!("page:{path}"), result);
    }
}
