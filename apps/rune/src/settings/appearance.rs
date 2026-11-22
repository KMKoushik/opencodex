use crate::{
    State,
    pages::controls as ui,
    profile::{ThemePreference, VariantPreference},
    sidebar::label,
    theme::Theme,
};
use rune::{El, TextEdit, TextStyle, col, el, row, text_input};
use std::collections::BTreeMap;

#[derive(Default)]
pub struct Appearance {
    pub system_dark: Option<bool>,
    pub fields: BTreeMap<String, TextEdit>,
    pub editing: Option<String>,
}
pub fn receive_color(s: &mut State) -> bool {
    let Some((key, value)) = oc_native::take_color() else {
        return false;
    };
    s.pages
        .appearance
        .fields
        .insert(key.clone(), TextEdit::new(&value));
    commit(s, &key);
    true
}
fn open_color(s: &mut State, key: String, color: &str) {
    if let Some(wake) = s.waker.clone() {
        oc_native::open_color(key, color, wake);
    }
}
pub fn after_frame(rt: &rune::Runtime<State>, handle: &rune::AppHandle<State>) {
    let dark = rt.env.system_dark;
    if rt.state.pages.appearance.system_dark != Some(dark) {
        handle.update(move |s, _| system_changed(s, dark));
    }
    if let Some(key) = rt.state.pages.appearance.editing.clone() {
        if !rt
            .elements()
            .iter()
            .any(|e| e.key.as_deref() == Some(&key) && e.focused)
        {
            handle.update(move |s, _| commit(s, &key));
        }
    }
}
pub fn preference(s: &State) -> ThemePreference {
    s.prefs.theme.clone().unwrap_or_else(|| {
        let mut p = ThemePreference::default();
        if let Some(dark) = s.prefs.dark {
            p.mode = if dark { "dark" } else { "light" }.into();
        }
        let v = p.variant_mut(s.prefs.dark.unwrap_or(s.theme.dark));
        v.preset = s.prefs.preset.clone();
        v.accent = s.prefs.accent.clone();
        p
    })
}
pub fn derive(dark: bool, value: &VariantPreference) -> Theme {
    let theme = Theme::new(dark, &value.preset);
    let mut seed = theme.preset.seed.clone();
    if let Some(hex) = value.accent.as_deref().and_then(normalize) {
        seed.accent = hex;
    }
    if let Some(hex) = value.surface.as_deref().and_then(normalize) {
        seed.surface = hex;
    }
    if let Some(hex) = value.ink.as_deref().and_then(normalize) {
        seed.ink = hex;
    }
    if let Some(c) = value
        .contrast
        .filter(|c| c.is_finite() && *c >= 0.0 && *c <= 100.0)
    {
        seed.contrast = c.round();
    }
    Theme::derive(dark, theme.preset, seed, value.surface.is_some())
}
pub fn apply(s: &mut State, preference: ThemePreference) {
    let system = s
        .pages
        .appearance
        .system_dark
        .unwrap_or(crate::OPTIONS.get().unwrap().dark);
    let dark = match preference.mode.as_str() {
        "light" => false,
        "dark" => true,
        _ => system,
    };
    let next = derive(dark, preference.variant(dark));
    s.prefs.theme = Some(preference);
    if next.tokens != s.theme.tokens {
        let art_changed = next.preset.art != s.theme.preset.art;
        let wordmark_changed = next.tokens["text"] != s.theme.tokens["text"]
            || next.tokens["wordmark-muted"] != s.theme.tokens["wordmark-muted"];
        s.theme = next;
        s.rows_revision += 1;
        s.chat.disclosure_revision += 1;
        if let Some(wake) = s.waker.clone() {
            if art_changed || s.assets.is_none() {
                s.assets = Some(crate::assets::Assets::load(&s.theme, wake, false));
            } else if wordmark_changed {
                s.assets = Some(s.assets.as_ref().unwrap().retint(&s.theme, wake));
            }
        }
    }
    s.save();
}
pub fn system_changed(s: &mut State, dark: bool) {
    s.pages.appearance.system_dark = Some(dark);
    let p = preference(s);
    if p.mode == "system" {
        apply(s, p);
    }
}
pub fn font(s: &mut State, size: f32) {
    let size = size.round().clamp(12.0, 20.0);
    if s.prefs.chat_font_size == Some(size) {
        return;
    }
    s.prefs.chat_font_size = Some(size);
    s.chat.disclosure_revision += 1;
    s.save();
}
fn update(s: &mut State, dark: bool, change: impl FnOnce(&mut VariantPreference)) {
    let mut p = preference(s);
    change(p.variant_mut(dark));
    apply(s, p);
}
pub fn normalize(value: &str) -> Option<String> {
    let hex = value.strip_prefix('#').unwrap_or(value);
    (hex.len() == 6 && hex.bytes().all(|b| b.is_ascii_hexdigit()))
        .then(|| format!("#{}", hex.to_ascii_lowercase()))
}
pub fn commit(s: &mut State, key: &str) {
    let Some(edit) = s.pages.appearance.fields.remove(key) else {
        return;
    };
    s.pages.appearance.editing = None;
    let Some(hex) = normalize(&edit.text) else {
        return;
    };
    let Some((variant, field)) = key
        .strip_prefix("appearance-")
        .and_then(|v| v.split_once('-'))
    else {
        return;
    };
    update(s, variant == "dark", |v| match field {
        "accent" => v.accent = Some(hex),
        "surface" => v.surface = Some(hex),
        "ink" => v.ink = Some(hex),
        _ => {}
    });
}
fn customized(v: &VariantPreference) -> bool {
    v.surface.is_some() || v.ink.is_some() || v.accent.is_some() || v.contrast.is_some()
}
fn bare(s: &State) -> El {
    col()
        .w_full()
        .radius(12.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border"))
        .border_layout()
}
pub fn view(s: &State, mut body: El) -> El {
    let p = preference(s);
    body = body.child(
        bare(s).child(
            super::setting_row(s, "Mode", "Follow your system or keep one appearance.")
                .border_sides([0.0; 4], rune::Color::TRANSPARENT)
                .child(super::controls::segment(
                    s,
                    "Mode",
                    &p.mode,
                    &[("light", "Light"), ("dark", "Dark"), ("system", "System")],
                    |s, value| {
                        let mut p = preference(s);
                        p.mode = value.into();
                        apply(s, p);
                    },
                )),
        ),
    );
    let size = s.prefs.chat_font_size.unwrap_or(14.0);
    body = body.child(
        super::group_action(
            s,
            "Typography",
            Some(
                ui::ghost(s, "Reset")
                    .label("Reset chat font size")
                    .disabled(size == 14.0)
                    .dim(if size == 14.0 { 0.45 } else { 1.0 })
                    .on_press(|s: &mut State| font(s, 14.0)),
            ),
        )
        .child(
            super::setting_row(
                s,
                "Chat font size",
                "Messages and the prompt input. Code and sidebar text are unchanged.",
            )
            .child(ui::range(
                s,
                "Chat font size",
                size,
                12.0,
                20.0,
                format!("{size:.0}px"),
                font,
            )),
        )
        .child(
            label(
                &s.theme,
                "Good code should be easy to read.",
                size,
                400.0,
                "text",
            )
            .label("Chat font preview")
            .font(rune::TextStyle::new(size, 400.0).lh(size * 1.625))
            .w_full()
            .padding(16.0)
            .h(size * 1.625 + 33.0)
            .border_sides([1.0, 0.0, 0.0, 0.0], s.theme.c("border"))
            .border_layout(),
        ),
    );
    body = body.child(
        super::group(s, "Terminal").child(
            super::setting_row(
                s,
                "Placement",
                "Open the terminal below the workspace or in the right-side panel.",
            )
            .child(super::controls::segment(
                s,
                "Terminal placement",
                if s.prefs.terminal_right {
                    "right"
                } else {
                    "bottom"
                },
                &[("bottom", "Bottom"), ("right", "Right")],
                |s, value| {
                    s.prefs.terminal_right = value == "right";
                    s.save();
                },
            )),
        ),
    );
    for dark in [false, true] {
        body = body.child(variant(s, dark, p.variant(dark)));
    }
    body
}
fn variant(s: &State, dark: bool, value: &VariantPreference) -> El {
    let name = if dark { "Dark" } else { "Light" };
    let preset = crate::theme::preset(dark, &value.preset);
    let selected = preset.id.clone();
    let mut action = row().gap(8.0).center_y();
    if customized(value) {
        action = action.child(ui::ghost(s, "Reset").on_press(move |s: &mut State| {
            update(s, dark, |v| {
                *v = VariantPreference {
                    preset: v.preset.clone(),
                    ..Default::default()
                }
            });
            s.pages.appearance.fields.clear();
        }));
    }
    let options = crate::theme::presets(dark)
        .into_iter()
        .map(|p| ui::Choice {
            value: p.id,
            label: p.name,
        })
        .collect();
    action = action.child(
        ui::select(
            s,
            &format!("{name} theme"),
            &format!("{name} theme"),
            &selected,
            options,
            move |s, value| {
                update(s, dark, |v| {
                    *v = VariantPreference {
                        preset: value.into(),
                        ..Default::default()
                    }
                });
                s.pages.appearance.fields.clear();
            },
        )
        .w(220.0),
    );
    let mut group = super::group_action(s, &format!("{name} theme"), Some(action));
    let seed = &preset.seed;
    for (field, title, color) in [
        (
            "accent",
            "Accent",
            value.accent.as_deref().unwrap_or(&seed.accent),
        ),
        (
            "surface",
            "Background",
            value.surface.as_deref().unwrap_or(&seed.surface),
        ),
        (
            "ink",
            "Foreground",
            value.ink.as_deref().unwrap_or(&seed.ink),
        ),
    ] {
        group = group.child(
            super::setting_row(s, title, "").child(color_field(s, dark, field, color, name)),
        );
    }
    let contrast = value.contrast.unwrap_or(seed.contrast) as f32;
    group.child(super::setting_row(s, "Contrast", "").child(ui::range(
        s,
        &format!("{name} contrast"),
        contrast,
        0.0,
        100.0,
        format!("{contrast:.0}"),
        move |s, c| update(s, dark, |v| v.contrast = Some(c as f64)),
    )))
}
fn color_field(s: &State, dark: bool, field: &'static str, color: &str, name: &str) -> El {
    let key = format!("appearance-{}-{field}", if dark { "dark" } else { "light" });
    let editkey = key.clone();
    let commitkey = key.clone();
    let inputkey = key.clone();
    let pickerkey = key.clone();
    let pickercolor = color.to_owned();
    let display = match field {
        "surface" => "background",
        "ink" => "foreground",
        _ => "accent",
    };
    let initial = color.to_owned();
    let fallback = TextEdit::new(color);
    let edit = s.pages.appearance.fields.get(&key).unwrap_or(&fallback);
    row()
        .h(30.0)
        .pl(4.0)
        .pr(8.0)
        .gap(6.0)
        .center_y()
        .radius(8.0)
        .fill(s.theme.c("control"))
        .border(1.0, s.theme.c("border-heavy"))
        .child(
            el().key(format!("{key}-swatch"))
                .role("button")
                .label(format!("{name} {display} color"))
                .focusable(true)
                .size(22.0, 22.0)
                .radius(11.0)
                .fill(rune::color::hex(color).unwrap_or(rune::Color::TRANSPARENT))
                .border(1.0, s.theme.c("border-heavy"))
                .on_press(move |s: &mut State| open_color(s, pickerkey.clone(), &pickercolor)),
        )
        .child(
            text_input(edit, TextStyle::new(12.0, 400.0).mono())
                .key(&key)
                .label(format!("{name} {display} hex value"))
                .single_line()
                .w(64.0)
                .color(s.theme.c("text"))
                .on_edit(move |s: &mut State| {
                    s.pages
                        .appearance
                        .fields
                        .entry(editkey.clone())
                        .or_insert_with(|| TextEdit::new(&initial))
                })
                .on_input_change(move |s: &mut State, _| {
                    s.pages.appearance.editing = Some(inputkey.clone())
                })
                .on_input_key(move |s: &mut State, event, _| match event.key {
                    rune::Key::Enter => {
                        commit(s, &commitkey);
                        true
                    }
                    rune::Key::Escape => {
                        s.pages.appearance.fields.remove(&commitkey);
                        s.pages.appearance.editing = None;
                        true
                    }
                    _ => false,
                }),
        )
}
