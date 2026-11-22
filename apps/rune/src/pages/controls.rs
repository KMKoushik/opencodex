//! Shared web-shaped controls, with native keyboard/accessibility behavior.
use crate::{State, sidebar::label};
use rune::{El, col, el, row};
use std::sync::Arc;
/// HTML maxlength counts UTF-16 units and limits only the inserted text, keeping
/// the selection's suffix and the editor's native undo history intact.
pub fn limit_input(edit: &mut rune::TextEdit, text: &str, max: usize) -> bool {
    let (a, b) = edit.range();
    let used = edit.text[..a].encode_utf16().count() + edit.text[b..].encode_utf16().count();
    let available = max.saturating_sub(used);
    if text.encode_utf16().count() <= available {
        return false;
    }
    let mut units = 0;
    let end = text
        .char_indices()
        .find_map(|(n, c)| {
            units += c.len_utf16();
            (units > available).then_some(n)
        })
        .unwrap_or(text.len());
    if end > 0 {
        edit.insert(&text[..end]);
    }
    true
}
pub fn limit_key(edit: &mut rune::TextEdit, event: &rune::KeyEvent, max: usize) -> bool {
    if let rune::Key::Text(text) = &event.key {
        limit_input(edit, text, max)
    } else {
        false
    }
}

pub type Choose = Arc<dyn Fn(&mut State, &str)>;
#[derive(Clone)]
pub struct Choice {
    pub value: String,
    pub label: String,
}
#[derive(Clone)]
pub struct Select {
    pub id: String,
    pub options: Vec<Choice>,
    pub selected: String,
    pub choose: Choose,
    pub active: usize,
}
pub fn ghost(s: &State, title: &str) -> El {
    ghost_tone(s, title, "text-secondary")
}
pub fn ghost_tone(s: &State, title: &str, tone: &str) -> El {
    el().role("button")
        .label(title)
        .focusable(true)
        .h(28.0)
        .px(10.0)
        .center()
        .radius(8.0)
        .hover(s.theme.c("hover"))
        .child(label(&s.theme, title, 12.0, 500.0, tone))
}
pub fn segment(
    s: &State,
    id: &str,
    selected: &str,
    options: &[(&str, &str)],
    choose: impl Fn(&mut State, &str) + 'static,
) -> El {
    let choose: Choose = Arc::new(choose);
    let mut group = s.theme.shadow(
        s.theme.paint(
            row()
                .key(id)
                .role("radiogroup")
                .label(id)
                .gap(2.0)
                .padding(2.0)
                .radius(9.0),
            "well",
        ),
        "well-shadow",
    );
    for &(value, name) in options {
        let value = value.to_owned();
        let cb = choose.clone();
        let checked = selected == value;
        let keys: Vec<_> = options.iter().map(|(v, _)| v.to_string()).collect();
        let index = keys.iter().position(|v| v == &value).unwrap_or(0);
        let focusid = id.to_owned();
        let keycb = choose.clone();
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
            .on_key(move |s: &mut State, event, tx| {
                let n = match event.key {
                    rune::Key::Right | rune::Key::Down => (index + 1) % keys.len(),
                    rune::Key::Left | rune::Key::Up => (index + keys.len() - 1) % keys.len(),
                    rune::Key::Home => 0,
                    rune::Key::End => keys.len() - 1,
                    _ => return false,
                };
                keycb(s, &keys[n]);
                tx.focus(format!("{focusid}-{}", keys[n]), true);
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
        let item = if checked {
            s.theme.shadow(s.theme.paint(item, "glaze"), "glaze-shadow")
        } else {
            item
        };
        group = group.child(item.on_press(move |s: &mut State| cb(s, &value)));
    }
    group
}
pub fn select(
    s: &State,
    id: &str,
    name: &str,
    selected: &str,
    options: Vec<Choice>,
    choose: impl Fn(&mut State, &str) + 'static,
) -> El {
    let current = options
        .iter()
        .find(|o| o.value == selected)
        .map(|o| o.label.as_str())
        .unwrap_or("");
    let id = id.to_owned();
    let anchor = id.clone();
    let key = id.clone();
    let value = selected.to_owned();
    let choose: Choose = Arc::new(choose);
    let keyboard = Select {
        id: key.clone(),
        options: options.clone(),
        selected: value.clone(),
        choose: choose.clone(),
        active: options.iter().position(|o| o.value == value).unwrap_or(0),
    };
    let preview = theme_chip(s, id.contains("theme"), id.starts_with("Dark"), selected);
    s.theme.shadow(
        s.theme.paint(
            row()
                .key(&id)
                .role("combobox")
                .label(name)
                .focusable(true)
                .h(30.0)
                .px(10.0)
                .gap(8.0)
                .center_y()
                .radius(8.0)
                .border(1.0, s.theme.c("chip-border"))
                .child(preview)
                .child(label(&s.theme, current, 12.0, 400.0, "text").grow(1.0))
                .child(rune::icon(&crate::icons::DOWN, 14.0).color(s.theme.c("text-tertiary")))
                .on_layout_tx(move |s: &mut State, rect, tx| {
                    s.pages.anchors.insert(anchor.clone(), rect);
                    tx.live_only();
                })
                .on_key(move |s: &mut State, event, tx| {
                    if !matches!(event.key, rune::Key::Down | rune::Key::Up) {
                        return false;
                    }
                    s.menus.open = Some(crate::menus::Menu::Choice(keyboard.clone()));
                    tx.focus_when_shown(format!("choice-{}", keyboard.active), true);
                    true
                })
                .on_press_tx(move |s: &mut State, tx| {
                    let active = options.iter().position(|o| o.value == value).unwrap_or(0);
                    s.menus.open = Some(crate::menus::Menu::Choice(Select {
                        id: key.clone(),
                        options: options.clone(),
                        selected: value.clone(),
                        choose: choose.clone(),
                        active,
                    }));
                    tx.focus_when_shown(format!("choice-{active}"), false);
                }),
            "chip",
        ),
        "chip-shadow",
    )
}
fn theme_chip(s: &State, show: bool, dark: bool, value: &str) -> El {
    if !show {
        return el();
    }
    let seed = &crate::theme::preset(dark, value).seed;
    el().size(22.0, 22.0)
        .radius(11.0)
        .center()
        .fill(rune::color::hex(&seed.surface).expect("preset surface"))
        .border(1.0, crate::theme::preview_border(seed))
        .child(
            label(&s.theme, "Aa", 10.0, 600.0, "text")
                .color(rune::color::hex(&seed.accent).expect("preset accent")),
        )
}
pub fn select_overlay(s: &State, menu: &Select) -> El {
    let rect = s.pages.anchors.get(&menu.id).copied().unwrap_or([
        s.window_size.0 / 2.0,
        160.0,
        200.0,
        30.0,
    ]);
    let w = rect[2].max(200.0);
    let h = (menu.options.len() as f32 * 32.0 + 8.0).min(320.0);
    let y = if s.window_size.1 - rect[1] - rect[3] < h + 12.0 {
        (rect[1] - h - 4.0).max(8.0)
    } else {
        rect[1] + rect[3] + 4.0
    };
    let id = menu.id.clone();
    let mut panel = col()
        .w(w)
        .max_h(320.0)
        .padding(4.0)
        .radius(9.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        });
    for (n, option) in menu.options.iter().enumerate() {
        let value = option.value.clone();
        let cb = menu.choose.clone();
        let back = menu.id.clone();
        panel = panel.child(
            row()
                .key(format!("choice-{n}"))
                .role("option")
                .label(&option.label)
                .focusable(true)
                .w_full()
                .h(32.0)
                .px(10.0)
                .gap(10.0)
                .center_y()
                .radius(5.0)
                .hover(s.theme.c("hover"))
                .child(theme_chip(
                    s,
                    menu.id.contains("theme"),
                    menu.id.starts_with("Dark"),
                    &option.value,
                ))
                .child(label(&s.theme, &option.label, 13.0, 400.0, "text").grow(1.0))
                .child(label(
                    &s.theme,
                    if option.value == menu.selected {
                        "✓"
                    } else {
                        ""
                    },
                    13.0,
                    400.0,
                    "text",
                ))
                .on_press_tx(move |s: &mut State, tx| {
                    s.menus.open = None;
                    cb(s, &value);
                    tx.return_focus(&back, false);
                }),
        );
    }
    el().absolute(0.0, 0.0)
        .size(s.window_size.0, s.window_size.1)
        .modal(true, |s: &mut State| s.menus.open = None)
        .on_key(move |s: &mut State, event, tx| {
            if matches!(event.key, rune::Key::Escape | rune::Key::Tab) {
                s.menus.open = None;
                tx.return_focus(&id, true);
                return true;
            }
            let Some(crate::menus::Menu::Choice(m)) = &mut s.menus.open else {
                return false;
            };
            let len = m.options.len();
            if len == 0 {
                return false;
            }
            m.active = match event.key {
                rune::Key::Down => (m.active + 1) % len,
                rune::Key::Up => (m.active + len - 1) % len,
                rune::Key::Home => 0,
                rune::Key::End => len - 1,
                _ => return false,
            };
            tx.focus(format!("choice-{}", m.active), true);
            tx.scroll_into_view(format!("choice-{}", m.active));
            true
        })
        .child(
            el().absolute(0.0, 0.0)
                .size(s.window_size.0, s.window_size.1)
                .on_press(|s: &mut State| s.menus.open = None),
        )
        .child(
            s.theme
                .shadow(panel, "shadow")
                .absolute(rect[0].min(s.window_size.0 - w - 8.0), y),
        )
}
pub fn range(
    s: &State,
    id: &str,
    value: f32,
    min: f32,
    max: f32,
    output: String,
    update: impl Fn(&mut State, f32) + 'static,
) -> El {
    crate::settings::controls::range(s, id, value, min, max, output, update)
}
