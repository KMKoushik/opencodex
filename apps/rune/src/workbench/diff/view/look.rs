//! Diff palette, colours, typography, and gutter metrics derived from [`Kit`].

use std::hash::{Hash, Hasher};

use rune::{Color, Icon, TextStyle};

use crate::workbench::diff::model::LineKind;
use crate::workbench::diff::state::Metrics;
use rune_kit::Kit;
use rune_kit::syntax::SyntaxTheme;

fn tint(base: Color, hue: Color, t: f32) -> Color {
    // Pierre uses CSS color-mix(in lab), whose reference white is D50.
    let lab = |c: Color| {
        let [r, g, b] = [c.r, c.g, c.b];
        let x = 0.4123908 * r + 0.35758434 * g + 0.1804808 * b;
        let y = 0.212639 * r + 0.7151687 * g + 0.07219232 * b;
        let z = 0.01933082 * r + 0.11919478 * g + 0.95053214 * b;
        let f = |v: f32| {
            if v > 216.0 / 24389.0 {
                v.cbrt()
            } else {
                (24389.0 / 27.0 * v + 16.0) / 116.0
            }
        };
        let fx = f((1.0479298 * x + 0.02294687 * y - 0.050192267 * z) / 0.9642957);
        let fy = f(0.02962781 * x + 0.9904344 * y - 0.0170738 * z);
        let fz = f((-0.009243058 * x + 0.015055145 * y + 0.7518743 * z) / 0.8251046);
        [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)]
    };
    let [a, b] = [lab(base), lab(hue)];
    let v = [0, 1, 2].map(|i| a[i] + (b[i] - a[i]) * t);
    let y = (v[0] + 16.0) / 116.0;
    let inv = |v: f32| {
        if v.powi(3) > 216.0 / 24389.0 {
            v.powi(3)
        } else {
            (116.0 * v - 16.0) / (24389.0 / 27.0)
        }
    };
    let [x, y, z] = [
        inv(y + v[1] / 500.0) * 0.9642957,
        inv(y),
        inv(y - v[2] / 200.0) * 0.8251046,
    ];
    let [x, y, z] = [
        0.9554734 * x - 0.023098536 * y + 0.06325931 * z,
        -0.028369708 * x + 1.0099955 * y + 0.021041399 * z,
        0.012314002 * x - 0.020507697 * y + 1.3303659 * z,
    ];
    Color {
        r: (3.24097 * x - 1.5373832 * y - 0.49861076 * z).clamp(0.0, 1.0),
        g: (-0.96924365 * x + 1.8759675 * y + 0.04155506 * z).clamp(0.0, 1.0),
        b: (0.05563008 * x - 0.20397696 * y + 1.0569715 * z).clamp(0.0, 1.0),
        a: base.a,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn pierre_tints_use_css_lab_not_oklab_or_srgb() {
        let mid = super::tint(rune::Color::WHITE, rune::Color::BLACK, 0.5);
        assert!((mid.r - 0.1841865).abs() < 0.0001);
        assert!((mid.g - mid.r).abs() < 0.0001 && (mid.b - mid.r).abs() < 0.0001);
        let bg = rune::color::hex("#f9f9f8").unwrap();
        let green = rune::color::hex("#3c7841").unwrap();
        // Real Electron's 91% surface + 9% addition gutter, both in Lab D50.
        assert_eq!(super::tint(bg, green, 0.09).hex(), "#e7ede6ff");
    }
}

/// Colours and type, from the kit's palette so themes restyle them.
pub(super) struct Look {
    pub(super) metrics: Metrics,
    pub(super) font: TextStyle,
    pub(super) label: TextStyle,
    pub(super) small: TextStyle,
    /// [`FoldRow::LineInfo`]'s count: the interface face at the code's size, on the row's height.
    pub(super) separator_text: TextStyle,
    /// [`FoldRow::LineInfo`]'s row: the background 2% toward black, 5% toward white in dark
    /// (OpenCode's `--diffs-bg-separator-override`).
    pub(super) separator: Color,
    /// The advance of a mono column.
    pub(super) adv: f32,
    pub(super) bg: Color,
    pub(super) text: Color,
    pub(super) muted: Color,
    pub(super) modified: Color,
    pub(super) faint: Color,
    pub(super) border: Color,
    pub(super) header_bg: Color,
    pub(super) hover: Color,
    pub(super) add: Tints,
    pub(super) del: Tints,
    pub(super) gap_bg: Color,
    pub(super) empty_bg: Color,
    pub(super) selected: Color,
    pub(super) selected_gutter: Color,
    pub(super) selection: Color,
    pub(super) accent: Color,
    pub(super) on_accent: Color,
    pub(super) triangle_down: &'static Icon,
    pub(super) triangle_right: &'static Icon,
    pub(super) syntax: SyntaxTheme,
    /// Changes when anything above does, for memoised rows.
    pub(super) version: u64,
}

