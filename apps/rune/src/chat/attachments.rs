use crate::{State, sidebar::label};
use rune::{El, col, el, row};
use serde_json::Value;

pub fn download(file: &Value, tx: &mut rune::Tx) {
    let name = file["name"]
        .as_str()
        .filter(|n| !n.is_empty())
        .unwrap_or("attachment")
        .to_owned();
    let Some(data) = file["data"].as_str() else {
        return;
    };
    let uri = format!(
        "data:{};base64,{data}",
        file["mime"].as_str().unwrap_or("application/octet-stream")
    );
    tx.save_file(
        rune::FileDialogOptions {
            title: format!("Download {name}"),
            file_name: Some(name),
            ..Default::default()
        },
        move |s: &mut State, result, _| match result {
            Ok(Some(destination)) => s.workspace_request(
                "download-attachment".into(),
                crate::workbench::worker::Operation::SaveData { uri, destination },
            ),
            Err(error) => s.error = Some(error.to_string()),
            _ => {}
        },
    );
}
pub fn sent(
    s: &State,
    message: &std::sync::Arc<oc_gateway::types::Message>,
    width: f32,
    reader: bool,
) -> El {
    let t = &s.theme;
    let chat = super::conversation(s, reader);
    let mut strip = row()
        .gap(8.0)
        .max_w(width - 48.0)
        .flex_wrap()
        .justify_end()
        .role("list")
        .label("Attached files");
    let files = message
        .fields
        .get("files")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    for (index, file) in files
        .iter()
        .enumerate()
        .filter(|(_, f)| f["mention"].is_null())
    {
        let mime = file["mime"].as_str().unwrap_or("");
        let name = file["name"]
            .as_str()
            .filter(|s| !s.is_empty())
            .unwrap_or(mime);
        if matches!(
            mime,
            "image/png" | "image/jpeg" | "image/gif" | "image/webp"
        ) {
            let name = file["name"]
                .as_str()
                .filter(|s| !s.is_empty())
                .unwrap_or("Attached image");
            let source = format!("data:{mime};base64,{}", file["data"].as_str().unwrap_or(""));
            let mut thumbnail = el()
                .size(96.0, 76.0)
                .radius(10.0)
                .border(1.0, t.c("border-heavy"));
            if let Some(Ok(image)) = chat.media.images.get(&source) {
                thumbnail = thumbnail.pixels_fit(image.pixels(), rune::SurfaceFit::Fill);
            } else {
                // Sent ImageAttachment has no onError/retry control. Chromium shows
                // its alt text on failure rather than turning it into a file card.
                thumbnail = thumbnail.child(label(t, name, 12.0, 400.0, "text-secondary").wrap());
            }
            let preview_name = name.to_owned();
            strip = strip.child(
                thumbnail
                    .role("button")
                    .label(format!("Preview {name}"))
                    .focusable(true)
                    .on_press(move |s: &mut State| {
                        s.chat.preview_name = preview_name.clone();
                        s.chat.preview = Some(source.clone());
                    }),
            );
        } else {
            let kind = if mime == "application/pdf" {
                "PDF".into()
            } else {
                name.rsplit_once('.')
                    .map(|(_, ext)| ext.to_uppercase())
                    .unwrap_or("File".into())
            };
            let message = message.clone();
            strip = strip.child(
                col()
                    .w(240.0)
                    .max_w(width - 48.0)
                    .h(76.0)
                    .px(12.0)
                    .py(10.0)
                    .justify_center()
                    .radius(10.0)
                    .border(1.0, t.c("border"))
                    .fill(t.c("secondary"))
                    .gap(4.0)
                    .hover(t.c("secondary-hover"))
                    .child(label(t, name, 14.0, 400.0, "text").truncate())
                    .child(label(t, kind, 12.0, 400.0, "text-secondary"))
                    .role("button")
                    .label(format!(
                        "{} {}",
                        if name.to_ascii_lowercase().ends_with(".docx") {
                            "Preview"
                        } else {
                            "Download"
                        },
                        if name.is_empty() { "attachment" } else { name }
                    ))
                    .focusable(true)
                    .on_press_tx(move |s: &mut State, tx| {
                        if let Some(file) = message
                            .fields
                            .get("files")
                            .and_then(Value::as_array)
                            .and_then(|f| f.get(index))
                        {
                            if file["name"]
                                .as_str()
                                .is_some_and(|n| n.to_ascii_lowercase().ends_with(".docx"))
                            {
                                super::document::open(s, file.clone());
                            } else {
                                download(file, tx);
                            }
                        }
                    }),
            );
        }
    }
    strip
}
