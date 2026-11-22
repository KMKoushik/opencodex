use crate::{State, icons as i, sidebar::label};
use oc_gateway::{
    timeline::{Kind, Row},
    types::Message,
};
use rune::{El, GrowthSpec, ScrollSpec, TextStyle, col, icon, row, text};
use serde_json::Value;
use std::sync::Arc;

pub fn activity(
    s: &State,
    id: &str,
    entries: &[Arc<Row>],
    summary: &str,
    active: bool,
    errors: usize,
) -> El {
    let t = &s.theme;
    let id = id.to_owned();
    let open = s.chat.open(&id);
    let mut header = row()
        .w_full()
        .min_h(32.0)
        .px(2.0)
        .py(4.0)
        .gap(8.0)
        .center_y()
        .child(label(
            t,
            if active { "Working" } else { summary },
            13.0,
            400.0,
            "text-secondary",
        ));
    if active {
        header = header
            .child(
                rune_kit::Spinner::new()
                    .size(12.0)
                    .color(t.c("text-tertiary"))
                    .build(&rune_kit::Kit::neutral(t.dark)),
            )
            .child(label(t, summary, 12.0, 400.0, "text-tertiary").truncate());
    }
    if errors > 0 {
        header = header.child(label(t, format!("{errors} failed"), 12.0, 400.0, "error"));
    }
    let mut group = col().w_full().min_w(0.0).child(
        header
            .role("button")
            .label(summary)
            .focusable(true)
            .expanded(open)
            .on_press_tx(move |s: &mut State, tx| {
                s.chat.toggle(&id);
                tx.instant();
            }),
    );
    if open {
        let mut content = col().w_full().pl(20.0).pt(4.0).pb(8.0);
        if entries.len() > 30 {
            // The web's >30 rule: only long step lists get their own bounded scroller.
            let entries = Arc::new(entries.to_vec());
            let count = entries.len();
            let keys = entries.clone();
            content = col()
                .w_full()
                .h(360.0)
                .scroll(ScrollSpec {
                    stick_bottom: false,
                })
                .child(content.growth(GrowthSpec::default()).virtual_rows(
                    count,
                    38.0,
                    move |_: &State, n| keys[n].id.clone().into(),
                    move |s: &State, n| work(s, &entries[n]),
                ));
        } else {
            for entry in entries {
                content = content.child(work(s, entry));
            }
        }
        group = group.child(content);
    }
    group
}
fn work(s: &State, r: &Row) -> El {
    let t = &s.theme;
    let open = s.chat.open(&r.id);
    let id = r.id.clone();
    match &r.kind {
        Kind::Reasoning { text: content, .. } => {
            let mut thought = text(if content.is_empty() {
                "Thinking…"
            } else {
                content
            })
            .font(TextStyle::new(12.0, 400.0).lh(18.6))
            .color(t.c("text-tertiary"))
            .wrap()
            .selectable(true);
            if !open {
                thought = thought.max_lines(2);
            }
            col()
                .key(id.clone())
                .w_full()
                .pl(2.0)
                .pr(8.0)
                .py(5.0)
                .radius(5.0)
                .child(thought)
                .role("button")
                .label("Thought")
                .expanded(open)
                .focusable(true)
                .on_press_tx(move |s: &mut State, tx| {
                    s.chat.toggle(&id);
                    tx.instant();
                })
        }
        Kind::Skill(m) => label(
            t,
            format!(
                "Used {}",
                m.fields
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("skill")
            ),
            12.0,
            400.0,
            "text-secondary",
        )
        .py(8.0),
        Kind::Tool(tool) => tool_row(s, &id, tool),
        _ => col(),
    }
}
fn tool_row(s: &State, id: &str, tool: &Value) -> El {
    let t = &s.theme;
    let open = s.chat.open(id);
    let name = tool["name"].as_str().unwrap_or("Tool");
    let state = &tool["state"];
    let input = &state["input"];
    let target = ["filePath", "path", "command", "pattern", "query"]
        .iter()
        .find_map(|key| input[*key].as_str())
        .unwrap_or(name);
    let (glyph, title, ink) = match name {
        "read" | "read_file" => (&super::icons::READ, "Read", "text-secondary"),
        "shell" | "bash" | "exec" | "execute" => (&super::icons::SHELL, "Run", "text-secondary"),
        "grep" | "glob" | "search" | "list" | "ls" => (&i::SEARCH, name, "activity-search"),
        "edit" | "write" | "patch" | "apply_patch" | "write_file" => {
            (&i::EDIT, name, "activity-edit")
        }
        "skill" => (&i::BOOK, "Skill", "activity-skill"),
        "question" => (&i::PLAN, "Question", "text-secondary"),
        _ => (&i::FOLDER, name, "text-secondary"),
    };
    let status = state["status"].as_str().unwrap_or("");
    let key = id.to_owned();
    let header = row()
        .w_full()
        .min_h(32.0)
        .px(2.0)
        .pr(8.0)
        .py(4.0)
        .gap(8.0)
        .center_y()
        .child(icon(if open { &i::DOWN } else { &i::RIGHT }, 12.0).color(t.c("text-tertiary")))
        .child(icon(glyph, 14.0).color(t.c(ink)))
        .child(label(t, title, 12.0, 400.0, "text-secondary"))
        .child(
            label(t, target, 11.0, 400.0, "text-tertiary")
                .font(TextStyle::new(11.0, 400.0).mono())
                .grow(1.0)
                .min_w(0.0)
                .truncate_fade(),
        )
        .child(if matches!(status, "error" | "completed") {
            icon(
                if status == "error" {
                    &super::icons::ALERT
                } else {
                    &super::icons::CHECK
                },
                13.0,
            )
            .color(t.c(if status == "error" {
                "error"
            } else {
                "text-tertiary"
            }))
        } else {
            label(
                t,
                if status == "running" {
                    "Running…"
                } else {
                    "Preparing…"
                },
                12.0,
                400.0,
                "text-tertiary",
            )
        })
        .role("button")
        .label(format!("{title} {target}"))
        .expanded(open)
        .focusable(true)
        .on_press_tx(move |s: &mut State, tx| {
            s.chat.toggle(&key);
            tx.instant();
        });
    let mut body = col().key(id).w_full().child(header);
    if open {
        let mut details = col()
            .w_full()
            .mt(4.0)
            .ml(22.0)
            .mr(8.0)
            .mb(12.0)
            .px(12.0)
            .py(10.0)
            .radius(8.0)
            .fill(t.c("secondary"))
            .child(label(t, "Input", 11.0, 400.0, "text-tertiary"))
            .child(pre(
                s,
                &if let Some(input) = input.as_str() {
                    input.into()
                } else {
                    serde_json::to_string_pretty(input).unwrap_or_default()
                },
            ));
        if status == "error" {
            details = details.child(
                label(
                    t,
                    state["error"]["message"].as_str().unwrap_or("Tool failed"),
                    12.0,
                    400.0,
                    "error",
                )
                .wrap(),
            );
        }
        if let Some(content) = state["content"].as_array() {
            for output in content {
                if let Some(content) = output["text"].as_str() {
                    details = details.child(pre(s, content));
                } else {
                    details = details.child(label(t, "File output", 12.0, 400.0, "text-tertiary"));
                }
            }
        }
        // Task calls expose the child conversation without reimplementing subagent execution.
        if let Some(session) = state["metadata"]["sessionId"]
            .as_str()
            .or_else(|| state["metadata"]["sessionID"].as_str())
        {
            let session = session.to_owned();
            details = details.child(
                label(t, "Open subagent conversation", 12.0, 500.0, "link")
                    .on_press(move |s: &mut State| s.open_session(Some(session.clone()))),
            );
        }
        body = body.child(details);
    }
    body
}
fn pre(s: &State, source: &str) -> El {
    col()
        .w_full()
        .max_h(320.0)
        .mt(10.0)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(
            text(source)
                .font(TextStyle::new(12.0, 400.0).mono().lh(19.2))
                .color(s.theme.c("text"))
                .wrap()
                .selectable(true),
        )
}
pub fn shell(s: &State, m: &Message) -> El {
    let cmd = m
        .fields
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or("");
    let output = m
        .fields
        .get("output")
        .and_then(|o| o["output"].as_str())
        .unwrap_or("");
    col()
        .w_full()
        .child(label(&s.theme, cmd, 12.0, 500.0, "text-secondary"))
        .child(pre(s, output))
}
