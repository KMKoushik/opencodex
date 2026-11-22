use super::*;

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
    });
    let mut state = State::new();
    let project = oc_gateway::types::Project {
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
