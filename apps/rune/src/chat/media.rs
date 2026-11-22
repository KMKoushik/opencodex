//! Network, base64, Markdown image discovery, decoding and mip work stay off the UI.
use oc_gateway::{Gateway, messages::Messages};
use rune::{Image, ImageCache, Latest, Waker};
use rune_kit::markdown::Block;
use std::{collections::BTreeMap, sync::Arc};

type Images = BTreeMap<String, Result<Image, String>>;
#[derive(Default)]
pub struct Media {
    html_revision: u64,
    #[cfg(target_os = "macos")]
    pub pasteboard: super::pasteboard::Writer,
    pub document: super::document::Preview,
    pub details: super::details::Data,
    pending: Latest<Result<Images, String>>,
    pub images: Arc<Images>,
    pub error: Option<String>,
    revision: Option<u64>,
}
impl Media {
    pub fn request(&mut self, data: Arc<Messages>, gateway: Option<&str>, wake: Option<Waker>) {
        // Image discovery is a completion/snapshot task, never work on every token.
        if self.revision == Some(data.media_revision) {
            return;
        }
        self.revision = Some(data.media_revision);
        if let Some(wake) = wake {
            self.pending.set_waker(wake);
        }
        let Some(url) = gateway.map(str::to_owned) else {
            return;
        };
        let old = self.images.clone();
        self.error = None;
        self.pending.request(data, move |data| {
            Gateway::new(&url, None).map(|client| load(client, &data, old))
        });
    }
    pub fn retry(
        &mut self,
        source: &str,
        data: Arc<Messages>,
        gateway: Option<&str>,
        wake: Option<Waker>,
    ) {
        Arc::make_mut(&mut self.images).remove(source);
        self.revision = None;
        self.request(data, gateway, wake);
    }
    pub fn capture(&mut self, data: Arc<Messages>, gateway: &str) -> Result<(), String> {
        if let Some(info) = &data.info {
            self.details
                .capture(gateway, &data.session_id, &info.location.directory)?;
        }
        let client = Gateway::new(gateway, None)?;
        self.images = Arc::new(
            std::thread::spawn(move || load(client, &data, Arc::default()))
                .join()
                .map_err(|_| "Image capture worker panicked")?,
        );
        Ok(())
    }
    pub fn take(&mut self) -> bool {
        let revision = super::html::revision();
        let mut details =
            self.details.take() | self.document.take() | (revision != self.html_revision);
        self.html_revision = revision;
        #[cfg(target_os = "macos")]
        {
            details |= self.pasteboard.take();
        }
        if let Some(result) = self.pending.take() {
            let images = match result {
                Ok(images) => images,
                Err(error) => {
                    self.error = Some(error);
                    return true;
                }
            };
            if images.is_empty() && self.images.is_empty() {
                return details;
            }
            self.images = Arc::new(images);
            true
        } else {
            details
        }
    }
}
fn collect(blocks: &[Block], out: &mut Vec<String>) {
    for block in blocks {
        match block {
            Block::Image { src, .. } => out.push(src.clone()),
            Block::Quote(blocks) => collect(blocks, out),
            Block::List { items, .. } => {
                for blocks in items {
                    collect(blocks, out)
                }
            }
            _ => {}
        }
    }
}
fn load(client: Gateway, data: &Messages, old: Arc<Images>) -> Images {
    let mut sources = Vec::new();
    for message in data.visible() {
        if let Some(files) = message
            .fields
            .get("files")
            .and_then(serde_json::Value::as_array)
        {
            for file in files {
                if let (Some(mime), Some(bytes)) = (file["mime"].as_str(), file["data"].as_str()) {
                    if mime.starts_with("image/") && file["mention"].is_null() {
                        sources.push(format!("data:{mime};base64,{bytes}"));
                    }
                }
            }
        }
        if let Some(parts) = message
            .fields
            .get("content")
            .and_then(serde_json::Value::as_array)
        {
            for part in parts {
                if part["type"] == "text" {
                    if let Some(text) = part["text"].as_str() {
                        if text.contains('<') {
                            fn images(
                                nodes: &[oc_markdown::html::Node],
                                sources: &mut Vec<String>,
                            ) {
                                for n in nodes {
                                    if let oc_markdown::html::Node::Element {
                                        tag,
                                        attrs,
                                        children,
                                    } = n
                                    {
                                        if tag == "img" {
                                            if let Some(src) = attrs.get("src") {
                                                sources.push(src.clone());
                                            }
                                        }
                                        images(children, sources);
                                    }
                                }
                            }
                            if let Some(tree) = super::html::prepare(text) {
                                images(&tree.nodes, &mut sources);
                                collect(
                                    &rune_kit::markdown::parse(&text[..tree.start]),
                                    &mut sources,
                                );
                            } else if text.contains("![") {
                                collect(&rune_kit::markdown::parse(text), &mut sources);
                            }
                        } else if text.contains("![") {
                            collect(&rune_kit::markdown::parse(text), &mut sources);
                        }
                    }
                }
            }
        }
    }
    sources.sort();
    sources.dedup();
    sources.truncate(16);
    let cache = ImageCache::new(Arc::new(|| {}));
    let mut result = BTreeMap::new();
    let mut decoded = 0u64;
    for source in sources {
        let image = old.get(&source).cloned().unwrap_or_else(|| {
            oc_gateway::image_bytes(&client, &data.session_id, &source).and_then(|bytes| {
                let image = cache.load(bytes);
                image.wait().map_err(|e| e.to_string())?;
                Ok(image)
            })
        });
        let image = image.and_then(|image| {
            let [width, height] = image.size().ok_or("Image has no dimensions")?;
            decoded += width as u64 * height as u64 * 4 * 4 / 3;
            if decoded > 64 * 1024 * 1024 {
                Err("Session images exceed 64 MiB decoded budget".into())
            } else {
                Ok(image)
            }
        });
        result.insert(source, image);
    }
    result
}
