//! Reproducible local presentation states; network data still comes from the isolated gateway.
use super::{menus, state::Menu};
use crate::{OPTIONS, State};
use oc_gateway::{Gateway, prompt::Attachment};
use serde_json::Value;
use std::sync::Arc;

pub fn setup(s: &mut State) {
    let options = OPTIONS.get().unwrap();
    s.composer.providers = super::providers::load(&s.theme.tokens["text"], Arc::new(|| {}), true);
    s.selected = options.session.clone();
    if let (Some(url), Some(directory)) =
        (&options.gateway, s.project().map(|p| p.canonical.clone()))
    {
        let session = s.selected.clone();
        let client = Gateway::new(url, None).expect("capture gateway");
        let result = std::thread::spawn(move || tokio_capture(client, directory, session))
            .join()
            .expect("capture worker");
        match result {
            Ok(values) => {
                Arc::make_mut(&mut s.snapshot).live = true;
                for (tag, value) in values {
                    let items = value.as_array().cloned().unwrap_or_default();
                    if let Some((kind, directory)) = tag.split_once(':') {
                        match kind {
                            "commands" => {
                                s.composer.commands.insert(directory.into(), items);
                            }
                            "skills" => {
                                s.composer.skills.insert(directory.into(), items);
                            }
                            "files" => {
                                s.composer.files.insert(directory.into(), items);
                            }
                            "branches" => {
                                s.composer.branches.insert(directory.into(), items);
                            }
                            _ => crate::docks::receive(s, &tag, value),
                        }
                    }
                }
            }
            Err(error) => {
                eprintln!("Composer capture: {error}");
                std::process::exit(1);
            }
        }
    }
    let state = options.composer_state.as_str();
    match state {
        "focused" => s.draft_mut().edit.focused = true,
        "text" | "attachment" => {
            s.draft_mut()
                .edit
                .replace_text("Review the API changes and suggest a test plan.");
            s.draft_mut().edit.focused = true;
            s.touch_draft();
            if state == "attachment" {
                s.draft_mut().attachments.push(Attachment {
                    name: "notes.txt".into(),
                    mime: "text/plain".into(),
                    bytes: Arc::new(b"Golden attachment review notes".to_vec()),
                    thumbnail: None,
                });
            }
        }
        "model" | "filtered" => {
            s.composer.menu = Some(Menu::Models);
            if state == "filtered" {
                s.composer.search.replace_text("big");
            }
            s.composer.search.focused = true;
        }
        "slash" => {
            s.draft_mut().edit.replace_text("/");
            s.draft_mut().edit.focused = true;
            s.composer.menu = Some(Menu::Slash);
        }
        "mention" => {
            s.draft_mut().edit.replace_text("@");
            s.draft_mut().edit.focused = true;
            s.composer.menu = Some(Menu::Mention);
        }
        "worktree" => s.composer.menu = Some(Menu::Workspace),
        "fork" => {
            s.draft_mut().edit.replace_text("/fork");
            super::fork::open(s);
        }
        "context" => s.chat.context = true,
        "new-worktree" => s.draft_mut().worktree = true,
        "question-selected" | "question-review" => {
            crate::docks::capture_selection(s, state == "question-review")
        }
        _ => {}
    }
    menus::filter(s);
}
fn tokio_capture(
    client: Gateway,
    directory: String,
    session: Option<String>,
) -> Result<Vec<(String, Value)>, String> {
    oc_gateway::prompt::capture(client, directory, session)
}
