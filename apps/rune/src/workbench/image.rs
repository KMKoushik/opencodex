use crate::{State, sidebar::label};
use rune::{El, col, row};
const STEPS: [f32; 11] = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 8.0, 16.0];

pub fn view(s: &State, index: usize, image: &rune::Image) -> El {
    let doc = &s.workbench.docs[index];
    let [w, h] = image.size().unwrap_or([1, 1]);
    let viewport = [
        (s.panel_width() - if s.workbench.tree_visible { 220.0 } else { 0.0 }).max(64.0),
        (s.window_size.1 - 180.0).max(64.0),
    ];
    let fit = 1.0f32
        .min((viewport[0] - 32.0).max(1.0) / w as f32)
        .min((viewport[1] - 32.0).max(1.0) / h as f32);
    let scale = doc.image_scale.unwrap_or(fit);
    let uri = doc.value["uri"].as_str().map(str::to_owned);
    let toolbar = row()
        .h(40.0)
        .px(12.0)
        .gap(8.0)
        .center_y()
        .child(
            label(
                &s.theme,
                format!("{w} × {h}"),
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
                .on_press(move |s: &mut State| {
                    s.workbench.docs[index].image_scale = Some(
                        STEPS
                            .into_iter()
                            .rev()
                            .find(|v| *v < scale - 0.001)
                            .unwrap_or(fit.min(0.1)),
                    );
                }),
        )
        .child(
            label(
                &s.theme,
                format!("{}%", (scale * 100.0).round() as u32),
                12.0,
                400.0,
                "text-secondary",
            )
            .w(56.0),
        )
        .child(
            super::documents::button(s, "+")
                .label("Zoom in")
                .disabled(scale >= 16.0)
                .on_press(move |s: &mut State| {
                    s.workbench.docs[index].image_scale = Some(
                        STEPS
                            .into_iter()
                            .find(|v| *v > scale + 0.001)
                            .unwrap_or(16.0),
                    );
                }),
        )
        .child(
            super::documents::button(s, "Fit")
                .checked(doc.image_scale.is_none())
                .on_press(move |s: &mut State| s.workbench.docs[index].image_scale = None),
        )
        .child(
            super::documents::button(s, "100%")
                .checked(doc.image_scale == Some(1.0))
                .on_press(move |s: &mut State| s.workbench.docs[index].image_scale = Some(1.0)),
        )
        .child(
            super::documents::button(s, "Comment").on_press(move |s: &mut State| {
                let d = &s.workbench.docs[index];
                crate::chat::comments::begin(
                    s,
                    serde_json::json!({"directory":d.directory,"path":d.path}),
                );
            }),
        )
        .child(
            super::documents::button(s, "Download")
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
    col().grow(1.0).min_h(0.0).child(toolbar).child(
        col()
            .key(format!("image-viewport-{index}"))
            .grow(1.0)
            .min_h(0.0)
            .w_full()
            .scroll_xy()
            .fill(s.theme.c("surface-under"))
            .child(
                col()
                    .min_w(viewport[0])
                    .min_h(viewport[1])
                    .padding(16.0)
                    .center()
                    .child(
                        rune::el()
                            .size(w as f32 * scale, h as f32 * scale)
                            .pixels_fit(image.pixels(), rune::SurfaceFit::Fit),
                    ),
            )
            .on_key(move |s: &mut State, key, _| {
                match key.key {
                    rune::Key::Text(ref c) if c == "0" => {
                        s.workbench.docs[index].image_scale = None
                    }
                    rune::Key::Text(ref c) if c == "1" => {
                        s.workbench.docs[index].image_scale = Some(1.0)
                    }
                    _ => return false,
                }
                true
            }),
    )
}
