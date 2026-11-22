use super::*;

#[test]
fn typed_answers_preserve_conditions_and_review_labels() {
    let integer = json!({"type":"integer", "minimum":2, "maximum":8, "required":true});
    assert_eq!(
        answer::validate(&integer, Some(&json!(2.5))).as_deref(),
        Some("Enter a whole number.")
    );
    assert_eq!(
        answer::validate(&integer, Some(&json!(1))).as_deref(),
        Some("Enter 2 or more.")
    );
    assert!(answer::validate(&integer, Some(&json!(3))).is_none());
    assert!(
        answer::validate(
            &json!({"type":"boolean","required":true}),
            Some(&json!(false))
        )
        .is_none()
    );
    assert_eq!(
        answer::review(
            &json!({"type":"multiselect", "options":[{"value":"a","label":"Alpha"}]}),
            Some(&json!(["a", "custom"]))
        ),
        "Alpha\ncustom"
    );
    let condition = json!({"when":[{"key":"n", "op":"eq", "value":3}]});
    assert!(answer::applies(
        &condition,
        &BTreeMap::from([("n".into(), json!(3))])
    ));
    assert!(!answer::applies(
        &condition,
        &BTreeMap::from([("n".into(), json!("3"))])
    ));
}

#[test]
fn headless_boolean_navigation_and_review() {
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
        panel: None,
        file: None,
        size: (1280.0, 800.0),
    });
    let mut state = State::new();
    state.selected = Some("fixture".into());
    receive(
        &mut state,
        "forms:fixture",
        json!([{"id":"form", "fields":[{"key":"confirm","type":"boolean","title":"Proceed?","required":true}]}]),
    );
    let mut rt = rune::Runtime::new(
        state,
        |s, _| view(s).w(720.0),
        (800.0, 600.0),
        rune::Env::new(true, 2.0),
    );
    rt.frame(0.0);
    let target = rt
        .elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some("question-option-1"))
        .unwrap()
        .rect;
    rt.pointer_down(target[0] + 4.0, target[1] + 4.0);
    rt.pointer_up(target[0] + 4.0, target[1] + 4.0);
    rt.frame(0.1);
    assert_eq!(rt.state.docks.answers.get("confirm"), Some(&json!(false)));
    advance(&mut rt.state);
    assert!(rt.state.docks.reviewing);
    assert_eq!(
        answer::review(
            &json!({"type":"boolean"}),
            rt.state.docks.answers.get("confirm")
        ),
        "No"
    );
}
