use super::{fuzzy, state::Menu};
use crate::{State, sidebar::label};
use oc_gateway::{prompt::Request, types::ModelRef};
use rune::{Align, El, Key, Side, TextStyle, Tx, col, row, text_input};
use serde_json::{Value, json};

#[derive(Clone)]
pub struct Choice {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub data: Value,
    pub heading: bool,
}
fn choice(id: &str, label: &str, detail: &str, data: Value) -> Choice {
    Choice {
        id: id.into(),
        label: label.into(),
        detail: detail.into(),
        data,
        heading: false,
    }
}
pub fn open(s: &mut State, menu: Menu, tx: &mut Tx) {
    s.composer.menu = Some(menu);
    s.composer.search.clear();
    s.composer.cursor = 0;
    filter(s);
    if matches!(menu, Menu::Models | Menu::Branch) {
        tx.focus("composer-search", false);
    }
    tx.instant();
}
pub fn prefetch(s: &mut State) {
    if s.composer.worker.is_none() {
        return;
    }
    let Some(directory) = s.project().map(|p| p.canonical.clone()) else {
        return;
    };
    if !s.composer.loaded.insert(directory.clone()) {
        return;
    }
    while s.composer.loaded.len() > 32 {
        let Some(old) = s.composer.loaded.iter().find(|d| *d != &directory).cloned() else {
            break;
        };
        s.composer.loaded.remove(&old);
        s.composer.commands.remove(&old);
        s.composer.skills.remove(&old);
        s.composer.files.remove(&old);
        s.composer.branches.remove(&old);
    }
    for (kind, path) in [
        ("commands", "commands"),
        ("skills", "workspace/skills"),
        ("branches", "workspace/branches"),
    ] {
        s.prompt_request(Request::Get {
            tag: format!("{kind}:{directory}"),
            path: path.into(),
            query: vec![("directory".into(), directory.clone())],
        });
    }
    s.prompt_request(Request::Get {
        tag: format!("mention-chats:{directory}"),
        path: "session-search".into(),
        query: vec![("search".into(), String::new())],
    });
}
pub fn filter(s: &mut State) {
    let Some(menu) = s.composer.menu else {
        return;
    };
    let directory = s.project().map(|p| p.canonical.as_str()).unwrap_or("");
    let query = s.composer.search.text.trim();
    let mut choices = vec![];
    match menu {
        Menu::ConfirmAccess | Menu::Fork | Menu::ShellOutput | Menu::Calendar => {}
        Menu::Models => {
            if let Some(catalog) = s.snapshot.models.get(directory) {
                if query.is_empty()
                    && let Some(model) = s.model_info()
                {
                    let mut heading = choice("current", "Current model", "1", Value::Null);
                    heading.heading = true;
                    choices.push(heading);
                    choices.push(choice(
                        "current-model",
                        &model.name,
                        &context(model.limit["context"].as_u64()),
                        json!({"id":model.id,"providerID":model.provider_id,"frequent":true}),
                    ));
                }
                let mut providers: Vec<_> = catalog
                    .data
                    .iter()
                    .filter(|m| m.enabled)
                    .map(|m| m.provider_id.as_str())
                    .collect();
                providers.sort();
                providers.dedup();
                for provider in providers {
                    let name = catalog
                        .providers
                        .iter()
                        .find(|p| p.id == provider)
                        .map(|p| p.name.as_str())
                        .unwrap_or(provider);
                    let mut models: Vec<_> = catalog
                        .data
                        .iter()
                        .filter(|m| {
                            m.enabled
                                && m.provider_id == provider
                                && format!("{name} {} {}", m.name, m.id)
                                    .to_lowercase()
                                    .contains(&query.to_lowercase())
                        })
                        .collect();
                    models.sort_by(|a, b| a.name.cmp(&b.name));
                    if models.is_empty() {
                        continue;
                    }
                    let mut heading = choice(
                        provider,
                        name,
                        &models.len().to_string(),
                        json!({"provider":provider}),
                    );
                    heading.heading = true;
                    choices.push(heading);
                    if query.is_empty() && s.composer.collapsed_providers.contains(provider) {
                        continue;
                    }
                    choices.extend(models.into_iter().map(|m| {
                        choice(
                            &format!("{provider}/{}", m.id),
                            &m.name,
                            &context(m.limit["context"].as_u64()),
                            json!({"id":m.id,"providerID":provider}),
                        )
                    }));
                }
            }
        }
        Menu::Thinking => {
            choices.push(choice("", "Default", "", Value::Null));
            if let Some(model) = s.model_info() {
                choices.extend(
                    model
                        .variants
                        .iter()
                        .map(|v| choice(&v.id, &super::variant_label(&v.id), "", Value::Null)),
                );
            }
        }
        Menu::Workspace => {
            choices.push(choice(
                "local",
                "Local",
                "Work in your project folder",
                Value::Null,
            ));
            choices.push(choice(
                "worktree",
                "New worktree",
                "Isolated checkout. Local changes stay put.",
                Value::Null,
            ));
        }
        Menu::Branch => {
            choices.push(choice("", "Current branch", "Start from HEAD", Value::Null));
            for b in s.composer.branches.get(directory).into_iter().flatten() {
                if let Some(name) = b.as_str().or_else(|| b["name"].as_str()) {
                    if fuzzy::score(name, query).is_some() {
                        choices.push(choice(name, name, "", Value::Null));
                    }
                }
            }
        }
        Menu::Slash => {
            {
                for (name, description) in super::commands::LOCAL {
                    {
                        choices.push(choice(name, &format!("/{name}"), description, Value::Null));
                    }
                }
            }
            for item in s
                .composer
                .skills
                .get(directory)
                .into_iter()
                .flatten()
                .chain(s.composer.commands.get(directory).into_iter().flatten())
            {
                let name = item["name"].as_str().unwrap_or("");
                if !choices.iter().any(|c| c.id == name) {
                    choices.push(choice(
                        name,
                        &format!("/{name}"),
                        item["description"]
                            .as_str()
                            .unwrap_or(if item.get("id").is_some() {
                                "Use skill"
                            } else {
                                "Run command"
                            }),
                        Value::Null,
                    ));
                }
            }
        }
        Menu::Mention => {
            let search = query.to_lowercase();
            let mut skills: Vec<_> = s
                .composer
                .skills
                .get(directory)
                .into_iter()
                .flatten()
                .filter_map(|item| {
                    let name = item["name"].as_str().unwrap_or("").to_lowercase();
                    let rank = if name.starts_with(&search) {
                        0
                    } else if name.contains(&search)
                        || item["id"]
                            .as_str()
                            .unwrap_or("")
                            .to_lowercase()
                            .contains(&search)
                    {
                        1
                    } else {
                        return None;
                    };
                    Some((rank, item))
                })
                .collect();
            skills.sort_by_key(|(rank, _)| *rank);
            for (_, item) in skills.into_iter().take(5) {
                let name = item["name"].as_str().unwrap_or("");
                choices.push(choice(
                    name,
                    name,
                    item["description"].as_str().unwrap_or("Skill"),
                    json!({"type":"skill","id":item["id"],"token":format!("@{name}")}),
                ));
            }
            for item in s
                .composer
                .files
                .get(directory)
                .into_iter()
                .flatten()
                .filter(|_| !query.is_empty())
                .take(6)
            {
                let path = item["path"].as_str().unwrap_or("");
                let (parent, name) = path.rsplit_once('/').unwrap_or(("", path));
                choices.push(choice(
                    path,
                    name,
                    parent,
                    json!({"type":"file","path":path,"token":format!("@{path}")}),
                ));
            }
            let mut threads: Vec<_> = s
                .snapshot
                .sessions
                .values()
                .filter(|t| {
                    Some(&t.id) != s.selected.as_ref() && t.title.to_lowercase().contains(&search)
                })
                .collect();
            threads.sort_by(|a, b| b.updated_at.total_cmp(&a.updated_at));
            for thread in threads
                .into_iter()
                .take(if s.composer.recent_chats.is_empty() {
                    5
                } else {
                    0
                })
            {
                choices.push(choice(
                    &thread.id,
                    &thread.title,
                    thread.directory.rsplit(['/', '\\']).next().unwrap_or(""),
                    json!({"type":"chat","id":thread.id,"token":format!("@{}",thread.title)}),
                ));
            }
            for thread in s
                .composer
                .recent_chats
                .iter()
                .filter(|t| {
                    t["id"].as_str() != s.selected.as_deref()
                        && t["title"]
                            .as_str()
                            .unwrap_or("")
                            .to_lowercase()
                            .contains(&search)
                })
                .take(5)
            {
                let id = thread["id"].as_str().unwrap_or("");
                let title = thread["title"].as_str().unwrap_or("");
                choices.push(choice(
                    id,
                    title,
                    thread["directory"]
                        .as_str()
                        .unwrap_or("")
                        .rsplit(['/', '\\'])
                        .next()
                        .unwrap_or(""),
                    json!({"type":"chat", "id":id, "token":format!("@{title}")}),
                ));
            }
        }
    }
    if menu == Menu::Slash {
        if s.selected.is_none() {
            choices.retain(|c| !super::commands::LOCAL.iter().any(|(name, _)| *name == c.id));
        }
        let query = query.to_lowercase();
        let rank = |c: &Choice| {
            let name = c.id.to_lowercase();
            if name == query {
                0
            } else if name.starts_with(&query) {
                1
            } else if name.contains(&query) {
                2
            } else if c.detail.to_lowercase().contains(&query) {
                3
            } else {
                4
            }
        };
        choices.retain(|c| rank(c) < 4);
        choices.sort_by_key(rank);
    }
    if matches!(menu, Menu::Slash | Menu::Mention) {
        choices.truncate(50);
    }
    s.composer.choices = choices;
    s.composer.cursor = s
        .composer
        .choices
        .iter()
        .position(|c| !c.heading)
        .unwrap_or(0);
    if menu == Menu::Workspace && s.draft().worktree {
        s.composer.cursor = 1;
    }
}
fn context(value: Option<u64>) -> String {
    match value {
        Some(n) if n >= 1_000_000 => format!("{}M", n / 1_000_000),
        Some(n) if n % 1000 == 0 => format!("{}K", n / 1000),
        Some(n) => format!("{:.1}K", n as f64 / 1000.0),
        None => String::new(),
    }
}
pub fn changed(s: &mut State, tx: &mut Tx) {
    let draft = s.draft_mut();
    draft.mentions.retain(|item| {
        item["token"]
            .as_str()
            .is_some_and(|token| super::state::mention_position(&draft.edit.text, token).is_some())
    });
    s.touch_draft();
    let edit = &s.draft().edit;
    let text = &edit.text[..edit.focus.min(edit.text.len())];
    let next = if text.starts_with('/') && !text.contains(char::is_whitespace) {
        Some((Menu::Slash, text[1..].to_owned()))
    } else {
        text.rsplit_once('@')
            .filter(|(before, after)| {
                (before.is_empty() || before.ends_with(char::is_whitespace))
                    && !after.contains(char::is_whitespace)
            })
            .map(|(_, q)| (Menu::Mention, q.into()))
    };
    if let Some((menu, query)) = next {
        if menu == Menu::Mention
            && let Some(directory) = s.project().map(|p| p.canonical.clone())
        {
            s.composer.mention_search = Some((
                std::time::Instant::now() + std::time::Duration::from_millis(80),
                directory,
                query.clone(),
            ));
            tx.wake_after(std::time::Duration::from_millis(80));
        }
        s.composer.menu = Some(menu);
        s.composer.search.replace_text(query);
        filter(s);
    } else if matches!(s.composer.menu, Some(Menu::Slash | Menu::Mention)) {
        s.composer.menu = None;
    }
    tx.instant();
}
pub fn keys(s: &mut State, ev: &rune::KeyEvent, tx: &mut Tx) -> bool {
    if s.composer.menu.is_none() {
        return false;
    }
    if ev.key == Key::Escape {
        s.composer.menu = None;
        tx.focus("message", false);
        return true;
    }
    let n = s.composer.choices.len();
    if n == 0 {
        return false;
    }
    match ev.key {
        Key::Up | Key::Down => {
            for _ in 0..n {
                s.composer.cursor =
                    (s.composer.cursor + n + if ev.key == Key::Down { 1 } else { n - 1 }) % n;
                if !s.composer.choices[s.composer.cursor].heading {
                    break;
                }
            }
            tx.scroll_into_view(format!("composer-choice-{}", s.composer.cursor));
            true
        }
        Key::Enter | Key::Tab if !ev.mods.shift => {
            choose(s, s.composer.cursor, tx);
            true
        }
        _ => false,
    }
}
fn choose(s: &mut State, index: usize, tx: &mut Tx) {
    let Some(c) = s.composer.choices.get(index).cloned() else {
        return;
    };
    if c.heading {
        if c.id != "current" {
            if !s.composer.collapsed_providers.remove(&c.id) {
                s.composer.collapsed_providers.insert(c.id);
            }
            filter(s);
        }
        return;
    }
    match s.composer.menu {
        Some(Menu::Models) => {
            if let Ok(mut model) = serde_json::from_value::<ModelRef>(c.data) {
                model.variant = s
                    .prefs
                    .model_variants
                    .get(&format!("{}/{}", model.provider_id, model.id))
                    .cloned()
                    .flatten();
                s.choose_model(model);
            }
        }
        Some(Menu::Thinking) => {
            if let Some(mut model) = s.selected_model().cloned() {
                model.variant = (!c.id.is_empty()).then_some(c.id);
                s.choose_model(model);
            }
        }
        Some(Menu::Workspace) => {
            s.draft_mut().worktree = c.id == "worktree";
            s.touch_draft();
        }
        Some(Menu::Branch) => {
            s.draft_mut().branch = (!c.id.is_empty()).then_some(c.id);
            s.touch_draft();
        }
        Some(Menu::Slash) => {
            s.draft_mut().edit.replace_text(format!("/{} ", c.id));
            s.touch_draft();
        }
        Some(Menu::Mention) => {
            let caret = s.draft().edit.focus;
            let text = &s.draft().edit.text[..caret];
            if let Some(start) = text.rfind('@') {
                let token = c.data["token"].as_str().unwrap_or("");
                s.draft_mut().edit.set_selection(start, caret);
                s.draft_mut().edit.insert(&format!("{token} "));
                s.draft_mut()
                    .mentions
                    .retain(|item| item["token"] != c.data["token"]);
                s.draft_mut().mentions.push(c.data);
                s.touch_draft();
            }
        }
        _ => {}
    }
    s.composer.menu = None;
    tx.focus("message", false);
    tx.instant();
}
pub fn view(s: &State) -> Option<El> {
    if let Some(calendar) = crate::docks::date::view(s) {
        return Some(calendar);
    }
    if s.composer.running.output.is_some() {
        return Some(super::running_output::view(s));
    }
    let menu = s.composer.menu?;
    if menu == Menu::ConfirmAccess {
        return Some(super::access::view(s));
    }
    if menu == Menu::Fork {
        return Some(super::fork::view(s));
    }
    let t = &s.theme;
    let inline = matches!(menu, Menu::Slash | Menu::Mention);
    let width = if inline {
        let sidebar = if s.prefs.sidebar_closed {
            0.0
        } else {
            s.sidebar_width()
        };
        (s.window_size.0 - sidebar).min(768.0) - 48.0
    } else if menu == Menu::Models {
        400.0
    } else if menu == Menu::Workspace {
        300.0f32.min(s.window_size.0 - 48.0)
    } else {
        360.0
    };
    let searchable = matches!(menu, Menu::Models | Menu::Branch);
    let anchor = match menu {
        Menu::Models => "model-picker",
        Menu::Thinking => "thinking-picker",
        Menu::Workspace | Menu::Branch => "workspace-choice",
        _ => "composer",
    };
    let mut panel = crate::menus::overlay::surface(
        t,
        col()
            .key("composer-menu")
            .w(width)
            .padding(if menu == Menu::Models {
                0.0
            } else if menu == Menu::Workspace {
                5.0
            } else {
                6.0
            })
            .gap(0.0)
            .role("listbox")
            .label("Composer choices"),
        12.0,
        "elevated",
        "border-heavy",
    );
    if searchable {
        panel = panel.child(
            row()
                .h(44.0)
                .w_full()
                .px(14.0)
                .gap(10.0)
                .center_y()
                .border_sides(
                    [0.0, 0.0, 1.0, 0.0],
                    t.c(if s.composer.search.focused {
                        "accent"
                    } else {
                        "border"
                    }),
                )
                .border_layout()
                .child(rune::icon(&crate::icons::SEARCH, 16.0).color(t.c("text-tertiary")))
                .child(
                    text_input(&s.composer.search, TextStyle::new(13.0, 400.0))
                        .key("composer-search")
                        .h(24.0)
                        .grow(1.0)
                        .min_w(0.0)
                        .single_line()
                        .color(t.c("text"))
                        .placeholder("Search models…", t.c("text-tertiary"))
                        .on_edit(|s: &mut State| &mut s.composer.search)
                        .on_input_change(|s: &mut State, tx| {
                            filter(s);
                            tx.instant();
                        })
                        .on_input_key(keys),
                ),
        );
    }
    if s.composer.choices.is_empty() {
        panel = panel.child(label(t, "No results", 13.0, 400.0, "text-tertiary").padding(12.0));
    }
    let n = s.composer.choices.len();
    let row_height = if menu == Menu::Models || inline {
        if inline { 37.0 } else { 36.0 }
    } else if menu == Menu::Workspace {
        50.75
    } else {
        44.0
    };
    panel = panel.child(
        col()
            .key("composer-options")
            .w_full()
            .h((n as f32
                * if menu == Menu::Models {
                    44.0
                } else {
                    row_height
                })
            .min(if menu == Menu::Models {
                342.0
            } else if inline {
                (s.window_size.1 * 0.4).min(320.0) - 14.0
            } else {
                352.0
            }))
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            })
            .child(
                col()
                    .w_full()
                    .px(if menu == Menu::Models { 6.0 } else { 0.0 })
                    .growth(rune::GrowthSpec::default())
                    .virtual_rows(
                        n,
                        row_height,
                        |s: &State, i| std::borrow::Cow::Borrowed(&s.composer.choices[i].id),
                        move |s: &State, i| {
                            let c = &s.composer.choices[i];
                            let t = &s.theme;
                            let mut r = row()
                                .key(format!("composer-choice-{i}"))
                                .h(row_height)
                                .w_full()
                                .px(if menu == Menu::Models {
                                    8.0
                                } else if menu == Menu::Workspace {
                                    5.0
                                } else {
                                    10.0
                                })
                                .gap(if inline { 10.0 } else { 8.0 })
                                .center_y()
                                .radius(6.0);
                            if c.heading {
                                if let Some(provider) = c.data["provider"].as_str() {
                                    r = r.child(super::providers::view(s, provider));
                                }
                                return r
                                    .child(label(t, &c.label, 12.0, 500.0, "text-secondary"))
                                    .child(rune::el().grow(1.0))
                                    .child(label(t, &c.detail, 11.0, 400.0, "text-tertiary"))
                                    .child(
                                        rune::icon(&crate::icons::DOWN, 14.0)
                                            .color(t.c("text-tertiary")),
                                    )
                                    .role("button")
                                    .label(&c.label)
                                    .on_press_tx(move |s: &mut State, tx| choose(s, i, tx));
                            }
                            if menu == Menu::Models {
                                let selected = s.selected_model().is_some_and(|m| {
                                    c.data["id"] == m.id && c.data["providerID"] == m.provider_id
                                });
                                if selected {
                                    r = r.fill(t.c("selected"));
                                }
                                if s.composer.cursor == i {
                                    r = r.fill(t.c("hover"));
                                }
                                if c.data["frequent"] == true {
                                    r = r.child(super::providers::view(
                                        s,
                                        c.data["providerID"].as_str().unwrap_or(""),
                                    ));
                                } else {
                                    r = r.pl(34.0);
                                }
                                r = r
                                    .child(label(t, &c.label, 13.0, 400.0, "text").truncate())
                                    .child(label(t, &c.detail, 11.0, 400.0, "text-tertiary"))
                                    .child(rune::el().grow(1.0));
                                if selected {
                                    r = r.child(label(t, "✓", 13.0, 400.0, "text-secondary"));
                                }
                                return r
                                    .hover(t.c("hover"))
                                    .role("option")
                                    .label(&c.label)
                                    .on_press_tx(move |s: &mut State, tx| choose(s, i, tx));
                            }
                            if s.composer.cursor == i {
                                r = r.fill(t.c(if menu == Menu::Workspace {
                                    "hover"
                                } else {
                                    "selected"
                                }));
                            }
                            if inline {
                                if menu == Menu::Mention {
                                    let glyph = match c.data["type"].as_str() {
                                        Some("skill") => &crate::chat::icons::SKILL,
                                        Some("chat") => &crate::icons::CHAT,
                                        _ => &crate::chat::icons::READ,
                                    };
                                    r = r
                                        .child(rune::icon(glyph, 16.0).color(t.c("text-tertiary")));
                                }
                                return r
                                    .child(
                                        label(
                                            t,
                                            &c.label,
                                            14.0,
                                            400.0,
                                            if s.composer.cursor == i {
                                                "text"
                                            } else {
                                                "text-secondary"
                                            },
                                        )
                                        .truncate(),
                                    )
                                    .child(
                                        label(t, &c.detail, 12.0, 400.0, "text-tertiary")
                                            .grow(1.0)
                                            .min_w(0.0)
                                            .truncate(),
                                    )
                                    .hover(t.c("hover"))
                                    .role("option")
                                    .label(&c.label)
                                    .on_press_tx(move |s: &mut State, tx| choose(s, i, tx));
                            }
                            if menu == Menu::Workspace {
                                r = r.child(
                                    rune::icon(
                                        if c.id == "worktree" {
                                            &crate::icons::WORKTREE
                                        } else {
                                            &crate::icons::FOLDER
                                        },
                                        16.0,
                                    )
                                    .color(t.c("text-secondary")),
                                );
                            }
                            r = r.child(
                                col()
                                    .grow(1.0)
                                    .min_w(0.0)
                                    .gap(2.0)
                                    .child(
                                        label(
                                            t,
                                            &c.label,
                                            13.0,
                                            400.0,
                                            if menu == Menu::Workspace {
                                                "text-secondary"
                                            } else {
                                                "text"
                                            },
                                        )
                                        .truncate(),
                                    )
                                    .child(
                                        label(
                                            t,
                                            &c.detail,
                                            if menu == Menu::Workspace { 11.5 } else { 11.0 },
                                            400.0,
                                            "text-tertiary",
                                        )
                                        .truncate(),
                                    ),
                            );
                            if menu == Menu::Workspace && (c.id == "worktree") == s.draft().worktree
                            {
                                r = r.child(
                                    rune::icon(&crate::icons::TICK, 14.0)
                                        .color(t.c("text-secondary")),
                                );
                            }
                            r.hover(t.c("hover"))
                                .role("option")
                                .label(&c.label)
                                .on_press_tx(move |s: &mut State, tx| choose(s, i, tx))
                        },
                    ),
            ),
    );
    if menu == Menu::Models {
        panel = panel.child(
            row()
                .h(30.0)
                .center_y()
                .gap(16.0)
                .border_sides([1.0, 0.0, 0.0, 0.0], t.c("border"))
                .border_layout()
                .px(14.0)
                .py(4.0)
                .child(label(t, "↑↓ Navigate", 11.0, 400.0, "text-tertiary"))
                .child(label(t, "↵ Select", 11.0, 400.0, "text-tertiary"))
                .child(label(t, "esc Close", 11.0, 400.0, "text-tertiary")),
        );
    }
    let panel = crate::menus::overlay::anchored(
        t,
        panel,
        anchor,
        Side::Top,
        Align::Start,
        if menu == Menu::Workspace { 4.0 } else { 8.0 },
    );
    Some(if matches!(menu, Menu::Slash | Menu::Mention) {
        panel
    } else {
        panel
            .modal_tx(true, |s: &mut State, tx| {
                s.composer.menu = None;
                tx.focus("message", false);
            })
            .on_key(keys)
    })
}
