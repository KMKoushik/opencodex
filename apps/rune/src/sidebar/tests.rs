use crate::*;
fn state() -> State {
    OPTIONS.get_or_init(|| Options {
        gateway: None,
        preset: String::new(),
        dark: true,
        headless: true,
        session: None,
        scroll: "bottom".into(),
        work: None,
        composer_state: String::new(),
        page: String::new(),
        panel: None,
        file: None,
        size: (1280.0, 800.0),
    });
    let mut s = State::new();
    s.pages.data.insert(
        "connection".into(),
        Ok(serde_json::json!({"status":"connected"})),
    );
    s
}
fn thread(id: &str, directory: &str, idle: f64) -> oc_gateway::types::Session {
    serde_json::from_value(serde_json::json!({"id":id,"title":id,"directory":directory,"updatedAt":idle,"time":{"created":idle,"idle":idle,"viewed":idle}})).unwrap()
}
#[test]
fn opened_folders_persist_no_native_metadata() {
    let mut prefs = profile::Preferences::default();
    prefs.opened_projects=serde_json::from_value(serde_json::json!([{"id":"native","canonical":"/fixture","name":"Fixture","vcs":"git","time":{"active":100,"updated":200},"icon":{"url":"https://example.test/icon.png"}}])).unwrap();
    let saved = serde_json::to_value(&prefs).unwrap();
    assert_eq!(
        saved["opened_projects"],
        serde_json::json!([{"directory":"/fixture","name":"Fixture"}])
    );
    let restored: profile::Preferences = serde_json::from_value(saved).unwrap();
    assert_eq!(restored.opened_projects[0].canonical, "/fixture");
    assert!(restored.opened_projects[0].icon.is_none());
    assert!(restored.opened_projects[0].vcs.is_none());
}
#[test]
fn focus_exclusions_keep_requests_and_settled_runs_surface() {
    let mut s = state();
    s.prefs.focus = true;
    s.prefs.focus_excluded.insert("/excluded".into());
    let now = unix_ms() as f64;
    let snapshot = Arc::make_mut(&mut s.snapshot);
    for (id, path, age) in [
        ("old", "/open", 4.0),
        ("recent", "/open", 0.0),
        ("hidden", "/excluded", 0.0),
        ("question", "/excluded", 4.0),
        ("running-done", "/open", 4.0),
        ("done", "/open", 0.0),
    ] {
        let mut t = thread(id, path, now - age * 86400000.0);
        if id.contains("done") {
            t.done = Some(now);
        }
        snapshot.sessions.insert(id.into(), t);
    }
    snapshot
        .attention
        .insert("question".into(), "question".into());
    snapshot.active.insert("running-done".into());
    s.menus.focus.loaded = s.snapshot.sessions.clone();
    sidebar::rebuild(&mut s);
    let ids: Vec<_> = s
        .rows
        .iter()
        .filter_map(|r| {
            if let sidebar::Item::Session(id, _) = r {
                Some(id.as_str())
            } else {
                None
            }
        })
        .collect();
    assert_eq!(ids, ["question", "running-done", "recent"]);
    s.inactive_open = true;
    sidebar::rebuild(&mut s);
    assert!(
        s.rows
            .iter()
            .any(|r| matches!(r,sidebar::Item::Session(id,_)if id=="done"))
    );
    assert!(
        !s.rows
            .iter()
            .any(|r| matches!(r,sidebar::Item::Session(id,_)if id=="hidden"))
    );
    s.menus.open = Some(menus::Menu::Thread("recent".into()));
    s.menus.thread_pending.insert("recent:pin".into());
    let enabled = menus::thread::enabled_labels(&s, "recent");
    assert!(!enabled.iter().any(|l| l == "Mark as done"));
    assert!(enabled.iter().any(|l| l == "Mark as unread"));
    assert!(enabled.iter().any(|l| l == "Export as JSON"));
    assert!(!menus::thread::pending_for(&s, "done", "pin"));
}
#[test]
fn search_utf16_limit_and_modal_keyboard_restore() {
    let mut rt = rune::Runtime::new(state(), view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    rt.update(menus::open_search);
    rt.frame(0.1);
    rt.frame(0.2);
    rt.key(rune::KeyEvent {
        key: rune::Key::Text("🙂".repeat(130)),
        mods: Default::default(),
    });
    rt.frame(0.3);
    assert_eq!(rt.state.menus.search.text.encode_utf16().count(), 256);
    assert_eq!(rt.state.menus.pagination.query, rt.state.menus.search.text);
    assert!(rt.state.menus.search.preedit().is_none());
    rt.key(rune::KeyEvent {
        key: rune::Key::Escape,
        mods: Default::default(),
    });
    rt.frame(0.4);
    assert!(rt.state.menus.open.is_none());
}
#[test]
fn search_ime_limit_preserves_suffix_and_undo_history() {
    let mut rt = rune::Runtime::new(state(), view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    rt.update(menus::open_search);
    rt.frame(0.1);
    rt.frame(0.2);
    rt.update(|s, _| {
        s.menus.search.insert(&format!("{}tail", "a".repeat(250)));
        s.menus.search.set_selection(250, 250);
        s.menus.search.break_history_group();
    });
    rt.frame(0.3);
    rt.ime(rune::Ime::Preedit("🙂🙂🙂".into(), None, Vec::new()));
    rt.frame(0.35);
    rt.ime(rune::Ime::Commit("🙂🙂🙂".into()));
    rt.frame(0.4);
    assert_eq!(
        rt.state.menus.search.text,
        format!("{}🙂tail", "a".repeat(250))
    );
    assert_eq!(rt.state.menus.pagination.query, rt.state.menus.search.text);
    rt.key(rune::KeyEvent {
        key: rune::Key::Command('z'),
        mods: rune::Mods {
            cmd: true,
            ..Default::default()
        },
    });
    rt.frame(0.5);
    assert_eq!(
        rt.state.menus.search.text,
        format!("{}tail", "a".repeat(250))
    );
    rt.key(rune::KeyEvent {
        key: rune::Key::Command('z'),
        mods: rune::Mods {
            cmd: true,
            shift: true,
            ..Default::default()
        },
    });
    rt.frame(0.6);
    assert_eq!(rt.state.menus.search.text.encode_utf16().count(), 256);
    assert!(rt.state.menus.search.text.ends_with("🙂tail"));
}
#[test]
fn thread_menu_navigation_selection_and_focus_return() {
    let mut s = state();
    s.prefs.focus = true;
    let now = unix_ms() as f64;
    let snapshot = Arc::make_mut(&mut s.snapshot);
    for id in ["first", "second"] {
        snapshot
            .sessions
            .insert(id.into(), thread(id, "/fixture", now));
    }
    snapshot.sessions.get_mut("first").unwrap().title = " 🦀 Café / 世界! ".into();
    s.menus.focus.loaded = s.snapshot.sessions.clone();
    sidebar::rebuild(&mut s);
    let mut rt = rune::Runtime::new(s, view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    rt.update(|_, tx| tx.focus("thread-first", true));
    rt.frame(0.1);
    rt.update(|s, tx| {
        s.menus.open = Some(menus::Menu::Thread("first".into()));
        tx.focus_when_shown("menu-Pin thread", true);
    });
    rt.frame(0.2);
    rt.frame(0.3);
    rt.key(rune::KeyEvent {
        key: rune::Key::End,
        mods: Default::default(),
    });
    rt.frame(0.4);
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("menu-Select") && e.focused)
    );
    rt.key(rune::KeyEvent {
        key: rune::Key::Tab,
        mods: Default::default(),
    });
    rt.frame(0.5);
    assert!(rt.state.menus.open.is_none());
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("thread-second") && e.focused)
    );
    rt.update(|s, tx| {
        let filename =
            menus::thread::filename(&s.snapshot.sessions["first"].title, "first", "markdown");
        s.menus.export_ready.push_back(menus::thread::Download {
            session: "first".into(),
            filename,
            temporary: "unused-headless-download".into(),
        });
        menus::thread::poll(s, tx);
    });
    rt.frame(0.6);
    rt.frame(0.7);
    rt.frame(0.8);
    assert_eq!(
        rt.file_dialog().unwrap().1.file_name.as_deref(),
        Some("café-世界.md")
    );
    rt.resolve_file_dialog(None).unwrap();
    rt.frame(0.9);
    assert!(sidebar::selection::click(
        &mut rt.state,
        "first",
        rune::Mods {
            cmd: true,
            ..Default::default()
        }
    ));
    assert!(sidebar::selection::click(
        &mut rt.state,
        "second",
        Default::default()
    ));
    assert_eq!(rt.state.menus.selection.picked.len(), 2);
    assert_eq!(rt.state.selected, None);
}
