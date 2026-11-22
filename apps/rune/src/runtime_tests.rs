use super::*;

#[test]
fn project_switcher_clamps_arrows_and_ignores_dismissed_resolution() {
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
        size: (1280.0, 800.0),
    });
    let mut state = State::new();
    let snapshot = Arc::make_mut(&mut state.snapshot);
    snapshot.live = true;
    snapshot.projects=serde_json::from_value(serde_json::json!([
        {"id":"old","name":"Old project","canonical":"/fixture/old","time":{"active":0,"updated":1}},
        {"id":"new","name":"New project","canonical":"/fixture/new","time":{"active":3,"updated":2}}
    ])).unwrap();
    state.prefs.project = Some("/fixture/old".into());
    let mut rt = rune::Runtime::new(state, view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.update(menus::projects::open);
    rt.frame(0.0);
    rt.frame(0.1);
    assert_eq!(
        menus::projects::rows(&rt.state)[0].directory,
        "/fixture/new"
    );
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("project-switcher-search") && e.focused)
    );
    let key = |key| rune::KeyEvent {
        key,
        mods: Default::default(),
    };
    rt.key(key(rune::Key::Down));
    rt.frame(0.2);
    assert_eq!(
        rt.state.menus.projects.active, "/fixture/old",
        "Down at the end must not wrap"
    );
    rt.key(key(rune::Key::Up));
    rt.frame(0.3);
    rt.key(key(rune::Key::Up));
    rt.frame(0.4);
    assert_eq!(rt.state.menus.projects.active, "/fixture/new");
    let generation = rt.state.menus.projects.generation;
    rt.key(key(rune::Key::Escape));
    rt.frame(0.5);
    assert!(rt.state.menus.open.is_none());
    rt.update(menus::projects::open);
    rt.frame(0.6);
    menus::projects::receive(
        &mut rt.state,
        &format!("switcher:{generation}:resolve"),
        Ok(serde_json::json!({"directory":"/fixture/new"})),
    );
    assert_eq!(rt.state.prefs.project.as_deref(), Some("/fixture/old"));
    rt.update(|s, _| s.menus.projects.query = rune::TextEdit::new("~/new-folder"));
    rt.frame(0.7);
    let rows = menus::projects::rows(&rt.state);
    assert_eq!(rows.len(), 1);
    assert!(rows[0].project.is_none());
}

#[test]
fn task_drag_container_does_not_swallow_card_controls_or_escape() {
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
        size: (1280.0, 800.0),
    });
    let mut state = State::new();
    state.pages.route = pages::Route::Tasks;
    state.pages.data.insert(
        "tasks/plugin".into(),
        Ok(serde_json::json!({"state":"active"})),
    );
    state.pages.data.insert("tasks".into(),Ok(serde_json::json!([{"id":"a","title":"Review changes","bucket":"today","order":1,"time":{"moved":0}}])));
    let mut rt = rune::Runtime::new(state, view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    let rect = rt
        .elements()
        .iter()
        .find(|e| e.key.as_deref() == Some("task-title-a"))
        .unwrap()
        .visible;
    let (x, y) = (rect[0] + rect[2] / 2.0, rect[1] + rect[3] / 2.0);
    rt.pointer_down(x, y);
    rt.frame(0.1);
    rt.pointer_up(x, y);
    rt.frame(0.2);
    assert!(
        rt.state.pages.tasks.editor.is_some(),
        "the title click must reach the editor, not its parent drag handler"
    );
    rt.key(rune::KeyEvent {
        key: rune::Key::Escape,
        mods: Default::default(),
    });
    rt.frame(0.3);
    assert!(rt.state.pages.tasks.editor.is_none());
    assert_eq!(rt.state.pages.route, pages::Route::Tasks);
    assert!(rt.state.error.is_none(), "cancel never sends a task update");
    rt.update(|s,_|{s.pages.data.insert("tasks".into(),Ok(serde_json::Value::Array((0..2000).map(|n|serde_json::json!({"id":format!("task-{n}"),"title":format!("Review change {n}"),"notes":"Check the API and update its documentation.","bucket":"today","order":n,"time":{"moved":0}})).collect())));});
    let start = std::time::Instant::now();
    rt.frame(0.4);
    let mounted = rt
        .elements()
        .iter()
        .filter(|e| {
            e.key
                .as_deref()
                .is_some_and(|k| k.starts_with("task-title-"))
        })
        .count();
    eprintln!(
        "2,000-task board: {mounted} mounted cards; CPU frame {:?}",
        start.elapsed()
    );
    assert!(
        mounted > 0 && mounted < 40,
        "card construction must stay bounded by the viewport"
    );
}

