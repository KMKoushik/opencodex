//! The web timeline projector and turn grouper. Message identity caches part projection;
//! activity/turn owner keys survive prepending history and completion.
use crate::{messages::Messages, types::Message};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

#[derive(Clone, Debug)]
pub struct Row {
    pub id: String,
    pub kind: Kind,
    pub version: u64,
}
#[derive(Clone, Debug)]
pub enum Kind {
    Message(Arc<Message>),
    Text {
        message: Arc<Message>,
        ordinal: usize,
        text: String,
        copyable: bool,
    },
    Activity {
        entries: Vec<Arc<Row>>,
        summary: String,
        active: bool,
        errors: usize,
    },
    Reasoning {
        message: Arc<Message>,
        ordinal: usize,
        text: String,
    },
    Tool(Value),
    Skill(Arc<Message>),
    Turn {
        status: &'static str,
        start: f64,
        end: Option<f64>,
        open: bool,
    },
}
#[derive(Default)]
pub struct Projector {
    cache: BTreeMap<String, (Arc<Message>, Vec<Arc<Row>>)>,
    groups: BTreeMap<String, String>,
    owners: BTreeMap<String, String>,
    answers: BTreeMap<String, (u64, Arc<Row>)>,
    version: u64,
}
impl Projector {
    pub fn project(
        &mut self,
        data: &Messages,
        overrides: &BTreeMap<String, bool>,
    ) -> Vec<Arc<Row>> {
        self.version += 1;
        let mut rows = Vec::new();
        let mut work = Vec::new();
        let mut next_groups = BTreeMap::new();
        let mut claimed = BTreeSet::new();
        for message in &data.messages {
            let entries = if let Some((old, entries)) = self
                .cache
                .get(&message.id)
                .filter(|(old, _)| Arc::ptr_eq(old, message))
            {
                let _ = old;
                entries.clone()
            } else {
                let entries = project_message(message, self.version);
                self.cache
                    .insert(message.id.clone(), (message.clone(), entries.clone()));
                entries
            };
            for entry in entries {
                if matches!(
                    entry.kind,
                    Kind::Tool(_) | Kind::Reasoning { .. } | Kind::Skill(_)
                ) {
                    work.push(entry);
                } else {
                    self.flush(&mut work, &mut rows, &mut next_groups, &mut claimed);
                    rows.push(entry);
                }
            }
        }
        self.flush(&mut work, &mut rows, &mut next_groups, &mut claimed);
        self.groups = next_groups;
        let ids: BTreeSet<_> = data.messages.iter().map(|m| m.id.as_str()).collect();
        self.cache.retain(|id, _| ids.contains(id.as_str()));
        let row_ids: BTreeSet<_> = rows.iter().map(|row| row.id.as_str()).collect();
        self.answers.retain(|id, _| row_ids.contains(id.as_str()));
        let times = turn_times(data);
        let mut out = Vec::new();
        let mut next_owners = BTreeMap::new();
        claimed.clear();
        let mut start = 0;
        while start < rows.len() {
            let user = is_user(&rows[start]).then(|| rows[start].clone());
            if let Some(user) = &user {
                out.push(user.clone());
            }
            let begin = start + usize::from(user.is_some());
            let end = (begin..rows.len())
                .find(|&i| is_user(&rows[i]))
                .unwrap_or(rows.len());
            let turn = &rows[begin..end];
            let live = data.running && end == rows.len();
            let mut answer = None;
            for (i, row) in turn.iter().enumerate().rev() {
                if matches!(row.kind, Kind::Text { .. }) {
                    answer = Some(i);
                    break;
                }
                if live && matches!(row.kind, Kind::Activity { .. }) {
                    break;
                }
            }
            let member = |i: usize, row: &Row| {
                Some(i) != answer && matches!(row.kind, Kind::Activity { .. } | Kind::Text { .. })
            };
            let members: Vec<_> = turn
                .iter()
                .enumerate()
                .filter(|(i, r)| member(*i, r))
                .map(|(_, r)| r)
                .collect();
            let header = if members.is_empty() {
                None
            } else {
                let id = members
                    .iter()
                    .filter_map(|r| self.owners.get(&r.id))
                    .find(|id| !claimed.contains(*id))
                    .cloned()
                    .unwrap_or_else(|| {
                        format!(
                            "turn:{}",
                            user.as_ref()
                                .map(|r| r.id.as_str())
                                .unwrap_or(&members[0].id)
                        )
                    });
                claimed.insert(id.clone());
                let time = times.get(user.as_ref().map(|r| r.id.as_str()).unwrap_or(""));
                let status = if live {
                    "working"
                } else if time.is_some_and(|t| t.2.as_deref() == Some("interrupted")) {
                    "stopped"
                } else {
                    "worked"
                };
                let open = overrides.get(&id).copied().unwrap_or(live);
                Some(Arc::new(Row {
                    id,
                    version: time.map_or(0, |t| {
                        t.0.to_bits() ^ t.1.unwrap_or(0.0).to_bits().rotate_left(13)
                    }) ^ u64::from(open)
                        ^ if live {
                            2
                        } else if status == "stopped" {
                            4
                        } else {
                            8
                        },
                    kind: Kind::Turn {
                        status,
                        start: time.map_or(0.0, |t| t.0),
                        end: if live { None } else { time.and_then(|t| t.1) },
                        open,
                    },
                }))
            };
            let mut placed = false;
            for (i, row) in turn.iter().enumerate() {
                if let Some(header) = &header {
                    if member(i, row) {
                        next_owners.insert(row.id.clone(), header.id.clone());
                        if !placed {
                            out.push(header.clone());
                            placed = true;
                        }
                        if matches!(header.kind, Kind::Turn { open: false, .. }) {
                            continue;
                        }
                    }
                }
                if Some(i) == answer && !live {
                    if let Kind::Text {
                        message,
                        ordinal,
                        text,
                        ..
                    } = &row.kind
                    {
                        let answer = self
                            .answers
                            .entry(row.id.clone())
                            .or_insert_with(|| (0, row.clone()));
                        if answer.0 != row.version {
                            *answer = (
                                row.version,
                                Arc::new(Row {
                                    id: row.id.clone(),
                                    version: row.version,
                                    kind: Kind::Text {
                                        message: message.clone(),
                                        ordinal: *ordinal,
                                        text: text.clone(),
                                        copyable: message.time.completed.is_some(),
                                    },
                                }),
                            );
                        }
                        out.push(answer.1.clone());
                        continue;
                    }
                }
                out.push(row.clone());
            }
            start = end;
        }
        self.owners = next_owners;
        out
    }
    fn flush(
        &self,
        work: &mut Vec<Arc<Row>>,
        rows: &mut Vec<Arc<Row>>,
        groups: &mut BTreeMap<String, String>,
        claimed: &mut BTreeSet<String>,
    ) {
        if work.is_empty() {
            return;
        }
        let id = work
            .iter()
            .filter_map(|r| self.groups.get(&r.id))
            .find(|id| !claimed.contains(*id))
            .cloned()
            .unwrap_or_else(|| format!("activity:{}", work[0].id));
        claimed.insert(id.clone());
        for entry in work.iter() {
            groups.insert(entry.id.clone(), id.clone());
        }
        let version = work.iter().map(|r| r.version).max().unwrap_or(0);
        let (summary, active, errors) = summarize(work);
        rows.push(Arc::new(Row {
            id,
            version,
            kind: Kind::Activity {
                entries: std::mem::take(work),
                summary,
                active,
                errors,
            },
        }));
    }
}
fn project_message(m: &Arc<Message>, version: u64) -> Vec<Arc<Row>> {
    let mut rows = Vec::new();
    let mut push = |id: String, kind| rows.push(Arc::new(Row { id, kind, version }));
    if m.r#type == "assistant" {
        let mut text = 0;
        let mut reasoning = 0;
        for part in m
            .fields
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let content = part["text"].as_str().unwrap_or("");
            match part["type"].as_str() {
                Some("tool") => push(
                    part["id"].as_str().unwrap_or("tool").into(),
                    Kind::Tool(part.clone()),
                ),
                Some("reasoning") => {
                    let ordinal = reasoning;
                    reasoning += 1;
                    if !content.trim().is_empty() || m.time.completed.is_none() {
                        push(
                            format!("{}:reasoning:{ordinal}", m.id),
                            Kind::Reasoning {
                                message: m.clone(),
                                ordinal,
                                text: content.into(),
                            },
                        );
                    }
                }
                Some("text") => {
                    let ordinal = text;
                    text += 1;
                    if !content.trim().is_empty() || m.time.completed.is_none() {
                        push(
                            format!("{}:text:{ordinal}", m.id),
                            Kind::Text {
                                message: m.clone(),
                                ordinal,
                                text: content.into(),
                                copyable: false,
                            },
                        );
                    }
                }
                _ => {}
            }
        }
        if text == 0 && m.time.completed.is_none() {
            push(
                format!("{}:text:0", m.id),
                Kind::Text {
                    message: m.clone(),
                    ordinal: 0,
                    text: String::new(),
                    copyable: false,
                },
            );
        }
        if m.fields.contains_key("error") || m.fields.contains_key("retry") {
            push(format!("{}:status", m.id), Kind::Message(m.clone()));
        }
    } else if m.r#type == "skill" {
        push(m.id.clone(), Kind::Skill(m.clone()));
    } else if !matches!(m.r#type.as_str(), "idle" | "system" | "synthetic") {
        push(m.id.clone(), Kind::Message(m.clone()));
    }
    rows
}
fn is_user(row: &Row) -> bool {
    matches!(&row.kind,Kind::Message(m) if m.r#type == "user")
}
type TurnTime = (f64, Option<f64>, Option<String>);
fn turn_times(data: &Messages) -> BTreeMap<String, TurnTime> {
    let mut times = BTreeMap::new();
    let mut key = String::new();
    for m in &data.messages {
        if m.r#type == "user" {
            key = m.id.clone();
            times.insert(key.clone(), (m.time.created, None, None));
            continue;
        }
        let t = times
            .entry(key.clone())
            .or_insert((m.time.created, None, None));
        if m.r#type == "idle" {
            t.1 = Some(m.time.created);
            t.2 = m
                .fields
                .get("outcome")
                .and_then(Value::as_str)
                .map(str::to_owned);
        } else if m.r#type == "assistant" && t.2.is_none() {
            t.1 = Some(
                t.1.unwrap_or(0.0)
                    .max(m.time.completed.unwrap_or(m.time.created)),
            );
        }
    }
    times
}
fn summarize(entries: &[Arc<Row>]) -> (String, bool, usize) {
    let mut n = [0; 7];
    let mut active = false;
    let mut errors = 0;
    for r in entries {
        match &r.kind {
            Kind::Skill(_) => n[5] += 1,
            Kind::Reasoning { message, .. } => active |= message.time.completed.is_none(),
            Kind::Tool(t) => {
                active |= matches!(t["state"]["status"].as_str(), Some("running" | "streaming"));
                errors += usize::from(t["state"]["status"] == "error");
                n[match t["name"].as_str().unwrap_or("") {
                    "read" | "read_file" => 0,
                    "grep" | "glob" | "search" | "list" | "ls" => 1,
                    "shell" | "bash" | "exec" | "execute" => 2,
                    "edit" | "write" | "patch" | "apply_patch" | "write_file" => 3,
                    "question" => 4,
                    "skill" => 5,
                    _ => 6,
                }] += 1;
            }
            _ => {}
        }
    }
    let labels = [
        ("Read ", "file", "files"),
        ("", "search", "searches"),
        ("ran ", "command", "commands"),
        ("", "edit", "edits"),
        ("", "question", "questions"),
        ("used ", "skill", "skills"),
        ("", "tool call", "tool calls"),
    ];
    let mut summary = n
        .iter()
        .zip(labels)
        .filter(|(n, _)| **n > 0)
        .map(|(n, (prefix, one, many))| format!("{prefix}{n} {}", if *n == 1 { one } else { many }))
        .collect::<Vec<_>>()
        .join(" · ");
    if summary.is_empty() {
        summary = "Thought process".into();
    } else {
        summary.replace_range(..1, &summary[..1].to_uppercase());
    }
    (summary, active, errors)
}
