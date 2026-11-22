//! Focus's global session-search pages and presentation-only project exclusions.
use crate::{State, sidebar::label};
use rune::{El, col, el, row};
use serde_json::Value;
pub fn append(s: &mut State, rows: &mut Vec<super::Item>) -> bool {
    use super::Item;
    rows.push(Item::Heading("Focus".into()));
    if s.menus.focus.error.is_some() || (s.menus.focus.pending && s.menus.focus.pages == 0) {
        rows.push(Item::Note(
            s.menus
                .focus
                .error
                .clone()
                .unwrap_or_else(|| "Loading…".into()),
        ));
        if s.menus.focus.error.is_some() {
            rows.push(Item::FocusRetry);
        }
        return false;
    }
    let now = crate::unix_ms() as f64;
    let (mut recent, mut inactive): (Vec<_>, Vec<_>) = s
        .snapshot
        .sessions
        .values()
        .filter(|t| {
            t.pinned.is_none()
                && s.menus.focus.loaded.contains_key(&t.id)
                && (!s.prefs.focus_excluded.contains(&t.directory)
                    || s.snapshot.attention.contains_key(&t.id))
        })
        .partition(|t| {
            s.snapshot.active.contains(&t.id)
                || s.snapshot.attention.contains_key(&t.id)
                || (t.activity() >= now - 3.0 * 86400000.0
                    && t.done.is_none_or(|d| d < t.activity()))
        });
    let rank = |t: &oc_gateway::types::Session| {
        if s.snapshot.attention.contains_key(&t.id)
            || (!s.snapshot.active.contains(&t.id) && t.unread())
        {
            0
        } else if s.snapshot.active.contains(&t.id) {
            1
        } else {
            2
        }
    };
    recent.sort_by(|a, b| {
        rank(a)
            .cmp(&rank(b))
            .then(b.activity().total_cmp(&a.activity()))
    });
    inactive.sort_by(|a, b| b.activity().total_cmp(&a.activity()));
    s.menus.focus.inactive_count = inactive.len();
    s.menus
        .focus
        .order
        .extend(recent.iter().chain(inactive.iter()).map(|t| t.id.clone()));
    rows.extend(recent.iter().map(|t| Item::Session(t.id.clone(), false)));
    if recent.is_empty() {
        rows.push(Item::Note("Nothing needs focus".into()));
    }
    rows.push(Item::Gap("focus".into()));
    rows.push(Item::Inactive);
    if s.inactive_open {
        rows.extend(
            inactive
                .iter()
                .take(s.inactive_visible)
                .map(|t| Item::Session(t.id.clone(), false)),
        );
        if inactive.len() > s.inactive_visible || s.menus.focus.cursor.is_some() {
            rows.push(Item::MoreInactive);
        }
        if inactive.is_empty() && s.menus.focus.cursor.is_none() {
            rows.push(Item::Note("No inactive threads".into()));
        }
    }
    rows.push(Item::Gap("inactive".into()));
    true
}

