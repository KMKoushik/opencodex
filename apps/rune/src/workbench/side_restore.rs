//! Undo decoding stays on the bounded workspace worker, outside input/render paths.
use base64::Engine;
use oc_gateway::{prompt::Attachment, types::Message};
use serde_json::{Value, json};
use std::sync::Arc;

pub struct Restored {
    pub text: String,
    pub attachments: Vec<Attachment>,
    pub mentions: Vec<Value>,
}

pub fn parse_slash(text: &str) -> Option<(String, String)> {
    let command = text.trim().strip_prefix('/')?;
    let (name, args) = command
        .split_once(char::is_whitespace)
        .unwrap_or((command, ""));
    (!name.is_empty() && !name.contains('/')).then(|| (name.into(), args.into()))
}

pub fn decode(message: &Message) -> Result<Restored, String> {
    let text = message
        .fields
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("");
    if text.encode_utf16().count() > 200_000 {
        return Err("This message is too long to restore into the composer.".into());
    }
    let mut attachments = Vec::new();
    let mut mentions = Vec::new();
    for file in message
        .fields
        .get("files")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if let Some(mention) = file.get("mention").filter(|v| !v.is_null()) {
            let token = mention["text"].as_str().unwrap_or("");
            if file["source"]["type"] == "uri" {
                mentions.push(json!({"type":"file","path":token.strip_prefix('@').unwrap_or(token),"token":token}));
            } else if let Some(id) = file["description"]
                .as_str()
                .and_then(|s| s.strip_suffix(')'))
                .and_then(|s| s.rsplit_once('(').map(|(_, id)| id))
                .filter(|id| !id.is_empty() && !id.chars().any(char::is_whitespace))
            {
                mentions.push(json!({"type":"chat","id":id,"token":token}));
            }
            continue;
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file["data"].as_str().unwrap_or(""))
            .map_err(|e| e.to_string())?;
        attachments.push(Attachment {
            name: file["name"]
                .as_str()
                .filter(|s| !s.is_empty())
                .unwrap_or("attachment")
                .into(),
            mime: file["mime"]
                .as_str()
                .unwrap_or("application/octet-stream")
                .into(),
            bytes: Arc::new(bytes),
            thumbnail: None,
        });
    }
    for skill in message
        .fields
        .get("skills")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if let Some(token) = skill["mention"]["text"].as_str() {
            mentions.push(json!({"type":"skill","id":skill["id"],"token":token}));
        }
    }
    oc_gateway::prompt::validate_attachments(&attachments)?;
    Ok(Restored {
        text: text.into(),
        attachments,
        mentions,
    })
}

pub fn prompt_mentions(text: &str, mentions: &[Value]) -> Vec<Value> {
    mentions
        .iter()
        .filter_map(|item| {
            let token = item["token"].as_str()?;
            let offset = text.match_indices(token).find_map(|(i, _)| {
                let before = text[..i].chars().next_back();
                let after = text[i + token.len()..].chars().next();
                (before.is_none_or(|c| c.is_whitespace() || "([{\"'`".contains(c))
                    && after.is_none_or(|c| c.is_whitespace() || ")] }\"'`,.;:!?".contains(c)))
                .then_some(i)
            })?;
            let start = text[..offset].encode_utf16().count();
            let mut result = item.clone();
            result.as_object_mut()?.remove("token");
            result["mention"] =
                json!({"start":start,"end":start+token.encode_utf16().count(),"text":token});
            Some(result)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn undo_restores_bytes_and_mentions_without_turning_mentions_into_attachments() {
        let message: Message = serde_json::from_value(json!({"id":"m", "type":"user", "time":{"created":1},
            "text":"😀 @src/main.rs @review @chat",
            "files":[
                {"mime":"text/plain","name":"note.txt","data":"SGVsbG8=","source":{"type":"inline"}},
                {"mime":"text/plain","data":"", "source":{"type":"uri"},"mention":{"text":"@src/main.rs"}},
                {"mime":"text/plain","data":"", "source":{"type":"inline"},"description":"Conversation (ses_child)","mention":{"text":"@chat"}}
            ],
            "skills":[{"id":"skill-review","mention":{"text":"@review"}}]
        })).unwrap();
        let restored = decode(&message).unwrap();
        assert_eq!(restored.attachments.len(), 1);
        assert_eq!(restored.attachments[0].bytes.as_slice(), b"Hello");
        let mentions = prompt_mentions(&restored.text, &restored.mentions);
        assert_eq!(mentions.len(), 3);
        assert_eq!(mentions[0]["mention"]["start"], 3);
        assert_eq!(mentions[0]["path"], "src/main.rs");
        assert_eq!(mentions[1]["id"], "ses_child");
        assert_eq!(mentions[2]["id"], "skill-review");
        assert!(parse_slash("/path/to/file").is_none());
        assert_eq!(
            parse_slash(" /review  source "),
            Some(("review".into(), " source".into()))
        );
    }
}
