//! Scoped, cancellable metadata subscription while Session details is visible.
//! The shared snapshot reducer currently drops MCP/skill/descendant events, so
//! this consumer subscribes to the existing gateway stream, never to OpenCode.
use oc_gateway::Gateway;
use rune::Waker;
use serde_json::Value;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

pub struct Watch {
    stop: Option<tokio::sync::oneshot::Sender<()>>,
    dirty: Arc<AtomicBool>,
    ids: Arc<Mutex<std::collections::BTreeSet<String>>>,
    usages: Arc<Mutex<std::collections::BTreeMap<String, Value>>>,
}
impl Drop for Watch {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}
impl Watch {
    pub fn start(url: String, session: String, directory: String, wake: Option<Waker>) -> Self {
        let (stop, mut stopped) = tokio::sync::oneshot::channel();
        let dirty = Arc::new(AtomicBool::new(false));
        let ids = Arc::new(Mutex::new(std::collections::BTreeSet::from([session])));
        let flag = dirty.clone();
        let sessions = ids.clone();
        let usages = Arc::new(Mutex::new(std::collections::BTreeMap::new()));
        let updates = usages.clone();
        std::thread::spawn(move || {
            let Ok(rt) = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            else {
                return;
            };
            rt.block_on(async {
                let Ok(client) = Gateway::new(&url, None) else {
                    return;
                };
                let stream = async {
                    let mut delay = std::time::Duration::from_millis(500);
                    loop {
                        if let Ok(mut response) = client.events().await {
                            let mut buffer = String::new();
                            // Bytes can split UTF-8 codepoints; retain raw bytes until
                            // the complete SSE frame has arrived.
                            let mut bytes = Vec::new();
                            let mut queued=false;
                            let mut due=tokio::time::Instant::now();
                            loop {
                                let chunk=tokio::select! {
                                    result=tokio::time::timeout(std::time::Duration::from_secs(45),response.chunk()) => {
                                        let Ok(Ok(Some(chunk)))=result else { break; };
                                        chunk
                                    },
                                    _=tokio::time::sleep_until(due), if queued => {
                                        queued=false;
                                        if !flag.swap(true,Ordering::AcqRel) {
                                            if let Some(wake)=&wake { wake(); }
                                        }
                                        continue;
                                    }
                                };
                                bytes.extend_from_slice(&chunk);
                                if bytes.len()+buffer.len() > 1024 * 1024 {
                                    break;
                                }
                                while let Some(end) = bytes.iter().position(|b| *b == b'\n') {
                                    let line = String::from_utf8_lossy(&bytes[..end])
                                        .trim_end_matches('\r')
                                        .to_owned();
                                    bytes.drain(..=end);
                                    if line.is_empty() {
                                        if let Some((id,usage))=usage(&buffer) {
                                            if sessions.lock().unwrap().contains(&id) {
                                                let mut updates=updates.lock().unwrap();
                                                let first=updates.is_empty();
                                                updates.insert(id,usage);
                                                if first { if let Some(wake)=&wake {wake();} }
                                            }
                                        }
                                        if !queued && relevant(&buffer, &directory, &sessions.lock().unwrap()) {
                                            queued=true;
                                            due=tokio::time::Instant::now()+std::time::Duration::from_millis(100);
                                        }
                                        buffer.clear();
                                    } else {
                                        buffer.push_str(&line);
                                        buffer.push('\n');
                                    }
                                }
                            }
                            delay = std::time::Duration::from_millis(500);
                        }
                        tokio::time::sleep(delay).await;
                        delay = (delay * 2).min(std::time::Duration::from_secs(15));
                    }
                };
                tokio::select! { _=stream=>{}, _=&mut stopped=>{} }
            });
        });
        Self {
            stop: Some(stop),
            dirty,
            ids,
            usages,
        }
    }
    pub fn take(&self) -> bool {
        self.dirty.swap(false, Ordering::AcqRel)
    }
    pub fn descendants(&self, ids: impl Iterator<Item = String>) {
        let next = ids.collect::<std::collections::BTreeSet<_>>();
        if !next.is_empty() {
            *self.ids.lock().unwrap() = next;
        }
    }
    pub fn take_usage(&self) -> std::collections::BTreeMap<String, Value> {
        std::mem::take(&mut *self.usages.lock().unwrap())
    }
}
fn usage(frame: &str) -> Option<(String, Value)> {
    if !frame.contains("session.usage.updated") {
        return None;
    }
    let data = frame.lines().find_map(|l| l.strip_prefix("data:"))?;
    let value = serde_json::from_str::<Value>(data).ok()?;
    if value["type"] != "session.usage.updated" {
        return None;
    }
    Some((
        value["data"]["sessionID"].as_str()?.to_owned(),
        value["data"].clone(),
    ))
}
fn relevant(frame: &str, directory: &str, ids: &std::collections::BTreeSet<String>) -> bool {
    let mut event = "";
    let mut data = String::new();
    for line in frame.lines() {
        if let Some(value) = line.strip_prefix("event:") {
            event = value.trim();
        }
        if let Some(value) = line.strip_prefix("data:") {
            data.push_str(value.trim_start());
        }
    }
    if event == "ready" {
        return true;
    }
    let Ok(value) = serde_json::from_str::<Value>(&data) else {
        return false;
    };
    if event == "canvas" {
        return value["type"] == "list";
    }
    if event != "opencode" {
        return false;
    }
    let kind = value["type"].as_str().unwrap_or("");
    if matches!(
        kind,
        "mcp.status.changed"
            | "skill.updated"
            | "config.updated"
            | "filesystem.changed"
            | "vcs.branch.updated"
    ) {
        return value["location"]["directory"]
            .as_str()
            .is_none_or(|d| d == directory);
    }
    if matches!(
        kind,
        "session.created"
            | "session.deleted"
            | "session.execution.succeeded"
            | "session.execution.failed"
            | "session.model.selected"
            | "session.agent.selected"
            | "session.permissions"
    ) {
        return ["sessionID", "parentID"]
            .iter()
            .filter_map(|k| value["data"][k].as_str())
            .any(|id| ids.contains(id));
    }
    false
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resources_and_descendants_invalidate_without_token_storms() {
        let ids = std::collections::BTreeSet::from(["root".into(), "child".into()]);
        let frame = |kind: &str, data: Value| {
            format!(
                "event: opencode\ndata: {}\n",
                serde_json::json!({"type":kind,"data":data,"location":{"directory":"/project"}})
            )
        };
        assert!(relevant(
            &frame("mcp.status.changed", Value::Null),
            "/project",
            &ids
        ));
        assert_eq!(
            usage(&frame(
                "session.usage.updated",
                serde_json::json!({"sessionID":"child","cost":1.2})
            ))
            .unwrap()
            .1["cost"],
            1.2
        );
        assert!(!relevant(
            &frame("mcp.status.changed", Value::Null),
            "/other",
            &ids
        ));
        assert!(!relevant(
            &frame(
                "session.usage.updated",
                serde_json::json!({"sessionID":"child"})
            ),
            "/project",
            &ids
        ));
        assert!(relevant(
            &frame("session.created", serde_json::json!({"parentID":"child"})),
            "/project",
            &ids
        ));
        assert!(!relevant(
            &frame(
                "session.text.delta",
                serde_json::json!({"sessionID":"child"})
            ),
            "/project",
            &ids
        ));
    }
}
