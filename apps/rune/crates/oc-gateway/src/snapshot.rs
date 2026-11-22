use crate::{Gateway, types::*};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Default)]
pub struct Snapshot {
    pub projects: Vec<Project>,
    pub sessions: BTreeMap<String, Session>,
    pub active: BTreeSet<String>,
    pub cursors: BTreeMap<String, String>,
    pub project_cursors: BTreeMap<String, String>,
    pub error: Option<String>,
    pub live: bool,
    pub revision: u64,
    pub models: BTreeMap<String, ModelCatalog>,
    pub branches: BTreeMap<String, String>,
    pub attention: BTreeMap<String, String>,
}
impl Snapshot {
    pub async fn load(client: &Gateway) -> Result<Self, String> {
        let (projects, active) = tokio::try_join!(client.projects(), client.active())?;
        let mut out = Self {
            projects,
            active: active.into_keys().collect(),
            ..Self::default()
        };
        // Parallel requests are bounded; no thousands of simultaneous per-project sockets.
        use futures_util::{StreamExt, TryStreamExt, stream};
        let pages: Vec<_> = stream::iter(out.projects.iter().map(|p| async move {
            let local = client.sessions(&p.canonical, None).await?;
            let tree = if p.vcs.is_some() {
                Some(client.project_sessions(&p.id, None).await?)
            } else {
                None
            };
            Ok::<_, String>((p.id.clone(), p.canonical.clone(), local, tree))
        }))
        .buffer_unordered(4)
        .try_collect()
        .await?;
        for (id, directory, page, tree) in pages {
            if let Some(cursor) = page.next_cursor {
                out.cursors.insert(directory, cursor);
            }
            if let Some(cursor) = tree.as_ref().and_then(|p| p.next_cursor.clone()) {
                out.project_cursors.insert(id, cursor);
            }
            for session in page
                .sessions
                .into_iter()
                .chain(tree.into_iter().flat_map(|p| p.sessions))
            {
                out.sessions.insert(session.id.clone(), session);
            }
        }
        if !out.active.is_empty() {
            out.refresh_attention(client).await?;
        }
        Ok(out)
    }
    pub async fn refresh_attention(&mut self, client: &Gateway) -> Result<bool, String> {
        let dirs: Vec<_> = self
            .projects
            .iter()
            .take(32)
            .map(|p| ("directory", p.canonical.as_str()))
            .collect();
        let attention = client.get("attention", &dirs).await?;
        let changed = self.attention != attention;
        self.attention = attention;
        Ok(changed)
    }
    pub async fn details(&mut self, client: &Gateway, directory: &str) -> Result<(), String> {
        let models = client.get("models", &[("directory", directory)]).await?;
        let vcs: Value = client
            .get("workspace/vcs", &[("directory", directory)])
            .await?;
        self.models.insert(directory.into(), models);
        if let Some(branch) = vcs["info"]["branch"]["current"].as_str() {
            self.branches.insert(directory.into(), branch.into());
        }
        Ok(())
    }
    /// Returns true only for sidebar-visible changes. Token deltas never publish or wake UI.
    pub fn reduce(&mut self, event: Event) -> bool {
        let data = &event.data;
        let Some(id) = data["sessionID"].as_str() else {
            return false;
        };
        if event.r#type == "session.created" {
            if data["parentID"].is_string() || self.sessions.contains_key(id) {
                return false;
            }
            if data["metadata"]["opencodexApp"].is_object()
                || data["metadata"]["opencodexSideChat"].is_object()
            {
                return false;
            }
            let directory = data["location"]["directory"]
                .as_str()
                .or_else(|| event.location.as_ref().map(|l| l.directory.as_str()));
            let Some(directory) = directory else {
                return false;
            };
            self.sessions.insert(
                id.into(),
                Session {
                    id: id.into(),
                    title: data["title"].as_str().unwrap_or("Untitled session").into(),
                    directory: directory.into(),
                    project_id: data["projectID"].as_str().map(str::to_owned),
                    updated_at: event.created,
                    time: Times {
                        created: event.created,
                        ..Times::default()
                    },
                    unread: None,
                    pinned: None,
                    done: None,
                    muted: None,
                    model: None,
                    fork: None,
                },
            );
            return true;
        }
        if event.r#type == "session.deleted" {
            self.active.remove(id);
            return self.sessions.remove(id).is_some();
        }
        let Some(session) = self.sessions.get_mut(id) else {
            return false;
        };
        match event.r#type.as_str() {
            "session.renamed" => {
                // The stream was opened before the snapshot. A queued older event cannot
                // roll its newer authoritative title back after a reconnect.
                if event.created > 0.0 && event.created < session.updated_at {
                    return false;
                }
                let Some(title) = data["title"].as_str() else {
                    return false;
                };
                if session.title == title {
                    return false;
                }
                session.title = title.into();
                session.updated_at = event.created.max(session.updated_at);
            }
            "session.execution.started" => {
                if !self.active.insert(id.into()) {
                    return false;
                }
                session.updated_at = event.created;
            }
            "session.execution.succeeded"
            | "session.execution.failed"
            | "session.execution.interrupted" => {
                self.active.remove(id);
                session.time.idle = Some(event.created);
            }
            "session.viewed" => {
                let Some(idle) = data["idle"].as_f64() else {
                    return false;
                };
                session.time.viewed = Some(session.time.viewed.unwrap_or(0.0).max(idle));
            }
            "session.metadata.updated" => {
                if event.created > 0.0 && event.created < session.updated_at {
                    return false;
                }
                let meta = &data["metadata"];
                session.pinned = marker(meta, "opencodexPinned");
                session.done = marker(meta, "opencodexDone");
                session.unread = meta["opencodexUnread"].as_str().map(str::to_owned);
                session.muted = meta["opencodexMuted"].as_bool();
                session.updated_at = event.created.max(session.updated_at);
            }
            _ => return false,
        }
        true
    }
}
fn marker(meta: &Value, key: &str) -> Option<f64> {
    meta[key].as_f64().filter(|v| *v > 0.0)
}