#[derive(Clone, Copy)]
pub(super) struct Tints {
    pub(super) line: Color,
    pub(super) gutter: Color,
    pub(super) word: Color,
    pub(super) number: Color,
    pub(super) bar: Color,
    pub(super) count: Color,
}

impl Look {
    pub(super) fn new(k: &Kit, metrics: Metrics) -> Look {
        let c = &k.c;
        let bg = c.bg_base;
        let dark = k.dark;
        let tints = |hue: Color, fg: Color| Tints {
            line: tint(bg, hue, if dark { 0.2 } else { 0.12 }),
            gutter: tint(bg, hue, if dark { 0.15 } else { 0.09 }),
            word: Color {
                a: if dark { 0.2 } else { 0.15 },
                ..hue
            },
            number: hue,
            bar: hue,
            count: fg,
        };
        let font = TextStyle {
            size: metrics.font,
            line_height: metrics.line,
            ..k.ty.mono
        };
        let info = c.info.icon;
        let mut look = Look {
            metrics,
            font,
            label: TextStyle {
                size: 12.5,
                line_height: 20.0,
                ..k.ty.ui
            },
            small: TextStyle {
                size: 12.0,
                line_height: 16.0,
                ..k.ty.mono
            },
            separator_text: TextStyle {
                size: 11.5,
                line_height: metrics.gap,
                ..k.ty.ui
            },
            separator: c.layer_01,
            adv: metrics.advance,
            bg,
            text: c.text_base,
            muted: c.text_muted,
            modified: c.warning.fg,
            faint: c.text_faint,
            border: c.border_weak,
            header_bg: c.layer_01,
            hover: k.alpha(c.text_base, if dark { 0.06 } else { 0.035 }),
            add: tints(c.success.icon, c.success.fg),
            del: tints(c.danger.icon, c.danger.fg),
            gap_bg: tint(bg, info, if dark { 0.1 } else { 0.06 }),
            empty_bg: tint(bg, c.text_base, if dark { 0.03 } else { 0.025 }),
            selected: tint(bg, info, if dark { 0.2 } else { 0.14 }),
            selected_gutter: tint(bg, info, if dark { 0.32 } else { 0.26 }),
            selection: k.selection(),
            accent: info,
            on_accent: c.white,
            triangle_down: k.glyph.triangle_down,
            triangle_right: k.glyph.triangle_right,
            syntax: SyntaxTheme::from_kit(k),
            version: 0,
        };
        let mut h = std::hash::DefaultHasher::new();
        for c in [
            look.bg,
            look.text,
            look.add.bar,
            look.del.bar,
            look.accent,
            look.header_bg,
        ] {
            [c.r, c.g, c.b, c.a].map(f32::to_bits).hash(&mut h);
        }
        look.font.size.to_bits().hash(&mut h);
        for n in [
            metrics.line,
            metrics.header,
            metrics.gap,
            metrics.note,
            metrics.bar,
            metrics.advance,
            metrics.code_padding.0,
            metrics.code_padding.1,
            metrics.number_padding,
            metrics.number_right,
            metrics.number_border,
        ] {
            n.to_bits().hash(&mut h);
        }
        look.version = h.finish();
        look
    }

    pub(super) fn tints(&self, kind: LineKind) -> Option<&Tints> {
        match kind {
            LineKind::Added => Some(&self.add),
            LineKind::Removed => Some(&self.del),
            LineKind::Context => None,
        }
    }

    pub(super) fn gutter_fill(&self, kind: LineKind, selected: bool) -> Color {
        match (selected, self.tints(kind)) {
            (true, _) => self.selected_gutter,
            (false, Some(t)) => t.gutter,
            (false, None) => self.bg,
        }
    }

    /// One line-number column for numbers of `digits` digits.
    pub(super) fn number_w(&self, digits: u32) -> f32 {
        digits as f32 * self.adv
            + self.metrics.number_padding
            + self.metrics.number_right
            + self.metrics.number_border
    }
}