#[derive(Default)]
pub struct Focus {
    pub cursor: Option<String>,
    pub pending: bool,
    pub pages: usize,
    pub error: Option<String>,
    pub filter_open: bool,
    pub loaded: std::collections::BTreeMap<String, oc_gateway::types::Session>,
    pub minute_due: Option<f64>,
    pub inactive_count: usize,
    pub expand_page: bool,
    reload_pages: usize,
    pub order: Vec<String>,
    refresh_queued: bool,
}
pub fn load(s: &mut State, more: bool) {
    if s.menus.focus.pending {
        if !more {
            s.menus.focus.refresh_queued = true;
        }
        return;
    }
    if !crate::menus::search::connected(s) {
        return;
    }
    if !more {
        s.menus.focus.expand_page = false;
        s.menus.focus.reload_pages = s.menus.focus.pages.max(1);
    }
    let mut query = vec![("search".into(), String::new())];
    if more {
        if let Some(cursor) = &s.menus.focus.cursor {
            query.push(("cursor".into(), cursor.clone()));
        }
    }
    s.menus.focus.error = None;
    s.menus.focus.pending = s.prompt_request(oc_gateway::prompt::Request::Get {
        tag: if more {
            "sidebar-focus:more"
        } else {
            "sidebar-focus:first"
        }
        .into(),
        path: "session-search".into(),
        query,
    });
}
pub fn receive(s: &mut State, more: bool, result: Result<Value, String>) {
    s.menus.focus.pending = false;
    match result.and_then(|v| {
        serde_json::from_value::<oc_gateway::types::SessionPage>(v).map_err(|e| e.to_string())
    }) {
        Ok(page) => {
            if !more {
                s.menus.focus.loaded.clear();
                s.menus.focus.pages = 0;
            }
            let recent = page
                .sessions
                .last()
                .is_some_and(|t| t.updated_at >= crate::unix_ms() as f64 - 3.0 * 86400000.0);
            s.menus.focus.cursor = page.next_cursor;
            s.menus.focus.pages += 1;
            for thread in page.sessions {
                s.menus
                    .focus
                    .loaded
                    .insert(thread.id.clone(), thread.clone());
                std::sync::Arc::make_mut(&mut s.snapshot)
                    .sessions
                    .insert(thread.id.clone(), thread);
            }
            if more && s.menus.focus.expand_page {
                s.inactive_visible += 10;
                s.menus.focus.expand_page = false;
            }
            if (s.menus.focus.pages < s.menus.focus.reload_pages
                || (recent && s.menus.focus.pages < 4))
                && s.menus.focus.cursor.is_some()
                && s.composer.worker.is_some()
            {
                load(s, true);
            }
        }
        Err(error) => s.menus.focus.error = Some(error),
    }
    super::rebuild(s);
    if !s.menus.focus.pending && std::mem::take(&mut s.menus.focus.refresh_queued) {
        load(s, false);
    }
}
pub fn poll(s: &mut State, clock: f64, tx: &mut rune::Tx) -> bool {
    if !s.prefs.focus {
        return false;
    }
    if s.menus.focus.minute_due.is_none_or(|due| clock >= due) {
        s.menus.focus.minute_due = Some(clock + 60.0);
        tx.wake_after(std::time::Duration::from_secs(60));
        if s.menus.focus.pages == 0 {
            load(s, false);
        }
        super::rebuild(s);
        return true;
    }
    false
}
fn directories(s: &State) -> Vec<(String, String)> {
    let mut paths = s.prefs.focus_excluded.clone();
    paths.extend(
        s.menus
            .focus
            .loaded
            .keys()
            .filter_map(|id| s.snapshot.sessions.get(id))
            .map(|t| t.directory.clone()),
    );
    let mut options: Vec<_> = paths
        .into_iter()
        .map(|directory| {
            let name = s
                .snapshot
                .projects
                .iter()
                .find(|p| p.canonical == directory)
                .map(|p| p.display_name())
                .unwrap_or_else(|| directory.rsplit('/').next().unwrap_or(&directory))
                .to_owned();
            (directory, name)
        })
        .collect();
    options.sort_by(|a, b| a.1.to_lowercase().cmp(&b.1.to_lowercase()));
    options
}
pub fn filter(s: &State) -> El {
    let mut panel = col()
        .w(220.0)
        .max_h(360.0f32.min(s.window_size.1 - 80.0))
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .padding(4.0)
        .radius(8.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .border_layout()
        .role("menu")
        .on_key(filter_key)
        .child(
            label(&s.theme, "Show in Focus", 12.0, 500.0, "text-tertiary")
                .px(8.0)
                .pt(6.0)
                .pb(4.0),
        );
    let options = directories(s);
    if options.is_empty() {
        panel = panel.child(
            label(&s.theme, "No recent projects", 12.0, 400.0, "text-tertiary").padding(8.0),
        );
    }
    for (n, (directory, name)) in options.into_iter().enumerate() {
        let shown = !s.prefs.focus_excluded.contains(&directory);
        panel = panel.child(
            row()
                .key(format!("focus-filter-{n}"))
                .role("menuitemcheckbox")
                .checked(shown)
                .label(&name)
                .focusable(true)
                .w_full()
                .h(30.0)
                .px(8.0)
                .gap(8.0)
                .center_y()
                .radius(6.0)
                .hover(s.theme.c("hover"))
                .focus_fill(s.theme.c("hover"))
                .no_focus_ring()
                .child(folder_icon(s, &directory, &name).dim(if shown { 1.0 } else { 0.5 }))
                .child(
                    label(
                        &s.theme,
                        name,
                        13.0,
                        400.0,
                        if shown { "text" } else { "text-tertiary" },
                    )
                    .grow(1.0),
                )
                .child(if shown {
                    rune::icon(&crate::icons::TICK, 14.0).color(s.theme.c("text-secondary"))
                } else {
                    el().size(14.0, 14.0)
                })
                .on_press(move |s: &mut State| {
                    if !s.prefs.focus_excluded.remove(&directory) {
                        s.prefs.focus_excluded.insert(directory.clone());
                    }
                    super::rebuild(s);
                    s.save();
                }),
        );
    }
    if !s.prefs.focus_excluded.is_empty() {
        panel = panel.child(
            row()
                .role("menuitem")
                .key("focus-filter-reset")
                .label("Show all projects")
                .focusable(true)
                .h(30.0)
                .w_full()
                .mt(4.0)
                .px(8.0)
                .center_y()
                .border_sides([1.0, 0.0, 0.0, 0.0], s.theme.c("border"))
                .hover(s.theme.c("hover"))
                .focus_fill(s.theme.c("hover"))
                .no_focus_ring()
                .child(label(
                    &s.theme,
                    "Show all projects",
                    13.0,
                    400.0,
                    "text-secondary",
                ))
                .on_press(|s: &mut State| {
                    s.prefs.focus_excluded.clear();
                    super::rebuild(s);
                    s.save();
                }),
        );
    }
    let anchor = s
        .pages
        .anchors
        .get("focus-filter-trigger")
        .copied()
        .unwrap_or([s.sidebar_width() - 58.0, 300.0, 28.0, 28.0]);
    el().absolute(0.0, 0.0)
        .size(s.window_size.0, s.window_size.1)
        .on_key(|s: &mut State, e, tx| {
            if e.key == rune::Key::Escape {
                s.menus.focus.filter_open = false;
                tx.focus("focus-filter-trigger", true);
                true
            } else {
                false
            }
        })
        .child(
            el().w_full()
                .h_full()
                .on_press(|s: &mut State| s.menus.focus.filter_open = false),
        )
        .child(s.theme.shadow(panel, "shadow").absolute(
            (anchor[0] + anchor[2] - 220.0).max(8.0),
            anchor[1] + anchor[3] + 4.0,
        ))
}
fn filter_key(s: &mut State, e: &rune::KeyEvent, tx: &mut rune::Tx) -> bool {
    let mut keys: Vec<_> = (0..directories(s).len())
        .map(|i| format!("focus-filter-{i}"))
        .collect();
    if !s.prefs.focus_excluded.is_empty() {
        keys.push("focus-filter-reset".into());
    }
    if keys.is_empty() {
        return false;
    }
    let index = keys
        .iter()
        .position(|key| Some(key.as_str()) == tx.focused())
        .map(|i| i as isize)
        .unwrap_or(-1);
    let next = match e.key {
        rune::Key::Down => (index + 1).rem_euclid(keys.len() as isize) as usize,
        rune::Key::Up => (index - 1).rem_euclid(keys.len() as isize) as usize,
        rune::Key::Home => 0,
        rune::Key::End => keys.len() - 1,
        _ => return false,
    };
    tx.focus(&keys[next], true);
    tx.scroll_into_view(&keys[next]);
    true
}
fn folder_icon(s: &State, directory: &str, name: &str) -> El {
    if let Some(p) = s
        .snapshot
        .projects
        .iter()
        .find(|p| p.canonical == directory)
    {
        super::images::avatar(s, p, 16.0)
    } else {
        let p = oc_gateway::types::Project {
            id: String::new(),
            canonical: directory.into(),
            name: Some(name.into()),
            icon: None,
            vcs: None,
            time: Default::default(),
        };
        super::project_badge(&s.theme, &p, 16.0)
    }
}
