use oc_webview::{Event, FocusRequest, Navigation, Options, WebView};
use rune::{App, AppSpec, Cx, El, Key, Phase, Tx, col, el, row, text};
use std::{cell::RefCell, rc::Rc, time::Duration};

#[path = "support/check.rs"]
mod check;

const PAGE: &str = include_str!("page.html");
struct State {
    web: WebView,
    sidebar: f32,
    popover: bool,
    status: String,
    check: Option<check::Check>,
}

fn view(s: &State, _: &mut Cx<State>) -> El {
    let t = rune::tok::theme(true);
    let action = |label: &'static str| {
        text(label)
            .color(t.text)
            .padding(10.0)
            .radius(6.0)
            .fill(t.control_off)
            .focusable(true)
    };
    let side = col()
        .w(s.sidebar)
        .h_full()
        .padding(20.0)
        .gap(16.0)
        .fill(t.bg)
        .child(
            text("OpenCodex")
                .color(t.text)
                .font(rune::tok::type_::TITLE),
        )
        .child(text("Native web surfaces").color(t.text))
        .child(action("Canvas page").on_press(|s: &mut State| {
            s.web.load_html(PAGE, Some("http://127.0.0.1/")).unwrap();
        }))
        .child(action("Browse example.org").on_press(|s: &mut State| {
            s.web.load_url("https://example.org/").unwrap();
        }))
        .child(
            action("Rune popover")
                .key("popover-button")
                .on_press(|s: &mut State| {
                    s.popover = !s.popover;
                    s.web.set_covered(s.popover);
                }),
        )
        .child(text(&s.status).color(t.text));
    let splitter = el()
        .w(6.0)
        .h_full()
        .fill(t.control_off)
        .cursor(rune::Cursor::ResizeColumn)
        .on_drag(|s: &mut State, d, tx| {
            if d.phase == Phase::Down {
                d.data = s.sidebar;
                return;
            }
            s.sidebar = (d.data + d.dx).clamp(180.0, 520.0);
            tx.instant();
        });
    let toolbar = row()
        .h(48.0)
        .gap(8.0)
        .padding(5.0)
        .fill(t.bg)
        .child(action("←").on_press(|s: &mut State| s.web.back()))
        .child(action("→").on_press(|s: &mut State| s.web.forward()))
        .child(action("Reload").on_press(|s: &mut State| s.web.reload()))
        .child(
            action("Focus page")
                .key("web-focus")
                .on_press(|s: &mut State| s.web.focus()),
        );
    // Check mode controls native frames directly, so it works when Rune skips drawing an
    // occluded window. Interactive mode binds the real GPU layout, including spring frames.
    let panel = if s.check.is_some() {
        el()
    } else {
        s.web.host::<State>("web-panel")
    };
    let body = col()
        .grow(1.0)
        .min_w(0.0)
        .h_full()
        .child(toolbar)
        .child(panel.grow(1.0).fill(t.bg));
    let mut root = row()
        .w_full()
        .h_full()
        .fill(t.bg)
        .child(side)
        .child(splitter)
        .child(body);
    if s.popover {
        root = root.child(
            col()
                .absolute(s.sidebar - 40.0, 120.0)
                .size(340.0, 180.0)
                .padding(24.0)
                .gap(16.0)
                .radius(12.0)
                .fill(t.control_off)
                .child(text("Rune is above the web surface").color(t.text))
                .child(text("WebKit is hidden while covered.").color(t.text))
                .child(action("Dismiss").on_press(|s: &mut State| {
                    s.popover = false;
                    s.web.set_covered(false);
                })),
        );
    }
    root
}

fn poll(s: &mut State, _: f64, tx: &mut Tx) -> bool {
    let mut changed = false;
    for event in s.web.drain_events() {
        if let Some(check) = &mut s.check {
            check.event(&event);
        }
        match event {
            Event::Message { json, .. } => {
                if json.contains("\"ready\"") {
                    s.web.post_message(&serde_json::json!({ "hello": "Rune" }));
                }
                s.status = format!("Bridge: {json}");
                changed = true;
            }
            Event::Changed(page) => {
                s.status = page.title;
                changed = true;
            }
            Event::Focus(request) => {
                match request {
                    FocusRequest::Location => s.status = "Cmd+L handed back to Rune".into(),
                    _ => s.status = format!("Focus: {request:?}"),
                }
                tx.focus("web-focus", true);
                changed = true;
            }
            other => {
                s.status = format!("{other:?}");
                changed = true;
            }
        }
    }
    if let Some(check) = &mut s.check {
        check.step(&s.web, tx);
        tx.wake_after(Duration::from_millis(40));
    }
    changed
}

fn main() {
    let checking = std::env::args().any(|arg| arg == "--check");
    let waker: Rc<RefCell<Option<rune::Waker>>> = Rc::default();
    let wake = waker.clone();
    let web = WebView::new(Options {
        bridge: true,
        navigation: Navigation {
            origins: if checking {
                vec!["http://127.0.0.1".into()]
            } else {
                vec![]
            },
            ..Default::default()
        },
        wake: Rc::new(move || {
            if let Some(wake) = &*wake.borrow() {
                wake();
            }
        }),
        ..Default::default()
    });
    let result = Rc::new(RefCell::new(None));
    let result_in = result.clone();
    let init_web = web.clone();
    let attach_web = web.clone();
    let ready_web = web.clone();
    let spec = AppSpec {
        setup: Some(|_, _| {}),
        poll: Some(poll),
        on_key: Some(|s: &mut State, event, _| {
            if matches!(event.key, Key::Escape) && s.popover {
                s.popover = false;
                s.web.set_covered(false);
                true
            } else {
                false
            }
        }),
        ..AppSpec::new(
            "Rune · WKWebView panel",
            (1100.0, 700.0),
            || unreachable!(),
            view,
        )
    };
    let app = App::new(spec)
        .args(Vec::new())
        .init(move || State {
            web: init_web,
            sidebar: 260.0,
            popover: false,
            status: "Ready".into(),
            check: checking.then(|| check::Check::new(result_in, web.clone())),
        })
        .on_window(move |window| {
            attach_web.attach(window).expect("attach WKWebView");
            if checking {
                attach_web
                    .load_html(PAGE, Some("http://127.0.0.1/"))
                    .unwrap();
                attach_web
                    .present([266.0, 48.0, 834.0, 652.0], [266.0, 48.0, 834.0, 652.0])
                    .unwrap();
            }
        })
        .on_ready(move |_| {
            if checking {
                return;
            }
            ready_web
                .load_html(PAGE, Some("http://127.0.0.1/"))
                .unwrap();
        });
    let handle = app.handle();
    *waker.borrow_mut() = Some(std::sync::Arc::new(move || handle.wake()));
    app.run();
    if checking {
        match result.borrow().as_ref() {
            Some(Ok(())) => println!("PASS: oc-webview native integration check"),
            other => {
                eprintln!("FAIL: {other:?}");
                std::process::exit(1);
            }
        }
    }
}
