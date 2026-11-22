use super::*;
use serde_json::json;

fn state() -> State {
    crate::OPTIONS.get_or_init(|| crate::Options {
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
    State::new()
}

#[test]
fn usage_help_uses_delayed_native_tooltips() {
    let mut s = state();
    s.pages.route = Route::Settings("usage".into());
    std::sync::Arc::make_mut(&mut s.snapshot).live = true;
    let now = chrono::Utc::now().timestamp_millis();
    s.pages.data.insert("usage/limits".into(),Ok(json!({"providers":[{"id":"codex","name":"ChatGPT","windows":[{"id":"five","label":"5-hour limit","usedPercent":32,"resetsAt":now+10800000,"durationMs":18000000}]}]})));
    let mut rt = rune::Runtime::new(s, crate::view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    let rect = rt
        .elements()
        .iter()
        .find(|e| {
            e.help
                .as_deref()
                .is_some_and(|text| text.starts_with("Resets "))
        })
        .unwrap()
        .rect;
    rt.pointer_move(rect[0] + rect[2] / 2.0, rect[1] + rect[3] / 2.0);
    rt.frame(0.1);
    assert!(rt.help_tooltip().is_none());
    rt.frame(0.7);
    assert!(
        rt.help_tooltip()
            .is_some_and(|(tip, _)| tip.starts_with("Resets "))
    );
}

#[test]
fn closing_projects_keeps_other_selection_and_advances_current_selection() {
    let mut s = state();
    let snapshot = std::sync::Arc::make_mut(&mut s.snapshot);
    snapshot.projects = serde_json::from_value(json!([
        {"id":"a","canonical":"/a","time":{"created":0,"updated":0}},
        {"id":"b","canonical":"/b","time":{"created":0,"updated":0}},
        {"id":"c","canonical":"/c","time":{"created":0,"updated":0}}
    ]))
    .unwrap();
    s.prefs.project = Some("/a".into());
    projects::close_project(&mut s, "b");
    assert_eq!(s.prefs.project.as_deref(), Some("/a"));
    projects::close_project(&mut s, "a");
    assert_eq!(s.prefs.project.as_deref(), Some("/c"));
    assert!(s.selected.is_none());
    projects::close_project(&mut s, "c");
    assert!(s.prefs.project.is_none());
    assert_eq!(s.prefs.closed_projects.len(), 3);
}
#[test]
fn project_editor_errors_are_independent_and_instructions_limit_preserves_suffix() {
    let mut s = state();
    projects::receive(&mut s, "project-save", Err("Save failed".into()));
    s.pages.projects.preparing = Some("upload");
    projects::receive(&mut s, "project-icon", Err("Upload failed".into()));
    s.pages.projects.preparing = Some("favicon");
    projects::receive(&mut s, "project-icon", Err("URL failed".into()));
    assert_eq!(
        s.pages.projects.editor_save_error.as_deref(),
        Some("Save failed")
    );
    assert_eq!(
        s.pages.projects.upload_error.as_deref(),
        Some("Upload failed")
    );
    assert_eq!(s.pages.projects.url_error.as_deref(), Some("URL failed"));
    let mut edit = rune::TextEdit::new(format!("{}tail", "x".repeat(49_995)));
    edit.anchor = 49_995;
    edit.focus = 49_995;
    assert!(pages::controls::limit_input(&mut edit, "🦀z", 50_000));
    assert!(edit.text.ends_with("xtail"));
    assert_eq!(edit.text.encode_utf16().count(), 49_999);
}
#[test]
fn folder_pointer_keeps_input_focus_and_enter_uses_the_ranked_choice() {
    let mut s = state();
    s.pages.route = Route::ProjectSetup;
    s.pages.projects.directory = rune::TextEdit::new("/fixture/a");
    s.pages.projects.suggesting = true;
    s.pages.projects.folders_parent = Some("/fixture/".into());
    s.pages.projects.folders = Some(json!({"folders":["alpha","at","atlas-long"]}));
    let mut rt = rune::Runtime::new(s, crate::view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    rt.update(|_, tx| tx.focus("Project directory", false));
    rt.frame(0.1);
    let choice = rt
        .elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some("project-folder-0"))
        .unwrap();
    assert_eq!(choice.label.as_deref(), Some("at"));
    let (x, y) = (choice.rect[0] + 10.0, choice.rect[1] + 15.0);
    rt.pointer_down(x, y);
    rt.frame(0.2);
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("Project directory") && e.focused)
    );
    rt.pointer_up(x, y);
    rt.frame(0.3);
    assert_eq!(rt.state.pages.projects.directory.text, "/fixture/at/");
    rt.update(|s, _| {
        s.pages.projects.directory.replace_text("/fixture/a");
        s.pages.projects.folders_parent = Some("/fixture/".into());
        s.pages.projects.suggesting = true;
    });
    rt.frame(0.4);
    rt.key(rune::KeyEvent {
        key: rune::Key::Enter,
        mods: Default::default(),
    });
    rt.frame(0.5);
    assert_eq!(rt.state.pages.projects.directory.text, "/fixture/at");
    assert!(!rt.state.pages.projects.suggesting);
}

#[test]
fn pairing_is_a_modal_and_only_a_new_device_completes_it() {
    let mut s = state();
    s.pages.route = Route::Settings("remote".into());
    s.pages.remote.pairing_at = Some(200);
    s.pages.data.insert(
        "remote".into(),
        Ok(json!({"hostname":"pair.example.test","devices":[{"name":"Old phone","created":100}]})),
    );
    assert!(pairing::paired(&s).is_none());
    assert!(projects::dialog(&s).is_some());
    s.pages.data.insert(
        "remote".into(),
        Ok(json!({"hostname":"pair.example.test","devices":[{"name":"New phone","created":201}]})),
    );
    assert_eq!(pairing::paired(&s), Some("New phone"));
    s.pages.remote.pairing_at = None;
    assert!(projects::dialog(&s).is_none());
}

#[test]
fn remote_keyboard_and_refetch_errors_preserve_the_edit_and_snapshot() {
    let mut s = state();
    s.pages.route = Route::Settings("remote".into());
    let remote = json!({"enabled":true,"hostname":"pair.example.test","port":4517,"tunnel":"token","served":true,"listener":{"state":"listening"},"connector":{"state":"connected"},"devices":[]});
    pages::receive(&mut s, "page:remote", Ok(remote.clone()));
    let mut rt = rune::Runtime::new(s, crate::view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    rt.update(|_, tx| tx.focus("Tunnel-token", true));
    rt.frame(0.1);
    rt.key(rune::KeyEvent {
        key: rune::Key::Right,
        mods: Default::default(),
    });
    rt.frame(0.2);
    assert!(rt.state.pages.remote.external && rt.state.pages.remote.dirty);
    assert!(
        !rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("remote-token"))
    );
    rt.update(|_, tx| tx.focus("remote-port", true));
    rt.frame(0.21);
    rt.key(rune::KeyEvent {
        key: rune::Key::Up,
        mods: Default::default(),
    });
    rt.frame(0.22);
    assert_eq!(rt.state.pages.remote.port.text, "4518");
    rt.key(rune::KeyEvent {
        key: rune::Key::Text("a".into()),
        mods: Default::default(),
    });
    rt.frame(0.23);
    assert_eq!(rt.state.pages.remote.port.text, "4518");
    rt.update(|s, _| {
        s.pages.remote.hostname = rune::TextEdit::new("unsaved.example.test");
        s.pages.remote.edits.insert("hostname");
        pages::receive(s, "page:remote", Ok(remote));
    });
    rt.frame(0.3);
    assert_eq!(rt.state.pages.remote.hostname.text, "unsaved.example.test");
    rt.update(|s, _| {
        pages::receive(s, "page:remote", Err("Read failed".into()));
    });
    rt.frame(0.4);
    assert!(data(&rt.state, "remote").is_some());
    rt.update(|s, tx| {
        pairing::open(s);
        tx.focus_when_shown("pair-dialog-close", false);
    });
    rt.frame(0.5);
    rt.key(rune::KeyEvent {
        key: rune::Key::Tab,
        mods: Default::default(),
    });
    rt.frame(0.6);
    assert!(
        rt.elements()
            .iter()
            .filter(|e| e.focused)
            .all(|e| e.key.as_deref() == Some("pair-dialog-close"))
    );
    rt.key(rune::KeyEvent {
        key: rune::Key::Escape,
        mods: Default::default(),
    });
    rt.frame(0.7);
    assert!(rt.state.pages.remote.pairing_at.is_none());
}
