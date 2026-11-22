use base64::Engine;
use serde_json::{Value, json};
pub async fn prepare(source: &str, local: bool, favicon: bool) -> Result<Value, String> {
    let mut url = String::new();
    let bytes = if local {
        let path = std::path::Path::new(source);
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !["png", "jpg", "jpeg", "webp", "gif"].contains(&ext.as_str()) {
            return Err("Choose a PNG, JPEG, WebP, or GIF image.".into());
        }
        std::fs::read(path).map_err(|e| e.to_string())?
    } else {
        if source.trim().len() > 4096 {
            return Err("Use a URL shorter than 4,096 characters.".into());
        }
        let mut parsed = reqwest::Url::parse(source.trim())
            .map_err(|_| "Enter a complete website or image URL, starting with https://.")?;
        if !["http", "https"].contains(&parsed.scheme())
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err("Use an HTTP or HTTPS URL without embedded credentials.".into());
        }
        if favicon {
            parsed = parsed.join("/favicon.ico").map_err(|e| e.to_string())?;
        }
        url = parsed.to_string();
        let response = reqwest::Client::new()
            .get(parsed)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    "Loading the icon timed out. Try another URL.".into()
                } else {
                    e.to_string()
                }
            })?;
        if !response.status().is_success() {
            return Err(if favicon{"No favicon could be loaded at /favicon.ico. Try a direct image URL or upload an icon."}else{"The image could not be loaded. Check the URL or upload an icon."}.into());
        }
        response.bytes().await.map_err(|e| e.to_string())?.to_vec()
    };
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| {
        if favicon {
            "No favicon could be loaded at /favicon.ico. Try a direct image URL or upload an icon."
        } else {
            "The image could not be loaded. Check the URL or upload an icon."
        }
    })?;
    let size = image.width().min(image.height());
    let image = image
        .crop_imm(
            (image.width() - size) / 2,
            (image.height() - size) / 2,
            size,
            size,
        )
        .resize_exact(128, 128, image::imageops::FilterType::Triangle);
    let mut output = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let png = output.into_inner();
    if local {
        url = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&png)
        );
    }
    Ok(json!({"url":url,"png":png}))
}
