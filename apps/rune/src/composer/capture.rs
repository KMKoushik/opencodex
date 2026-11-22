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
                    if tag.starts_with("running-") {
                        super::running::receive(s, &tag, Ok(value));
                        continue;
                    }
                    let items = value.as_array().cloned().unwrap_or_default();
                    if let Some((kind, directory)) = tag.split_once(':') {
                        match kind {
                            "info" => {
                                s.draft_mut().model =
                                    serde_json::from_value(value["model"].clone()).ok();
                                s.draft_mut().full_access = value["permissions"]
                                    .as_array()
                                    .and_then(|p| p.last())
                                    .is_some_and(|r| {
                                        r["action"] == "*"
                                            && r["resource"] == "*"
                                            && r["effect"] == "allow"
                                    });
                            }
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
        "running" | "shell-output" => {
            s.composer.running.now = std::env::var("OPENCODEX_CAPTURE_NOW")
                .ok()
                .and_then(|n| n.parse::<u64>().ok())
                .unwrap_or_else(|| {
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64
                });
            s.composer.running.expanded = true;
            s.composer.running.tab_shell = Some(true);
            if state == "shell-output"
                && let Some(id) = s
                    .composer
                    .running
                    .shells
                    .first()
                    .and_then(|v| v["id"].as_str())
                    .map(str::to_owned)
            {
                super::running_output::open(s, &id);
                if let Some(url) = &options.gateway {
                    let directory = s.project().map(|p| p.canonical.clone()).unwrap_or_default();
                    let client = Gateway::new(url, None).expect("capture gateway");
                    let values = std::thread::spawn(move || {
                        tokio::runtime::Builder::new_current_thread()
                            .enable_all()
                            .build()
                            .unwrap()
                            .block_on(async {
                                let q = [("directory", directory.as_str())];
                                let info: Value = client.get(&format!("shells/{id}"), &q).await?;
                                let output: Value =
                                    client.get(&format!("shells/{id}/output"), &q).await?;
                                Ok::<_, String>((id, info, output))
                            })
                    })
                    .join()
                    .unwrap()
                    .expect("capture shell output");
                    super::running_output::receive(
                        s,
                        &format!("running-info/{}", values.0),
                        Ok(values.1),
                    );
                    super::running_output::receive(
                        s,
                        &format!("running-output/{}", values.0),
                        Ok(values.2),
                    );
                }
            }
        }
        "new-worktree" => s.draft_mut().worktree = true,
        "question-selected" | "question-review" => {
            crate::docks::capture_selection(s, state == "question-review")
        }
        _ => {}
    }
    menus::filter(s);
    // Explicit capture-only opt-in: scripted request clicks may reach the local
    // recorded-response server, never a live/user gateway. Normal app startup is unchanged.
    if std::env::var("OPENCODEX_CAPTURE_MUTATIONS").as_deref() == Ok("1") {
        if let Some(directory) = s.project().map(|p| p.canonical.clone()) {
            s.composer.loaded.insert(directory);
        }
        let url = options.gateway.as_deref().expect("capture gateway");
        assert!(
            url == "http://127.0.0.1:4542",
            "capture mutations require the isolated replay server"
        );
        s.composer.worker = Some(oc_gateway::prompt::PromptWorker::start(
            Gateway::new(url, None).unwrap(),
            || {},
        ));
    }
}
fn tokio_capture(
    client: Gateway,
    directory: String,
    session: Option<String>,
) -> Result<Vec<(String, Value)>, String> {
    let mut values =
        oc_gateway::prompt::capture(client.clone(), directory.clone(), session.clone())?;
    if let Some(id) = session {
        let more = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?
            .block_on(async {
                let shells: Value = client
                    .get("shells", &[("directory", directory.as_str())])
                    .await?;
                let agents: Value = client.get(&format!("sessions/{id}/subagents"), &[]).await?;
                let info: Value = client.get(&format!("sessions/{id}"), &[]).await?;
                Ok::<_, String>(vec![
                    (format!("info:{id}"), info),
                    (format!("running-shells:{id}"), shells),
                    (format!("running-agents:{id}"), agents),
                ])
            })?;
        values.extend(more);
    }
    Ok(values)
}
