use super::*;
use rune::{TextStyle, el, row};
pub fn status(app: &Value) -> String {
    if !app["error"].is_null() {
        return "server.ts failed".into();
    }
    if let Some(running) = app["running"].as_array().filter(|v| !v.is_empty()) {
        return format!(
            "Running {}",
            running
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(", ")
        );
    }
    let last = &app["lastRun"];
    if last.is_null() {
        "Never run".into()
    } else {
        format!(
            "{} {}",
            if last["status"] == "error" {
                "Failed"
            } else {
                "Ran"
            },
            ago(last["ended"]
                .as_i64()
                .or(last["started"].as_i64())
                .unwrap_or(0))
        )
    }
}
pub fn ago(time: i64) -> String {
    let seconds = ((time - chrono::Local::now().timestamp_millis()) as f64 / 1000.0).round();
    for (unit, size) in [("day", 86400.0), ("hr", 3600.0), ("min", 60.0)] {
        if seconds.abs() >= size {
            let n = (seconds / size).round() as i64;
            return if unit == "day" && n == -1 {
                "yesterday".into()
            } else if unit == "day" && n == 1 {
                "tomorrow".into()
            } else if n < 0 {
                format!("{} {unit} ago", -n)
            } else {
                format!("in {n} {unit}")
            };
        }
    }
    "just now".into()
}
pub fn schedule(app: &Value) -> String {
    let mut every = Vec::new();
    for t in app["triggers"]
        .as_object()
        .into_iter()
        .flat_map(|t| t.values())
    {
        let Some(e) = t["every"].as_str() else {
            continue;
        };
        if every.iter().any(|v| v == e) {
            continue;
        }
        every.push(e.to_owned());
    }
    every
        .iter()
        .map(|e| match e.as_str() {
            "1h" => "hourly".into(),
            "1d" => "daily".into(),
            "7d" => "weekly".into(),
            _ => format!("every {e}"),
        })
        .collect::<Vec<String>>()
        .join(", ")
}
pub fn icon(s: &State, app: &Value, size: f32) -> El {
    let hash = app["id"]
        .as_str()
        .unwrap_or("")
        .encode_utf16()
        .fold(0u32, |hash, c| hash.wrapping_mul(31).wrapping_add(c as u32));
    let color = app["icon"]["color"]
        .as_str()
        .unwrap_or(["blue", "green", "orange", "pink", "purple"][hash as usize % 5]);
    let glyph = app["icon"]["glyph"].as_str();
    let body = el()
        .size(size, size)
        .radius(size * 0.27)
        .center()
        .fill(s.theme.c(&format!("project-{color}")));
    if let Some(glyph) = glyph {
        let Some(glyph) = super::glyphs::get(glyph) else {
            return body;
        };
        body.child(rune::icon(glyph, (size * 0.66).round()).color(s.theme.c("on-project")))
    } else {
        body.child(label(
            &s.theme,
            app["title"]
                .as_str()
                .unwrap_or("?")
                .chars()
                .next()
                .unwrap_or('?')
                .to_uppercase()
                .to_string(),
            (size * 0.62).round(),
            500.0,
            "on-project",
        ))
    }
}
pub fn view(s: &State, apps: &[Value]) -> El {
    let running = apps
        .iter()
        .filter(|a| a["running"].as_array().is_some_and(|v| !v.is_empty()))
        .count();
    let failing = apps
        .iter()
        .filter(|a| !a["error"].is_null() || a["lastRun"]["status"] == "error")
        .count();
    let summary = format!(
        "{} {}{}{}",
        apps.len(),
        if apps.len() == 1 { "app" } else { "apps" },
        if running > 0 {
            format!(" · {running} running")
        } else {
            String::new()
        },
        if failing > 0 {
            format!(" · {failing} failing")
        } else {
            String::new()
        }
    );
    let width = (s.window_size.0
        - if s.prefs.sidebar_closed {
            0.0
        } else {
            s.prefs.sidebar_width.unwrap_or(300.0)
        }
        - 48.0)
        .min(1080.0);
    let count = ((width + 12.0) / 272.0).floor().max(1.0) as usize;
    let mut content = col().w_full().max_w(1080.0).gap(16.0).child(
        col()
            .gap(2.0)
            .child(
                label(&s.theme, "Apps", 20.0, 600.0, "text")
                    .font(TextStyle::new(20.0, 600.0).lh(26.0)),
            )
            .child(label(&s.theme, summary, 13.0, 400.0, "text-tertiary")),
    );
    for chunk in apps.chunks(count) {
        let mut line = row().w_full().gap(12.0);
        for app in chunk {
            let id = app["id"].as_str().unwrap_or("").to_owned();
            let title = app["title"].as_str().unwrap_or("");
            let schedule = schedule(app);
            let foot = if schedule.is_empty() {
                "On demand".into()
            } else {
                format!("{}{}", schedule[..1].to_uppercase(), &schedule[1..])
            };
            let tile = row()
                .grow(1.0)
                .w(0.0)
                .min_w(0.0)
                .padding(14.0)
                .gap(12.0)
                .radius(14.0)
                .role("button")
                .label(title)
                .focusable(true)
                .child(icon(s, app, 36.0))
                .child(
                    col()
                        .grow(1.0)
                        .min_w(0.0)
                        .gap(3.0)
                        .child(
                            label(&s.theme, title, 13.5, 550.0, "text")
                                .font(TextStyle::new(13.5, 550.0).lh(18.225))
                                .truncate(),
                        )
                        .child(
                            label(
                                &s.theme,
                                status(app),
                                12.5,
                                400.0,
                                if !app["error"].is_null() || app["lastRun"]["status"] == "error" {
                                    "error"
                                } else {
                                    "text-secondary"
                                },
                            )
                            .truncate(),
                        )
                        .child(label(&s.theme, foot, 12.0, 400.0, "text-tertiary").mt(4.0)),
                )
                .on_press(move |s: &mut State| {
                    super::select(s, id.clone());
                });
            line = line.child(s.theme.shadow(s.theme.paint(tile, "glaze"), "glaze-shadow"));
        }
        for _ in chunk.len()..count {
            line = line.child(el().grow(1.0).w(0.0));
        }
        content = content.child(line);
    }
    col()
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .items_center()
        .px(24.0)
        .pt(24.0)
        .pb(32.0)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(content)
}
