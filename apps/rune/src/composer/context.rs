use crate::{State, sidebar::label};
use rune::{Align, El, Shape, Side, col, el, row};

fn total(tokens: &serde_json::Value) -> u64 {
    tokens["input"].as_u64().unwrap_or(0)
        + tokens["output"].as_u64().unwrap_or(0)
        + tokens["reasoning"].as_u64().unwrap_or(0)
        + tokens["cache"]["read"].as_u64().unwrap_or(0)
        + tokens["cache"]["write"].as_u64().unwrap_or(0)
}
fn number(n: u64) -> String {
    let raw = n.to_string();
    raw.chars()
        .enumerate()
        .fold(String::new(), |mut out, (i, ch)| {
            if i > 0 && (raw.len() - i) % 3 == 0 {
                out.push(',');
            }
            out.push(ch);
            out
        })
}
pub fn view(s: &State) -> El {
    let t = &s.theme;
    // ContextIndicator reads the newest history page, not all retained history.
    let latest =
        s.chat.data.messages.iter().rev().take(50).find(|m| {
            m.r#type == "assistant" && m.fields.get("tokens").is_some_and(|v| total(v) > 0)
        });
    let tokens = latest.and_then(|m| m.fields.get("tokens")).map(total);
    let response = latest.and_then(|m| m.fields.get("model"));
    let limit = response
        .and_then(|response| {
            s.project()
                .and_then(|p| s.snapshot.models.get(&p.canonical))?
                .data
                .iter()
                .find(|m| response["id"] == m.id && response["providerID"] == m.provider_id)?
                .limit["context"]
                .as_u64()
        })
        .or_else(|| s.model_info().and_then(|m| m.limit["context"].as_u64()));
    let used = tokens
        .zip(limit)
        .filter(|(_, max)| *max > 0)
        .map(|(n, max)| n as f32 / max as f32);
    let percent = used.map(|v| {
        let p = (v * 1000.0).round() / 10.0;
        if p.fract() == 0.0 {
            format!("{p:.0}%")
        } else {
            format!("{p:.1}%")
        }
    });
    let title = percent
        .as_ref()
        .map(|p| format!("{p} context used"))
        .unwrap_or("Context usage unavailable".into());
    let circle = el()
        .size(15.0, 15.0)
        .radius(7.5)
        .border(2.0833, t.c("border-heavy"));
    let mut ring = el().size(20.0, 20.0).center().child(circle);
    if let Some(used) = used {
        let points: Vec<_> = (0..=64)
            .map(|i| {
                let a = -std::f32::consts::FRAC_PI_2
                    + std::f32::consts::TAU * used.clamp(0.0, 1.0) * i as f32 / 64.0;
                [10.0 + 7.5 * a.cos(), 10.0 + 7.5 * a.sin()]
            })
            .collect();
        ring = ring.child(
            rune::canvas(Shape::new().stroke(
                points,
                2.0833,
                t.c(if used >= 0.9 {
                    "error"
                } else if used >= 0.75 {
                    "warning"
                } else {
                    "text-secondary"
                }),
            ))
            .size(20.0, 20.0)
            .absolute(0.0, 0.0),
        );
    }
    let mut wrapper = el()
        .size(32.0, 32.0)
        .center()
        .key("context-indicator")
        .role("button")
        .label(title)
        .focusable(true)
        .radius(7.0)
        .hover(t.c("hover"))
        .child(ring)
        .on_hover_change(|s: &mut State, inside, tx| {
            s.chat.context = inside || tx.focused() == Some("context-indicator")
        })
        .on_press(|s: &mut State| {
            s.chat.context = true;
            s.composer.context_clicked = true;
        })
        .on_key(|s: &mut State, event, _| {
            if event.key == rune::Key::Tab {
                s.chat.context = false;
                s.composer.context_clicked = false;
                false
            } else if event.key == rune::Key::Escape {
                s.chat.context = false;
                s.composer.context_clicked = false;
                true
            } else {
                false
            }
        });
    if s.chat.context {
        let width = (s.window_size.0 - 24.0).min(280.0);
        let mut panel = col()
            .w(width)
            .padding(14.0)
            .radius(12.0)
            .fill(t.c("elevated"))
            .border(1.0, t.c("border-heavy"))
            .role("tooltip")
            .label("Context window")
            .child(
                row()
                    .w_full()
                    .justify_between()
                    .gap(12.0)
                    .child(label(t, "Context window", 12.0, 400.0, "text"))
                    .child(label(
                        t,
                        percent.map(|p| format!("{p} used")).unwrap_or("—".into()),
                        12.0,
                        400.0,
                        "text",
                    )),
            )
            .child(
                el().w_full()
                    .h(4.0)
                    .my(12.0)
                    .radius(4.0)
                    .fill(t.c("secondary-hover"))
                    .child(
                        el().w((width - 28.0) * used.unwrap_or(0.0).clamp(0.0, 1.0))
                            .h(4.0)
                            .radius(4.0)
                            .fill(t.c("text-secondary")),
                    ),
            )
            .child(
                label(
                    t,
                    tokens
                        .map(|n| {
                            format!(
                                "{}{} tokens used",
                                number(n),
                                limit
                                    .map(|v| format!(" / {}", number(v)))
                                    .unwrap_or_default()
                            )
                        })
                        .unwrap_or("Usage appears after the first response.".into()),
                    12.0,
                    400.0,
                    "text-secondary",
                )
                .wrap(),
            );
        if tokens.is_some() {
            panel = panel.child(
                label(
                    t,
                    if used.is_none() {
                        "Latest response · Context limit unavailable"
                    } else {
                        "Latest response"
                    },
                    12.0,
                    400.0,
                    "text-tertiary",
                )
                .mt(4.0),
            );
        }
        let panel =
            t.shadow(panel, "shadow")
                .anchored("context-indicator", Side::Top, Align::End, 8.0);
        let panel = if s.composer.context_clicked {
            panel.modal(true, |s: &mut State| {
                s.chat.context = false;
                s.composer.context_clicked = false;
            })
        } else {
            panel
        };
        wrapper = wrapper.child(panel);
    }
    wrapper
}
