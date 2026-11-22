use base64::Engine;
use serde_json::{Value, json};
/// Disposable presentation bytes, never written back to the project catalog.
pub async fn preview(source: &str) -> Result<Value, String> {
    let bytes = if let Some(encoded) = source.strip_prefix("data:") {
        let (header, body) = encoded.split_once(',').ok_or("Invalid image data")?;
        if !header.starts_with("image/") || !header.ends_with(";base64") {
            return Err("Unsupported image data".into());
        }
        if body.len() > 8 * 1024 * 1024 {
            return Err("Project image is too large".into());
        }
        base64::engine::general_purpose::STANDARD
            .decode(body)
            .map_err(|e| e.to_string())?
    } else {
        let url = reqwest::Url::parse(source).map_err(|e| e.to_string())?;
        if !["http", "https"].contains(&url.scheme())
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("Unsupported image URL".into());
        }
        let mut response = reqwest::Client::new()
            .get(url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            if bytes.len() + chunk.len() > 6 * 1024 * 1024 {
                return Err("Project image is too large".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        bytes
    };
    if std::str::from_utf8(&bytes)
        .is_ok_and(|s| s.trim_start().starts_with("<svg") || s.contains("<svg "))
    {
        return Ok(json!({"svg":String::from_utf8(bytes).map_err(|e| e.to_string())?}));
    }
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|e| e.to_string())?
        .thumbnail(128, 128);
    let mut out = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut out, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(json!({"png":out.into_inner()}))
}
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
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saved_icon_previews_are_bounded_and_do_not_accept_local_urls() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            assert!(preview("file:///etc/passwd").await.is_err());
            assert!(
                preview("https://user:secret@example.test/icon.png")
                    .await
                    .is_err()
            );
            let image = image::DynamicImage::new_rgba8(512, 256);
            let mut png = std::io::Cursor::new(Vec::new());
            image.write_to(&mut png, image::ImageFormat::Png).unwrap();
            let source = format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(png.into_inner())
            );
            let value = preview(&source).await.unwrap();
            let bytes: Vec<_> = value["png"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_u64().unwrap() as u8)
                .collect();
            let image = image::load_from_memory(&bytes).unwrap();
            assert_eq!((image.width(), image.height()), (128, 64));
        });
    }
}
