use super::context::{Event, Visibility, step};

#[test]
fn keyboard_focus_opens_escape_dismisses_and_tab_blurs_without_a_trap() {
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
    let mut rt = rune::Runtime::new(
        crate::State::new(),
        |s, _| {
            rune::row().child(super::context::view(s)).child(
                rune::el()
                    .key("after-context")
                    .size(32.0, 32.0)
                    .focusable(true),
            )
        },
        (800.0, 600.0),
        rune::Env::new(true, 2.0),
    );
    rt.poll = Some(|s, _, tx| super::context::poll(s, tx));
    rt.frame(0.0);
    rt.key(rune::KeyEvent {
        key: rune::Key::Tab,
        mods: Default::default(),
    });
    rt.frame(0.1);
    rt.frame(0.11);
    assert!(
        rt.state.chat.context,
        "Tab entering the trigger opens the popover: {:?}",
        rt.state.composer.context_focus
    );
    rt.key(rune::KeyEvent {
        key: rune::Key::Escape,
        mods: Default::default(),
    });
    rt.frame(0.2);
    assert!(!rt.state.chat.context);
    rt.frame(0.3);
    assert!(
        !rt.state.chat.context,
        "unchanged focus must not reopen after Escape"
    );
    rt.key(rune::KeyEvent {
        key: rune::Key::Tab,
        mods: Default::default(),
    });
    rt.frame(0.4);
    rt.frame(0.41);
    assert!(!rt.state.chat.context);
    rt.key(rune::KeyEvent {
        key: rune::Key::Tab,
        mods: Default::default(),
    });
    rt.frame(0.5);
    rt.frame(0.51);
    assert!(
        rt.state.chat.context,
        "a new focus entry reopens the popover"
    );
}

#[test]
fn context_retains_hover_across_blur_and_focus_across_pointer_leave() {
    let mut state = Visibility::Closed;
    step(&mut state, Event::Focus(true));
    assert!(matches!(state, Visibility::Focused));
    step(&mut state, Event::Hover(true));
    step(&mut state, Event::Focus(false));
    assert!(matches!(state, Visibility::Hovered));
    step(&mut state, Event::Focus(true));
    step(&mut state, Event::Hover(false));
    assert!(matches!(state, Visibility::Focused));
    step(&mut state, Event::Focus(false));
    assert!(matches!(state, Visibility::Closed));
}

#[test]
fn dismissal_stays_closed_until_a_new_entry_or_click() {
    let mut state = Visibility::HoveredFocused;
    step(&mut state, Event::Dismiss);
    step(&mut state, Event::Hover(false));
    assert!(matches!(state, Visibility::Dismissed { focused: true, .. }));
    step(&mut state, Event::Focus(false));
    assert!(matches!(
        state,
        Visibility::Dismissed { focused: false, .. }
    ));
    step(&mut state, Event::Focus(true));
    assert!(matches!(state, Visibility::Focused));
    step(&mut state, Event::Dismiss);
    step(&mut state, Event::Open);
    assert!(matches!(state, Visibility::Focused));
}

#[test]
fn pointer_popover_is_immediate_nonmodal_and_does_not_eat_outside_clicks() {
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
    let mut rt = rune::Runtime::new(
        crate::State::new(),
        |s, _| {
            rune::col().padding(320.0).child(
                rune::row().child(super::context::view(s)).child(
                    rune::el()
                        .key("other-popover")
                        .label("Other popover")
                        .size(32.0, 32.0)
                        .focusable(true)
                        .on_press(|s: &mut crate::State| {
                            s.composer.menu = Some(super::state::Menu::Thinking)
                        }),
                ),
            )
        },
        (1000.0, 800.0),
        rune::Env::new(true, 2.0),
    );
    rt.poll = Some(|s, _, tx| super::context::poll(s, tx));
    rt.frame(0.0);
    let trigger = rt
        .elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some("context-indicator"))
        .unwrap()
        .rect;
    let (x, y) = (trigger[0] + 16.0, trigger[1] + 16.0);
    rt.pointer_move(x, y);
    rt.frame(0.01);
    assert!(rt.state.chat.context, "React has no hover-open delay");
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.02);
    rt.frame(0.03);
    let panel = rt
        .elements()
        .into_iter()
        .find(|e| e.label.as_deref() == Some("Context window"))
        .unwrap()
        .rect;
    rt.pointer_move(panel[0] + 20.0, panel[1] + 20.0);
    rt.frame(0.04);
    rt.pointer_down(panel[0] + 20.0, panel[1] + 20.0);
    rt.pointer_up(panel[0] + 20.0, panel[1] + 20.0);
    rt.frame(0.05);
    rt.frame(0.06);
    assert!(
        rt.state.chat.context,
        "a click within the popover must not dismiss it"
    );
    let other = rt
        .elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some("other-popover"))
        .unwrap()
        .rect;
    rt.pointer_move(other[0] + 16.0, other[1] + 16.0);
    rt.pointer_down(other[0] + 16.0, other[1] + 16.0);
    rt.pointer_up(other[0] + 16.0, other[1] + 16.0);
    rt.frame(0.1);
    rt.frame(0.11);
    assert!(!rt.state.chat.context);
    assert!(
        rt.state.composer.menu.is_some(),
        "outside control receives the same click"
    );
    rt.state.composer.menu = None;
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.2);
    rt.frame(0.21);
    assert!(rt.state.chat.context);
    rt.pointer_move(800.0, 700.0);
    rt.frame(0.22);
    assert!(
        rt.state.chat.context,
        "focused trigger retains the panel after pointer leave"
    );
    rt.pointer_down(800.0, 700.0);
    rt.pointer_up(800.0, 700.0);
    rt.frame(0.3);
    rt.frame(0.31);
    assert!(
        !rt.state.chat.context,
        "blank background clicks light-dismiss too"
    );
}
