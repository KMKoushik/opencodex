//! Native background-only alerts. Session ancestry and app/mute rules follow the web client.
use crate::State;
use serde_json::Value;
#[derive(Default)]
pub struct Notifications {
    pub shown: std::collections::BTreeSet<String>,
    pub requesting: Option<String>,
    pub error: Option<(String, String)>,
}
pub fn change(s: &mut State, kind: &str, enabled: bool) {
    if s.notifications.requesting.is_some() {
        return;
    }
    s.notifications.error = None;
    if !enabled {
        s.prefs.notifications.insert(kind.into(), false);
        s.save();
        return;
    }
    let Some(wake) = s.waker.clone() else {
        return;
    };
    s.notifications.requesting = Some(kind.into());
    oc_native::notifications::request_permission(wake);
}
pub fn poll(s: &mut State) -> bool {
    let Some(result) = oc_native::notifications::take_permission() else {
        return false;
    };
    let Some(kind) = s.notifications.requesting.take() else {
        return false;
    };
    match result {
        Ok(true) => {
            s.prefs.notifications.insert(kind, true);
            s.save();
        }
        Ok(false) => {
            s.notifications.error = Some((
                kind,
                "Notifications are blocked. Allow them in your browser or system settings.".into(),
            ))
        }
        Err(error) => s.notifications.error = Some((kind, error)),
    }
    true
}
pub fn clear_on_focus(s: &mut State) {
    if !s.notifications.shown.is_empty() && rune_notify::app_focused() {
        rune_notify::remove(
            &s.notifications
                .shown
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>(),
        );
        s.notifications.shown.clear();
    }
}
pub fn snapshot(s: &mut State, next: &oc_gateway::Snapshot) {
    if rune_notify::app_focused() || !rune_notify::available() {
        return;
    }
    let finished: Vec<_> = s
        .snapshot
        .active
        .iter()
        .filter(|id| !next.active.contains(*id))
        .cloned()
        .collect();
    for id in finished {
        request(s, "reply", &id, 0);
    }
    for (id, kind) in &next.attention {
        if s.snapshot.attention.get(id) != Some(kind) {
            request(s, kind, id, 0);
        }
    }
}
fn request(s: &mut State, kind: &str, id: &str, depth: usize) {
    if !s.prefs.notifications.get(kind).copied().unwrap_or(false) {
        return;
    }
    s.prompt_request(oc_gateway::prompt::Request::Get {
        tag: format!("notify:{kind}:{depth}"),
        path: format!("sessions/{id}"),
        query: vec![],
    });
}
pub fn receive(s: &mut State, tag: &str, result: Result<Value, String>) {
    let Ok(value) = result else {
        return;
    };
    if rune_notify::app_focused() {
        return;
    }
    let mut parts = tag.split(':');
    parts.next();
    let kind = parts.next().unwrap_or("reply");
    let depth: usize = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    if let Some(parent) = value["parentID"].as_str() {
        if kind == "reply" || depth >= 8 {
            return;
        }
        request(s, kind, parent, depth + 1);
        return;
    }
    if let Some(parent) = value["metadata"]["opencodexSideChat"]["parentID"].as_str() {
        if depth >= 8 {
            return;
        }
        request(s, kind, parent, depth + 1);
        return;
    }
    if value["metadata"]["opencodexMuted"] == true
        || (kind == "reply" && !value["metadata"]["opencodexApp"].is_null())
    {
        return;
    }
    let Some(id) = value["id"].as_str() else {
        return;
    };
    s.notifications.shown.insert(id.into());
    while s.notifications.shown.len() > 64 {
        if let Some(id) = s.notifications.shown.pop_first() {
            rune_notify::remove(&[&id]);
        }
    }
    let title = match kind {
        "question" => "Question waiting",
        "permission" => "Permission needed",
        _ => "Reply finished",
    };
    rune_notify::post(
        &rune_notify::Notification::new(id, title)
            .body(value["title"].as_str().unwrap_or("Thread"))
            .info("session", id),
    );
}
