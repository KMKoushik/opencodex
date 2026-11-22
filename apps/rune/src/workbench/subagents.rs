use crate::{
    State,
    sidebar::{icon_button, label},
};
use rune::{El, GrowthSpec, ScrollSpec, col, el, icon, row};

pub fn view(s: &State) -> El {
    let t = &s.theme;
    let mut body = col().grow(1.0).min_h(0.0).w_full();
    if s.workbench.reader.is_some() {
        let chat = &s.workbench.reader_chat;
        let mut detail = col().grow(1.0).min_w(0.0).gap(4.0).child(
            label(
                t,
                chat.data
                    .info
                    .as_ref()
                    .and_then(|i| i.title.as_deref())
                    .unwrap_or("Subagent session"),
                14.0,
                500.0,
                "text",
            )
            .truncate(),
        );
        if let Some(model) = chat.data.info.as_ref().and_then(|i| i.model.as_ref()) {
            let name = s
                .snapshot
                .models
                .values()
                .flat_map(|c| &c.data)
                .find(|m| m.id == model.id && m.provider_id == model.provider_id)
                .map(|m| m.name.as_str())
                .unwrap_or(&model.id);
            detail = detail.child(
                row()
                    .gap(6.0)
                    .center_y()
                    .min_w(0.0)
                    .child(provider(s, &model.provider_id, 14.0))
                    .child(
                        label(t, name, 12.0, 400.0, "text-tertiary")
                            .label(format!("Model: {name}"))
                            .help(format!("{} · {}", model.provider_id, model.id))
                            .truncate(),
                    ),
            );
        }
        let mut header = row()
            .w_full()
            .padding(12.0)
            .gap(12.0)
            .center_y()
            .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
            .border_layout()
            .child(
                icon_button(t, &crate::icons::BACK, "Back to subagents")
                    .key("subagents-back")
                    .autofocus()
                    .on_press_tx(|s: &mut State, tx| {
                        s.workbench.reader = None;
                        s.workbench.reader_chat = Default::default();
                        s.workbench.reader_worker = None;
                        tx.focus("subagents-heading", false);
                    }),
            )
            .child(detail);
        if chat.data.running {
            header = header.child(activity(s, "Responding"));
        }
        // Timeline's footer belongs to the scroll content, not a fixed bottom dock.
        let mut footer = col().w_full().px(16.0).pb(20.0).gap(8.0);
        if let Some(error) = &chat.data.error {
            footer = footer
                .child(label(t, error, 12.0, 400.0, "error").wrap())
                .child(
                    super::documents::button(s, "Retry").on_press(|s: &mut State| {
                        if let (Some(id), Some(worker)) =
                            (&s.workbench.reader, &s.workbench.reader_worker)
                        {
                            let command = if s.workbench.reader_chat.rows.is_empty() {
                                oc_gateway::Command::OpenSession(id.clone())
                            } else {
                                oc_gateway::Command::EarlierMessages(id.clone())
                            };
                            if let Err(error) = worker.command(command) {
                                s.workbench.error = Some(error);
                            }
                        }
                    }),
                );
        }
        let outcome = chat.data.info.as_ref().and_then(|i| i.outcome.as_deref());
        if !chat.data.running && outcome == Some("failed") {
            footer = footer.child(label(t, "This subagent run failed.", 12.0, 400.0, "error"));
        }
        if !s.workbench.requests.permissions.is_empty() {
            footer = footer.child(super::reader_requests::permissions(s));
        }
        footer = footer.child(
            label(
                t,
                super::reader_requests::status(s).unwrap_or(if chat.data.running {
                    ""
                } else {
                    match outcome {
                        Some("succeeded") => "Completed",
                        Some("interrupted") => "Stopped",
                        _ => "Idle",
                    }
                }),
                12.0,
                400.0,
                "text-tertiary",
            )
            .h(20.0)
            .role("status"),
        );
        return body
            .child(header)
            .child(super::sessions::reader(s).child(footer));
    }
    let running = s
        .workbench
        .agents
        .iter()
        .filter(|v| {
            v["id"]
                .as_str()
                .is_some_and(|id| s.snapshot.active.contains(id))
        })
        .count();
    let mut bar = row()
        .w_full()
        .px(10.0)
        .py(5.0)
        .gap(8.0)
        .center_y()
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
        .child(
            label(t, "Delegated sessions", 14.0, 500.0, "text")
                .grow(1.0)
                .key("subagents-heading")
                .focusable(true),
        );
    let mut filters = row()
        .gap(2.0)
        .padding(2.0)
        .radius(9.0)
        .fill(t.c("well"))
        .role("radiogroup")
        .label("Show subagents");
    for (filter, title, count) in [
        (
            false,
            "All",
            format!(
                "{}{}",
                s.workbench.agents.len(),
                if s.workbench.agent_cursor.is_some() {
                    "+"
                } else {
                    ""
                }
            ),
        ),
        (true, "Running", running.to_string()),
    ] {
        let selected = s.workbench.agents_running_only == filter;
        let button = row()
            .h(26.0)
            .px(10.0)
            .gap(6.0)
            .center_y()
            .radius(7.0)
            .child(label(
                t,
                title,
                12.0,
                500.0,
                if selected { "text" } else { "text-secondary" },
            ))
            .child(
                label(t, count, 10.5, 500.0, "text-secondary")
                    .font(rune::TextStyle {
                        family: rune::Family::Mono,
                        ..rune::TextStyle::new(10.5, 500.0)
                    })
                    .px(5.0)
                    .radius(4.0)
                    .fill(t.c("secondary")),
            )
            .role("radio")
            .checked(selected)
            .focusable(true)
            .key(if filter {
                "agents-running"
            } else {
                "agents-all"
            })
            .on_press(move |s: &mut State| s.workbench.agents_running_only = filter)
            .on_key(move |s: &mut State, key, tx| {
                if matches!(
                    key.key,
                    rune::Key::Left | rune::Key::Right | rune::Key::Up | rune::Key::Down
                ) {
                    s.workbench.agents_running_only = !filter;
                    tx.focus(
                        if filter {
                            "agents-all"
                        } else {
                            "agents-running"
                        },
                        true,
                    );
                    true
                } else {
                    false
                }
            });
        filters = filters.child(if selected {
            t.shadow(t.paint(button, "glaze"), "glaze-shadow")
        } else {
            button
        });
    }
    bar = bar.child(t.shadow(filters, "well-shadow"));
    body = body.child(bar);
    if s.workbench.pending.contains("agents") && s.workbench.agents.is_empty() {
        return body.child(
            label(t, "Loading subagents…", 12.0, 400.0, "text-tertiary")
                .padding(12.0)
                .role("status"),
        );
    }
    let indices: Vec<_> = s
        .workbench
        .agents
        .iter()
        .enumerate()
        .filter(|(_, v)| {
            !s.workbench.agents_running_only
                || v["id"]
                    .as_str()
                    .is_some_and(|id| s.snapshot.active.contains(id))
        })
        .map(|(i, _)| i)
        .collect();
    if indices.is_empty() {
        return body.child(super::view::empty_state(
            s,
            &crate::chat::icons::SUBAGENTS,
            if s.workbench.agents.is_empty() {
                "No subagents yet"
            } else {
                "No subagents running"
            },
            if s.workbench.agents.is_empty() {
                "Delegated sessions will appear here as the agent starts them."
            } else {
                "Subagents the agent is running now will appear here."
            },
        ));
    }
    let keys = indices.clone();
    body = body.child(
        col()
            .grow(1.0)
            .min_h(0.0)
            .scroll(ScrollSpec {
                stick_bottom: false,
            })
            .child(
                col()
                    .growth(GrowthSpec::default())
                    .w_full()
                    .virtual_rows(
                        indices.len(),
                        62.0,
                        move |s: &State, n| {
                            format!("agent-{}", s.workbench.agents[keys[n]]["id"]).into()
                        },
                        move |s: &State, n| {
                            let v = &s.workbench.agents[indices[n]];
                            let id = v["id"].as_str().unwrap_or("").to_owned();
                            let running = s.snapshot.active.contains(&id);
                            let mut meta = row()
                                .gap(6.0)
                                .center_y()
                                .child(
                                    label(
                                        &s.theme,
                                        v["agent"]
                                            .as_str()
                                            .filter(|s| !s.is_empty())
                                            .unwrap_or("Subagent"),
                                        12.0,
                                        400.0,
                                        "text-tertiary",
                                    )
                                    .truncate(),
                                )
                                .child(label(&s.theme, "·", 12.0, 400.0, "text-tertiary"));
                            meta = meta.child(if running {
                                activity(s, "Running")
                            } else {
                                label(
                                    &s.theme,
                                    status(v["outcome"].as_str()),
                                    12.0,
                                    400.0,
                                    if v["outcome"] == "failed" {
                                        "error"
                                    } else {
                                        "text-tertiary"
                                    },
                                )
                            });
                            row()
                                .w_full()
                                .px(12.0)
                                .py(10.0)
                                .gap(10.0)
                                .hover(s.theme.c("hover"))
                                .child(
                                    el().size(28.0, 28.0)
                                        .radius(14.0)
                                        .fill(s.theme.c("accent-soft"))
                                        .center()
                                        .child(
                                            icon(&crate::chat::icons::SUBAGENTS, 18.0)
                                                .color(s.theme.c("accent-text")),
                                        ),
                                )
                                .child(
                                    col()
                                        .grow(1.0)
                                        .min_w(0.0)
                                        .child(
                                            label(
                                                &s.theme,
                                                v["title"]
                                                    .as_str()
                                                    .filter(|s| !s.is_empty())
                                                    .unwrap_or("Untitled subagent"),
                                                s.prefs.chat_font_size.unwrap_or(14.0),
                                                400.0,
                                                "text-secondary",
                                            )
                                            .truncate(),
                                        )
                                        .child(meta),
                                )
                                .child(
                                    icon(&crate::icons::RIGHT, 16.0)
                                        .color(s.theme.c("text-tertiary"))
                                        .self_center(),
                                )
                                .role("button")
                                .focusable(true)
                                .on_press_tx(move |s: &mut State, tx| {
                                    s.open_workspace_reader(id.clone());
                                    tx.focus("subagents-back", false);
                                })
                        },
                        // Active-session events must invalidate cached virtual rows too: otherwise
                        // a completed session keeps its old spinning indicator indefinitely.
                    )
                    .virtual_rows_version(s.snapshot.revision),
            ),
    );
    if s.workbench.agent_cursor.is_some() {
        let pending = s.workbench.pending.contains("agents-more");
        body = body.child(
            super::documents::button(
                s,
                if pending {
                    "Loading…"
                } else {
                    "Load more subagents"
                },
            )
            .disabled(pending)
            .on_press(|s: &mut State| {
                if let (Some(id), Some(cursor)) =
                    (s.selected.clone(), s.workbench.agent_cursor.clone())
                {
                    s.workspace_get(
                        "agents-more",
                        format!("sessions/{id}/subagents"),
                        vec![("cursor".into(), cursor)],
                        true,
                    );
                }
            }),
        );
    }
    body
}
fn status(outcome: Option<&str>) -> &'static str {
    match outcome {
        Some("succeeded") => "Completed",
        Some("failed") => "Failed",
        Some("interrupted") => "Stopped",
        _ => "Idle",
    }
}
pub fn activity(s: &State, name: &str) -> El {
    el().size(10.0, 10.0)
        // Never transfer the loop's cooling rotation to the replacement Idle text.
        .key("session-activity")
        .transition(rune::Transition::none())
        .radius(5.0)
        .border(1.5, s.theme.c("border-heavy"))
        .child(
            el().size(10.0, 10.0)
                .radius(5.0)
                .border_sides([1.5, 1.5, 0.0, 0.0], s.theme.c("text-secondary")),
        )
        // Only mounted running rows/header/tab indicators construct this element.
        // Rune suspends its own loop when it is not visible; no application timer.
        .looping(rune::LoopSpec::rotation(0.9))
        .role("img")
        .label(name)
        .help(name)
}

pub fn provider(s: &State, provider: &str, size: f32) -> El {
    let alias = match provider {
        "codex" | "chatgpt" => "openai",
        "claude" => "anthropic",
        "gemini" | "google-vertex" => "google",
        "copilot" | "github-copilot-enterprise" => "github-copilot",
        "ollama-cloud" => "ollama",
        "azure-cognitive-services" => "azure",
        id => id,
    };
    if let Some(image) = s.composer.providers.get(alias) {
        el().size(size, size).pixels(image.pixels())
    } else {
        label(
            &s.theme,
            &provider
                .chars()
                .next()
                .unwrap_or('?')
                .to_uppercase()
                .to_string(),
            size * 0.7,
            500.0,
            "text-tertiary",
        )
        .size(size, size)
    }
}
