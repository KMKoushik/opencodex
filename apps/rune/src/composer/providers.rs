use crate::State;
use rune::{El, Image, ImageCache, Waker, el};
use std::collections::BTreeMap;

pub fn load(ink: &str, wake: Waker, wait: bool) -> BTreeMap<String, Image> {
    let cache = ImageCache::new(wake);
    macro_rules! logos { ($($name:literal),*) => {[$(($name,include_str!(concat!("../../../web/src/features/chat/provider-logos/",$name,".svg")))),*]} }
    logos!(
        "alibaba",
        "amazon-bedrock",
        "anthropic",
        "azure",
        "deepseek",
        "github-copilot",
        "google",
        "groq",
        "mistral",
        "moonshotai",
        "ollama",
        "openai",
        "opencode",
        "openrouter",
        "xai"
    )
    .into_iter()
    .map(|(id, svg)| {
        // The web masks these paths with currentColor. Keep transparent holes and tint fills.
        let fill = if svg.split('>').next().unwrap_or("").contains("fill=") {
            String::new()
        } else {
            format!("fill=\"{ink}\" ")
        };
        let mut svg = svg
            .replace("<svg ", &format!("<svg {fill}color=\"{ink}\" "))
            .replace("currentColor", ink);
        for color in ["#000000", "#000", "black", "#FFFFFF", "#ffffff", "white"] {
            svg = svg.replace(&format!("fill=\"{color}\""), &format!("fill=\"{ink}\""));
        }
        let image = cache.svg(svg.as_bytes(), 18.0, 2.0);
        if wait {
            let _ = image.wait();
        }
        (id.into(), image)
    })
    .collect()
}
pub fn view(s: &State, provider: &str) -> El {
    let alias = match provider {
        "codex" | "chatgpt" => "openai",
        "claude" => "anthropic",
        "gemini" | "google-vertex" => "google",
        "copilot" | "github-copilot-enterprise" => "github-copilot",
        "ollama-cloud" => "ollama",
        "azure-cognitive-services" => "azure",
        id => id,
    };
    if let Some(image) = s.composer.providers.get(alias) {
        return el().size(18.0, 18.0).pixels(image.pixels());
    }
    rune::icon(&super::icons::OPENCODE, 18.0).color(s.theme.c("text"))
}
