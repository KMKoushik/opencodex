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
    pub page_results: BTreeMap<String, (u64, Option<String>)>,
    pub loaded_directories: BTreeSet<String>,
    pub project_errors: BTreeMap<String, String>,
    pub scoped_directories: Option<BTreeSet<String>>,
    pub error: Option<String>,
    pub live: bool,
    pub revision: u64,
    pub models: BTreeMap<String, ModelCatalog>,
    pub branches: BTreeMap<String, String>,
    pub attention: BTreeMap<String, String>,
    pub workspace_revision: u64,
    /// List, source, data, app runs, tasks, PTYs: token deltas invalidate none of these.
    pub native_revisions: [u64; 6],
    pub workspace_directory: Option<String>,
}
impl Snapshot {
    pub fn retain_project_lists(&mut self, directories: &BTreeSet<String>, selected: Option<&str>) {
        self.scoped_directories = Some(directories.clone());
        let ids: BTreeSet<_> = self
            .projects
            .iter()
            .filter(|p| directories.contains(&p.canonical))
            .map(|p| p.id.clone())
            .collect();
        self.loaded_directories
            .retain(|dir| directories.contains(dir));
        self.cursors.retain(|dir, _| directories.contains(dir));
        self.project_cursors.retain(|id, _| ids.contains(id));
        self.project_errors
            .retain(|dir, _| directories.contains(dir));
        self.page_results.retain(|dir, _| directories.contains(dir));
        self.sessions.retain(|id, session| {
            session.pinned.is_some()
                || selected == Some(id.as_str())
                || directories.contains(&session.directory)
                || session
                    .project_id
                    .as_ref()
                    .is_some_and(|id| ids.contains(id))
        });
    }
    /// Commit both directory/worktree cursors only after the entire page succeeds.
    /// A failed read must neither advance pagination nor restart the event stream.
    pub async fn more(&mut self, client: &Gateway, directory: &str) {
        let result: Result<(), String> = async {
            let local = if let Some(cursor) = self.cursors.get(directory) {
                Some(client.sessions(directory, Some(cursor)).await?)
            } else {
                None
            };
            let id = self
                .projects
                .iter()
                .find(|p| p.canonical == directory)
                .map(|p| p.id.clone());
            let tree = if let Some(id) = &id {
                if let Some(cursor) = self.project_cursors.get(id) {
                    Some(client.project_sessions(id, Some(cursor)).await?)
                } else {
                    None
                }
            } else {
                None
            };
            if let Some(page) = local {
                self.cursors.remove(directory);
                if let Some(cursor) = page.next_cursor {
                    self.cursors.insert(directory.into(), cursor);
                }
                for session in page.sessions {
                    self.sessions.insert(session.id.clone(), session);
                }
            }
            if let (Some(id), Some(page)) = (id, tree) {
                self.project_cursors.remove(&id);
                if let Some(cursor) = page.next_cursor {
                    self.project_cursors.insert(id, cursor);
                }
                for session in page.sessions {
                    self.sessions.insert(session.id.clone(), session);
                }
            }
            Ok(())
        }
        .await;
        let entry = self.page_results.entry(directory.into()).or_default();
        entry.0 = entry.0.wrapping_add(1);
        entry.1 = result.err();
    }
    pub async fn load(client: &Gateway) -> Result<Self, String> {
        Self::load_scoped(client, None).await
    }
    /// `None` is reserved for headless capture. Live clients supply only mounted
    /// project lists, never all service-discovered projects.
    pub async fn load_scoped(
        client: &Gateway,
        directories: Option<&BTreeSet<String>>,
    ) -> Result<Self, String> {
        let (projects, active) = tokio::try_join!(client.projects(), client.active())?;
        let mut out = Self {
            projects,
            active: active.into_keys().collect(),
            scoped_directories: directories.cloned(),
            ..Self::default()
        };
        // Parallel requests are bounded; no thousands of simultaneous per-project sockets.
        use futures_util::{StreamExt, stream};
        let dirs: Vec<String> = directories
            .map(|dirs| dirs.iter().cloned().collect())
            .unwrap_or_else(|| out.projects.iter().map(|p| p.canonical.clone()).collect());
        let pages: Vec<_> = stream::iter(dirs.iter().map(|directory| {
            let project = out.projects.iter().find(|p| &p.canonical == directory);
            async move {
                let result = async {
                    let local = client.sessions(directory, None).await?;
                    let tree = if let Some(p) = project.filter(|p| p.vcs.is_some()) {
                        Some(client.project_sessions(&p.id, None).await?)
                    } else {
                        None
                    };
                    Ok::<_, String>((
                        project.map(|p| p.id.clone()).unwrap_or_default(),
                        local,
                        tree,
                    ))
                }
                .await;
                (directory.clone(), result)
            }
        }))
        .buffer_unordered(4)
        .collect()
        .await;
        for (directory, result) in pages {
            let (id, page, tree) = match result {
                Ok(page) => page,
                Err(error) => {
                    out.project_errors.insert(directory, error);
                    continue;
                }
            };
            out.loaded_directories.insert(directory.clone());
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
    /// Returns true for sidebar/workspace changes. Token deltas never publish or wake UI.
    pub fn reduce(&mut self, event: Event) -> bool {
        if matches!(
            event.r#type.as_str(),
            "pty.created" | "pty.updated" | "pty.deleted"
        ) {
            self.native_revisions[5] = self.native_revisions[5].wrapping_add(1);
            return true;
        }
        if matches!(
            event.r#type.as_str(),
            "filesystem.changed" | "vcs.branch.updated"
        ) {
            self.workspace_revision = self.workspace_revision.wrapping_add(1);
            self.workspace_directory = event.location.as_ref().map(|l| l.directory.clone());
            return true;
        }
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
            if let Some(directories) = &self.scoped_directories {
                let project = data["projectID"].as_str();
                if !directories.contains(directory)
                    && !self.projects.iter().any(|p| {
                        Some(p.id.as_str()) == project && directories.contains(&p.canonical)
                    })
                {
                    return false;
                }
            }
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