#[test]
fn appearance_keyboard_preserves_each_variant_and_dismisses_the_select() {
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
        size: (1280.0, 800.0),
    });
    let mut state = State::new();
    state.pages.route = pages::Route::Settings("appearance".into());
    state.pages.appearance.system_dark = Some(true);
    let mut rt = rune::Runtime::new(state, view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    rt.update(|_, tx| tx.focus("Mode-system", true));
    rt.frame(0.1);
    rt.key(rune::KeyEvent {
        key: rune::Key::Right,
        mods: Default::default(),
    });
    rt.frame(0.2);
    assert_eq!(settings::appearance::preference(&rt.state).mode, "light");
    assert!(!rt.state.theme.dark);
    rt.update(|s, tx| {
        s.pages.appearance.fields.insert(
            "appearance-light-accent".into(),
            rune::TextEdit::new("#1256ab"),
        );
        settings::appearance::commit(s, "appearance-light-accent");
        tx.focus("Light theme", true);
    });
    rt.frame(0.3);
    rt.key(rune::KeyEvent {
        key: rune::Key::Down,
        mods: Default::default(),
    });
    rt.frame(0.4);
    assert!(matches!(rt.state.menus.open, Some(menus::Menu::Choice(_))));
    rt.key(rune::KeyEvent {
        key: rune::Key::Escape,
        mods: Default::default(),
    });
    rt.frame(0.5);
    assert!(rt.state.menus.open.is_none());
    rt.update(|s, _| {
        let mut p = settings::appearance::preference(s);
        p.mode = "dark".into();
        settings::appearance::apply(s, p);
    });
    rt.frame(0.6);
    assert!(rt.state.theme.dark);
    let preferences: profile::Preferences =
        serde_json::from_str(&serde_json::to_string(&rt.state.prefs).unwrap()).unwrap();
    let saved = preferences.theme.unwrap();
    assert_eq!(saved.light.accent.as_deref(), Some("#1256ab"));
    assert!(saved.dark.accent.is_none());
}

#[test]
fn native_subagent_readers_cannot_interrupt_but_side_chats_can() {
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
        size: (1280.0, 800.0),
    });
    let mut state = State::new();
    state.selected = Some("child".into());
    let data = Arc::make_mut(&mut state.chat.data);
    data.info = Some(
        serde_json::from_value(serde_json::json!({
            "id":"child", "parentID":"parent", "location":{"directory":"/fixture"},
            "time":{"created":0}
        }))
        .unwrap(),
    );
    assert!(state.chat.read_only());
    assert!(!state.can_send());
    state.stop();
    assert!(state.error.is_none(), "a reader never attempts a mutation");
    Arc::make_mut(&mut state.chat.data)
        .info
        .as_mut()
        .unwrap()
        .metadata = Some(serde_json::json!({"opencodexSideChat":{"parentID":"parent"}}));
    assert!(!state.chat.read_only());
    state.stop();
    assert_eq!(
        state.error.as_deref(),
        Some("Gateway is not connected"),
        "a writable side chat reaches the mutation transport"
    );
}

#[test]
fn long_sidebar_only_mounts_visible_rows() {
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
        size: (1280.0, 800.0),
    });
    let mut state = State::new();
    let project = oc_gateway::types::Project {
        time: Default::default(),
        id: "fixture".into(),
        name: Some("Example".into()),
        canonical: "/fixture".into(),
        icon: None,
        vcs: Some("git".into()),
    };
    let template: oc_gateway::types::Session = serde_json::from_value(serde_json::json!({
        "id":"fixture", "title":"Explain the project structure", "directory":"/fixture",
        "projectID":"fixture", "updatedAt":100,"time":{"created":100}
    }))
    .unwrap();
    let mut snapshot = Snapshot {
        projects: vec![project],
        ..Snapshot::default()
    };
    for index in 0..20_000 {
        let mut thread = template.clone();
        thread.id = format!("fixture-{index}");
        thread.updated_at = index as f64;
        snapshot.sessions.insert(thread.id.clone(), thread);
    }
    state.snapshot = Arc::new(snapshot);
    state.visible.insert("fixture".into(), 20_000);
    sidebar::rebuild(&mut state);
    let mut rt = rune::Runtime::new(state, view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    let start = std::time::Instant::now();
    rt.frame(0.0);
    let threads = rt
        .elements()
        .iter()
        .filter(|e| e.key.as_deref().is_some_and(|k| k.starts_with("thread-")))
        .count();
    eprintln!(
        "20,000-thread sidebar: {threads} mounted rows; first CPU frame {:?}",
        start.elapsed()
    );
    assert!(
        threads > 5 && threads < 40,
        "only viewport + overscan rows are constructed"
    );
    assert!(
        rt.elements().len() < 500,
        "scene size must not scale with history length"
    );
}
