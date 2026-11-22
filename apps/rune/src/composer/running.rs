use crate::{State, sidebar::label};
use oc_gateway::prompt::Request;
use rune::{El, col, row};
use serde_json::{Value, json};

#[derive(Default)]
pub struct Running {
    pub revision: u64,
    pub inbox: Vec<oc_gateway::timeline::Row>,
    pub session: String,
    pub moving: bool,
    pub error: Option<String>,
    pub expanded: bool,
    pub shells: Vec<Value>,
    pub agents: Vec<Value>,
    pub shell_error: Option<String>,
    pub agent_error: Option<String>,
    pub tab_shell: Option<bool>,
    pub loaded_session: String,
    pub loaded_revision: u64,
    pub pending: std::collections::BTreeSet<String>,
    pub output: Option<super::running_output::Output>,
    pub next_refresh: Option<std::time::Instant>,
    pub now: u64,
    pub attention: std::collections::BTreeMap<String, [Option<Result<bool, String>>; 2]>,
}
pub fn poll(s: &mut State, tx: &mut rune::Tx) -> bool {
    let Some(id) = s.selected.clone() else {
        return false;
    };
    if s.composer.worker.is_none() {
        return false;
    }
    let now = std::time::Instant::now();
    let running = &s.composer.running;
    let refresh = running.loaded_session != id
        || running.loaded_revision != s.snapshot.revision
        || running.next_refresh.is_none_or(|due| now >= due);
    if refresh {
        let changed_session = s.composer.running.loaded_session != id;
        if changed_session {
            if s.composer.menu == Some(super::state::Menu::ShellOutput) {
                s.composer.menu = None;
            }
            let r = &mut s.composer.running;
            r.shells.clear();
            r.agents.clear();
            r.output = None;
            r.moving = false;
            r.error = None;
            r.attention.clear();
            r.tab_shell = None;
            r.shell_error = None;
            r.agent_error = None;
        }
        s.composer.running.loaded_session = id.clone();
        s.composer.running.loaded_revision = s.snapshot.revision;
        s.composer.running.next_refresh = Some(now + std::time::Duration::from_secs(5));
        if let Some(directory) = s.project().map(|p| p.canonical.clone()) {
            get(
                s,
                "shells",
                "shells".into(),
                vec![("directory".into(), directory)],
            );
        }
        get(s, "agents", format!("sessions/{id}/subagents"), vec![]);
    }
    tx.wake_after(std::time::Duration::from_secs(5));
    super::running_output::poll(s, tx);
    let visible = s.composer.running.expanded
        && (!s.composer.running.shells.is_empty() || !s.composer.running.agents.is_empty())
        || s.composer.running.output.is_some();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        * 1000;
    let changed = visible && s.composer.running.now != now;
    if visible {
        s.composer.running.now = now;
        tx.wake_after(std::time::Duration::from_secs(1));
    }
    changed
}
pub(super) fn elapsed(now: u64, started: u64) -> String {
    let seconds = ((now.saturating_sub(started) as f64) / 1000.0).round() as u64;
    if seconds < 60 {
        format!("{seconds}s")
    } else if seconds < 3600 {
        if seconds % 60 == 0 {
            format!("{}m", seconds / 60)
        } else {
            format!("{}m {}s", seconds / 60, seconds % 60)
        }
    } else if seconds % 3600 < 60 {
        format!("{}h", seconds / 3600)
    } else {
        format!("{}h {}m", seconds / 3600, (seconds % 3600) / 60)
    }
}
pub fn get(s: &mut State, kind: &str, path: String, query: Vec<(String, String)>) {
    let tag = format!("running-{kind}:{}", s.selected.as_deref().unwrap_or(""));
    if s.composer.running.pending.contains(&tag) {
        return;
    }
    if s.prompt_request(Request::Get {
        tag: tag.clone(),
        path,
        query,
    }) {
        s.composer.running.pending.insert(tag);
    }
}
pub fn blocking(s: &State) -> Vec<&Value> {
    if !s.chat.data.running {
        return vec![];
    }
    let Some(last) = s
        .chat
        .data
        .visible()
        .iter()
        .rev()
        .find(|m| m.r#type == "assistant")
        .filter(|m| m.time.completed.is_none())
    else {
        return vec![];
    };
    last.fields
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|part| {
            part["type"] == "tool"
                && part["state"]["status"] == "running"
                && (part["name"] == "shell" || part["name"] == "subagent")
        })
        .collect()
}
pub fn background(s: &mut State) {
    if s.composer.running.moving {
        return;
    }
    if let Some(id) = s.selected.clone()
        && s.prompt_request(Request::Mutate {
            tag: format!("background:{id}"),
            path: format!("sessions/{id}/background"),
            body: json!({}),
            delete: false,
        })
    {
        s.composer.running.moving = true;
        s.composer.running.error = None;
    }
}
pub fn receive(s: &mut State, tag: &str, result: Result<Value, String>) {
    s.composer.running.pending.remove(tag);
    let Some((kind, id)) = tag.split_once(':') else {
        return;
    };
    if s.selected.as_deref() != Some(id) {
        return;
    }
    if kind.starts_with("running-output")
        || kind.starts_with("running-info")
        || kind.starts_with("running-stop")
    {
        super::running_output::receive(s, kind, result);
        return;
    }
    if let Some((kind, child)) = kind.split_once('/')
        && (kind == "running-child-permissions" || kind == "running-child-forms")
    {
        let entry = s
            .composer
            .running
            .attention
            .entry(child.into())
            .or_default();
        entry[usize::from(kind == "running-child-forms")] =
            Some(result.map(|v| v.as_array().is_some_and(|a| !a.is_empty())));
        return;
    }
    if kind == "running-shells" || kind == "running-agents" {
        let shells = kind == "running-shells";
        match result {
            Ok(value) => {
                let items = value
                    .as_array()
                    .or_else(|| value["sessions"].as_array())
                    .cloned()
                    .unwrap_or_default();
                if shells {
                    s.composer.running.shells = items
                        .into_iter()
                        .filter(|v| v["status"] == "running" && v["metadata"]["sessionID"] == id)
                        .collect();
                    s.composer.running.shell_error = None;
                } else {
                    s.composer.running.agents = items
                        .into_iter()
                        .filter(|v| {
                            v["id"]
                                .as_str()
                                .is_some_and(|id| s.snapshot.active.contains(id))
                        })
                        .collect();
                    s.composer
                        .running
                        .agents
                        .sort_by_key(|v| v["time"]["created"].as_u64().unwrap_or(0));
                    s.composer.running.agent_error = None;
                }
            }
            Err(error) => {
                if shells {
                    s.composer.running.shell_error = Some(error);
                } else {
                    s.composer.running.agent_error = Some(error);
                }
            }
        }
        if !shells && s.composer.worker.is_some() {
            let ids = s
                .composer
                .running
                .agents
                .iter()
                .filter_map(|v| v["id"].as_str().map(str::to_owned))
                .collect::<std::collections::BTreeSet<_>>();
            s.composer
                .running
                .attention
                .retain(|id, _| ids.contains(id));
            for id in ids {
                for kind in ["permissions", "forms"] {
                    get(
                        s,
                        &format!("child-{kind}/{id}"),
                        format!("sessions/{id}/{kind}"),
                        vec![],
                    );
                }
            }
        }
        return;
    }
    if kind == "background" {
        s.composer.running.moving = false;
    }
    match result {
        Ok(Value::Array(items)) if kind == "inbox" => {
            s.composer.running.revision = s.composer.running.revision.wrapping_add(1);
            s.composer.running.session = id.into();
            s.composer.running.inbox = items
                .into_iter()
                .filter(|item| item["type"] == "user")
                .filter_map(|mut item| {
                    let mut payload = item["payload"].take();
                    payload["id"] = item["id"].take();
                    payload["time"] = item["time"].take();
                    payload["type"] = json!("user");
                    let message: oc_gateway::types::Message =
                        serde_json::from_value(payload).ok()?;
                    Some(oc_gateway::timeline::Row {
                        id: message.id.clone(),
                        version: s.snapshot.revision,
                        kind: oc_gateway::timeline::Kind::Message(std::sync::Arc::new(message)),
                    })
                })
                .collect();
        }
        Err(e) => {
            s.composer.running.error = Some(if kind == "background" {
                format!("Could not move work to the background. {e}")
            } else {
                e
            })
        }
        _ => {}
    }
}
pub fn has_inbox(s: &State) -> bool {
    s.selected.as_deref() == Some(&s.composer.running.session)
        && s.composer.running.inbox.iter().any(|item| {
            !s.chat
                .data
                .messages
                .iter()
                .any(|message| message.id == item.id)
        })
}
pub fn inbox(s: &State) -> El {
    let t = &s.theme;
    let mut out = col().w_full().gap(8.0);
    if s.selected.as_deref() == Some(&s.composer.running.session) {
        for item in s
            .composer
            .running
            .inbox
            .iter()
            .filter(|i| !s.chat.data.messages.iter().any(|m| i.id == m.id))
        {
            out = out.child(
                col()
                    .w_full()
                    .items_end()
                    .child(crate::chat::conversation_row(
                        s,
                        item,
                        (s.window_size.0 - s.sidebar_width() - 44.0).min(768.0),
                        false,
                    ))
                    .child(label(
                        t,
                        "Pending in OpenCode",
                        12.0,
                        400.0,
                        "text-tertiary",
                    )),
            );
        }
    }
    out
}
pub fn view(s: &State) -> El {
    activity(s)
}
fn child_attention<'a>(r: &'a Running, id: &str) -> Option<&'a str> {
    let pair = r.attention.get(id)?;
    if pair.iter().flatten().any(Result::is_err) {
        return Some("error");
    }
    if matches!(pair[0], Some(Ok(true))) {
        return Some("permission");
    }
    if matches!(pair[1], Some(Ok(true))) {
        return Some("question");
    }
    None
}
fn activity(s: &State) -> El {
    let t = &s.theme;
    let r = &s.composer.running;
    let parts = blocking(s);
    let mut out = col().w_full();
    if !r.shells.is_empty()
        || !r.agents.is_empty()
        || r.shell_error.is_some()
        || r.agent_error.is_some()
    {
        let shell = r
            .tab_shell
            .unwrap_or(r.agents.is_empty() && r.agent_error.is_none());
        let mut tabs = row()
            .gap(4.0)
            .center_y()
            .role("tablist")
            .label("Running activity")
            .focus_group()
            .focus_follows();
        for (name, is_shell, count, failed) in [
            ("Subagents", false, r.agents.len(), r.agent_error.is_some()),
            ("Shell", true, r.shells.len(), r.shell_error.is_some()),
        ] {
            let title = format!(
                "{name} ({})",
                if failed {
                    "?".into()
                } else {
                    count.to_string()
                }
            );
            let alert = if failed
                || (!is_shell
                    && r.agents.iter().any(|v| {
                        child_attention(r, v["id"].as_str().unwrap_or("")) == Some("error")
                    })) {
                Some("error")
            } else if !is_shell
                && r.agents.iter().any(|v| {
                    child_attention(r, v["id"].as_str().unwrap_or("")) == Some("permission")
                })
            {
                Some("permission")
            } else if !is_shell
                && r.agents
                    .iter()
                    .any(|v| child_attention(r, v["id"].as_str().unwrap_or("")) == Some("question"))
            {
                Some("question")
            } else {
                None
            };
            tabs = tabs.child(
                row()
                    .gap(6.0)
                    .child(
                        rune::icon(
                            if is_shell {
                                &crate::chat::icons::SHELL
                            } else {
                                &crate::chat::icons::SUBAGENTS
                            },
                            14.0,
                        )
                        .color(t.c(if shell == is_shell {
                            "text"
                        } else {
                            "text-tertiary"
                        })),
                    )
                    .child(label(
                        t,
                        &title,
                        12.0,
                        500.0,
                        if shell == is_shell {
                            "text"
                        } else {
                            "text-tertiary"
                        },
                    ))
                    .children(alert.map(|kind| {
                        label(
                            t,
                            if kind == "question" { "?" } else { "!" },
                            9.0,
                            700.0,
                            "surface",
                        )
                        .size(12.0, 12.0)
                        .center()
                        .radius(6.0)
                        .fill(t.c(if kind == "error" {
                            "error"
                        } else if kind == "permission" {
                            "warning"
                        } else {
                            "accent"
                        }))
                    }))
                    .key(if is_shell {
                        "running-shell-tab"
                    } else {
                        "running-agents-tab"
                    })
                    .h(30.0)
                    .px(8.0)
                    .center_y()
                    .radius(7.0)
                    .fill(t.c(if shell == is_shell {
                        "selected"
                    } else {
                        "surface-under"
                    }))
                    .hover(t.c("hover"))
                    .role("tab")
                    .focusable(true)
                    .focus_selected(shell == is_shell)
                    .on_press(move |s: &mut State| {
                        s.composer.running.tab_shell = Some(is_shell);
                        s.composer.running.expanded = true;
                    }),
            );
        }
        let mut header = row().w_full().gap(4.0).center_y().child(tabs.grow(1.0));
        if !parts.is_empty() {
            header = header.child(
                label(
                    t,
                    if r.moving {
                        "Moving…"
                    } else {
                        "Move to background"
                    },
                    12.0,
                    500.0,
                    "text-secondary",
                )
                .h(30.0)
                .px(8.0)
                .center_y()
                .role("button")
                .focusable(true)
                .disabled(r.moving)
                .on_press(background),
            );
        }
        header = header.child(
            crate::sidebar::icon_button_size(
                t,
                if r.expanded {
                    &crate::icons::DOWN
                } else {
                    &crate::icons::RIGHT
                },
                if r.expanded {
                    "Collapse running activity"
                } else {
                    "Expand running activity"
                },
                14.0,
            )
            .on_press(|s: &mut State| s.composer.running.expanded = !s.composer.running.expanded),
        );
        let mut tray = col()
            .w_full()
            .px(6.0)
            .pt(4.0)
            .pb(18.0)
            .radius(14.0)
            .fill(t.c("surface-under"))
            .border(1.0, t.c("border"))
            .child(header);
        if r.expanded {
            let items = if shell { &r.shells } else { &r.agents };
            let error = if shell {
                &r.shell_error
            } else {
                &r.agent_error
            };
            let height = r
                .shells
                .len()
                .max(r.agents.len())
                .max(if error.is_some() { 2 } else { 1 })
                .min(4) as f32
                * 30.0
                + 4.0;
            let mut rows = col().w_full();
            if error.is_some() {
                rows = rows
                    .child(
                        label(
                            t,
                            if shell {
                                "Could not check running shell commands"
                            } else {
                                "Could not check running subagents"
                            },
                            12.0,
                            400.0,
                            "error",
                        )
                        .padding(8.0),
                    )
                    .child(
                        label(t, "Retry", 12.0, 500.0, "text")
                            .role("button")
                            .focusable(true)
                            .on_press(|s: &mut State| s.composer.running.next_refresh = None),
                    );
            } else if items.is_empty() {
                rows = rows.child(
                    label(
                        t,
                        if shell {
                            "No running shell commands"
                        } else {
                            "No running subagents"
                        },
                        12.0,
                        400.0,
                        "text-tertiary",
                    )
                    .padding(8.0),
                );
            }
            for item in items {
                let id = item["id"].as_str().unwrap_or("").to_owned();
                let title = if shell {
                    item["command"].as_str()
                } else {
                    Some(
                        item["title"]
                            .as_str()
                            .filter(|v| !v.is_empty())
                            .unwrap_or("Untitled subagent"),
                    )
                }
                .unwrap_or("");
                let attention = if shell { None } else { child_attention(r, &id) };
                let meta = match attention {
                    Some("permission") => "Needs approval".into(),
                    Some("question") => "Has a question".into(),
                    Some("error") => "Could not check requests".into(),
                    _ if !shell && !item["time"]["idle"].is_null() => "Working".into(),
                    _ => item["time"]["started"]
                        .as_u64()
                        .or_else(|| item["time"]["created"].as_u64())
                        .map(|start| elapsed(r.now, start))
                        .unwrap_or("Working".into()),
                };
                let agent = item["agent"]
                    .as_str()
                    .filter(|v| !v.is_empty())
                    .map(|name| {
                        let mut chars = name.chars();
                        format!("{}{}", chars.next().unwrap().to_uppercase(), chars.as_str())
                    })
                    .unwrap_or("Subagent".into());
                let foreground =
                    parts.iter().any(|p| {
                        if shell {
                            p["name"] == "shell"
                                && p["state"]["metadata"]["shellID"]
                                    .as_str()
                                    .map(|shell_id| shell_id == id)
                                    .unwrap_or_else(|| {
                                        p["state"]["input"]["command"].as_str().is_some_and(
                                            |command| Some(command) == item["command"].as_str(),
                                        )
                                    })
                        } else {
                            p["name"] == "subagent" && p["state"]["metadata"]["sessionID"] == id
                        }
                    });
                rows = rows.child(
                    row()
                        .key(format!("running-item-{id}"))
                        .w_full()
                        .h(30.0)
                        .px(8.0)
                        .gap(8.0)
                        .center_y()
                        .radius(8.0)
                        .hover(t.c("hover"))
                        .role("button")
                        .label(if shell {
                            format!("View output: {title}")
                        } else {
                            title.into()
                        })
                        .focusable(true)
                        .child(if matches!(attention, Some("permission" | "question")) {
                            label(
                                t,
                                if attention == Some("permission") {
                                    "!"
                                } else {
                                    "?"
                                },
                                9.0,
                                700.0,
                                "surface",
                            )
                            .size(12.0, 12.0)
                            .center()
                            .radius(6.0)
                            .fill(t.c(
                                if attention == Some("permission") {
                                    "warning"
                                } else {
                                    "accent"
                                },
                            ))
                        } else {
                            activity_spinner(t)
                        })
                        .children((!shell).then(|| label(t, &agent, 13.0, 500.0, "text")))
                        .child(
                            label(t, title, 12.0, 400.0, "text-secondary")
                                .font(
                                    rune::TextStyle::new(if shell { 12.0 } else { 13.0 }, 400.0)
                                        .family(if shell {
                                            rune::Family::Mono
                                        } else {
                                            rune::Family::Sans
                                        }),
                                )
                                .grow(1.0)
                                .min_w(0.0)
                                .truncate(),
                        )
                        .child(
                            label(
                                t,
                                if foreground {
                                    "Foreground"
                                } else {
                                    "Background"
                                },
                                11.0,
                                500.0,
                                if foreground {
                                    "accent-text"
                                } else {
                                    "text-tertiary"
                                },
                            )
                            .px(6.0)
                            .py(1.0)
                            .radius(6.0)
                            .fill(t.c(if foreground {
                                "accent-soft"
                            } else {
                                "hover"
                            })),
                        )
                        .child(label(
                            t,
                            &meta,
                            12.0,
                            400.0,
                            match attention {
                                Some("permission") => "warning",
                                Some("question") => "accent-text",
                                Some("error") => "error",
                                _ => "text-tertiary",
                            },
                        ))
                        .child(rune::icon(&crate::icons::RIGHT, 14.0).color(t.c("text-secondary")))
                        .on_press(move |s: &mut State| {
                            if shell {
                                super::running_output::open(s, &id);
                            } else {
                                s.open_workspace_reader(id.clone());
                            }
                        }),
                );
            }
            tray = tray.child(
                rune::el()
                    .w_full()
                    .h(height)
                    .pt(4.0)
                    .scroll(rune::ScrollSpec {
                        stick_bottom: false,
                    })
                    .child(rows),
            );
        }
        out = out.child(rune::el().w_full().px(14.0).mb(-14.0).child(tray));
    }
    if let Some(error) = &r.error {
        out = out.child(label(t, error, 12.0, 400.0, "error").wrap());
    }
    out
}
fn activity_spinner(t: &crate::theme::Theme) -> El {
    const SPINNER: rune::Icon = rune::Icon {
        name: "running-activity",
        view: 24.0,
        body: r#"<path d="M12 3a9 9 0 1 1-9 9" fill="none" stroke="currentColor" stroke-width="3"/>"#,
    };
    rune::icon(&SPINNER, 10.0)
        .color(t.c("text-secondary"))
        .looping(rune::LoopSpec::rotation(0.9))
}
