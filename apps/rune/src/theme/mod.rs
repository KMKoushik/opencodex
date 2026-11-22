//! Exact sRGB/contrast derivation from web `theme.ts`. Seeds are generated from `presets.ts`.
use rune::{Color, El, Shadow};
use serde::Deserialize;
use std::collections::BTreeMap;

type Rgb = [f64; 3];
const BLACK: Rgb = [0.0; 3];
const WHITE: Rgb = [255.0; 3];
#[derive(Clone, Deserialize)]
pub struct Seed {
    pub surface: String,
    pub ink: String,
    pub accent: String,
    pub contrast: f64,
}
#[derive(Clone, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub seed: Seed,
    pub under: Option<String>,
    pub error: Option<String>,
    pub success: Option<String>,
    pub warning: Option<String>,
    pub link: Option<String>,
    pub primary: Option<String>,
    pub syntax: Option<String>,
    pub art: Option<String>,
}
pub struct Theme {
    pub dark: bool,
    pub preset: Preset,
    pub tokens: BTreeMap<String, String>,
    colors: BTreeMap<String, Color>,
    gradients: BTreeMap<String, Vec<(f32, Color)>>,
    shadows: BTreeMap<String, Vec<Shadow>>,
}
pub fn presets(dark: bool) -> Vec<Preset> {
    preset_list(dark).to_vec()
}
pub fn preset(dark: bool, id: &str) -> &'static Preset {
    let choices = preset_list(dark);
    choices.iter().find(|p| p.id == id).unwrap_or(&choices[0])
}
pub fn preview_border(seed: &Seed) -> Color {
    rune::color::hex(&css(mix(rgb(&seed.surface), rgb(&seed.ink), 0.16)))
        .expect("theme preview border")
}
fn preset_list(dark: bool) -> &'static [Preset] {
    static ALL: std::sync::OnceLock<BTreeMap<String, Vec<Preset>>> = std::sync::OnceLock::new();
    ALL.get_or_init(|| {
        serde_json::from_str(include_str!("../../presets.json")).expect("bundled theme seeds")
    })
    .get(if dark { "dark" } else { "light" })
    .expect("appearance")
    .as_slice()
}
impl Theme {
    pub fn new(dark: bool, id: &str) -> Self {
        let p = preset(dark, id).clone();
        Self::derive(dark, p.clone(), p.seed.clone(), false)
    }
    /// Custom surfaces deliberately invalidate a preset's published sidebar tone.
    pub fn derive(dark: bool, p: Preset, seed: Seed, custom_surface: bool) -> Self {
        let s = rgb(&seed.surface);
        let ink = rgb(&seed.ink);
        let accent = rgb(&seed.accent);
        let light = !dark;
        let standard = if light { 45.0 } else { 60.0 };
        let scaled = seed.contrast / 100.0 + ((seed.contrast - standard) / 60.0) * 0.7;
        let c = if seed.contrast <= standard {
            scaled
        } else {
            standard / 100.0 + (scaled - standard / 100.0) * 2.0
        };
        let offset = seed.contrast - standard;
        let under = if !custom_surface && p.under.is_some() {
            rgb(p.under.as_deref().unwrap())
        } else if light {
            mix(s, ink, 0.04 + offset * 0.0012)
        } else {
            mix(s, BLACK, 0.16 + offset * 0.0015)
        };
        let readable = |color| readable(color, [s, under], ink);
        let error = rgb(p
            .error
            .as_deref()
            .unwrap_or(if light { "#ba2623" } else { "#ff6764" }));
        let success =
            rgb(p
                .success
                .as_deref()
                .unwrap_or(if light { "#00a240" } else { "#40c977" }));
        let warning =
            rgb(p
                .warning
                .as_deref()
                .unwrap_or(if light { "#9a5b00" } else { "#e2b85a" }));
        let link = readable(rgb(p.link.as_deref().unwrap_or(&seed.accent)));
        let on_accent = if luminance(accent) > 0.179 {
            BLACK
        } else {
            WHITE
        };
        let primary_accent = p.primary.as_deref() == Some("accent");
        let primary = if primary_accent { accent } else { ink };
        let lift = |amount| mix(s, if light { WHITE } else { ink }, amount);
        let sink = |amount| mix(s, ink, amount);
        let drop = |amount| alpha(BLACK, amount);
        let edge = if light { css(WHITE) } else { alpha(ink, 0.07) };
        let secondary = readable(mix(s, ink, (if light { 0.74 } else { 0.65 }) + c * 0.1));
        let tertiary = readable(mix(s, ink, (if light { 0.45 } else { 0.42 }) + c * 0.12));
        let mut tokens = BTreeMap::new();
        let mut put = |name: &str, value: String| {
            tokens.insert(name.to_owned(), value);
        };
        for (name, hex) in [
            ("gray", "#676767"),
            ("blue", "#397be5"),
            ("green", "#32815d"),
            ("orange", "#cf713c"),
            ("pink", "#c74795"),
            ("purple", "#7250d8"),
        ] {
            put(
                &format!("project-{name}"),
                css(mix(rgb(hex), s, if light { 0.0 } else { 0.12 })),
            );
        }
        for (name, value) in [
            ("on-project", WHITE),
            ("scan-light", WHITE),
            ("scan-dark", BLACK),
            ("surface", s),
            ("surface-under", under),
            ("text", ink),
            (
                "elevated",
                if light {
                    mix(s, WHITE, 0.16 + c * 0.12)
                } else {
                    mix(s, ink, 0.03 + c * 0.03)
                },
            ),
            (
                "control",
                if light {
                    mix(s, WHITE, 0.09 + c * 0.04)
                } else {
                    mix(s, ink, 0.07 + c * 0.05)
                },
            ),
            ("text-secondary", secondary),
            ("text-tertiary", tertiary),
            ("activity-skill", readable(mix(rgb("#7250d8"), ink, 0.25))),
            ("activity-search", readable(mix(rgb("#397be5"), ink, 0.25))),
            ("activity-edit", readable(mix(rgb("#cf713c"), ink, 0.25))),
            (
                "user-message",
                mix(
                    s,
                    if light { accent } else { ink },
                    if light { 0.12 } else { 0.08 + c * 0.04 },
                ),
            ),
            ("primary", primary),
            ("primary-hover", mix(primary, s, 0.14)),
            ("on-primary", if primary_accent { on_accent } else { s }),
            ("accent", accent),
            (
                "accent-soft",
                mix(s, accent, (if light { 0.11 } else { 0.18 }) + c * 0.05),
            ),
            ("accent-text", readable(accent)),
            ("on-accent", on_accent),
            ("error", readable(error)),
            ("success", readable(success)),
            ("warning", readable(warning)),
            ("link", link),
            ("bubble", sink(if light { 0.055 } else { 0.065 })),
            ("wordmark-muted", mix(s, ink, 0.47)),
        ] {
            put(name, css(value));
        }
        for (name, value) in [
            ("border", 0.06 + c * 0.04),
            ("border-heavy", (if light { 0.09 } else { 0.12 }) + c * 0.06),
            ("hover", (if light { 0.04 } else { 0.05 }) + c * 0.03),
            ("selected", (if light { 0.06 } else { 0.07 }) + c * 0.05),
            ("secondary", 0.04 + c * 0.02),
            ("secondary-hover", 0.07 + c * 0.04),
            ("code-bg", if light { 0.06 } else { 0.08 }),
            ("chip-border", if light { 0.1 } else { 0.09 }),
        ] {
            put(name, alpha(ink, value));
        }
        put("link-underline", alpha(link, 0.4));
        put("scrim", drop(if light { 0.18 } else { 0.5 }));
        put(
            "shadow",
            if light {
                "0 12px 32px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.05)"
            } else {
                "0 12px 32px rgb(0 0 0 / 0.45), 0 2px 6px rgb(0 0 0 / 0.25)"
            }
            .into(),
        );
        put(
            "card-shadow",
            format!(
                "0 2px 8px {}, 0 8px 24px {}",
                drop(if light { 0.04 } else { 0.2 }),
                drop(if light { 0.04 } else { 0.15 })
            ),
        );
        put(
            "glaze",
            gradient(&[
                css(lift(if light { 1.0 } else { 0.055 })),
                css(if light { sink(0.025) } else { lift(0.03) }),
            ]),
        );
        put(
            "glaze-shadow",
            format!(
                "inset 0 1px 0 {edge}, 0 0 0 1px {}, 0 1px 3px {}",
                alpha(ink, 0.08),
                drop(if light { 0.07 } else { 0.35 })
            ),
        );
        put(
            "chip",
            gradient(&[
                css(lift(if light { 1.0 } else { 0.08 })),
                css(if light { sink(0.035) } else { lift(0.045) }),
            ]),
        );
        put(
            "chip-shadow",
            format!(
                "inset 0 1px 0 {edge}, 0 1px 1px {}",
                drop(if light { 0.06 } else { 0.2 })
            ),
        );
        put(
            "composer",
            gradient(&[
                css(lift(if light { 1.0 } else { 0.04 })),
                css(if light { sink(0.012) } else { lift(0.015) }),
            ]),
        );
        put(
            "composer-shadow",
            format!(
                "inset 0 1px 0 {edge}, 0 0 0 1px {}, 0 10px 28px {}, 0 2px 5px {}",
                alpha(ink, if light { 0.09 } else { 0.08 }),
                drop(if light { 0.07 } else { 0.35 }),
                drop(if light { 0.05 } else { 0.25 })
            ),
        );
        put(
            "well",
            if light {
                alpha(ink, 0.05)
            } else {
                css(mix(s, BLACK, 0.3))
            },
        );
        put(
            "well-shadow",
            format!("inset 0 1px 2px {}", drop(if light { 0.08 } else { 0.7 })),
        );
        let (glaze, shadow, sheen) = if primary_accent {
            (
                vec![
                    css(mix(primary, WHITE, 0.08)),
                    css(mix(primary, BLACK, 0.06)),
                ],
                format!(
                    "inset 0 1px 0 {}, 0 1px 2px {}",
                    alpha(WHITE, 0.28),
                    drop(if light { 0.28 } else { 0.6 })
                ),
                0.12,
            )
        } else if luminance(primary) < 0.5 {
            (
                vec![
                    css(mix(primary, WHITE, 0.14)),
                    css(primary),
                    css(mix(primary, BLACK, 0.55)),
                ],
                format!(
                    "inset 0 1px 0 {}, inset 0 -2px 4px {}, 0 1px 2px {}, 0 3px 8px {}",
                    alpha(WHITE, 0.2),
                    drop(0.45),
                    drop(0.28),
                    drop(0.12)
                ),
                0.2,
            )
        } else {
            (
                vec![
                    css(WHITE),
                    css(mix(primary, BLACK, 0.02)),
                    css(mix(primary, BLACK, 0.11)),
                ],
                format!(
                    "inset 0 1px 0 {}, inset 0 -2px 3px {}, 0 1px 2px {}, 0 3px 8px {}",
                    css(WHITE),
                    drop(0.12),
                    drop(0.5),
                    drop(0.35)
                ),
                0.65,
            )
        };
        put("primary-glaze", gradient(&glaze));
        put("primary-shadow", shadow);
        put(
            "primary-sheen",
            gradient(&[alpha(WHITE, sheen), alpha(WHITE, 0.0)]),
        );
        let mono = p.syntax.as_deref() == Some("ink");
        put(
            "syntax-keyword",
            css(if mono { ink } else { readable(accent) }),
        );
        put(
            "syntax-keyword-weight",
            if mono { "600" } else { "400" }.into(),
        );
        put(
            "syntax-string",
            css(if mono {
                mix(s, ink, 0.68)
            } else {
                readable(success)
            }),
        );
        put("syntax-comment", css(tertiary));
        put(
            "syntax-punctuation",
            css(if mono { mix(s, ink, 0.52) } else { secondary }),
        );
        let mut colors = BTreeMap::new();
        let mut gradients = BTreeMap::new();
        let mut shadows = BTreeMap::new();
        for (name, value) in &tokens {
            if value.starts_with('#') || value.starts_with("rgb(") {
                colors.insert(name.clone(), color(value));
            } else if let Some(stops) = value
                .strip_prefix("linear-gradient(180deg, ")
                .and_then(|s| s.strip_suffix(')'))
            {
                gradients.insert(
                    name.clone(),
                    stops
                        .split(", ")
                        .map(|s| {
                            let (c, at) = s.rsplit_once(' ').expect("gradient stop");
                            (
                                at.trim_end_matches('%').parse::<f32>().unwrap() / 100.0,
                                color(c),
                            )
                        })
                        .collect(),
                );
            } else if name.ends_with("shadow") || name == "shadow" {
                shadows.insert(name.clone(), parse_shadows(value));
            }
        }
        Self {
            dark,
            preset: p,
            tokens,
            colors,
            gradients,
            shadows,
        }
    }
    pub fn c(&self, token: &str) -> Color {
        self.colors[token]
    }
    /// Component-local CSS color-mix recipes still derive only from semantic tokens.
    pub fn tint(&self, token: &str, amount: f32) -> Color {
        self.c(token).alpha(amount)
    }
    pub fn blend(&self, first: &str, second: &str, first_fraction: f32) -> Color {
        let t = first_fraction.clamp(0.0, 1.0);
        let a = self.c(first).premul_srgb(1.0);
        let b = self.c(second).premul_srgb(1.0);
        let out: [f32; 4] = std::array::from_fn(|n| a[n] * t + b[n] * (1.0 - t));
        if out[3] == 0.0 {
            return Color::TRANSPARENT;
        }
        Color {
            r: rune::color::srgb_decode(out[0] / out[3]),
            g: rune::color::srgb_decode(out[1] / out[3]),
            b: rune::color::srgb_decode(out[2] / out[3]),
            a: out[3],
        }
    }
    pub fn paint(&self, mut el: El, token: &str) -> El {
        if let Some(stops) = self.gradients.get(token) {
            el = el.linear_gradient(std::f32::consts::PI, stops.clone());
        } else {
            el = el.fill(self.c(token));
        }
        el
    }
    pub fn shadow(&self, mut el: El, token: &str) -> El {
        for shadow in &self.shadows[token] {
            el = el.box_shadow(*shadow);
        }
        el
    }
}
fn rgb(hex: &str) -> Rgb {
    [1, 3, 5].map(|n| u8::from_str_radix(&hex[n..n + 2], 16).expect("seed hex") as f64)
}
fn css(c: Rgb) -> String {
    format!("#{:02x}{:02x}{:02x}", c[0] as u8, c[1] as u8, c[2] as u8)
}
fn mix(from: Rgb, to: Rgb, amount: f64) -> Rgb {
    let t = amount.clamp(0.0, 1.0);
    std::array::from_fn(|i| (from[i] + (to[i] - from[i]) * t).round())
}
fn alpha(c: Rgb, amount: f64) -> String {
    format!(
        "rgb({} {} {} / {:.3})",
        c[0],
        c[1],
        c[2],
        amount.clamp(0.0, 1.0)
    )
}
fn gradient(stops: &[String]) -> String {
    format!(
        "linear-gradient(180deg, {})",
        stops
            .iter()
            .enumerate()
            .map(|(i, s)| {
                let at = if stops.len() == 3 && i == 1 {
                    55
                } else {
                    (i as f64 / (stops.len() - 1) as f64 * 100.0).round() as usize
                };
                format!("{s} {at}%")
            })
            .collect::<Vec<_>>()
            .join(", ")
    )
}
fn luminance(c: Rgb) -> f64 {
    let c = c.map(|v| {
        let v = v / 255.0;
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    });
    c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722
}
fn readable(color: Rgb, backgrounds: [Rgb; 2], toward: Rgb) -> Rgb {
    let contrast = |color| {
        backgrounds
            .iter()
            .map(|&bg| {
                let a = luminance(color);
                let b = luminance(bg);
                (a.max(b) + 0.05) / (a.min(b) + 0.05)
            })
            .fold(f64::INFINITY, f64::min)
    };
    let mut result = color;
    for step in 1..=10 {
        if contrast(result) >= 4.5 {
            break;
        }
        result = mix(color, toward, step as f64 / 10.0);
    }
    result
}
fn color(s: &str) -> Color {
    if s.starts_with('#') {
        return rune::color::hex(s).expect("theme color");
    }
    let body = s.strip_prefix("rgb(").unwrap().trim_end_matches(')');
    let (rgb, a) = body.split_once('/').unwrap();
    let rgb: Vec<f32> = rgb.split_whitespace().map(|v| v.parse().unwrap()).collect();
    Color {
        r: rune::color::srgb_decode(rgb[0] / 255.0),
        g: rune::color::srgb_decode(rgb[1] / 255.0),
        b: rune::color::srgb_decode(rgb[2] / 255.0),
        a: a.trim().parse().unwrap(),
    }
}
fn parse_shadows(s: &str) -> Vec<Shadow> {
    // rune-kit accepts computed hex shadows. Preserve float alpha (not rounded hex alpha).
    s.split(", ")
        .map(|s| {
            let start = s.find("rgb(").or_else(|| s.find('#')).unwrap();
            let c = color(&s[start..]);
            let mut n = s[..start].split_whitespace();
            let inset = s.starts_with("inset");
            if inset {
                n.next();
            }
            let nums: Vec<f32> = n
                .map(|v| v.trim_end_matches("px").parse().unwrap())
                .collect();
            Shadow {
                x: nums[0],
                y: nums[1],
                blur: nums.get(2).copied().unwrap_or(0.0),
                spread: nums.get(3).copied().unwrap_or(0.0),
                color: c,
                inset,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests;
