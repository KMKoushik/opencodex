use super::*;
pub(super) fn project_badge(t: &Theme, p: &oc_gateway::types::Project, size: f32) -> El {
    let color = p
        .icon
        .as_ref()
        .and_then(|i| i.color.as_deref())
        .filter(|c| matches!(*c, "gray" | "blue" | "green" | "orange" | "pink" | "purple"))
        .unwrap_or("gray");
    el().size(size, size)
        .radius(if size >= 24.0 { 6.0 } else { 4.0 })
        .center()
        .fill(t.c(&format!("project-{color}")))
        .border(1.0, t.c("border-heavy"))
        .child(label(
            t,
            p.display_name()
                .trim()
                .chars()
                .next()
                .unwrap_or('?')
                .to_uppercase()
                .collect::<String>(),
            if size >= 24.0 { 13.0 } else { 10.0 },
            500.0,
            "on-project",
        ))
}
pub fn resize(width: f32, height: f32) -> El {
    el().key("sidebar-resize")
        .role("separator")
        .label("Resize sidebar")
        .focusable(true)
        .size(8.0, height)
        .absolute(width - 4.0, 0.0)
        .cursor(rune::Cursor::ResizeColumn)
        .on_double_press(|s: &mut State| {
            s.prefs.sidebar_width = Some(300.0);
            s.save();
        })
        .on_key(|s: &mut State, event, tx| {
            let max = (s.window_size.0 - 360.0).clamp(200.0, 480.0);
            let next = match event.key {
                rune::Key::Left => s.sidebar_width() - 32.0,
                rune::Key::Right => s.sidebar_width() + 32.0,
                rune::Key::Home => 200.0,
                rune::Key::End => max,
                _ => return false,
            };
            s.prefs.sidebar_width = Some(next.clamp(200.0, max));
            s.save();
            tx.instant();
            true
        })
        .on_drag(|s: &mut State, d, tx| match d.phase {
            rune::Phase::Down => d.data = s.sidebar_width(),
            rune::Phase::Move => {
                s.prefs.sidebar_width = Some(
                    (d.data + d.dx).clamp(200.0, (s.window_size.0 - 360.0).clamp(200.0, 480.0)),
                );
                tx.instant();
            }
            rune::Phase::Up => {
                if d.cancelled() {
                    s.prefs.sidebar_width = Some(d.data);
                }
                s.save();
            }
        })
}
