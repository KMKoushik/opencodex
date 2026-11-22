//! Gateway-native history, newest-page replacement, and incremental execution events.
use crate::{
    Gateway,
    types::{Event, Message, MessagePage, SessionInfo, Times},
};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

#[derive(Clone, Debug, Default)]
pub struct Messages {
    pub session_id: String,
    pub info: Option<SessionInfo>,
    pub messages: Vec<Arc<Message>>,
    pub cursor: Option<String>,
    pub running: bool,
    pub error: Option<String>,
    pub revision: u64,
    /// Snapshot boundaries only, so attachment discovery never scans history per token.
    pub media_revision: u64,
    pub(crate) indexes: BTreeMap<String, usize>,
    // A late subscriber must never render a suffix as a complete answer.
    pub(crate) started: BTreeSet<(String, String, usize)>,
    pub(crate) live: BTreeMap<(String, String, usize), String>,
}
impl Messages {
    pub async fn load(client: &Gateway, id: &str) -> Result<Self, String> {
        let (info, page, active) = tokio::try_join!(
            client.session(id),
            client.messages(id, None),
            client.active()
        )?;
        let mut out = Self {
            session_id: id.into(),
            info: Some(info),
            running: active.contains_key(id),
            ..Self::default()
        };
        out.merge(page, false);
        Ok(out)
    }
    pub async fn refresh(&mut self, client: &Gateway) -> Result<(), String> {
        let (info, page, active) = tokio::try_join!(
            client.session(&self.session_id),
            client.messages(&self.session_id, None),
            client.active()
        )?;
        self.info = Some(info);
        self.running = active.contains_key(&self.session_id);
        self.merge(page, false);
        self.error = None;
        Ok(())
    }
    pub async fn earlier(&mut self, client: &Gateway) -> Result<(), String> {
        if let Some(cursor) = &self.cursor {
            self.merge(client.messages(&self.session_id, Some(cursor)).await?, true);
        }
        Ok(())
    }
    pub fn merge(&mut self, page: MessagePage, earlier: bool) {
        self.media_revision += 1;
        let fresh: Vec<_> = page.data.into_iter().rev().map(Arc::new).collect();
        let cursor = page.cursor.and_then(|c| c.next);
        if earlier {
            let mut prefix: Vec<_> = fresh
                .into_iter()
                .filter(|m| !self.indexes.contains_key(&m.id))
                .collect();
            prefix.append(&mut self.messages);
            self.messages = prefix;
            self.cursor = cursor;
        } else if let Some(index) = fresh.first().and_then(|m| self.indexes.get(&m.id)).copied() {
            self.messages.truncate(index);
            self.messages.extend(fresh);
        } else {
            self.messages = fresh;
            self.cursor = cursor;
        }
        self.reindex();
        if let Some(info) = self.info.as_ref().filter(|info| {
            info.metadata
                .as_ref()
                .is_some_and(|m| m["opencodexSideChat"].is_object())
        }) {
            if self
                .messages
                .iter()
                .any(|m| m.time.created < info.time.created)
            {
                self.cursor = None;
            }
            self.messages
                .retain(|m| m.time.created >= info.time.created);
            self.reindex();
        }
        self.live.retain(|(id, _, _), _| {
            self.indexes
                .get(id)
                .is_some_and(|i| self.messages[*i].time.completed.is_none())
        });
        self.started.retain(|key| self.live.contains_key(key));
        // A snapshot can lag the live tail. Keep observed full-prefix overlays until it catches up.
        for ((id, kind, ordinal), live) in &self.live {
            if let Some(index) = self.indexes.get(id) {
                let m = Arc::make_mut(&mut self.messages[*index]);
                if let Some(part) = m
                    .fields
                    .get_mut("content")
                    .and_then(Value::as_array_mut)
                    .and_then(|parts| {
                        parts
                            .iter_mut()
                            .filter(|p| p["type"] == kind.as_str())
                            .nth(*ordinal)
                    })
                {
                    if live.len() > part["text"].as_str().unwrap_or("").len() {
                        part["text"] = live.clone().into();
                    }
                }
            }
        }
        self.revision += 1;
    }
    fn reindex(&mut self) {
        self.indexes = self
            .messages
            .iter()
            .enumerate()
            .map(|(i, m)| (m.id.clone(), i))
            .collect();
    }
    fn assistant(&mut self, id: &str, created: f64) -> &mut Message {
        let index = if let Some(index) = self.indexes.get(id) {
            *index
        } else {
            let index = self.messages.len();
            self.messages.push(Arc::new(Message {
                id: id.into(),
                r#type: "assistant".into(),
                time: Times {
                    created,
                    ..Times::default()
                },
                fields: BTreeMap::from([("content".into(), json!([]))]),
            }));
            self.indexes.insert(id.into(), index);
            index
        };
        Arc::make_mut(&mut self.messages[index])
    }
    /// Returns (visible change, authoritative refresh required). Never requests on token deltas.
    pub fn reduce(&mut self, event: &Event) -> (bool, bool) {
        let d = &event.data;
        if d["sessionID"].as_str() != Some(&self.session_id) {
            return (false, false);
        }
        let kind = event.r#type.as_str();
        if let Some(message) = d["assistantMessageID"]
            .as_str()
            .and_then(|id| self.indexes.get(id))
            .and_then(|i| self.messages.get(*i))
        {
            if message
                .time
                .completed
                .is_some_and(|done| event.created > 0.0 && event.created <= done)
            {
                return (false, false);
            }
        }
        let mut changed = false;
        let mut refresh = false;
        match kind {
            "session.execution.started" => {
                self.running = true;
                self.error = None;
                changed = true;
                refresh = true;
            }
            "session.execution.succeeded"
            | "session.execution.failed"
            | "session.execution.interrupted" => {
                self.running = false;
                self.error = d["error"]["message"].as_str().map(str::to_owned);
                changed = true;
                refresh = true;
            }
            "session.step.started" => {
                if let Some(id) = d["assistantMessageID"].as_str() {
                    let m = self.assistant(id, d["started"].as_f64().unwrap_or(event.created));
                    for key in ["agent", "model"] {
                        if !d[key].is_null() {
                            m.fields.insert(key.into(), d[key].clone());
                        }
                    }
                    changed = true;
                }
            }
            "session.step.ended" | "session.step.streamed" => {
                if let Some(id) = d["assistantMessageID"].as_str() {
                    let m = self.assistant(id, event.created);
                    if kind.ends_with("ended") {
                        m.time.completed = Some(event.created);
                    } else {
                        m.time.streamed = Some(event.created);
                    }
                    changed = true;
                }
            }
            _ if kind.starts_with("session.text.") || kind.starts_with("session.reasoning.") => {
                if let (Some(id), Some(ordinal)) =
                    (d["assistantMessageID"].as_str(), d["ordinal"].as_u64())
                {
                    let part_kind = if kind.starts_with("session.text.") {
                        "text"
                    } else {
                        "reasoning"
                    };
                    let key = (id.to_owned(), part_kind.to_owned(), ordinal as usize);
                    if kind.ends_with("started") {
                        self.started.insert(key.clone());
                        self.live.insert(key.clone(), String::new());
                    }
                    if self.started.contains(&key) || kind.ends_with("ended") {
                        let text = if kind.ends_with("delta") {
                            let text = self.live.entry(key.clone()).or_default();
                            text.push_str(d["delta"].as_str().unwrap_or(""));
                            text.clone()
                        } else if let Some(text) = d["text"].as_str() {
                            self.live.insert(key.clone(), text.into());
                            text.to_owned()
                        } else {
                            self.live.get(&key).cloned().unwrap_or_default()
                        };
                        let m = self.assistant(id, event.created);
                        let parts = m
                            .fields
                            .entry("content".into())
                            .or_insert(json!([]))
                            .as_array_mut()
                            .expect("content array");
                        let index = parts
                            .iter()
                            .enumerate()
                            .filter(|(_, p)| p["type"] == part_kind)
                            .nth(ordinal as usize)
                            .map(|(i, _)| i);
                        let index = index.unwrap_or_else(|| {
                            parts.push(json!({"type":part_kind,"text":""}));
                            parts.len() - 1
                        });
                        if text.len() >= parts[index]["text"].as_str().unwrap_or("").len()
                            || kind.ends_with("ended")
                        {
                            parts[index]["text"] = text.into();
                        }
                        changed = true;
                    }
                    refresh = kind.ends_with("ended") && !self.started.contains(&key);
                }
            }
            _ if kind.starts_with("session.tool.") => {
                if let (Some(id), Some(tool_id)) =
                    (d["assistantMessageID"].as_str(), d["id"].as_str())
                {
                    let m = self.assistant(id, event.created);
                    let parts = m
                        .fields
                        .entry("content".into())
                        .or_insert(json!([]))
                        .as_array_mut()
                        .expect("content array");
                    let index = parts.iter().position(|p| p["type"] == "tool" && p["id"] == tool_id).unwrap_or_else(|| {
                        parts.push(json!({"type":"tool","id":tool_id,"name":d["name"],"time":{"created":event.created},"state":{"status":"streaming","input":""}})); parts.len()-1
                    });
                    let p = &mut parts[index];
                    match kind {
                        "session.tool.input.delta" => {
                            let input = p["state"]["input"].as_str().unwrap_or("");
                            p["state"]["input"] =
                                format!("{input}{}", d["delta"].as_str().unwrap_or("")).into();
                        }
                        "session.tool.input.ended" => p["state"]["input"] = d["text"].clone(),
                        "session.tool.called" => {
                            p["state"]["input"] = d["input"].clone();
                            p["state"]["status"] = "running".into();
                        }
                        "session.tool.progress" => p["state"]["metadata"] = d["metadata"].clone(),
                        "session.tool.success" => {
                            p["state"]["status"] = "completed".into();
                            p["state"]["content"] = d["content"].clone();
                            p["state"]["metadata"] = d["metadata"].clone();
                            p["time"]["completed"] = event.created.into();
                        }
                        "session.tool.failed" => {
                            p["state"]["status"] = "error".into();
                            p["state"]["error"] = d["error"].clone();
                            p["state"]["content"] = d["content"].clone();
                            p["state"]["metadata"] = d["metadata"].clone();
                        }
                        _ => refresh = true,
                    }
                    changed = true;
                }
            }
            "session.usage.updated" | "session.instructions.updated" => {}
            _ => refresh = kind.starts_with("session."),
        }
        if changed {
            self.revision += 1;
        }
        (changed, refresh)
    }
}
