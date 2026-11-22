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
    reader: bool,
) -> El {
    let t = &s.theme;
    let id = id.to_owned();
    let open = super::conversation(s, reader).open(&id);
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
        header = header.child(label(t, summary, 12.0, 400.0, "text-tertiary").truncate());
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
                super::conversation_mut(s, reader).toggle(&id);
                tx.keep_on_screen(id.clone());
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
                    move |s: &State, n| work(s, &entries[n], reader),
                ));
        } else {
            for entry in entries {
                content = content.child(work(s, entry, reader));
            }
        }
        group = group.child(content);
    }
    group
}
fn work(s: &State, r: &Row, reader: bool) -> El {
    let t = &s.theme;
    let open = super::conversation(s, reader).open(&r.id);
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
                    super::conversation_mut(s, reader).toggle(&id);
                    tx.keep_on_screen(id.clone());
                    tx.instant();
                })
        }
        Kind::Skill(m) => skill(
            s,
            m.fields
                .get("name")
                .or_else(|| m.fields.get("skill"))
                .and_then(Value::as_str),
            "completed",
            None,
        ),
        Kind::Tool(tool) => tool_row(s, &id, tool, reader),
        _ => col(),
    }
}
fn tool_row(s: &State, id: &str, tool: &Value, reader: bool) -> El {
    let t = &s.theme;
    let open = super::conversation(s, reader).open(id);
    let name = tool["name"].as_str().unwrap_or("Tool");
    let state = &tool["state"];
    let input = &state["input"];
    if name == "skill" {
        let name = ["name", "id"]
            .iter()
            .find_map(|k| input[*k].as_str().filter(|v| !v.is_empty()));
        let output_name = state["content"].as_array().and_then(|items| {
            items.iter().find_map(|item| {
                let text = item["text"].as_str()?;
                let start = text.find("<skill_content")?;
                let tag = text[start..].split('>').next()?;
                let tail = tag.split_once("name=")?.1;
                let quote = tail.chars().next()?;
                if !matches!(quote, '\'' | '"') {
                    return None;
                }
                tail[1..].split(quote).next()
            })
        });
        return skill(
            s,
            name.or(output_name),
            state["status"].as_str().unwrap_or("completed"),
            state["error"]["message"].as_str(),
        );
    }
    let target = ["filePath", "path", "command", "pattern", "query"]
        .iter()
        .find_map(|key| input[*key].as_str())
        .unwrap_or(if name == "question" { "" } else { name });
    let (glyph, title, ink) = match name {
        "read" | "read_file" => (&super::icons::READ, "Read", "text-secondary"),
        "shell" | "bash" | "exec" | "execute" => (&super::icons::SHELL, "Run", "text-secondary"),
        "grep" | "glob" | "search" | "list" | "ls" => (&i::SEARCH, name, "activity-search"),
        "edit" | "write" | "patch" | "apply_patch" | "write_file" => {
            (&super::icons::CHANGES, name, "activity-edit")
        }
        "question" => (&super::icons::READ, "Question", "text-secondary"),
        _ => (&super::icons::READ, name, "text-secondary"),
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
            super::conversation_mut(s, reader).toggle(&key);
            tx.keep_on_screen(key.clone());
            tx.instant();
        });
    let mut body = col().key(id).w_full().child(header);
    if open {
        let mut details = col()
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
                    details = details.child(label(
                        t,
                        format!("File output ({})", output["mime"].as_str().unwrap_or("")),
                        12.0,
                        400.0,
                        "text-tertiary",
                    ));
                }
            }
        }
        body = body.child(details);
    }
    body
}
pub fn skill(s: &State, name: Option<&str>, status: &str, error: Option<&str>) -> El {
    let t = &s.theme;
    let title = match status {
        "completed" => "Used skill",
        "error" => "Failed to load skill",
        _ => "Loading skill",
    };
    let title = format!(
        "{title}{}{}",
        name.map(|n| format!(": {n}")).unwrap_or_default(),
        if matches!(status, "running" | "streaming") {
            "…"
        } else {
            ""
        }
    );
    let mut result = col().w_full().child(
        row()
            .min_h(32.0)
            .px(2.0)
            .py(4.0)
            .gap(8.0)
            .center_y()
            .child(icon(&super::icons::SKILL, 14.0).color(t.c("activity-skill")))
            .child(label(t, title, 12.0, 400.0, "text-secondary").wrap()),
    );
    if let Some(error) = error {
        result = result.child(label(t, error, 12.0, 400.0, "error").wrap());
    }
    result
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
pub fn shell(s: &State, m: &Message, reader: bool) -> El {
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
    let id = m.id.clone();
    let open = super::conversation(s, reader).open(&id);
    let mut result = col().w_full().child(
        row()
            .min_h(32.0)
            .px(2.0)
            .py(4.0)
            .gap(8.0)
            .center_y()
            .child(
                icon(if open { &i::DOWN } else { &i::RIGHT }, 12.0)
                    .color(s.theme.c("text-tertiary")),
            )
            .child(
                text(cmd)
                    .font(TextStyle::new(13.0, 400.0).mono())
                    .color(s.theme.c("text-secondary"))
                    .truncate_fade(),
            )
            .role("button")
            .label(cmd)
            .expanded(open)
            .focusable(true)
            .on_press(move |s: &mut State| super::conversation_mut(s, reader).toggle(&id)),
    );
    if open {
        result = result.child(
            pre(s, output)
                .ml(22.0)
                .mr(8.0)
                .mb(12.0)
                .padding(12.0)
                .radius(8.0)
                .fill(s.theme.c("secondary")),
        );
        if m.fields
            .get("output")
            .is_some_and(|v| v["truncated"] == true)
        {
            result = result.child(label(
                &s.theme,
                "Output truncated by OpenCode.",
                12.0,
                400.0,
                "text-tertiary",
            ));
        }
    }
    result
}
