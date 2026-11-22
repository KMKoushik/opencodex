use crate::State;
use base64::Engine;
use oc_gateway::{Gateway, prompt::Attachment};
use serde_json::{Value, json};
use std::sync::{Arc, mpsc};

pub struct Restored {
    text: String,
    attachments: Vec<Attachment>,
    mentions: Vec<Value>,
}
pub struct Pending {
    session: String,
    revision: u64,
    result: mpsc::Receiver<Result<Restored, String>>,
}

pub fn start(s: &mut State) {
    if s.composer.undo.is_some() {
        return;
    }
    let Some(session) = s.selected.clone() else {
        return;
    };
    let Some(message) = s
        .chat
        .data
        .visible()
        .iter()
        .rev()
        .find(|m| m.r#type == "user")
    else {
        s.error = Some("No earlier user message is loaded. Load earlier history to undo.".into());
        return;
    };
    let id = message.id.clone();
    let data = s.chat.data.clone();
    let Some(url) = crate::sidecar::url().map(str::to_owned) else {
        return;
    };
    let wake = s.waker.clone();
    let (tx, rx) = mpsc::sync_channel(1);
    let thread_session = session.clone();
    std::thread::spawn(move || {
        let result = (|| {
            let message = data
                .messages
                .iter()
                .find(|m| m.id == id)
                .ok_or("Message no longer available")?;
            let text = message
                .fields
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            if text.encode_utf16().count() > 200_000 {
                return Err("This message is too long to restore into the composer.".into());
            }
            let mut attachments = vec![];
            let mut mentions = vec![];
            for file in message
                .fields
                .get("files")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if let Some(token) = file["mention"]["text"].as_str() {
                    if file["source"]["type"] == "uri" {
                        mentions.push(json!({"type":"file", "path":token.strip_prefix('@').unwrap_or(token), "token":token}));
                    } else if let Some(description) = file["description"]
                        .as_str()
                        .and_then(|v| v.strip_suffix(')'))
                        && let Some((_, id)) = description.rsplit_once('(')
                        && !id.is_empty()
                        && !id.contains(char::is_whitespace)
                    {
                        mentions.push(json!({"type":"chat", "id":id, "token":token}));
                    }
                    continue;
                }
                let data = file["data"].as_str().unwrap_or("");
                if data.len() > 28 * 1024 * 1024 {
                    return Err("Attachment exceeds the 20 MiB limit.".into());
                }
                let mut item = Attachment {
                    name: file["name"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .unwrap_or("attachment")
                        .into(),
                    mime: file["mime"]
                        .as_str()
                        .unwrap_or("application/octet-stream")
                        .into(),
                    bytes: Arc::new(
                        base64::engine::general_purpose::STANDARD
                            .decode(data)
                            .map_err(|e| e.to_string())?,
                    ),
                    thumbnail: None,
                };
                item.preview();
                attachments.push(item);
                oc_gateway::prompt::validate_attachments(&attachments)?;
            }
            for skill in message
                .fields
                .get("skills")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if let Some(token) = skill["mention"]["text"].as_str() {
                    mentions.push(json!({"type":"skill", "id":skill["id"], "token":token}));
                }
            }
            let client = Gateway::new(&url, None)?;
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| e.to_string())?
                .block_on(client.post::<Value>(
                    &format!("sessions/{thread_session}/action"),
                    json!({"action":"undo","messageID":id}),
                ))?;
            Ok(Restored {
                text,
                attachments,
                mentions,
            })
        })();
        let _ = tx.send(result);
        if let Some(wake) = wake {
            wake();
        }
    });
    s.composer.pending.insert(session.clone());
    s.composer.undo = Some(Pending {
        session,
        revision: s.draft().revision,
        result: rx,
    });
}

pub fn poll(s: &mut State) -> bool {
    let Some(result) = s
        .composer
        .undo
        .as_ref()
        .and_then(|p| p.result.try_recv().ok())
    else {
        return false;
    };
    let pending = s.composer.undo.take().unwrap();
    s.composer.pending.remove(&pending.session);
    match result {
        Ok(restored) if s.composer.drafts.get(&pending.session).revision == pending.revision => {
            let cache = rune::ImageCache::new(s.waker.clone().unwrap_or_else(|| Arc::new(|| {})));
            let images = restored
                .attachments
                .iter()
                .map(|a| {
                    a.thumbnail
                        .as_ref()
                        .map(|t| cache.rgba(t.width, t.height, t.rgba.clone()))
                })
                .collect();
            let draft = s.composer.drafts.edit(&pending.session);
            draft.edit.replace_text(restored.text);
            draft.attachments = restored.attachments;
            draft.images = images;
            draft.mentions = restored.mentions;
            draft.comments.clear();
            s.composer.drafts.touch(&pending.session);
        }
        Err(error) => s.error = Some(error),
        _ => {}
    }
    true
}
