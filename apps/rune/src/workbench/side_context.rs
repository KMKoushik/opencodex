use crate::{State, sidebar::label};
use rune::{Align, El, Shape, Side, col, el};

/// Side forks have their own history and model; never borrow main-chat usage.
pub fn view(s: &State, limit: Option<u64>) -> El {
    let t = &s.theme;
    let tokens = s
        .workbench
        .reader_chat
        .data
        .messages
        .iter()
        .rev()
        .take(50)
        .filter(|m| m.r#type == "assistant")
        .filter_map(|m| m.fields.get("tokens"))
        .map(crate::composer::context::total)
        .find(|n| *n > 0);
    let used = tokens
        .zip(limit)
        .filter(|(_, limit)| *limit > 0)
        .map(|(n, limit)| n as f32 / limit as f32);
    let title = used
        .map(|n| format!("{:.1}% context used", n * 100.0))
        .unwrap_or_else(|| "Context usage unavailable".into());
    let mut ring = el().size(20.0, 20.0).center().child(
        el().size(15.0, 15.0)
            .radius(7.5)
            .border(2.0833, t.c("border-heavy")),
    );
    if let Some(used) = used {
        let points: Vec<_> = (0..=64)
            .map(|i| {
                let angle = -std::f32::consts::FRAC_PI_2
                    + std::f32::consts::TAU * used.clamp(0.0, 1.0) * i as f32 / 64.0;
                [10.0 + 7.5 * angle.cos(), 10.0 + 7.5 * angle.sin()]
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
    let trigger = el()
        .key("side-context")
        .size(32.0, 32.0)
        .radius(7.0)
        .center()
        .hover(t.c("hover"))
        .child(ring)
        .role("button")
        .label(title.clone())
        .focusable(true)
        .on_press(|s: &mut State| s.workbench.side_context_open = !s.workbench.side_context_open);
    if !s.workbench.side_context_open {
        return trigger;
    }
    let mut content = col()
        .w(260.0)
        .padding(14.0)
        .gap(8.0)
        .radius(12.0)
        .fill(t.c("elevated"))
        .border(1.0, t.c("border"))
        .child(label(t, "Context window", 13.0, 500.0, "text"))
        .child(label(t, title, 12.0, 400.0, "text-secondary"));
    content = content.child(
        label(
            t,
            if let Some((tokens, limit)) = tokens.zip(limit) {
                format!("{tokens} / {limit} tokens")
            } else {
                "Usage appears after the model responds.".into()
            },
            12.0,
            400.0,
            "text-tertiary",
        )
        .wrap(),
    );
    trigger.child(
        t.shadow(content, "shadow")
            .anchored("side-context", Side::Top, Align::Start, 8.0)
            .modal(true, |s: &mut State| s.workbench.side_context_open = false),
    )
}
