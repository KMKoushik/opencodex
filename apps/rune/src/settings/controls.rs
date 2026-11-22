//! Settings-only controls. Thumb geometry is retained independently of labels.
use crate::{State, sidebar::label};
use rune::{El, el, row};
use std::sync::Arc;
pub fn range(
    s: &State,
    id: &str,
    value: f32,
    min: f32,
    max: f32,
    output: String,
    update: impl Fn(&mut State, f32) + 'static,
) -> El {
    let update: Arc<dyn Fn(&mut State, f32)> = Arc::new(update);
    let drag = update.clone();
    let keyboard = update.clone();
    let out_width = if id == "Chat font size" {
        30.234375
    } else {
        24.0
    };
    let width = 220.0 - 10.0 - out_width;
    let knob = 16.0;
    let fraction = (value - min) / (max - min);
    row()
        .w(220.0)
        .gap(10.0)
        .center_y()
        .child(
            el().key(id)
                .role("slider")
                .label(id)
                .focusable(true)
                .range_value(value as f64, min as f64, max as f64)
                .range_step(1.0)
                .a11y_value(&output)
                .size(width, 16.0)
                .on_step(move |s: &mut State, steps, _| {
                    update(s, (value + steps as f32).clamp(min, max))
                })
                .on_key(move |s: &mut State, e, _| {
                    let next = match e.key {
                        rune::Key::Right | rune::Key::Up => value + 1.0,
                        rune::Key::Left | rune::Key::Down => value - 1.0,
                        rune::Key::Home => min,
                        rune::Key::End => max,
                        rune::Key::PageUp => value + ((max - min) / 10.0).round().max(1.0),
                        rune::Key::PageDown => value - ((max - min) / 10.0).round().max(1.0),
                        _ => return false,
                    };
                    keyboard(s, next.clamp(min, max));
                    true
                })
                .on_drag(move |s: &mut State, d, _| match d.phase {
                    rune::Phase::Down => {
                        d.data = value;
                        drag(
                            s,
                            (min + ((d.x - knob / 2.0) / (width - knob)).clamp(0.0, 1.0)
                                * (max - min))
                                .round(),
                        );
                    }
                    rune::Phase::Move => drag(
                        s,
                        (min + ((d.x - knob / 2.0) / (width - knob)).clamp(0.0, 1.0) * (max - min))
                            .round(),
                    ),
                    rune::Phase::Up if d.cancelled() => drag(s, d.data),
                    _ => {}
                })
                .child(
                    el().absolute(0.0, 5.0)
                        .size(width, 6.0)
                        .radius(3.0)
                        .fill(s.theme.c("border-heavy")),
                )
                .child(
                    el().absolute(0.0, 5.0)
                        .size(fraction * (width - knob) + knob / 2.0, 6.0)
                        .radius(3.0)
                        .fill(s.theme.c("accent")),
                )
                .child(
                    el().absolute(fraction * (width - knob), 0.0)
                        .size(knob, knob)
                        .radius(8.0)
                        .fill(s.theme.c("accent")),
                ),
        )
        .child(
            label(&s.theme, output, 12.0, 400.0, "text-secondary")
                .w(out_width)
                .align(rune::Align::End),
        )
}
pub fn segment(
    s: &State,
    id: &str,
    selected: &str,
    options: &[(&str, &str)],
    choose: impl Fn(&mut State, &str) + 'static,
) -> El {
    let choose: crate::pages::controls::Choose = Arc::new(choose);
    let group_key = format!("segment:{id}");
    let selected_key = format!("segment:{id}:{selected}");
    let root_key = group_key.clone();
    let mut group = row()
        .key(id)
        .role("radiogroup")
        .label(id)
        .gap(2.0)
        .padding(2.0)
        .radius(9.0)
        .on_layout_tx(move |s: &mut State, rect, tx| {
            if s.pages.anchors.get(&root_key) == Some(&rect) {
                tx.live_only();
            } else {
                s.pages.anchors.insert(root_key.clone(), rect);
            }
        });
    let placed = s
        .pages
        .anchors
        .get(&group_key)
        .zip(s.pages.anchors.get(&selected_key));
    if let Some((root, target)) = placed {
        let thumb = s.theme.paint(
            el().key(format!("{id}-thumb"))
                .absolute(target[0] - root[0], 2.0)
                .size(target[2], 26.0)
                .radius(7.0)
                .lead(
                    rune::Spring::from_omega_zeta(26.0, 0.82),
                    rune::Spring::from_omega_zeta(17.0, 1.0),
                ),
            "glaze",
        );
        group = group.child(s.theme.shadow(thumb, "glaze-shadow"));
    }
    for (index, &(value, name)) in options.iter().enumerate() {
        let checked = selected == value;
        let value = value.to_owned();
        let cb = choose.clone();
        let keycb = choose.clone();
        let keys: Vec<_> = options.iter().map(|(v, _)| v.to_string()).collect();
        let focus = id.to_owned();
        let rect_key = format!("segment:{id}:{value}");
        let mut item = row()
            .key(format!("{id}-{value}"))
            .role("radio")
            .label(name)
            .checked(checked)
            .focusable(checked)
            .h(26.0)
            .px(10.0)
            .gap(6.0)
            .radius(7.0)
            .center_y()
            .on_layout_tx(move |s: &mut State, rect, tx| {
                if s.pages.anchors.get(&rect_key) == Some(&rect) {
                    tx.live_only();
                } else {
                    s.pages.anchors.insert(rect_key.clone(), rect);
                }
            })
            .on_key(move |s: &mut State, event, tx| {
                let next = match event.key {
                    rune::Key::Right | rune::Key::Down => (index + 1) % keys.len(),
                    rune::Key::Left | rune::Key::Up => (index + keys.len() - 1) % keys.len(),
                    _ => return false,
                };
                keycb(s, &keys[next]);
                tx.focus(format!("{focus}-{}", keys[next]), true);
                true
            });
        if id == "Mode" {
            let icon = match value.as_str() {
                "light" => &crate::icons::SUN,
                "dark" => &crate::icons::MOON,
                _ => &crate::icons::COMPUTER,
            };
            item = item.child(rune::icon(icon, 14.0).color(s.theme.c(if checked {
                "text"
            } else {
                "text-secondary"
            })));
        }
        item = item.child(label(
            &s.theme,
            name,
            12.0,
            500.0,
            if checked { "text" } else { "text-secondary" },
        ));
        if placed.is_none() && checked {
            item = s.theme.shadow(s.theme.paint(item, "glaze"), "glaze-shadow");
        }
        group = group.child(item.on_press(move |s: &mut State| cb(s, &value)));
    }
    s.theme.shadow(s.theme.paint(group, "well"), "well-shadow")
}
