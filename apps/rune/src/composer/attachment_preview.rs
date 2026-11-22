use crate::State;
use oc_gateway::prompt::Attachment;
use rune::Tx;

pub fn open(s: &mut State, item: Attachment) {
    if let Some(wake) = &s.waker {
        s.composer.attachment_preview.set_waker(wake.clone());
    }
    s.composer.attachment_preview.request(item, |item| {
        use base64::Engine;
        let data = base64::engine::general_purpose::STANDARD.encode(item.bytes.as_slice());
        let uri = format!("data:{};base64,{data}", item.mime);
        let mut file = serde_json::json!({"name":item.name,"mime":item.mime,"data":data});
        if item.mime.starts_with("image/") { file["uri"] = serde_json::json!(uri); }
        crate::workbench::worker::prepare(file)
    });
}
pub fn poll(s: &mut State, tx: &mut Tx) -> bool {
    let Some(prepared) = s.composer.attachment_preview.take() else {
        return false;
    };
    let file = prepared.value;
    let mime = file["mime"].as_str().unwrap_or("");
    if matches!(
        mime,
        "image/png" | "image/jpeg" | "image/gif" | "image/webp"
    ) {
        let uri = file["uri"].as_str().unwrap_or("").to_owned();
        // Keep only one draft image preview; sent-image cache has its own budget.
        if let Some(previous) = s.composer.preview_image.replace(uri.clone()) {
            std::sync::Arc::make_mut(&mut s.chat.media.images).remove(&previous);
        }
        if let Some(image) = prepared.image {
            std::sync::Arc::make_mut(&mut s.chat.media.images).insert(uri.clone(), image);
        }
        s.chat.preview_name = file["name"].as_str().unwrap_or("attachment").into();
        s.chat.preview = Some(uri);
    } else if file["name"]
        .as_str()
        .is_some_and(|n| n.to_ascii_lowercase().ends_with(".docx"))
    {
        crate::chat::open_document(s, file);
    } else {
        crate::chat::download_attachment(&file, tx);
    }
    true
}
