//! Lazy, bounded project artwork. HTTP/base64, decoding and mip generation never
//! run in the view or during typing. Failed sources retain the initial fallback.
use crate::State;
use rune::{Image, ImageCache, Latest};
use std::{collections::BTreeMap, sync::Arc};
type Cache = BTreeMap<String, Result<Image, String>>;
#[derive(Default)]
pub struct Images {
    pending: Latest<Cache>,
    pub cache: Arc<Cache>,
    sources: Vec<String>,
}
pub fn source(p: &oc_gateway::types::Project) -> Option<&str> {
    let icon = p.icon.as_ref()?;
    icon.r#override
        .as_deref()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            icon.color
                .as_ref()
                .is_none()
                .then_some(icon.url.as_deref())
                .flatten()
        })
}
pub fn request(s: &mut State) {
    let mut sources: Vec<_> = s
        .snapshot
        .projects
        .iter()
        .chain(s.prefs.opened_projects.iter())
        .filter_map(source)
        .map(str::to_owned)
        .take(64)
        .collect();
    sources.sort();
    sources.dedup();
    if sources == s.menus.images.sources {
        return;
    }
    s.menus.images.sources = sources.clone();
    let Some(url) = &crate::OPTIONS.get().unwrap().gateway else {
        return;
    };
    let Ok(client) = oc_gateway::Gateway::new(url, None) else {
        return;
    };
    if let Some(wake) = &s.waker {
        s.menus.images.pending.set_waker(wake.clone());
    }
    let old = s.menus.images.cache.clone();
    let load = move |sources: Vec<String>| {
        let cache = ImageCache::new(Arc::new(|| {}));
        let mut bytes = 0u64;
        sources
            .into_iter()
            .map(|source| {
                let result = old
                    .get(&source)
                    .cloned()
                    .unwrap_or_else(|| {
                        oc_gateway::image_bytes(&client, "", &source).and_then(|bytes| {
                            let image = cache.load(bytes);
                            image.wait().map_err(|e| e.to_string())?;
                            Ok(image)
                        })
                    })
                    .and_then(|image| {
                        let [w, h] = image.size().ok_or("Project image has no dimensions")?;
                        bytes += w as u64 * h as u64 * 4 * 4 / 3;
                        if bytes > 16 * 1024 * 1024 {
                            Err("Project artwork exceeds 16 MiB".into())
                        } else {
                            Ok(image)
                        }
                    });
                (source, result)
            })
            .collect()
    };
    if crate::OPTIONS.get().unwrap().headless {
        s.menus.images.cache = Arc::new(std::thread::spawn(move || load(sources)).join().unwrap());
    } else {
        s.menus.images.pending.request(sources, load);
    }
}
pub fn take(s: &mut State) -> bool {
    if let Some(cache) = s.menus.images.pending.take() {
        s.menus.images.cache = Arc::new(cache);
        s.rows_revision += 1;
        true
    } else {
        false
    }
}
pub fn avatar(s: &State, p: &oc_gateway::types::Project, size: f32) -> rune::El {
    if let Some(Ok(image)) = source(p).and_then(|source| s.menus.images.cache.get(source)) {
        rune::el()
            .size(size, size)
            .radius(4.0)
            .pixels(image.pixels())
    } else {
        super::project_badge(&s.theme, p, size)
    }
}
