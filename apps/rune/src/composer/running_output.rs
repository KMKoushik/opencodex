use crate::{State, sidebar::label};
use oc_gateway::prompt::Request;
use rune::{El, Family, ScrollSpec, TextStyle, col, el, row};
use serde_json::Value;
use std::time::{Duration, Instant};

pub struct Output {
    id: String,
    info: Option<Value>,
    text: String,
    cursor: u64,
    truncated: bool,
    error: Option<String>,
    confirm: bool,
    stopping: bool,
    next: Instant,
    requested: bool,
    retry: bool,
}
pub fn open(s: &mut State, id: &str) {
    s.composer.menu = Some(super::state::Menu::ShellOutput);
    s.composer.running.output = Some(Output {
        id: id.into(),
        info: None,
        text: String::new(),
        cursor: 0,
        truncated: false,
        error: None,
        confirm: false,
        stopping: false,
        next: Instant::now(),
        requested: false,
        retry: false,
    });
}
fn query(s: &State) -> Vec<(String, String)> {
    vec![(
        "directory".into(),
        s.project().map(|p| p.canonical.clone()).unwrap_or_default(),
    )]
}
pub fn poll(s: &mut State, tx: &mut rune::Tx) {
    let Some(output) = s.composer.running.output.as_ref() else {
        return;
    };
    if Instant::now() < output.next {
        return;
    }
    let id = output.id.clone();
    let cursor = output.cursor;
    let running = output
        .info
        .as_ref()
        .is_some_and(|i| i["status"] == "running");
    if running || !output.requested || output.retry {
        super::running::get(s, &format!("info/{id}"), format!("shells/{id}"), query(s));
        let mut q = query(s);
        q.push(("cursor".into(), cursor.to_string()));
        super::running::get(s, &format!("output/{id}"), format!("shells/{id}/output"), q);
        let output = s.composer.running.output.as_mut().unwrap();
        output.requested = true;
        output.retry = false;
    }
    s.composer.running.output.as_mut().unwrap().next = Instant::now() + Duration::from_secs(1);
    if running {
        tx.wake_after(Duration::from_secs(1));
    }
}
pub fn receive(s: &mut State, kind: &str, result: Result<Value, String>) {
    let Some((kind, id)) = kind.split_once('/') else {
        return;
    };
    let Some(output) = s.composer.running.output.as_mut().filter(|o| o.id == id) else {
        return;
    };
    if kind == "running-stop" {
        output.stopping = false;
    }
    match result {
        Err(error) => output.error = Some(error),
        Ok(value) if kind == "running-info" => {
            output.info = Some(value);
        }
        Ok(value) if kind == "running-output" => {
            output.text.push_str(value["output"].as_str().unwrap_or(""));
            output.cursor = value["cursor"].as_u64().unwrap_or(output.cursor);
            output.truncated |= value["truncated"] == true;
            output.truncated |= retain_tail(&mut output.text);
            if let Some(size) = value["size"].as_u64().filter(|n| *n > output.cursor) {
                output.cursor = size.saturating_sub(65_536);
                output.text.clear();
                output.truncated = true;
                output.next = Instant::now();
                output.retry = true;
            }
        }
        Ok(_) if kind == "running-stop" => {
            s.composer.running.output = None;
            s.composer.menu = None;
            s.composer.running.next_refresh = None;
        }
        _ => {}
    }
}
fn retain_tail(text: &mut String) -> bool {
    if text.len() <= 65_536 {
        return false;
    }
    let excess = text.encode_utf16().count().saturating_sub(65_536);
    if excess == 0 {
        return false;
    }
    let mut removed = 0;
    let mut start = 0;
    for (index, ch) in text.char_indices() {
        if removed >= excess {
            start = index;
            break;
        }
        removed += ch.len_utf16();
        start = index + ch.len_utf8();
    }
    text.drain(..start);
    true
}
#[test]
fn output_tail_is_bounded_in_browser_utf16_units_without_splitting_unicode() {
    let mut text = "🦀".repeat(40_000) + "final line";
    assert!(retain_tail(&mut text));
    assert!(text.encode_utf16().count() <= 65_536);
    assert!(text.ends_with("final line"));
    assert!(!retain_tail(&mut text));
}
fn close(s: &mut State) {
    if !s
        .composer
        .running
        .output
        .as_ref()
        .is_some_and(|o| o.stopping)
    {
        s.composer.running.output = None;
        s.composer.menu = None;
    }
}
fn stop(s: &mut State) {
    let Some(o) = s.composer.running.output.as_ref().filter(|o| !o.stopping) else {
        return;
    };
    let id = o.id.clone();
    let directory = s.project().map(|p| p.canonical.clone()).unwrap_or_default();
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("directory", &directory)
        .finish();
    let path = format!("shells/{id}?{query}");
    if s.prompt_request(Request::Mutate {
        tag: format!("running-stop/{id}:{}", s.selected.as_deref().unwrap_or("")),
        path,
        body: Value::Null,
        delete: true,
    }) {
        s.composer.running.output.as_mut().unwrap().stopping = true;
    }
}
pub fn view(s: &State) -> El {
    let t = &s.theme;
    let o = s.composer.running.output.as_ref().unwrap();
    let width = (s.window_size.0 - 32.0).min(1200.0);
    let height = (s.window_size.1 - 32.0).min(900.0);
    let control = |title: &str| {
        label(t, title, 13.0, 500.0, "text")
            .px(10.0)
            .h(30.0)
            .center_y()
            .radius(7.0)
            .hover(t.c("hover"))
            .role("button")
            .label(title)
            .focusable(true)
            .disabled(o.stopping)
            .opacity(if o.stopping { 0.45 } else { 1.0 })
    };
    let mut body = col()
        .grow(1.0)
        .min_h(0.0)
        .padding(12.0)
        .radius(10.0)
        .border(1.0, t.c("border"))
        .fill(t.c("surface-under"));
    if let Some(info) = &o.info {
        body = body
            .child(
                label(
                    t,
                    info["command"].as_str().unwrap_or(""),
                    12.0,
                    400.0,
                    "text",
                )
                .font(TextStyle::new(12.0, 400.0).family(Family::Mono).lh(18.0))
                .wrap(),
            )
            .child(
                label(
                    t,
                    info["cwd"].as_str().unwrap_or(""),
                    11.0,
                    400.0,
                    "text-tertiary",
                )
                .font(TextStyle::new(11.0, 400.0).family(Family::Mono).lh(16.5))
                .wrap(),
            )
            .child(label(
                t,
                format!(
                    "{} · {}",
                    match info["status"].as_str() {
                        Some("running") => "Running".into(),
                        Some("killed") => "Stopped".into(),
                        Some("timeout") => "Timed out".into(),
                        _ => info["exit"]
                            .as_i64()
                            .map(|n| format!("Exited with code {n}"))
                            .unwrap_or("Exited".into()),
                    },
                    super::running::elapsed(
                        info["time"]["completed"]
                            .as_u64()
                            .unwrap_or(s.composer.running.now),
                        info["time"]["started"].as_u64().unwrap_or(0)
                    )
                ),
                12.0,
                400.0,
                "text-tertiary",
            ));
    } else {
        body = body.child(label(t, "Loading command…", 13.0, 400.0, "text"));
    }
    if let Some(error) = &o.error {
        body = body
            .child(label(t, error, 12.0, 400.0, "error").wrap())
            .child(control("Retry").on_press(|s: &mut State| {
                if let Some(o) = &mut s.composer.running.output {
                    o.error = None;
                    o.retry = true;
                    o.next = Instant::now();
                }
            }));
    }
    if o.truncated {
        body = body.child(label(
            t,
            "Showing recent output. Earlier output is omitted.",
            12.0,
            400.0,
            "text-tertiary",
        ));
    }
    body = body.child(
        el().key("shell-output-scroll")
            .grow(1.0)
            .min_h(0.0)
            .w_full()
            .mt(12.0)
            .scroll(ScrollSpec { stick_bottom: true })
            .child(
                label(
                    t,
                    if o.text.is_empty() {
                        if o.info.is_none() {
                            "Loading output…"
                        } else {
                            "No output yet."
                        }
                    } else {
                        &o.text
                    },
                    12.0,
                    400.0,
                    "text",
                )
                .font(TextStyle::new(12.0, 400.0).family(Family::Mono).lh(18.0))
                .wrap()
                .selectable(true),
            ),
    );
    let mut dialog = col()
        .key("shell-output-dialog")
        .w(width)
        .h(height)
        .padding(20.0)
        .radius(14.0)
        .fill(t.c("elevated"))
        .border(1.0, t.c("border-heavy"))
        .child(
            row()
                .w_full()
                .justify_between()
                .center_y()
                .mb(20.0)
                .child(label(t, "Shell output", 16.0, 600.0, "text"))
                .child(
                    crate::sidebar::icon_button_size(
                        t,
                        &crate::icons::CLOSE,
                        "Close shell output",
                        16.0,
                    )
                    .disabled(o.stopping)
                    .on_press(close),
                ),
        )
        .child(body);
    if o.info.as_ref().is_some_and(|i| i["status"] == "running") {
        let mut actions = row()
            .w_full()
            .mt(12.0)
            .gap(8.0)
            .center_y()
            .child(el().grow(1.0));
        if o.confirm {
            actions = actions
                .child(label(
                    t,
                    "Stop this command?",
                    13.0,
                    400.0,
                    "text-secondary",
                ))
                .child(control("Cancel").on_press(|s: &mut State| {
                    if let Some(o) = s.composer.running.output.as_mut().filter(|o| !o.stopping) {
                        o.confirm = false;
                    }
                }))
                .child(
                    t.paint(
                        control(if o.stopping {
                            "Stopping…"
                        } else {
                            "Stop command"
                        }),
                        "chip",
                    )
                    .on_press(stop),
                );
        } else {
            actions = actions.child(t.paint(control("Stop command…"), "chip").on_press(
                |s: &mut State| s.composer.running.output.as_mut().unwrap().confirm = true,
            ));
        }
        dialog = dialog.child(actions);
    }
    el().absolute(0.0, 0.0)
        .size(s.window_size.0, s.window_size.1)
        .fill(t.c("scrim"))
        .center()
        .child(crate::menus::overlay::raised(t, dialog.modal(true, close)))
}
