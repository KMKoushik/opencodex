use crate::{
    State, icons,
    sidebar::{icon_button, label},
};
use rune::{El, col, el, row};

pub fn view(s: &State, width: f32, height: f32) -> Option<El> {
    let source = s.chat.preview.as_ref()?;
    let image = s.chat.media.images.get(source)?.as_ref().ok()?;
    let t = &s.theme;
    Some(
        el().key("image-preview")
            .absolute(0.0, 0.0)
            .size(width, height)
            .fill(t.c("scrim"))
            .center()
            .modal(true, |s: &mut State| s.chat.preview = None)
            .child(
                col()
                    .w((width - 48.0).min(1000.0))
                    .h((height - 48.0).max(200.0))
                    .radius(12.0)
                    .fill(t.c("surface"))
                    .child(
                        row()
                            .w_full()
                            .h(44.0)
                            .px(14.0)
                            .center_y()
                            .child(label(t, "Image preview", 13.0, 500.0, "text"))
                            .child(el().grow(1.0))
                            .child(
                                icon_button(t, &icons::CLOSE, "Close image preview")
                                    .on_press(|s: &mut State| s.chat.preview = None),
                            ),
                    )
                    .child(
                        el().w_full()
                            .grow(1.0)
                            .min_h(0.0)
                            .pixels_fit(image.pixels(), rune::SurfaceFit::Fit),
                    ),
            ),
    )
}
