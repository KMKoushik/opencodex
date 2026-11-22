//! Usage limits presentation; calculations mirror usage-limits.tsx.
use crate::{State, pages::data, sidebar::label};
use rune::{El, col, el, row};
use serde_json::Value;
const REFRESH: rune::Icon = rune::Icon {
    name: "usage-refresh",
    view: 24.0,
    body: r#"<path fill="none" d="M20.0092 2V5.13219C20.0092 5.42605 19.6418 5.55908 19.4537 5.33333C17.6226 3.2875 14.9617 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>"#,
};

pub fn view(s: &State, mut body: El) -> El {
    body = body.gap(32.0).child(
        row()
            .w_full()
            .center_y()
            .gap(16.0)
            .child(
                row()
                    .grow(1.0)
                    .gap(10.0)
                    .child(label(&s.theme, "Usage", 20.0, 500.0, "text-tertiary"))
                    .child(label(&s.theme, "/", 20.0, 500.0, "text-tertiary"))
                    .child(label(&s.theme, "Limits", 20.0, 600.0, "text")),
            )
            .child(
                crate::sidebar::icon_button(&s.theme, &REFRESH, "Refresh limits")
                    .disabled(s.pages.pending.contains("usage/limits") || !s.snapshot.live)
                    .on_press(|s: &mut State| s.page_get("usage/limits")),
            ),
    );
    if !s.snapshot.live {
        return body.child(label(
            &s.theme,
            "Connect to OpenCode to check your plan limits.",
            14.0,
            400.0,
            "text-secondary",
        ));
    }
    if let Some(Err(error)) = s.pages.data.get("usage/limits") {
        body = body.child(
            label(&s.theme, error, 14.0, 400.0, "error")
                .role("alert")
                .wrap(),
        );
    }
    let Some(value) = data(s, "usage/limits") else {
        return if s.pages.data.contains_key("usage/limits") {
            body
        } else {
            body.child(
                label(&s.theme, "Checking limits…", 14.0, 400.0, "text-secondary").role("status"),
            )
        };
    };
    let providers = value["providers"].as_array();
    if providers.is_none_or(Vec::is_empty) {
        return body.child(label(&s.theme,"No plan limits to show. Sign in with ChatGPT or add an OpenCode Go key in OpenCode, or sign in to Claude Code, to see your remaining usage here.",14.0,400.0,"text-secondary").w_full().wrap());
    }
    let now = chrono::Utc::now().timestamp_millis();
    for provider in providers.into_iter().flatten() {
        let name = provider["name"].as_str().unwrap_or("");
        let id = provider["id"].as_str().unwrap_or("");
        let mut section = col().w_full().gap(12.0).child(
            row()
                .gap(12.0)
                .center_y()
                .mb(4.0)
                .child(logo(s, id))
                .child(label(&s.theme, name, 15.0, 500.0, "text")),
        );
        let windows = provider["windows"].as_array();
        if let Some(error) = provider["error"].as_str() {
            section =
                section.child(card(s).child(label(&s.theme, error, 13.0, 400.0, "error").wrap()));
        } else if windows.is_none_or(Vec::is_empty) {
            section = section.child(card(s).child(label(
                &s.theme,
                "This plan reports no usage limits.",
                13.0,
                400.0,
                "text",
            )));
        } else {
            for window in windows.into_iter().flatten() {
                section = section.child(limit(s, name, id, window, now));
            }
        }
        body = body.child(section);
    }
    body
}
fn card(s: &State) -> El {
    col()
        .w_full()
        .px(32.0)
        .py(20.0)
        .border(1.0, s.theme.c("border-heavy"))
        .radius(14.0)
}
fn limit(s: &State, provider: &str, id: &str, window: &Value, now: i64) -> El {
    let used = window["usedPercent"].as_f64().unwrap_or(0.0);
    let left = (100.0 - used).round();
    let reset = window["resetsAt"].as_i64();
    let duration = window["durationMs"].as_f64().unwrap_or(0.0);
    let mut amount = row()
        .gap(10.0)
        .center_y()
        .child(
            label(
                &s.theme,
                &format!("{left:.0}%"),
                40.0,
                500.0,
                if window["limited"] == true {
                    "error"
                } else {
                    "text"
                },
            )
            .font(rune::TextStyle::new(40.0, 500.0).lh(46.0)),
        )
        .child(label(&s.theme, "left", 15.0, 400.0, "text-tertiary"));
    if let Some(reset) = reset.filter(|_| duration > 0.0) {
        let elapsed = 1.0 - (reset - now) as f64 / duration;
        if elapsed > 0.0 && elapsed < 1.0 {
            let fast = used / 100.0 > elapsed;
            let tip = format!(
                "{}: {:.0}% used with {:.0}% of the window elapsed",
                if fast {
                    "Using faster than the limit resets"
                } else {
                    "On pace"
                },
                used,
                elapsed * 100.0
            );
            amount = amount.child(
                label(
                    &s.theme,
                    if fast { "↗" } else { "↘" },
                    18.0,
                    400.0,
                    "text-tertiary",
                )
                .role("img")
                .label(tip),
            );
        }
    }
    let tint = s.theme.c(match id {
        "claude" => "project-orange",
        "opencode-go" => "project-blue",
        _ => "text-tertiary",
    });
    let base = s.theme.c("elevated");
    let fill = rune::Color {
        r: tint.r * 0.4 + base.r * 0.6,
        g: tint.g * 0.4 + base.g * 0.6,
        b: tint.b * 0.4 + base.b * 0.6,
        a: 1.0,
    };
    let mut bar = row()
        .w_full()
        .h(24.0)
        .radius(8.0)
        .fill(s.theme.c("secondary"))
        .role("meter")
        .label(format!(
            "{provider} {} limit remaining: {left:.0}% left",
            window["label"].as_str().unwrap_or("").to_lowercase()
        ));
    if left > 0.0 {
        bar = bar.child(
            el().w_frac(left.clamp(0.0, 100.0) as f32 / 100.0)
                .h(24.0)
                .min_w(4.0)
                .center()
                .radius(8.0)
                .fill(fill)
                .child(label(
                    &s.theme,
                    if left >= 8.0 { "1" } else { "" },
                    11.0,
                    500.0,
                    "text-secondary",
                )),
        );
    }
    let mut legend = row().w_full().px(14.0).gap(12.0).center_y().child(
        row()
            .gap(8.0)
            .center_y()
            .grow(1.0)
            .child(
                el().size(18.0, 18.0)
                    .center()
                    .radius(5.0)
                    .fill(fill)
                    .child(label(&s.theme, "1", 11.0, 500.0, "text-secondary")),
            )
            .child(label(
                &s.theme,
                &format!("{provider} {left:.0}%"),
                14.0,
                400.0,
                "text",
            )),
    );
    if let Some(reset) = reset.filter(|r| *r > now) {
        legend = legend.child(
            label(
                &s.theme,
                &format!("↻ {}", countdown(reset - now)),
                13.0,
                400.0,
                "text-secondary",
            )
            .label(format!("Resets in {}", countdown(reset - now))),
        );
    }
    let summary = col()
        .gap(0.0)
        .child(label(
            &s.theme,
            window["label"].as_str().unwrap_or(""),
            15.0,
            500.0,
            "text",
        ))
        .child(amount);
    let detail = col()
        .grow(1.0)
        .min_w(0.0)
        .gap(10.0)
        .child(bar)
        .child(legend);
    if s.window_size.0 - s.prefs.sidebar_width.unwrap_or(300.0) < 608.0 {
        card(s)
            .px(20.0)
            .py(16.0)
            .gap(14.0)
            .child(summary)
            .child(detail)
    } else {
        card(s).child(
            row()
                .w_full()
                .center_y()
                .gap(24.0)
                .child(summary.w_frac(0.2647).min_w(150.0))
                .child(detail),
        )
    }
}
fn logo(s: &State, id: &str) -> El {
    const OPENAI: rune::Icon = rune::Icon {
        name: "usage-openai",
        view: 24.0,
        body: include_str!("../../../web/src/features/chat/provider-logos/openai.svg"),
    };
    const ANTHROPIC: rune::Icon = rune::Icon {
        name: "usage-anthropic",
        view: 24.0,
        body: include_str!("../../../web/src/features/chat/provider-logos/anthropic.svg"),
    };
    const OPENCODE: rune::Icon = rune::Icon {
        name: "usage-opencode",
        view: 24.0,
        body: include_str!("../../../web/src/features/chat/provider-logos/opencode.svg"),
    };
    rune::icon(
        match id {
            "codex" => &OPENAI,
            "claude" => &ANTHROPIC,
            _ => &OPENCODE,
        },
        20.0,
    )
    .color(s.theme.c(if id == "claude" {
        "project-orange"
    } else {
        "text"
    }))
}
fn countdown(ms: i64) -> String {
    let minutes = ((ms as f64 / 60_000.0).ceil() as i64).max(0);
    let days = minutes / 1440;
    let hours = minutes % 1440 / 60;
    if days > 0 {
        format!("{days}d {hours}h")
    } else if hours > 0 {
        format!("{hours}h {}m", minutes % 60)
    } else if minutes > 0 {
        format!("{minutes}m")
    } else {
        "now".into()
    }
}
