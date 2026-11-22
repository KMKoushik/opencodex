use crate::theme::Theme;
use rune::{Image, ImageCache, Waker};

pub struct Assets {
    pub small: Image,
    pub hero: Image,
    pub wordmark: Image,
}
impl Assets {
    pub fn retint(&self, theme: &Theme, waker: Waker) -> Self {
        let cache = ImageCache::new(waker);
        let svg = include_str!("../assets/wordmark.svg")
            .replace("MUTED", &theme.tokens["wordmark-muted"])
            .replace("INK", &theme.tokens["text"]);
        Self {
            small: self.small.clone(),
            hero: self.hero.clone(),
            wordmark: cache.svg(svg.as_bytes(), 96.0, 2.0),
        }
    }
    pub fn load(theme: &Theme, waker: Waker, wait: bool) -> Self {
        let cache = ImageCache::new(waker);
        let catppuccin = theme.preset.art.as_deref() == Some("catppuccin");
        let small = cache.load(if catppuccin {
            include_bytes!("../../web/src/assets/brand/catppuccin-96.png").as_slice()
        } else {
            include_bytes!("../../web/src/assets/brand/calico-96.png").as_slice()
        });
        let hero = cache.load(if catppuccin {
            include_bytes!("../../web/src/assets/brand/catppuccin-384.png").as_slice()
        } else {
            include_bytes!("../../web/src/assets/brand/calico-384.png").as_slice()
        });
        let svg = include_str!("../assets/wordmark.svg")
            .replace("MUTED", &theme.tokens["wordmark-muted"])
            .replace("INK", &theme.tokens["text"]);
        let wordmark = cache.svg(svg.as_bytes(), 96.0, 2.0);
        if wait {
            small.wait().expect("bundled small brand image");
            hero.wait().expect("bundled hero image");
            wordmark.wait().expect("bundled wordmark");
        }
        Self {
            small,
            hero,
            wordmark,
        }
    }
}
