//! Pinned Rune-kit Markdown with web metrics and sanitized native HTML rendering.
//! See ../README.md and ../HTML.md for provenance, policy and worker boundaries.
mod budget;
pub mod markdown;
pub use markdown::*;
pub use rune_kit::{Checkbox, Kit, ScrollBar, ScrollBarStyle, Table, TableStyle, search, syntax};

mod tokens {
    pub mod palette {
        pub(crate) fn tint(base: rune::Color, hue: rune::Color, t: f32) -> rune::Color {
            let [a, b] = [base.to_oklab(), hue.to_oklab()];
            rune::Color::from_oklab([0, 1, 2, 3].map(|i| if i == 3 { a[3] } else { a[i] + (b[i] - a[i]) * t }))
        }
    }
}
