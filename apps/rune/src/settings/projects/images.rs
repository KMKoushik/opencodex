use super::*;
pub enum Preview {
    Pending,
    Ready(rune::Image),
    Failed,
}
pub fn source(icon: Option<&oc_gateway::types::ProjectIcon>) -> Option<&str> {
    let icon = icon?;
    icon.r#override
        .as_deref()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            if icon.color.as_deref().is_none_or(str::is_empty) {
                icon.url.as_deref().filter(|s| !s.is_empty())
            } else {
                None
            }
        })
}
pub fn receive(s: &mut State, source: &str, result: Result<Value, String>) {
    let Some(entry) = s.pages.projects.images.get_mut(source) else {
        return;
    };
    let Ok(value) = result else {
        *entry = Preview::Failed;
        return;
    };
    let cache = rune::ImageCache::new(
        s.waker
            .clone()
            .unwrap_or_else(|| std::sync::Arc::new(|| {})),
    );
    let image = if let Some(svg) = value["svg"].as_str() {
        Some(cache.svg(svg.as_bytes(), 48.0, 2.0))
    } else {
        value["png"].as_array().map(|v| {
            cache.load(
                v.iter()
                    .filter_map(|b| b.as_u64().map(|n| n as u8))
                    .collect::<Vec<_>>(),
            )
        })
    };
    if crate::OPTIONS.get().is_some_and(|o| o.headless) {
        if let Some(image) = &image {
            let _ = image.wait();
        }
    }
    *entry = image.map(Preview::Ready).unwrap_or(Preview::Failed);
}
pub fn after_frame(rt: &rune::Runtime<State>, handle: &rune::AppHandle<State>) {
    if !matches!(&rt.state.pages.route,pages::Route::Settings(section) if section=="projects") {
        return;
    }
    let visible: std::collections::BTreeSet<_> = rt
        .elements()
        .iter()
        .filter(|e| e.visible[2] > 0.0 && e.visible[3] > 0.0)
        .filter_map(|e| {
            e.key
                .as_deref()
                .and_then(|k| k.strip_prefix("settings-project-"))
                .map(str::to_owned)
        })
        .collect();
    let editing = match &rt.state.pages.projects.dialog {
        Some(Dialog::Edit(id)) => Some(id.as_str()),
        _ => None,
    };
    let wanted: std::collections::BTreeSet<_> = rt
        .state
        .snapshot
        .projects
        .iter()
        .filter(|p| visible.contains(&p.id) || editing == Some(p.id.as_str()))
        .filter_map(|p| source(p.icon.as_ref()))
        .map(str::to_owned)
        .collect();
    let free = 128_usize.saturating_sub(
        rt.state
            .pages
            .projects
            .images
            .keys()
            .filter(|src| wanted.contains(*src))
            .count(),
    );
    let sources: Vec<_> = wanted
        .iter()
        .filter(|src| !rt.state.pages.projects.images.contains_key(*src))
        .take(free)
        .cloned()
        .collect();
    if sources.is_empty() {
        return;
    }
    handle.update(move |s, _| {
        for source in &sources {
            if s.pages.projects.images.len() >= 128 {
                if let Some(old) = s
                    .pages
                    .projects
                    .images
                    .keys()
                    .find(|key| !wanted.contains(*key))
                    .cloned()
                {
                    s.pages.projects.images.remove(&old);
                } else {
                    break;
                }
            }
            s.pages
                .projects
                .images
                .insert(source.clone(), Preview::Pending);
            s.prompt_request(oc_gateway::prompt::Request::ProjectPreview {
                source: source.clone(),
            });
        }
    });
}
pub fn view(s: &State, source: &str, size: f32) -> Option<El> {
    match s.pages.projects.images.get(source)? {
        Preview::Pending => Some(el().size(size, size)),
        Preview::Failed => None,
        Preview::Ready(image) if image.error().is_some() => None,
        Preview::Ready(image) => Some({
            el().size(size, size)
                .radius(if size >= 48.0 { 10.0 } else { 5.0 })
                .pixels_fit(image.pixels(), rune::SurfaceFit::Fill)
        }),
    }
}
pub fn capture(s: &mut State) {
    let sources: Vec<_> = s
        .snapshot
        .projects
        .iter()
        .filter_map(|p| source(p.icon.as_ref()))
        .take(128)
        .map(str::to_owned)
        .collect();
    let results = std::thread::spawn(move || {
        sources
            .into_iter()
            .map(|source| {
                let result = oc_gateway::capture_project_preview(&source);
                (source, result)
            })
            .collect::<Vec<_>>()
    })
    .join()
    .unwrap_or_default();
    for (source, result) in results {
        s.pages
            .projects
            .images
            .insert(source.clone(), Preview::Pending);
        receive(s, &source, result);
    }
}
