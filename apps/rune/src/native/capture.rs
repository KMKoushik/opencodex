//! Screenshot-only export of the real WK child, composited at its laid-out rect.
use super::*;

pub fn composite(screenshot: &str, tree: &str) -> Result<(), String> {
    let Some(id) = std::env::var("OPENCODEX_CANVAS").ok() else {
        return Ok(());
    };
    let layout: Value = serde_json::from_slice(&std::fs::read(tree).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let Some(host) = layout["elements"]
        .as_array()
        .and_then(|els| els.iter().find(|e| e["key"] == "canvas-page-focus"))
    else {
        return Err("canvas screenshot has no laid-out native host".into());
    };
    let rect: [f64; 4] = serde_json::from_value(host["rect"].clone()).map_err(|e| e.to_string())?;
    let scale = layout["scale"].as_f64().ok_or("missing screenshot scale")?;
    let url = OPTIONS
        .get()
        .unwrap()
        .gateway
        .as_ref()
        .ok_or("missing gateway")?;
    let source = crate::workbench::capture_get(url, format!("canvases/{id}"), vec![])?.value;
    let data = crate::workbench::capture_get(url, format!("canvases/{id}/data"), vec![])?.value;
    let tasks = crate::workbench::capture_get(url, "tasks".into(), vec![])?.value;
    let mut state = State::new();
    state.theme = crate::Theme::new(OPTIONS.get().unwrap().dark, &OPTIONS.get().unwrap().preset);
    let mut html = source["html"]
        .as_str()
        .ok_or("canvas has no HTML")?
        .to_owned();
    // Readiness instrumentation does not change content or paint. Hidden WK
    // views suspend requestAnimationFrame; takeSnapshot supplies the paint fence.
    html.push_str(r#"<script>addEventListener('load',()=>document.fonts.ready.then(()=>parent.postMessage({channel:'opencodex-canvas',type:'capture-rendered'},'*')))</script>"#);
    let values: serde_json::Map<String, Value> = data["values"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(key, value)| (key.clone(), value["value"].clone()))
        .collect();
    let init = json!({"channel":"opencodex-canvas","type":"init","theme":canvas::canvas_theme(&state),"html":html,"data":values,"running":[],"tasks":{"tasks":tasks},"scroll":0});
    let shell = canvas::shell(&state);
    let bytes = oc_webview::capture_html(&shell, url, [rect[2], rect[3]], init)?;
    let child_path = format!("{screenshot}.webview.png");
    std::fs::write(&child_path, &bytes).map_err(|e| e.to_string())?;
    let child = image::load_from_memory(&bytes)
        .map_err(|e| e.to_string())?
        .into_rgba8();
    let mut image = image::open(screenshot)
        .map_err(|e| e.to_string())?
        .into_rgba8();
    let size = [
        (rect[2] * scale).round() as u32,
        (rect[3] * scale).round() as u32,
    ];
    let child = if child.dimensions() == (size[0], size[1]) {
        child
    } else {
        image::imageops::resize(
            &child,
            size[0],
            size[1],
            image::imageops::FilterType::Lanczos3,
        )
    };
    image::imageops::overlay(
        &mut image,
        &child,
        (rect[0] * scale).round() as i64,
        (rect[1] * scale).round() as i64,
    );
    image.save(screenshot).map_err(|e| e.to_string())?;
    std::fs::write(format!("{screenshot}.webview.json"), json!({"rect":rect,"scale":scale,"snapshotPixels":child.dimensions(),"source":"WKWebView.takeSnapshot"}).to_string()).map_err(|e| e.to_string())?;
    Ok(())
}
