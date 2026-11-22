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
                label(t, name, 12.0, 400.0, "text-tertiary")
                    .label(format!("Model: {name}"))
                    .help(format!("{} · {}", model.provider_id, model.id))
                    .truncate(),
            );
        }
        let mut header = row()
            .w_full()
            .padding(12.0)
            .gap(12.0)
            .center_y()
            .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
            .child(
                icon_button(t, &crate::icons::BACK, "Back to subagents").on_press(
                    |s: &mut State| {
                        s.workbench.reader = None;
                        s.workbench.reader_chat = Default::default();
                        s.workbench.reader_worker = None;
                    },
                ),
            )
            .child(detail);
        if chat.data.running {
            header = header.child(activity(s, "Responding"));
        }
        body = body
            .child(header)
            .child(crate::chat::reader(s, chat, s.panel_width().max(340.0)));
        if let Some(error) = &chat.data.error {
            body = body.child(label(t, error, 12.0, 400.0, "error").wrap());
        }
        let outcome = chat.data.info.as_ref().and_then(|i| i.outcome.as_deref());
        if !chat.data.running && outcome == Some("failed") {
            body = body.child(label(t, "This subagent run failed.", 12.0, 400.0, "error").px(16.0));
        }
        return body.child(super::reader_requests::permissions(s)).child(
            label(
                t,
                super::reader_requests::status(s).unwrap_or(if chat.data.running {
                    ""
                } else {
                    status(outcome)
                }),
                12.0,
                400.0,
                "text-tertiary",
            )
            .px(16.0)
            .py(12.0)
            .role("status"),
        );
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
        .px(12.0)
        .py(8.0)
        .gap(8.0)
        .center_y()
        .child(label(t, "Delegated sessions", 14.0, 500.0, "text").grow(1.0));
    for (filter, title) in [
        (
            false,
            format!(
                "All {}{}",
                s.workbench.agents.len(),
                if s.workbench.agent_cursor.is_some() {
                    "+"
                } else {
                    ""
                }
            ),
        ),
        (true, format!("Running {running}")),
    ] {
        bar = bar.child(
            super::documents::button(s, &title)
                .checked(s.workbench.agents_running_only == filter)
                .fill(t.c(if s.workbench.agents_running_only == filter {
                    "selected"
                } else {
                    "surface"
                }))
                .on_press(move |s: &mut State| s.workbench.agents_running_only = filter),
        );
    }
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
            .child(col().growth(GrowthSpec::default()).w_full().virtual_rows(
                indices.len(),
                62.0,
                move |s: &State, n| format!("agent-{}", s.workbench.agents[keys[n]]["id"]).into(),
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
                        .min_h(62.0)
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
                        .child(icon(&crate::icons::RIGHT, 16.0).color(s.theme.c("text-tertiary")))
                        .role("button")
                        .focusable(true)
                        .on_press(move |s: &mut State| s.open_workspace_reader(id.clone()))
                },
            )),
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
    el().size(8.0, 8.0)
        .radius(4.0)
        .fill(s.theme.c("accent-text"))
        .role("img")
        .label(name)
        .help(name)
}
