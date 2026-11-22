use alacritty_terminal::vte::ansi::{Color as Ansi, NamedColor, Rgb};
use rune::Color;

/// Resolve through the host's semantic theme tokens, exactly as terminalTheme() does.
#[derive(Clone)]
pub struct Palette {
    pub indexed: [Color; 256],
    pub foreground: Color,
    pub background: Color,
    pub selection: Color,
}
impl Palette {
    pub fn from_tokens(token: impl Fn(&str) -> Color) -> Self {
        let names = [
            "surface-under",
            "error",
            "success",
            "project-orange",
            "accent-text",
            "project-purple",
            "project-blue",
            "text-secondary",
            "text-tertiary",
            "error",
            "success",
            "project-orange",
            "accent-text",
            "project-purple",
            "project-blue",
            "text",
        ];
        let mut indexed = [token("text"); 256];
        for (i, name) in names.iter().enumerate() {
            indexed[i] = token(name);
        }
        let levels = [0, 95, 135, 175, 215, 255];
        for (i, slot) in indexed.iter_mut().enumerate().skip(16) {
            let (r, g, b) = if i < 232 {
                let n = i - 16;
                (levels[n / 36], levels[n / 6 % 6], levels[n % 6])
            } else {
                let v = (8 + 10 * (i - 232)) as u8;
                (v, v, v)
            };
            *slot = rgb(Rgb { r, g, b });
        }
        Self {
            indexed,
            foreground: token("text"),
            background: token("surface"),
            selection: token("selected"),
        }
    }
    pub fn color(&self, color: Ansi) -> Color {
        match color {
            Ansi::Spec(c) => rgb(c),
            Ansi::Indexed(i) => self.indexed[i as usize],
            Ansi::Named(NamedColor::Background) => self.background,
            Ansi::Named(c) if (c as usize) < 256 => self.indexed[c as usize],
            _ => self.foreground,
        }
    }
}
fn rgb(c: Rgb) -> Color {
    let linear = |v: u8| {
        let v = v as f32 / 255.;
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    Color {
        r: linear(c.r),
        g: linear(c.g),
        b: linear(c.b),
        a: 1.,
    }
}
