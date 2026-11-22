use crate::{
    State, icons,
    sidebar::{icon_button, label},
};
use rune::{El, col, el, row};

pub fn view(s: &State, width: f32, height: f32) -> Option<El> {
    if let Some(document) = super::document::view(s, width, height) {
        return Some(document);
    }
    let source = s.chat.preview.as_ref()?;
    let image = s
        .chat
        .media
        .images
        .get(source)
        .or_else(|| s.workbench.reader_chat.media.images.get(source))
        .and_then(|image| image.as_ref().ok());
    let t = &s.theme;
    let panel_width = (width - 32.0).min(1100.0);
    let image_height = image
        .and_then(|i| i.size())
        .map(|[w, h]| (panel_width - 26.0) * h as f32 / (w.max(1) as f32))
        .unwrap_or(21.0)
        .min((height - 116.0).max(0.0));
    let image_body = match image {
        Some(image) => el()
            .w_full()
            .h(image_height)
            .radius(8.0)
            .pixels_fit(image.pixels(), rune::SurfaceFit::Fit),
        None => label(t, &s.chat.preview_name, 14.0, 400.0, "text")
            .w_full()
            .min_h(21.0),
    };
    Some(
        el().key("image-preview")
            .absolute(0.0, 0.0)
            .size(width, height)
            .fill(t.c("scrim"))
            .center()
            .role("dialog")
            .label(format!("Image preview: {}", s.chat.preview_name))
            .modal(true, |s: &mut State| s.chat.preview = None)
            .child(
                col()
                    .w(panel_width)
                    .padding(12.0)
                    .gap(12.0)
                    .radius(16.0)
                    .border(1.0, t.c("border-heavy"))
                    .border_layout()
                    .fill(t.c("surface"))
                    .child(
                        row()
                            .w_full()
                            .h(44.0)
                            .pl(8.0)
                            .center_y()
                            .child(label(t, &s.chat.preview_name, 14.0, 400.0, "text").truncate())
                            .child(el().grow(1.0))
                            .child(
                                icon_button(t, &icons::CLOSE, "Close image preview")
                                    .size(44.0, 44.0)
                                    .on_press(|s: &mut State| s.chat.preview = None),
                            ),
                    )
                    .child(image_body),
            ),
    )
}
