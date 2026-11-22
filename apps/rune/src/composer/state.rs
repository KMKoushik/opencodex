use crate::State;
use oc_gateway::{
    Gateway,
    prompt::{Attachment, PromptWorker, Reply, Request, Send},
    types::{Model, ModelRef},
};
use rune::TextEdit;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub struct Draft {
    pub images: Vec<Option<rune::Image>>,
    pub edit: TextEdit,
    pub revision: u64,
    pub model: Option<ModelRef>,
    pub attachments: Vec<Attachment>,
    pub mentions: Vec<Value>,
    pub full_access: bool,
    pub worktree: bool,
    pub branch: Option<String>,
}
impl Default for Draft {
    fn default() -> Self {
        Self {
            images: vec![],
            edit: TextEdit::new(""),
            revision: 0,
            model: None,
            attachments: vec![],
            mentions: vec![],
            full_access: false,
            worktree: false,
            branch: None,
        }
    }
}
#[derive(Default)]
pub struct Drafts {
    pub entries: BTreeMap<String, Draft>,
    clock: u64,
    empty: Draft,
}
impl Drafts {
    pub fn get(&self, key: &str) -> &Draft {
        self.entries.get(key).unwrap_or(&self.empty)
    }
    pub fn edit(&mut self, key: &str) -> &mut Draft {
        self.entries.entry(key.into()).or_default()
    }
    pub fn touch(&mut self, key: &str) {
        self.clock += 1;
        self.edit(key).revision = self.clock;
    }
    pub fn acknowledge(&mut self, key: &str, revision: u64) {
        if self.get(key).revision == revision {
            let draft = self.edit(key);
            draft.edit.clear();
            draft.attachments.clear();
            draft.images.clear();
            draft.mentions.clear();
            self.touch(key);
        }
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Menu {
    Models,
    Thinking,
    Access,
    ConfirmAccess,
    Workspace,
    Branch,
    Slash,
    Mention,
}
#[derive(Default)]
pub struct Composer {
    pub escape_until: Option<f64>,
    pub attachment_pending: BTreeMap<String, usize>,
    pub access_pending: bool,
    pub providers: BTreeMap<String, rune::Image>,
    pub collapsed_providers: BTreeSet<String>,
    pub drafts: Drafts,
    pub worker: Option<PromptWorker>,
    pub pending: BTreeSet<String>,
    pub menu: Option<Menu>,
    pub search: TextEdit,
    pub choices: Vec<super::menus::Choice>,
    pub cursor: usize,
    pub commands: BTreeMap<String, Vec<Value>>,
    pub skills: BTreeMap<String, Vec<Value>>,
    pub files: BTreeMap<String, Vec<Value>>,
    pub branches: BTreeMap<String, Vec<Value>>,
    pub loaded: BTreeSet<String>,
    pub dock_revision: u64,
}
impl State {
    pub fn draft_key(&self) -> &str {
        self.selected.as_deref().unwrap_or("new")
    }
    pub fn draft(&self) -> &Draft {
        self.composer.drafts.get(self.draft_key())
    }
    pub fn draft_mut(&mut self) -> &mut Draft {
        let key = self.draft_key().to_owned();
        self.composer.drafts.edit(&key)
    }
    pub fn touch_draft(&mut self) {
        let key = self.draft_key().to_owned();
        self.composer.drafts.touch(&key);
    }
    pub fn selected_model(&self) -> Option<&ModelRef> {
        self.draft()
            .model
            .as_ref()
            .or_else(|| {
                self.project()
                    .and_then(|p| self.prefs.project_models.get(&p.canonical))
            })
            .or_else(|| {
                self.project()
                    .and_then(|p| self.snapshot.models.get(&p.canonical))
                    .and_then(|c| c.default_model.as_ref())
            })
    }
    pub fn choose_model(&mut self, model: ModelRef) {
        let key = format!("{}/{}", model.provider_id, model.id);
        self.prefs.model_variants.insert(key, model.variant.clone());
        if let Some(directory) = self.project().map(|p| p.canonical.clone()) {
            self.prefs.project_models.insert(directory, model.clone());
        }
        while self.prefs.project_models.len() > 64
            || serde_json::to_vec(&self.prefs.project_models).is_ok_and(|b| b.len() > 16_384)
        {
            self.prefs.project_models.pop_first();
        }
        while self.prefs.model_variants.len() > 64
            || serde_json::to_vec(&self.prefs.model_variants).is_ok_and(|b| b.len() > 16_384)
        {
            self.prefs.model_variants.pop_first();
        }
        self.draft_mut().model = Some(model);
        self.touch_draft();
        self.save();
    }
    pub fn model_info(&self) -> Option<&Model> {
        let selected = self.selected_model()?;
        self.project()
            .and_then(|p| self.snapshot.models.get(&p.canonical))?
            .data
            .iter()
            .find(|m| m.id == selected.id && m.provider_id == selected.provider_id)
    }
    pub fn prompt_request(&mut self, request: Request) -> bool {
        let attachment = match &request {
            Request::ReadAttachment { key, .. } | Request::PrepareAttachment { key, .. } => {
                Some(key.clone())
            }
            _ => None,
        };
        let result = self
            .composer
            .worker
            .as_ref()
            .ok_or_else(|| "Gateway is not connected".to_owned())
            .and_then(|w| w.request(request));
        if let Err(error) = result {
            self.error = Some(error);
            return false;
        }
        if let Some(key) = attachment {
            *self.composer.attachment_pending.entry(key).or_default() += 1;
        }
        true
    }
    pub fn can_send(&self) -> bool {
        self.snapshot.live
            && !self.chat.read_only()
            && (self.selected.is_none() || self.chat.data.info.is_some())
            && self.project().is_some()
            && self.selected_model().is_some()
            && !self.composer.pending.contains(self.draft_key())
            && !self
                .composer
                .attachment_pending
                .contains_key(self.draft_key())
            && (!self.draft().edit.text.trim().is_empty() || !self.draft().attachments.is_empty())
            && self.draft().edit.text.chars().count() <= 200_000
    }
    pub fn send(&mut self) {
        if !self.can_send() {
            return;
        }
        if super::commands::local(self) {
            return;
        }
        let d = self.draft();
        let mut text = d.edit.text.clone();
        let mut command = None;
        let mut skill = None;
        if let Some(slash) = text.strip_prefix('/') {
            let (name, rest) = slash.split_once(char::is_whitespace).unwrap_or((slash, ""));
            let directory = &self.project().unwrap().canonical;
            if let Some(item) = self
                .composer
                .skills
                .get(directory)
                .and_then(|items| items.iter().find(|i| i["name"] == name))
            {
                skill = item["id"].as_str().map(str::to_owned);
                text = rest.into();
            } else if self
                .composer
                .commands
                .get(directory)
                .is_some_and(|items| items.iter().any(|i| i["name"] == name))
            {
                command = Some(name.into());
                text = rest.into();
            } else {
                self.error = Some(format!(
                    "Unknown command /{name}. Type / to see available commands."
                ));
                return;
            }
        }
        let mentions = prompt_mentions(&text, &d.mentions);
        let send = Send {
            key: self.draft_key().into(),
            revision: d.revision,
            session: self.selected.clone(),
            directory: self
                .selected
                .as_ref()
                .and_then(|id| self.snapshot.sessions.get(id))
                .map(|s| s.directory.clone())
                .unwrap_or_else(|| self.project().unwrap().canonical.clone()),
            model: self.selected_model().unwrap().clone(),
            text,
            attachments: d.attachments.clone(),
            mentions,
            command,
            skill,
            full_access: d.full_access,
            worktree: d.worktree,
            branch: d.branch.clone(),
        };
        let key = send.key.clone();
        if self.prompt_request(Request::Send(send)) {
            self.composer.pending.insert(key);
            self.error = None;
        }
    }
    pub fn stop(&mut self) {
        if self.chat.read_only() {
            return;
        }
        if let Some(id) = &self.selected {
            self.prompt_request(Request::Mutate {
                tag: "stop".into(),
                path: format!("sessions/{id}/interrupt"),
                body: json!({}),
                delete: false,
            });
        }
    }
}

pub fn mention_position(text: &str, token: &str) -> Option<usize> {
    text.match_indices(token).find_map(|(i, _)| {
        let before = text[..i].chars().next_back();
        let after = text[i + token.len()..].chars().next();
        (before.is_none_or(|c| c.is_whitespace() || "([{\"'`".contains(c))
            && after.is_none_or(|c| c.is_whitespace() || ")] }\"'`,.;:!?".contains(c)))
        .then_some(i)
    })
}
fn prompt_mentions(text: &str, mentions: &[Value]) -> Vec<Value> {
    mentions
        .iter()
        .filter_map(|item| {
            let token = item["token"].as_str()?;
            let offset = mention_position(text, token)?;
            let start = text[..offset].encode_utf16().count();
            let mut value = item.clone();
            value.as_object_mut()?.remove("token");
            value["mention"] =
                json!({"start":start,"end":start+token.encode_utf16().count(),"text":token});
            Some(value)
        })
        .take(32)
        .collect()
}
pub fn start(s: &mut State, client: Gateway, wake: rune::Waker) {
    s.composer.providers = super::providers::load(&s.theme.tokens["text"], wake.clone(), false);
    s.composer.worker = Some(PromptWorker::start(client, move || wake()));
}
pub fn poll(s: &mut State) -> bool {
    let mut changed = false;
    while let Some(reply) = s.composer.worker.as_ref().and_then(PromptWorker::take) {
        changed = true;
        match reply {
            Reply::Action {
                session,
                revision,
                result,
            } => {
                s.composer.pending.remove(&session);
                match result {
                    Ok(value) => {
                        let unchanged = s.composer.drafts.get(&session).revision == revision;
                        s.composer.drafts.acknowledge(&session, revision);
                        if unchanged && let Some(text) = value["restored"].as_str() {
                            s.composer.drafts.edit(&session).edit.replace_text(text);
                            s.composer.drafts.touch(&session);
                        }
                        if s.selected.as_deref() == Some(&session)
                            && let Some(id) = value["open"].as_str()
                        {
                            s.open_session(Some(id.into()));
                        }
                    }
                    Err(error) => s.error = Some(error),
                }
            }
            Reply::Sent {
                key,
                revision,
                session,
                result,
            } => {
                s.composer.pending.remove(&key);
                if result.is_ok() {
                    s.composer.drafts.acknowledge(&key, revision);
                }
                if let Err(e) = result {
                    s.error = Some(e);
                }
                // Even a failed admission may have created a session. Reuse it on retry.
                if key == "new" {
                    // A worktree move changes the authoritative session location after creation.
                    s.command(oc_gateway::Command::Refresh);
                    if let Some(id) = session {
                        if let Some(draft) = s.composer.drafts.entries.remove("new") {
                            s.composer.drafts.entries.insert(id.clone(), draft);
                        }
                        if s.selected.is_none() {
                            s.open_session(Some(id));
                        }
                    }
                }
            }
            Reply::Attachment { key, result } => {
                if let Some(count) = s.composer.attachment_pending.get_mut(&key) {
                    *count = count.saturating_sub(1);
                    if *count == 0 {
                        s.composer.attachment_pending.remove(&key);
                    }
                }
                match result {
                    Ok(item) => {
                        let image = item.thumbnail.as_ref().map(|thumb| {
                            rune::ImageCache::new(
                                s.waker
                                    .clone()
                                    .unwrap_or_else(|| std::sync::Arc::new(|| {})),
                            )
                            .rgba(
                                thumb.width,
                                thumb.height,
                                thumb.rgba.clone(),
                            )
                        });
                        let draft = s.composer.drafts.edit(&key);
                        draft.attachments.push(item);
                        if let Err(error) =
                            oc_gateway::prompt::validate_attachments(&draft.attachments)
                        {
                            draft.attachments.pop();
                            s.error = Some(error);
                        } else {
                            s.composer.drafts.edit(&key).images.push(image);
                            s.composer.drafts.touch(&key);
                        }
                    }
                    Err(e) => s.error = Some(e),
                }
            }
            Reply::Data { tag, result } if tag.starts_with("notify:") => {
                crate::notifications::receive(s, &tag, result);
            }
            Reply::Data { tag, result } if tag.starts_with("project-") => {
                if tag == "project-open"
                    && !matches!(s.pages.route, crate::pages::Route::Settings(_))
                {
                    crate::menus::projects::receive_home_folder(s, result);
                    continue;
                }
                crate::settings::projects::receive(s, &tag, result)
            }
            Reply::Data { tag, result } if tag.starts_with("switcher:") => {
                crate::menus::projects::receive(s, &tag, result)
            }
            Reply::Data { tag, result } if tag.starts_with("app-") => {
                crate::apps::receive(s, &tag, result)
            }
            Reply::Data { tag, result } if tag.starts_with("menu-search:") => {
                crate::menus::search::receive(s, tag.strip_prefix("menu-search:").unwrap(), result);
            }
            Reply::Data { tag, result }
                if tag.starts_with("page:")
                    || tag.starts_with("page-refresh:")
                    || tag.starts_with("menu-thread:")
                    || tag.starts_with("menu-export:") =>
            {
                crate::pages::receive(s, &tag, result);
            }
            Reply::Data { tag, result } => match result {
                Err(e) => {
                    s.error = Some(e);
                    s.docks.sending = false;
                    s.composer.access_pending = false;
                }
                Ok(value) => {
                    if let Some((kind, directory)) = tag.split_once(':') {
                        let values = value
                            .as_array()
                            .or_else(|| value["data"].as_array())
                            .cloned()
                            .unwrap_or_default();
                        match kind {
                            "info" => {
                                let draft = s.composer.drafts.edit(directory);
                                if draft.model.is_none() {
                                    draft.model =
                                        serde_json::from_value(value["model"].clone()).ok();
                                }
                                let rule = value["permissions"].as_array().and_then(|p| p.last());
                                draft.full_access = rule.is_some_and(|r| {
                                    r["action"] == "*"
                                        && r["resource"] == "*"
                                        && r["effect"] == "allow"
                                });
                            }
                            "access-true" | "access-false" => {
                                s.composer.drafts.edit(directory).full_access =
                                    kind == "access-true";
                                s.composer.access_pending = false;
                                s.composer.menu = None;
                                s.refresh_docks();
                            }
                            "commands" => {
                                s.composer.commands.insert(directory.into(), values);
                            }
                            "skills" => {
                                s.composer.skills.insert(directory.into(), values);
                            }
                            "files" => {
                                s.composer.files.insert(directory.into(), values);
                            }
                            "branches" => {
                                s.composer.branches.insert(directory.into(), values);
                            }
                            _ => crate::docks::receive(s, &tag, value),
                        }
                    } else if tag == "dock-reply" {
                        s.docks.sending = false;
                        s.refresh_docks();
                    }
                    if s.composer.menu.is_some() {
                        super::menus::filter(s);
                    }
                }
            },
        }
    }
    if s.composer.dock_revision != s.snapshot.revision {
        s.composer.dock_revision = s.snapshot.revision;
        if s.selected.is_some() {
            s.refresh_docks();
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn acknowledges_only_captured_revision_and_preserves_other_threads() {
        let mut store = Drafts::default();
        store.edit("a").edit.insert("first");
        store.touch("a");
        let revision = store.get("a").revision;
        store.edit("a").edit.insert(" newer");
        store.touch("a");
        store.edit("b").edit.insert("other");
        store.touch("b");
        store.acknowledge("a", revision);
        assert_eq!(store.get("a").edit.text, "first newer");
        store.acknowledge("a", store.get("a").revision);
        assert!(store.get("a").edit.text.is_empty());
        assert_eq!(store.get("b").edit.text, "other");
        assert_ne!(store.get("a").revision, revision);
    }
}
