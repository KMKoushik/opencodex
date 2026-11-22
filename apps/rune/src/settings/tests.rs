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
