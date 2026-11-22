//! Image transforms use the actual viewport, never inferred window/panel dimensions.
use crate::{State, sidebar::label};
use rune::{El, Live, Tx, col, row};
const STEPS: [f32; 11] = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 8.0, 16.0];

pub struct ViewState {
    viewport: [f32; 2],
    scroll: Live<[f32; 2]>,
    pan_start: [f32; 2],
    annotating: bool,
    pointer: Live<[f32; 2]>,
    dragging: bool,
}
impl Default for ViewState {
    fn default() -> Self {
        Self {
            viewport: [1.0; 2],
            scroll: Live::new([0.0; 2]),
            pan_start: [0.0; 2],
            annotating: false,
            pointer: Live::new([0.0; 2]),
            dragging: false,
        }
    }
}
fn geometry(s: &State, index: usize) -> ([f32; 2], [f32; 2], f32, f32) {
    let doc = &s.workbench.docs[index];
    let [w, h] = doc
        .image
        .as_ref()
        .and_then(|v| v.as_ref().ok())
        .and_then(|i| i.size())
        .unwrap_or([1, 1]);
    let size = doc.value["__imageNatural"]
        .as_array()
        .filter(|a| a.len() == 2)
        .and_then(|a| Some([a[0].as_f64()? as f32, a[1].as_f64()? as f32]))
        .unwrap_or([w as f32, h as f32]);
    let viewport = doc.image_view.viewport;
    let fit = 1.0f32
        .min((viewport[0] - 32.0).max(1.0) / size[0])
        .min((viewport[1] - 32.0).max(1.0) / size[1]);
    (size, viewport, fit, doc.image_scale.unwrap_or(fit))
}
fn origin(viewport: [f32; 2], size: [f32; 2], scale: f32) -> [f32; 2] {
    [
        ((viewport[0] - size[0] * scale) / 2.0).max(16.0),
        ((viewport[1] - size[1] * scale) / 2.0).max(16.0),
    ]
}
fn zoom(s: &mut State, index: usize, next: f32, point: Option<[f32; 2]>, tx: &mut Tx) {
    let (size, viewport, fit, shown) = geometry(s, index);
    let next = next.clamp(fit.min(0.1), 16.0);
    let point = point.unwrap_or([viewport[0] / 2.0, viewport[1] / 2.0]);
    let scroll = s.workbench.docs[index].image_view.scroll.get();
    let before = origin(viewport, size, shown);
    let after = origin(viewport, size, next);
    let mut offset = [0.0; 2];
    for axis in 0..2 {
        let pixel = (point[axis] + scroll[axis] - before[axis]) / shown;
        offset[axis] = (after[axis] + pixel * next - point[axis])
            .clamp(0.0, (size[axis] * next + 32.0 - viewport[axis]).max(0.0));
    }
    s.workbench.docs[index].image_scale = Some(next);
    tx.scroll_to_instant(format!("image-viewport-{index}"), offset[0], offset[1]);
    tx.instant();
}
fn step(s: &mut State, index: usize, up: bool, tx: &mut Tx) {
    let (_, _, fit, scale) = geometry(s, index);
    let next = if up {
        STEPS
            .into_iter()
            .find(|v| *v > scale + 0.001)
            .unwrap_or(16.0)
    } else {
        STEPS
            .into_iter()
            .rev()
            .find(|v| *v < scale - 0.001)
            .unwrap_or(fit.min(0.1))
    };
    zoom(s, index, next, None, tx);
}
pub fn view(s: &State, index: usize, image: &rune::Image) -> El {
    let doc = &s.workbench.docs[index];
    let (size, viewport, fit, scale) = geometry(s, index);
    let [w, h] = size;
    let uri = doc.value["uri"].as_str().map(str::to_owned);
    let bytes = doc.value["bytes"].as_f64().unwrap_or(0.0);
    let annotating = doc.image_view.annotating;
    let can_pan = w * scale + 32.0 > viewport[0] || h * scale + 32.0 > viewport[1];
    let toolbar = row()
        .h(40.0)
        .w_full()
        .px(12.0)
        .gap(8.0)
        .center_y()
        .child(
            label(
                &s.theme,
                format!("{w} × {h} · {} KB", decimal(bytes / 1024.0)),
                12.0,
                400.0,
                "text-secondary",
            )
            .grow(1.0),
        )
        .child(
            super::documents::button(s, "−")
                .label("Zoom out")
                .disabled(scale <= fit.min(0.1))
                .on_press_tx(move |s: &mut State, tx| step(s, index, false, tx)),
        )
        .child(
            super::documents::button(s, &format!("{}%", (scale * 100.0).round() as u32))
                .label("Actual size")
                .on_press_tx(move |s: &mut State, tx| zoom(s, index, 1.0, None, tx)),
        )
        .child(
            super::documents::button(s, "+")
                .label("Zoom in")
                .disabled(scale >= 16.0)
                .on_press_tx(move |s: &mut State, tx| step(s, index, true, tx)),
        )
        .child(
            super::documents::button(s, "Fit")
                .checked(doc.image_scale.is_none())
                .on_press(move |s: &mut State| s.workbench.docs[index].image_scale = None),
        )
        .child(
            super::documents::button(s, "↓")
                .label("Download image")
                .disabled(uri.is_none())
                .on_press_tx(move |_: &mut State, tx| {
                    let uri = uri.clone();
                    tx.save_file(
                        rune::FileDialogOptions {
                            title: "Download image".into(),
                            ..Default::default()
                        },
                        move |s: &mut State, result, _| match result {
                            Ok(Some(destination)) => {
                                if let Some(uri) = &uri {
                                    s.workspace_request(
                                        "download-image".into(),
                                        super::worker::Operation::SaveData {
                                            uri: uri.clone(),
                                            destination,
                                        },
                                    );
                                }
                            }
                            Err(error) => s.workbench.error = Some(error.to_string()),
                            _ => {}
                        },
                    );
                }),
        );
    let mut pixels = rune::el()
        .key("image-pixels")
        .size(w * scale, h * scale)
        .pixels_fit(image.pixels(), rune::SurfaceFit::Fit);
    if annotating {
        pixels = pixels.cursor(rune::Cursor::Crosshair).on_drag(move |s: &mut State, d, tx| {
            if d.phase != rune::Phase::Up || d.cancelled() { return; }
            let x = (d.x / d.w * 100.0).round().clamp(0.0, 100.0);
            let y = (d.y / d.h * 100.0).round().clamp(0.0, 100.0);
            let doc = &s.workbench.docs[index];
            let target = serde_json::json!({"directory":doc.directory,"path":doc.path,"quote":format!("Image point: {x}% from left, {y}% from top. Original dimensions: {w} × {h}.")});
            s.workbench.docs[index].image_view.annotating = false;
            crate::chat::comments::begin(s, target);
            tx.focus("review-comment", false);
        });
    }
    let scroll = doc.image_view.scroll.clone();
    let pointer = doc.image_view.pointer.clone();
    let surface = col()
        .key(format!("image-viewport-{index}"))
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .scroll_xy()
        .cursor(if doc.image_view.dragging {
            rune::Cursor::Grabbing
        } else if can_pan && !annotating {
            rune::Cursor::Grab
        } else {
            rune::Cursor::Default
        })
        .role("region")
        .label(format!(
            "Image preview: {}. Use + and − to zoom, 0 to fit, 1 for actual size.",
            doc.path
        ))
        .focusable(true)
        .fill(s.theme.c("surface-under"))
        .on_layout(move |s: &mut State, rect| {
            s.workbench.docs[index].image_view.viewport = [rect[2], rect[3]]
        })
        .on_scroll_offset(move |pos| {
            scroll.set(pos.offset);
        })
        .on_pointer_move_local(move |_: &mut State, point, tx| {
            pointer.set([point.x, point.y]);
            tx.live_only();
        })
        .child(
            col()
                .size(
                    (w * scale + 32.0).max(viewport[0]),
                    (h * scale + 32.0).max(viewport[1]),
                )
                .padding(16.0)
                .center()
                .child(pixels),
        )
        .on_wheel(move |s: &mut State, e, tx| {
            if !e.mods.ctrl && !e.mods.cmd {
                return false;
            }
            let (_, _, _, shown) = geometry(s, index);
            zoom(
                s,
                index,
                shown * (e.dy.clamp(-100.0, 100.0) * 0.01).exp(),
                Some([e.x, e.y]),
                tx,
            );
            true
        })
        .on_magnify(move |s: &mut State, e, tx| {
            let (_, _, _, shown) = geometry(s, index);
            zoom(s, index, shown * (1.0 + e.delta), Some([e.x, e.y]), tx);
            true
        })
        .on_drag(move |s: &mut State, d, tx| {
            if !can_pan || annotating {
                return;
            }
            let view = &mut s.workbench.docs[index].image_view;
            match d.phase {
                rune::Phase::Down => {
                    view.pan_start = view.scroll.get();
                    view.dragging = true;
                }
                rune::Phase::Move => tx.scroll_to_instant(
                    format!("image-viewport-{index}"),
                    (view.pan_start[0] - d.dx).max(0.0),
                    (view.pan_start[1] - d.dy).max(0.0),
                ),
                rune::Phase::Up => {
                    view.dragging = false;
                    if d.cancelled() {
                        tx.scroll_to_instant(
                            format!("image-viewport-{index}"),
                            view.pan_start[0],
                            view.pan_start[1],
                        );
                    }
                }
            }
        })
        .on_double_press_tx(move |s: &mut State, tx| {
            if annotating {
                return;
            }
            if s.workbench.docs[index].image_scale.is_none() {
                let point = s.workbench.docs[index].image_view.pointer.get();
                zoom(s, index, 1.0, Some(point), tx);
            } else {
                s.workbench.docs[index].image_scale = None;
            }
        })
        .on_key(move |s: &mut State, key, tx| {
            if key.mods.cmd || key.mods.ctrl || key.mods.alt {
                return false;
            }
            match &key.key {
                rune::Key::Text(c) if c == "+" || c == "=" => step(s, index, true, tx),
                rune::Key::Text(c) if c == "-" => step(s, index, false, tx),
                rune::Key::Text(c) if c == "0" => s.workbench.docs[index].image_scale = None,
                rune::Key::Text(c) if c == "1" => zoom(s, index, 1.0, None, tx),
                _ => return false,
            }
            true
        });
    let footer = row()
        .h(40.0)
        .w_full()
        .px(12.0)
        .center_y()
        .gap(8.0)
        .child(
            label(
                &s.theme,
                if annotating {
                    "Click a point on the image"
                } else {
                    "Pinch to zoom · Drag to pan"
                },
                12.0,
                400.0,
                "text-secondary",
            )
            .grow(1.0),
        )
        .child(
            super::documents::button(s, "Annotate point")
                .checked(annotating)
                .on_press(move |s: &mut State| {
                    s.workbench.docs[index].image_view.annotating ^= true
                }),
        )
        .child(
            super::documents::button(s, "Comment").on_press(move |s: &mut State| {
                let doc = &s.workbench.docs[index];
                crate::chat::comments::begin(
                    s,
                    serde_json::json!({"directory":doc.directory,"path":doc.path}),
                );
            }),
        );
    col()
        .grow(1.0)
        .min_h(0.0)
        .child(toolbar)
        .child(surface)
        .child(footer)
}
pub fn decimal(value: f64) -> String {
    let number = format!("{value:.1}");
    let number = number.strip_suffix(".0").unwrap_or(&number);
    let (whole, fraction) = number.split_once('.').map_or((number, ""), |(a, b)| (a, b));
    let mut result = String::new();
    for (i, character) in whole.chars().enumerate() {
        if i > 0 && (whole.len() - i).is_multiple_of(3) {
            result.push(',');
        }
        result.push(character);
    }
    if !fraction.is_empty() {
        result.push('.');
        result.push_str(fraction);
    }
    result
}
// Rune rasterizes SVG at 2× (capped at 4096), so raster pixels are not its intrinsic size.
// Read only the root's sizing attributes; no entities, resources, or executable SVG are read.
pub fn svg_size(bytes: &[u8]) -> Option<[f32; 2]> {
    let source = std::str::from_utf8(bytes).ok()?;
    let root = source.find("<svg")?;
    let tag = &source[root + 4..];
    let tag = &tag[..tag.find('>')?];
    let mut attrs = std::collections::BTreeMap::new();
    let mut rest = tag;
    while !rest.trim_start().is_empty() {
        rest = rest.trim_start();
        let Some(equal) = rest.find('=') else {
            break;
        };
        let key = rest[..equal].trim();
        rest = rest[equal + 1..].trim_start();
        let quote = rest.chars().next()?;
        if quote != '\'' && quote != '"' {
            return None;
        }
        rest = &rest[1..];
        let end = rest.find(quote)?;
        attrs.insert(key, &rest[..end]);
        rest = &rest[end + 1..];
    }
    fn length(value: &&str) -> Option<f32> {
        let value = value.trim();
        for (unit, factor) in [
            ("px", 1.0),
            ("in", 96.0),
            ("cm", 96.0 / 2.54),
            ("mm", 96.0 / 25.4),
            ("pt", 96.0 / 72.0),
            ("pc", 16.0),
        ] {
            if let Some(n) = value.strip_suffix(unit) {
                return n
                    .trim()
                    .parse::<f32>()
                    .ok()
                    .map(|n| n * factor)
                    .filter(|n| n.is_finite() && *n > 0.0);
            }
        }
        value
            .parse::<f32>()
            .ok()
            .filter(|n| n.is_finite() && *n > 0.0)
    }
    let w = attrs.get("width").and_then(length);
    let h = attrs.get("height").and_then(length);
    let ratio = attrs.get("viewBox").and_then(|v| {
        let v: Vec<f32> = v
            .split(|c: char| c.is_whitespace() || c == ',')
            .filter(|v| !v.is_empty())
            .filter_map(|v| v.parse().ok())
            .collect();
        (v.len() == 4 && v[2] > 0.0 && v[3] > 0.0).then(|| v[2] / v[3])
    });
    match (w, h, ratio) {
        (Some(w), Some(h), _) => Some([w, h]),
        (Some(w), None, Some(r)) => Some([w, w / r]),
        (None, Some(h), Some(r)) => Some([h * r, h]),
        (None, None, Some(r)) => Some(if r > 2.0 {
            [300.0, 300.0 / r]
        } else {
            [150.0 * r, 150.0]
        }),
        (w, h, _) => Some([w.unwrap_or(300.0), h.unwrap_or(150.0)]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn actual_viewport_zoom_anchor_and_point_comment_use_image_coordinates() {
        use base64::Engine;
        let mut s = crate::workbench::tests::state();
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="red"/></svg>"#;
        let uri = format!(
            "data:image/svg+xml;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(svg)
        );
        crate::workbench::documents::receive(
            &mut s,
            "file:diagram.svg",
            crate::workbench::worker::prepare(
                serde_json::json!({"kind":"image","uri":uri,"bytes":svg.len()}),
            ),
        );
        fn image_view(s: &State, _: &mut rune::Cx<State>) -> El {
            view(
                s,
                0,
                s.workbench.docs[0]
                    .image
                    .as_ref()
                    .unwrap()
                    .as_ref()
                    .unwrap(),
            )
            .h_full()
        }
        let mut rt = rune::Runtime::new(s, image_view, (800.0, 600.0), rune::Env::new(true, 2.0));
        for _ in 0..3 {
            rt.frame(0.0);
        }
        rt.update(|s, _| {
            let (_, viewport, fit, _) = geometry(s, 0);
            assert_eq!(viewport, [800.0, 520.0]);
            assert!(
                (fit - 488.0 / 900.0).abs() < 0.0001,
                "geometry: {:?}",
                geometry(s, 0)
            );
        });
        rt.update(|s, tx| zoom(s, 0, 2.0, Some([400.0, 260.0]), tx));
        for _ in 0..3 {
            rt.frame(0.0);
        }
        rt.update(|s, _| {
            let doc = &s.workbench.docs[0];
            let scroll = doc.image_view.scroll.get();
            assert_eq!(doc.image_scale, Some(2.0));
            assert!((scroll[0] - 816.0).abs() < 1.0, "x offset {scroll:?}");
            assert!((scroll[1] - 656.0).abs() < 1.0, "y offset {scroll:?}");
            s.workbench.docs[0].image_view.annotating = true;
        });
        rt.frame(0.0);
        let (x, y) = rt.find("image-pixels").unwrap();
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        rt.frame(0.0);
        rt.update(|s, _| {
            assert_eq!(
                s.chat.comment_editor.as_ref().unwrap().target["quote"],
                "Image point: 50% from left, 50% from top. Original dimensions: 1200 × 900."
            );
        });
    }
}
