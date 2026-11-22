//! Chords are shared with the shortcuts page; composer-specific bindings stay in composer.
use crate::{State, pages::Route};
use rune::{KeyEvent, Tx};
pub fn global(s: &mut State, event: &KeyEvent, tx: &mut Tx) -> bool {
    observe(s, event);
    if event.is_command('l')
        && s.workbench.open
        && s.workbench.panel == crate::workbench::Panel::Browser
    {
        tx.focus("browser-address", true);
        return true;
    }
    if event.is_command('s') && s.workbench.open {
        s.save_workspace_file();
        return true;
    }
    if dispatch(s, event, tx) {
        return true;
    }
    if s.pages.route != Route::Chat || s.menus.open.is_some() {
        return false;
    }
    // The catalog owns modified chords; do not accept extra modifiers.
    if event.mods.cmd
        || event.mods.ctrl
        || matches!(event.key, rune::Key::Command(_))
        || (event.key == rune::Key::Escape && (event.mods.alt || event.mods.shift))
    {
        return false;
    }
    crate::composer::keys::global(s, event, tx)
}
/// Inputs consume keys before the global handler. They must still break sequences.
pub fn observe(s: &mut State, event: &KeyEvent) {
    if event.key != rune::Key::Escape
        || event.mods.cmd
        || event.mods.ctrl
        || event.mods.alt
        || event.mods.shift
    {
        s.composer.escape_until = None;
    }
}
pub const COMMANDS: &[(&str, &str, &str)] = &[
    ("Toggle workspace panel", "mod+i", "workspace.toggle"),
    ("Toggle terminal", "mod+j", "terminal.toggle"),
    ("Toggle sidebar", "mod+b", "sidebar.toggle"),
    ("New chat", "mod+n", "chat.new"),
    ("New chat", "mod+alt+n", "chat.new"),
    ("Open project", "mod+o", "project.open"),
    ("Open tasks", "mod+shift+d", "tasks.open"),
    ("Open settings", "mod+,", "settings.open"),
    ("Keyboard shortcuts", "mod+/", "shortcuts.open"),
    ("Find in chat or file", "mod+f", "find.open"),
    ("Focus message", "mod+shift+l", "composer.focus"),
    ("Focus thread navigation", "mod+shift+k", "sidebar.focus"),
    ("Choose model", "mod+shift+m", "model.choose"),
    ("Choose thinking level", "mod+shift+e", "thinking.choose"),
    ("Cycle thinking level", "ctrl+t", "thinking.cycle"),
    (
        "Move running work to the background",
        "ctrl+b",
        "chat.background",
    ),
];
pub fn dispatch(s: &mut State, event: &KeyEvent, tx: &mut Tx) -> bool {
    if !event.mods.cmd
        && !event.mods.ctrl
        && !matches!(event.key, rune::Key::Command(_) | rune::Key::Escape)
    {
        return false;
    }
    if event.key == rune::Key::Escape {
        if s.find.open {
            crate::find::close(s, tx);
            return true;
        }
        if s.menus.open.take().is_some() {
            return true;
        }
        if s.pages.projects.dialog.is_some() {
            if s.pages.projects.suggesting {
                s.pages.projects.suggesting = false;
            } else {
                crate::settings::projects::close(s);
            }
            return true;
        }
        if s.pages.apps.dialog.is_some() {
            crate::apps::close_dialog(s);
            return true;
        }
        if s.pages.route != Route::Chat && s.pages.route != Route::ProjectSetup {
            s.open_page(Route::Chat);
            return true;
        }
    }
    if s.menus.open.is_some() || s.pages.projects.dialog.is_some() || s.pages.apps.dialog.is_some()
    {
        return false;
    }
    if s.find.open
        && (rune::Chord::parse("mod+g").unwrap().matches_tx(event, tx)
            || rune::Chord::parse("mod+shift+g")
                .unwrap()
                .matches_tx(event, tx))
    {
        crate::find::next(s, tx, event.mods.shift);
        return true;
    }
    for &(_, chord, id) in COMMANDS {
        if id == "chat.background" && !cfg!(target_os = "macos") {
            continue;
        }
        if rune::Chord::parse(chord).is_ok_and(|chord| chord.matches_tx(event, tx)) {
            return execute(s, id, tx);
        }
    }
    if !cfg!(target_os = "macos")
        && rune::Chord::parse("ctrl+shift+b")
            .unwrap()
            .matches_tx(event, tx)
    {
        return execute(s, "chat.background", tx);
    }
    for n in 1..=9 {
        if rune::Chord::parse(&format!("mod+{n}"))
            .unwrap()
            .matches_tx(event, tx)
        {
            let id = s
                .rows
                .iter()
                .filter_map(|row| match row {
                    crate::sidebar::Item::Session(id, false) => Some(id.clone()),
                    _ => None,
                })
                .nth(n - 1);
            if let Some(id) = id {
                s.open_session(Some(id));
                return true;
            }
        }
    }
    false
}
pub fn execute(s: &mut State, id: &str, tx: &mut Tx) -> bool {
    match id {
        "sidebar.toggle" => {
            s.prefs.sidebar_closed = !s.prefs.sidebar_closed;
            s.save();
        }
        "chat.new" => {
            s.open_session(None);
            tx.focus("message", false);
        }
        "tasks.open" => s.open_page(Route::Tasks),
        "settings.open" => s.open_page(Route::Settings("general".into())),
        "shortcuts.open" => s.open_page(Route::Settings("shortcuts".into())),
        "project.open" => crate::menus::open_projects(s, tx),
        "find.open" => crate::find::open(s, tx),
        "model.choose" | "thinking.choose" | "thinking.cycle" => {
            if s.pages.route != Route::Chat || s.chat.read_only() || crate::docks::active(s) {
                return false;
            }
            match id {
                "model.choose" => {
                    crate::composer::menus::open(s, crate::composer::state::Menu::Models, tx)
                }
                "thinking.choose" => {
                    if !s.model_info().is_some_and(|m| !m.variants.is_empty()) {
                        return false;
                    }
                    crate::composer::menus::open(s, crate::composer::state::Menu::Thinking, tx);
                }
                _ => {
                    let (Some(mut model), Some(info)) =
                        (s.selected_model().cloned(), s.model_info())
                    else {
                        return false;
                    };
                    if info.variants.is_empty() {
                        return false;
                    }
                    let next = model
                        .variant
                        .as_ref()
                        .and_then(|v| info.variants.iter().position(|item| &item.id == v))
                        .map(|n| n + 1)
                        .unwrap_or(0);
                    model.variant = info.variants.get(next).map(|v| v.id.clone());
                    s.choose_model(model);
                }
            }
        }
        "sidebar.focus" => tx.focus("project-list", false),
        "composer.focus" => {
            s.open_page(Route::Chat);
            tx.focus("message", false);
        }
        "chat.background" => {
            if s.pages.route != Route::Chat
                || !s.chat.data.running
                || s.pages.pending.contains("session-background")
            {
                return false;
            }
            let blocked = s
                .chat
                .data
                .messages
                .iter()
                .rev()
                .find(|m| m.r#type == "assistant")
                .is_some_and(|m| {
                    m.time.completed.is_none()
                        && m.fields
                            .get("content")
                            .and_then(serde_json::Value::as_array)
                            .is_some_and(|parts| {
                                parts.iter().any(|p| {
                                    p["type"] == "tool"
                                        && p["state"]["status"] == "running"
                                        && (p["name"] == "shell" || p["name"] == "subagent")
                                })
                            })
                });
            let Some(id) = s.selected.clone().filter(|_| blocked) else {
                return false;
            };
            s.page_mutate(
                &format!("sessions/{id}/background"),
                serde_json::json!({}),
                "session-background",
                false,
            );
        }
        "workspace.toggle" => {
            s.workbench.open = !s.workbench.open;
            s.load_panel(false);
        }
        "terminal.toggle" => s.toggle_terminal(),
        _ => return false,
    }
    true
}
