//! Workspace presentation. All project data and mutations cross the existing gateway.
mod details;
mod documents;
pub use details::view as details_view;
mod sessions;
#[cfg(test)]
mod tests;
mod view;
pub mod worker;
use crate::{OPTIONS, State};
use rune::{TextEdit, Waker};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
pub use view::layout;
use worker::{Operation, Request, Worker};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Panel {
    Files,
    Changes,
    Subagents,
    Side,
    Canvas,
    Browser,
    Terminal,
}
impl Panel {
    pub const ALL: [Self; 7] = [
        Self::Files,
        Self::Changes,
        Self::Subagents,
        Self::Side,
        Self::Canvas,
        Self::Browser,
        Self::Terminal,
    ];
    pub fn id(self) -> &'static str {
        match self {
            Self::Files => "files",
            Self::Changes => "changes",
            Self::Subagents => "subagents",
            Self::Side => "side-chat",
            Self::Canvas => "canvas",
            Self::Browser => "browser",
            Self::Terminal => "terminal",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Side => "Side chat",
            _ => match self {
                Self::Files => "Files",
                Self::Changes => "Changes",
                Self::Subagents => "Subagents",
                Self::Canvas => "Canvas",
                Self::Browser => "Browser",
                _ => "Terminal",
            },
        }
    }
    pub fn parse(id: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|p| p.id() == id || (*p == Self::Side && id == "side"))
    }
}
pub struct Workbench {
    pub open: bool,
    pub expanded: bool,
    pub panel: Panel,
    pub worker: Option<Worker>,
    epoch: u64,
    pub pending: BTreeSet<String>,
    pub loaded: BTreeSet<String>,
    pub error: Option<String>,
    pub entries: BTreeMap<String, Vec<Value>>,
    pub tree: Vec<(String, bool, usize)>,
    pub folders: BTreeSet<String>,
    pub search: TextEdit,
    pub query: String,
    pub search_due: Option<f64>,
    pub workspace_revision: u64,
    pub refresh_due: Option<f64>,
    pub changes: Vec<Value>,
    pub mode: String,
    pub docs: Vec<documents::Document>,
    pub selected: Option<usize>,
    pub split: bool,
    pub agents: Vec<Value>,
    pub agent_cursor: Option<String>,
    pub sides: Vec<Value>,
    pub reader: Option<String>,
    pub messages: Vec<Value>,
    pub side_drafts: BTreeMap<String, TextEdit>,
    pub side_revisions: BTreeMap<String, u64>,
    pub side_sending: Option<(String, u64)>,
    pub side_quote: Option<String>,
    pub side_origin: Option<(String, u64)>,
    pub details: BTreeMap<String, Value>,
    pub reader_worker: Option<oc_gateway::Worker>,
    pub reader_chat: crate::chat::Chat,
}
impl Default for Workbench {
    fn default() -> Self {
        Self {
            open: false,
            expanded: false,
            panel: Panel::Files,
            worker: None,
            epoch: 0,
            pending: Default::default(),
            loaded: Default::default(),
            error: None,
            entries: Default::default(),
            tree: Vec::new(),
            folders: Default::default(),
            search: TextEdit::new(""),
            query: String::new(),
            search_due: None,
            workspace_revision: 0,
            refresh_due: None,
            changes: Vec::new(),
            mode: "working".into(),
            docs: Vec::new(),
            selected: None,
            split: false,
            agents: Vec::new(),
            agent_cursor: None,
            sides: Vec::new(),
            reader: None,
            messages: Vec::new(),
            side_drafts: Default::default(),
            side_revisions: Default::default(),
            side_sending: None,
            side_quote: None,
            side_origin: None,
            details: Default::default(),
            reader_worker: None,
            reader_chat: Default::default(),
        }
    }
}
impl State {
    pub fn search_workspace(&mut self) {
        self.workbench.query = self.workbench.search.text.trim().to_owned();
        if self.workbench.query.is_empty() {
            self.rebuild_workspace_tree();
            return;
        }
        self.workspace_get(
            &format!("search:{}", self.workbench.query),
            "workspace/files".into(),
            vec![
                ("directory".into(), self.workspace_directory()),
                ("query".into(), self.workbench.query.clone()),
            ],
            true,
        );
    }
    pub fn workspace_directory(&self) -> String {
        self.chat
            .data
            .info
            .as_ref()
            .map(|i| i.location.directory.clone())
            .or_else(|| {
                self.selected
                    .as_ref()
                    .and_then(|id| self.snapshot.sessions.get(id))
                    .map(|s| s.directory.clone())
            })
            .or_else(|| self.project().map(|p| p.canonical.clone()))
            .unwrap_or_default()
    }
    pub fn panel_width(&self) -> f32 {
        if !self.workbench.open || self.selected.is_none() {
            return 0.0;
        }
        let sidebar = if self.prefs.sidebar_closed {
            0.0
        } else {
            self.sidebar_width()
        };
        let available = self.window_size.0 - sidebar;
        if self.workbench.expanded {
            available - 44.0
        } else {
            self.prefs
                .workbench_width
                .unwrap_or(820.0)
                .clamp(340.0, (available - 320.0).max(340.0))
        }
    }
    pub fn select_panel(&mut self, panel: Panel) {
        if panel == Panel::Terminal {
            self.toggle_terminal();
            return;
        }
        self.workbench.open = !self.workbench.open || self.workbench.panel != panel;
        self.workbench.panel = panel;
        self.workbench.reader = None;
        if self.workbench.open {
            self.load_panel(false);
        }
    }
    pub fn workspace_request(&mut self, tag: String, op: Operation) {
        if self.workbench.pending.contains(&tag) {
            return;
        }
        let Some(worker) = &self.workbench.worker else {
            return;
        };
        match worker.request(Request {
            epoch: self.workbench.epoch,
            tag: tag.clone(),
            op,
        }) {
            Ok(()) => {
                self.workbench.pending.insert(tag);
            }
            Err(e) => self.workbench.error = Some(e),
        }
    }
    pub fn workspace_get(
        &mut self,
        tag: &str,
        path: String,
        query: Vec<(String, String)>,
        force: bool,
    ) {
        if !force && self.workbench.loaded.contains(tag) {
            return;
        }
        self.workspace_request(tag.into(), Operation::Get { path, query });
    }
    pub fn load_panel(&mut self, force: bool) {
        let d = self.workspace_directory();
        let id = self.selected.clone().unwrap_or_default();
        match self.workbench.panel {
            Panel::Files => self.load_folder("", force),
            Panel::Changes => self.workspace_get(
                "changes",
                "workspace/diff".into(),
                vec![
                    ("directory".into(), d),
                    ("mode".into(), self.workbench.mode.clone()),
                ],
                force,
            ),
            Panel::Subagents => {
                self.workspace_get("agents", format!("sessions/{id}/subagents"), vec![], force)
            }
            Panel::Side => {
                self.workspace_get("sides", format!("sessions/{id}/side-chats"), vec![], force)
            }
            _ => {}
        }
    }
    pub fn load_folder(&mut self, path: &str, force: bool) {
        let mut query = vec![("directory".into(), self.workspace_directory())];
        if !path.is_empty() {
            query.push(("path".into(), path.into()));
        }
        self.workspace_get(
            &format!("folder:{path}"),
            "workspace/files".into(),
            query,
            force,
        );
    }
    pub fn rebuild_workspace_tree(&mut self) {
        fn walk(w: &Workbench, path: &str, depth: usize, out: &mut Vec<(String, bool, usize)>) {
            if depth > 64 {
                return;
            }
            if let Some(entries) = w.entries.get(path) {
                for entry in entries {
                    let Some(p) = entry["path"].as_str() else {
                        continue;
                    };
                    let dir = entry["type"] == "directory";
                    out.push((p.trim_end_matches('/').into(), dir, depth));
                    if dir && w.folders.contains(p.trim_end_matches('/')) {
                        walk(w, p.trim_end_matches('/'), depth + 1, out);
                    }
                }
            }
        }
        let mut out = Vec::new();
        walk(&self.workbench, "", 0, &mut out);
        self.workbench.tree = out;
    }
}
pub fn start(s: &mut State, client: oc_gateway::Gateway, wake: Waker) {
    s.workbench.worker = Some(Worker::start(client, wake));
    if s.workbench.open {
        s.load_panel(false);
    }
}
pub fn reset(s: &mut State) {
    let worker = s.workbench.worker.take();
    let epoch = s.workbench.epoch.wrapping_add(1);
    let open = s.workbench.open;
    let panel = s.workbench.panel;
    let drafts = std::mem::take(&mut s.workbench.side_drafts);
    let revisions = std::mem::take(&mut s.workbench.side_revisions);
    let mut docs = std::mem::take(&mut s.workbench.docs);
    docs.retain(|d| d.dirty());
    for doc in &mut docs {
        doc.saving = None;
    }
    s.workbench = Workbench {
        worker,
        epoch,
        open,
        panel,
        side_drafts: drafts,
        side_revisions: revisions,
        docs,
        ..Default::default()
    };
}
pub fn poll(s: &mut State, clock: f64, _tx: &mut rune::Tx) -> bool {
    if s.workbench.workspace_revision != s.snapshot.workspace_revision {
        s.workbench.workspace_revision = s.snapshot.workspace_revision;
        if s.snapshot
            .workspace_directory
            .as_deref()
            .is_none_or(|d| d == s.workspace_directory())
        {
            s.workbench.refresh_due = Some(clock + 0.25);
            _tx.wake_after(std::time::Duration::from_millis(250));
        }
    }
    if s.workbench.refresh_due.is_some_and(|due| clock >= due) {
        s.workbench.refresh_due = None;
        s.workbench.loaded.retain(|key| {
            !key.starts_with("folder:") && key != "changes" && !key.starts_with("detail-")
        });
        for doc in &mut s.workbench.docs {
            doc.stale = true;
        }
        if s.workbench.open {
            s.load_panel(true);
            if let Some(doc) = s
                .workbench
                .selected
                .and_then(|i| s.workbench.docs.get(i))
                .filter(|d| !d.dirty())
            {
                let (path, is_diff) = (doc.path.clone(), doc.is_diff);
                s.open_workspace_file(path, is_diff);
            }
        }
    }
    if s.workbench.search_due.is_some_and(|due| clock >= due) {
        s.workbench.search_due = None;
        s.search_workspace();
    }
    let replies = s
        .workbench
        .worker
        .as_ref()
        .map(Worker::take)
        .unwrap_or_default();
    let mut changed = false;
    if let Some(data) = s
        .workbench
        .reader_worker
        .as_ref()
        .and_then(oc_gateway::Worker::take_messages)
    {
        if s.workbench.reader.as_deref() == Some(&data.session_id) {
            s.workbench.reader_chat.accept(data);
            changed = true;
        }
    }
    // Drain unrelated sidebar snapshots without rebuilding or refetching the workbench.
    if let Some(worker) = &s.workbench.reader_worker {
        let _ = worker.take();
    }
    for reply in replies {
        if reply.epoch != s.workbench.epoch {
            continue;
        }
        s.workbench.pending.remove(&reply.tag);
        changed = true;
        match reply.result {
            Err(e) => {
                s.workbench.error = Some(e);
                if let Some(path) = reply.tag.strip_prefix("save:") {
                    if let Some(doc) = s
                        .workbench
                        .docs
                        .iter_mut()
                        .find(|d| d.path == path && !d.is_diff)
                    {
                        doc.saving = None;
                    }
                }
                if reply.tag == "side-send" {
                    s.workbench.side_sending = None;
                }
            }
            Ok(payload) => {
                if !reply.tag.starts_with("search:")
                    && !reply.tag.starts_with("file:")
                    && !reply.tag.starts_with("diff:")
                {
                    s.workbench.loaded.insert(reply.tag.clone());
                }
                s.workbench.error = None;
                receive(s, &reply.tag, payload);
            }
        }
    }
    changed
}
fn receive(s: &mut State, tag: &str, p: worker::Payload) {
    if tag.starts_with("detail-") {
        s.workbench.details.insert(tag.into(), p.value);
        return;
    }
    if let Some(path) = tag.strip_prefix("folder:") {
        let mut entries = p.value.as_array().cloned().unwrap_or_default();
        let retained: usize = s
            .workbench
            .entries
            .iter()
            .filter(|(key, _)| key.as_str() != path)
            .map(|(_, values)| values.len())
            .sum();
        if retained + entries.len() > 50_000
            || (s.workbench.entries.len() >= 128 && !s.workbench.entries.contains_key(path))
        {
            s.workbench.error = Some(
                "The file browser has reached its cache limit. Use Filter files to find a path."
                    .into(),
            );
            return;
        }
        entries.sort_by(|a, b| {
            (a["type"] != "directory")
                .cmp(&(b["type"] != "directory"))
                .then_with(|| {
                    a["path"]
                        .as_str()
                        .unwrap_or("")
                        .cmp(b["path"].as_str().unwrap_or(""))
                })
        });
        s.workbench.entries.insert(path.into(), entries);
        s.rebuild_workspace_tree();
    } else if tag
        .strip_prefix("search:")
        .is_some_and(|query| query == s.workbench.search.text.trim())
    {
        s.workbench.tree = p
            .value
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| Some((v["path"].as_str()?.into(), v["type"] == "directory", 0)))
            .collect();
    } else if tag == "changes" {
        s.workbench.changes = p.value.as_array().cloned().unwrap_or_default();
        for file in &mut s.workbench.changes {
            if file["path"].is_null() {
                file["path"] = file["file"].clone();
            }
        }
    } else if tag == "agents" || tag == "agents-more" {
        let items = p.value["data"]
            .as_array()
            .or_else(|| p.value["items"].as_array())
            .or_else(|| p.value.as_array())
            .cloned()
            .unwrap_or_default();
        if tag == "agents" {
            s.workbench.agents = items;
        } else {
            s.workbench.agents.extend(items);
        }
        s.workbench.agent_cursor = p.value["next"]
            .as_str()
            .or_else(|| p.value["cursor"].as_str())
            .map(str::to_owned);
    } else if tag == "sides" {
        s.workbench.sides = p.value.as_array().cloned().unwrap_or_default();
    } else if tag.starts_with("reader:") {
        s.workbench.messages = p.value["data"]
            .as_array()
            .or_else(|| p.value["items"].as_array())
            .or_else(|| p.value.as_array())
            .cloned()
            .unwrap_or_default();
    } else if tag == "side-create" {
        let auto_send = s.workbench.side_origin.is_some();
        let id = p.value["id"].as_str().unwrap_or_default().to_owned();
        s.workbench.sides.push(p.value);
        if let Some((key, revision)) = s.workbench.side_origin.take() {
            s.composer.drafts.acknowledge(&key, revision);
        }
        if let Some(quote) = s.workbench.side_quote.take() {
            s.workbench
                .side_drafts
                .entry(id.clone())
                .or_insert_with(|| TextEdit::new(""))
                .insert(&quote);
        }
        s.open_workspace_reader(id);
        if auto_send {
            s.send_workspace_side();
        }
    } else if tag == "side-send" {
        if let Some((id, revision)) = s.workbench.side_sending.take() {
            if s.workbench.side_revisions.get(&id).copied().unwrap_or(0) == revision {
                s.workbench
                    .side_drafts
                    .insert(id.clone(), TextEdit::new(""));
            }
            s.open_workspace_reader(id);
        }
    } else {
        documents::receive(s, tag, p);
    }
}
/// Capture setup performs network and parsing on a worker before any Rune frames.
pub fn capture(s: &mut State) -> Result<(), String> {
    let Some(panel) = OPTIONS
        .get()
        .and_then(|o| o.panel.as_deref())
        .and_then(Panel::parse)
    else {
        return Ok(());
    };
    let url = OPTIONS
        .get()
        .unwrap()
        .gateway
        .clone()
        .ok_or("Panel capture needs OPENCODEX_GATEWAY")?;
    s.workbench.open = true;
    s.workbench.panel = panel;
    if panel == Panel::Terminal {
        s.workbench.open = false;
        return crate::terminal::capture(s);
    }
    let directory = s.workspace_directory();
    let id = s.selected.clone().unwrap_or_default();
    let (tag, path, query) = match panel {
        Panel::Files => (
            "folder:",
            "workspace/files".into(),
            vec![("directory".into(), directory.clone())],
        ),
        Panel::Changes => (
            "changes",
            "workspace/diff".into(),
            vec![
                ("directory".into(), directory.clone()),
                ("mode".into(), "working".into()),
            ],
        ),
        Panel::Subagents => ("agents", format!("sessions/{id}/subagents"), vec![]),
        Panel::Side => ("sides", format!("sessions/{id}/side-chats"), vec![]),
        _ => return Ok(()),
    };
    let value = capture_get(&url, path, query)?;
    receive(s, tag, value);
    if let Some(path) = OPTIONS.get().unwrap().file.clone() {
        if matches!(panel, Panel::Files | Panel::Changes) {
            documents::capture(s, &url, &directory, &path, panel == Panel::Changes)?;
        } else if matches!(panel, Panel::Side | Panel::Subagents) {
            s.workbench.reader = Some(path.clone());
            s.workbench
                .side_drafts
                .entry(path.clone())
                .or_insert_with(|| TextEdit::new(""));
            s.workbench
                .reader_chat
                .accept(std::sync::Arc::new(oc_gateway::capture_messages(
                    oc_gateway::Gateway::new(&url, None)?,
                    path,
                    false,
                )?));
        }
    }
    Ok(())
}
pub(crate) fn capture_get(
    url: &str,
    path: String,
    query: Vec<(String, String)>,
) -> Result<worker::Payload, String> {
    let url = url.to_owned();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;
        let client = oc_gateway::Gateway::new(&url, None)?;
        let q: Vec<_> = query
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        rt.block_on(client.get_bounded::<Value>(&path, &q, 16 * 1024 * 1024))
            .map(worker::prepare)
    })
    .join()
    .map_err(|_| "Workspace capture worker panicked".to_owned())?
}
