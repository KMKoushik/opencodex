//! Source: projects/project-switcher.tsx. Query and active row are presentation state.
use crate::{State, icons as i, sidebar::label};
use rune::{El, Key, KeyEvent, ScrollSpec, TextEdit, TextStyle, Tx, col, el, row, text_input};
use serde_json::{Value, json};

#[derive(Default)]
pub struct Picker {
    pub query: TextEdit,
    pub active: String,
    pub pending: bool,
    pub error: Option<String>,
    pub generation: u64,
    pub focus_on_show: bool,
}
pub struct OptionRow {
    pub directory: String,
    pub project: Option<oc_gateway::types::Project>,
}
fn remember_folder(s: &mut State, directory: &str, name: Option<&str>) {
    if !s
        .prefs
        .opened_projects
        .iter()
        .any(|p| p.canonical == directory)
    {
        s.prefs.opened_projects.insert(
            0,
            oc_gateway::types::Project {
                id: format!("folder:{directory}"),
                canonical: directory.into(),
                name: name.map(str::to_owned),
                icon: None,
                vcs: None,
                time: Default::default(),
            },
        );
    }
}
fn select_composer_folder(s: &mut State, directory: String) {
    if let Some(model) = s.selected_model().cloned() {
        s.prefs.project_models.insert(directory.clone(), model);
    }
    crate::settings::projects::select(s, directory);
}
/// The home / composer forms resolve presentation folders. Settings' explicit
/// Add/Edit operations retain their own registration and mutation ownership.
pub fn receive_home_folder(s: &mut State, result: Result<Value, String>) -> bool {
    if matches!(s.pages.route, crate::pages::Route::Settings(_)) {
        return false;
    }
    let active = s.pages.route == crate::pages::Route::ProjectSetup
        || matches!(
            s.pages.projects.dialog,
            Some(crate::settings::projects::Dialog::Open(false))
        );
    s.pages.projects.busy = false;
    if !active {
        return true;
    }
    match result {
        Err(error) => s.pages.projects.error = Some(error),
        Ok(value) => {
            if let Some(path) = value["directory"]
                .as_str()
                .or_else(|| value["canonical"].as_str())
            {
                remember_folder(s, path, value["name"].as_str());
                s.pages.projects.dialog = None;
                if s.pages.route == crate::pages::Route::Chat {
                    select_composer_folder(s, path.into());
                } else {
                    crate::settings::projects::select(s, path.into());
                }
                s.command(oc_gateway::Command::Refresh);
            } else {
                s.pages.projects.error =
                    Some("The gateway returned an invalid project folder.".into());
            }
        }
    }
    true
}
pub fn rows(s: &State) -> Vec<OptionRow> {
    let mut projects: Vec<_> = s.snapshot.projects.iter().collect();
    let mut seen = std::collections::BTreeSet::new();
    projects.retain(|p| seen.insert(&p.canonical));
    projects.extend(s.prefs.opened_projects.iter().filter(|p| {
        !s.snapshot
            .projects
            .iter()
            .any(|native| native.canonical == p.canonical)
    }));
    projects.sort_by(|a, b| {
        let recent = |p: &oc_gateway::types::Project| {
            p.time
                .active
                .filter(|v| *v != 0.0)
                .unwrap_or(p.time.updated)
        };
        recent(b).total_cmp(&recent(a))
    });
    let query = s.menus.projects.query.text.trim();
    let search = query.to_lowercase();
    let mut rows: Vec<_> = projects
        .into_iter()
        .filter(|p| {
            format!("{} {}", p.display_name(), p.canonical)
                .to_lowercase()
                .contains(&search)
        })
        .map(|p| OptionRow {
            directory: p.canonical.clone(),
            project: Some(p.clone()),
        })
        .collect();
    let path = query.contains(['/', '\\']) || query.starts_with(['~', '.']);
    if path && !rows.iter().any(|p| p.directory == query) {
        rows.push(OptionRow {
            directory: query.into(),
            project: None,
        });
    }
    rows
}
pub fn active(s: &State, rows: &[OptionRow]) -> usize {
    rows.iter()
        .position(|r| r.directory == s.menus.projects.active)
        .unwrap_or(0)
}
pub fn open(s: &mut State, tx: &mut Tx) {
    if !super::search::connected(s) {
        return;
    }
    let current = s.project().map(|p| p.canonical.clone()).unwrap_or_default();
    let generation = s.menus.projects.generation.wrapping_add(1);
    s.menus.projects = Picker {
        active: current,
        generation,
        focus_on_show: true,
        ..Default::default()
    };
    s.menus.open = Some(super::Menu::Projects);
    tx.focus_when_shown("project-switcher-search", false);
}
pub fn close(s: &mut State, tx: &mut Tx) {
    s.menus.open = None;
    s.menus.projects.generation = s.menus.projects.generation.wrapping_add(1);
    tx.return_focus("Switch project", tx.by_keys());
}
fn changed(s: &mut State, tx: &mut Tx) {
    s.menus.projects.active.clear();
    s.menus.projects.error = None;
    if !rows(s).is_empty() {
        tx.scroll_into_view_in("project-switcher-options", "project-option-0");
    }
}
pub fn navigate(s: &mut State, event: &KeyEvent, tx: &mut Tx) -> bool {
    match event.key {
        Key::Escape => {
            close(s, tx);
            true
        }
        Key::Down | Key::Up => {
            let rows = rows(s);
            if rows.is_empty() {
                return true;
            }
            let index = active(s, &rows);
            let next = if event.key == Key::Down {
                (index + 1).min(rows.len() - 1)
            } else {
                index.saturating_sub(1)
            };
            s.menus.projects.active = rows[next].directory.clone();
            tx.scroll_into_view_in("project-switcher-options", format!("project-option-{next}"));
            true
        }
        Key::Enter => {
            let rows = rows(s);
            choose(s, active(s, &rows), tx);
            true
        }
        _ => false,
    }
}
fn choose(s: &mut State, index: usize, tx: &mut Tx) {
    if s.menus.projects.pending {
        return;
    }
    let Some(option) = rows(s).into_iter().nth(index) else {
        return;
    };
    if option.project.is_some() {
        let same = s.project().is_some_and(|p| p.canonical == option.directory);
        close(s, tx);
        if !same {
            select_composer_folder(s, option.directory);
        }
        return;
    }
    request(
        s,
        "resolve",
        "projects/resolve",
        json!({"directory":option.directory}),
    );
}
fn request(s: &mut State, stage: &str, path: &str, body: Value) {
    s.menus.projects.error = None;
    s.menus.projects.pending = s.prompt_request(oc_gateway::prompt::Request::Write {
        tag: format!("switcher:{}:{stage}", s.menus.projects.generation),
        path: path.into(),
        method: "POST".into(),
        body,
    });
    if !s.menus.projects.pending {
        s.menus.projects.error = Some("Gateway is not connected".into());
    }
}
pub fn receive(s: &mut State, tag: &str, result: Result<Value, String>) {
    let Some((generation, stage)) = tag
        .strip_prefix("switcher:")
        .and_then(|t| t.split_once(':'))
    else {
        return;
    };
    if generation.parse::<u64>().ok() != Some(s.menus.projects.generation)
        || !matches!(s.menus.open, Some(super::Menu::Projects))
    {
        return;
    }
    s.menus.projects.pending = false;
    let value = match result {
        Ok(value) => value,
        Err(error) => {
            s.menus.projects.error = Some(error);
            return;
        }
    };
    let Some(directory) = value["directory"]
        .as_str()
        .or_else(|| value["canonical"].as_str())
    else {
        return;
    };
    // React resolves unknown folders without registering native project metadata.
    // The presentation folder is enough for the composer; metadata arrives on send.
    if stage == "resolve" && !s.snapshot.projects.iter().any(|p| p.canonical == directory) {
        remember_folder(s, directory, value["name"].as_str());
    }
    let directory = directory.to_owned();
    s.menus.open = None;
    select_composer_folder(s, directory);
    s.command(oc_gateway::Command::Refresh);
}
pub fn after_frame(rt: &rune::Runtime<State>, handle: &rune::AppHandle<State>) {
    if !matches!(rt.state.menus.open, Some(super::Menu::Projects))
        || rt.state.menus.projects.focus_on_show
        || rt.pressing()
    {
        return;
    }
    let elements = rt.elements();
    let Some(index) = elements.iter().position(|e| e.focused) else {
        return;
    };
    let mut parent = Some(index);
    while let Some(index) = parent {
        if elements[index].key.as_deref() == Some("project-switcher-popup") {
            return;
        }
        parent = elements[index].parent;
    }
    handle.update(|s, _| {
        s.menus.open = None;
        s.menus.projects.generation = s.menus.projects.generation.wrapping_add(1);
    });
}
pub fn view(s: &State) -> El {
    let anchor = s.pages.anchors.get("Switch project").copied().unwrap_or([
        s.window_size.0 / 2.0,
        350.0,
        0.0,
        44.0,
    ]);
    let below = s.window_size.1 - anchor[1] - anchor[3];
    let above = anchor[1] > below;
    let max_h = (if above { anchor[1] } else { below } - 12.0)
        .min(440.0)
        .max(100.0);
    let width = 360.0f32.min(s.window_size.0 - 48.0);
    let rows = rows(s);
    let active = active(s, &rows);
    let pending = s.menus.projects.pending;
    let mut options = col()
        .key("project-switcher-options")
        .role("listbox")
        .label("Projects")
        .w_full()
        .min_h(0.0)
        .max_h((max_h - 108.0).max(20.0))
        .scroll(ScrollSpec {
            stick_bottom: false,
        });
    for (n, option) in rows.iter().enumerate() {
        let selected = s.project().is_some_and(|p| p.canonical == option.directory);
        let directory = option.directory.clone();
        let mut item = row()
            .key(format!("project-option-{n}"))
            .role("option")
            .label(&option.directory)
            .checked(selected)
            .w_full()
            .min_h(44.0)
            .padding(8.0)
            .gap(10.0)
            .center_y()
            .radius(5.0)
            .disabled(pending)
            .fill(if n == active {
                s.theme.c("hover")
            } else {
                rune::Color::TRANSPARENT
            });
        if let Some(project) = &option.project {
            item = item.child(crate::sidebar::images::avatar(s, project, 24.0));
        } else {
            item = item.child(rune::icon(&i::FOLDER_OPEN, 16.0).color(s.theme.c("text-secondary")));
        }
        item = item.child(
            col()
                .grow(1.0)
                .min_w(0.0)
                .gap(2.0)
                .child(
                    label(
                        &s.theme,
                        option
                            .project
                            .as_ref()
                            .map(|p| p.display_name())
                            .unwrap_or(if pending { "Opening…" } else { "Open folder" }),
                        13.0,
                        400.0,
                        "text",
                    )
                    .truncate(),
                )
                .child(label(&s.theme, &option.directory, 11.0, 400.0, "text-tertiary").truncate()),
        );
        if selected {
            item = item.child(rune::icon(&i::TICK, 14.0).color(s.theme.c("text-secondary")));
        }
        options = options.child(
            item.on_pointer_move(move |s: &mut State, _| {
                s.menus.projects.active = directory.clone()
            })
            .on_press_tx(move |s: &mut State, tx| choose(s, n, tx)),
        );
    }
    let search = row()
        .w_full()
        .h(44.0)
        .mb(4.0)
        .px(8.0)
        .gap(8.0)
        .center_y()
        .border_sides(
            [0.0, 0.0, 1.0, 0.0],
            s.theme.c(if s.menus.projects.query.focused {
                "accent"
            } else {
                "border"
            }),
        )
        .child(rune::icon(&i::SEARCH, 16.0).color(s.theme.c("text-tertiary")))
        .child(
            text_input(&s.menus.projects.query, TextStyle::new(13.0, 400.0))
                .key("project-switcher-search")
                .role("combobox")
                .label("Search projects or enter a folder path")
                .single_line()
                .grow(1.0)
                .color(s.theme.c("text"))
                .placeholder(
                    "Search projects or enter a folder path…",
                    s.theme.c("text-tertiary"),
                )
                .on_edit(|s: &mut State| &mut s.menus.projects.query)
                .on_input_change(changed)
                .on_input_key(navigate),
        );
    let mut panel = col()
        .key("project-switcher-popup")
        .on_layout_tx(|s: &mut State, _, tx| {
            if s.menus.projects.focus_on_show {
                s.menus.projects.focus_on_show = false;
                tx.focus_when_shown("project-switcher-search", false);
                let rows = self::rows(s);
                tx.scroll_into_view_in(
                    "project-switcher-options",
                    format!("project-option-{}", self::active(s, &rows)),
                );
            } else {
                tx.live_only();
            }
        })
        .w(width)
        .max_h(max_h)
        .padding(5.0)
        .radius(12.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .border_layout()
        .child(search)
        .child(options);
    if rows.is_empty() {
        panel = panel.child(
            label(
                &s.theme,
                "No matching projects",
                12.0,
                400.0,
                "text-tertiary",
            )
            .px(12.0)
            .py(10.0)
            .role("status"),
        );
    }
    if let Some(error) = &s.menus.projects.error {
        panel = panel.child(
            label(&s.theme, error, 12.0, 400.0, "error")
                .w_full()
                .wrap()
                .px(12.0)
                .py(10.0)
                .role("alert"),
        );
    }
    panel = panel.child(
        row()
            .key("project-switcher-open")
            .role("button")
            .label("Open project…")
            .focusable(true)
            .w_full()
            .h(44.0)
            .mt(4.0)
            .border_sides([1.0, 0.0, 0.0, 0.0], s.theme.c("border"))
            .px(10.0)
            .gap(8.0)
            .center_y()
            .radius(5.0)
            .hover(s.theme.c("hover"))
            .disabled(pending)
            .child(rune::icon(&i::FOLDER_OPEN, 16.0).color(s.theme.c("text-secondary")))
            .child(label(
                &s.theme,
                "Open project…",
                13.0,
                400.0,
                "text-secondary",
            ))
            .on_press_tx(|s: &mut State, tx| {
                if s.menus.projects.pending {
                    return;
                }
                close(s, tx);
                crate::settings::projects::open(
                    s,
                    crate::settings::projects::Dialog::Open(false),
                    tx,
                );
            }),
    );
    // The top edge is anchored for bottom placement; top placement uses actual content height.
    let content_h = (54.0 * rows.len() as f32
        + 108.0
        + if rows.is_empty() { 38.0 } else { 0.0 }
        + if s.menus.projects.error.is_some() {
            50.0
        } else {
            0.0
        })
    .min(max_h);
    let [x, y] = super::overlay::position(
        anchor,
        [width, content_h],
        s.window_size,
        rune::Side::Bottom,
        rune::Align::Center,
        4.0,
        super::overlay::Collision::MostRoom,
    );
    el().absolute(0.0, 0.0)
        .size(s.window_size.0, s.window_size.1)
        .on_key(|s: &mut State, event, tx| {
            if event.key == Key::Escape {
                close(s, tx);
                true
            } else {
                false
            }
        })
        .child(
            el().absolute(0.0, 0.0)
                .size(s.window_size.0, s.window_size.1)
                .on_press_tx(close),
        )
        .child(super::overlay::raised(&s.theme, panel).absolute(x, y))
}
