//! SessionPanel's read-only metadata/cost aggregation. Never runs on the UI thread.
use crate::{
    State,
    sidebar::{icon_button, label},
};
use oc_gateway::Gateway;
use rune::{El, Latest, Waker, col, el, icon, row};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    sync::Arc,
};

type Results = BTreeMap<String, Result<Value, String>>;
#[derive(Default)]
pub struct Data {
    pending: Latest<(String, Results)>,
    pub session: String,
    pub values: Arc<Results>,
    loaded: Option<std::time::Instant>,
    in_flight: bool,
    dirty_due: Option<f64>,
    watch: Option<super::detail_events::Watch>,
    usage: BTreeMap<String, Value>,
}
impl Data {
    pub fn request(&mut self, url: &str, session: String, directory: String, wake: Option<Waker>) {
        if self.session != session {
            self.watch = None;
            self.usage.clear();
        }
        if self.watch.is_none() && !crate::OPTIONS.get().is_some_and(|o| o.headless) {
            let watch = super::detail_events::Watch::start(
                url.to_owned(),
                session.clone(),
                directory.clone(),
                wake.clone(),
            );
            if self.session == session {
                watch.descendants(
                    self.values
                        .get("costs")
                        .and_then(|v| v.as_ref().ok())
                        .and_then(|v| v["ids"].as_array())
                        .into_iter()
                        .flatten()
                        .filter_map(|v| v.as_str().map(str::to_owned)),
                );
            }
            self.watch = Some(watch);
        }
        if self.session == session && self.in_flight {
            return;
        }
        if self.session == session
            && self.loaded.is_some_and(|at| at.elapsed().as_secs() < 15)
            && !self.values.is_empty()
            && self.values.values().all(Result::is_ok)
        {
            return;
        }
        let url = url.to_owned();
        if self.session != session {
            self.values = Arc::default();
        }
        self.session = session.clone();
        self.in_flight = true;
        if let Some(wake) = wake {
            self.pending.set_waker(wake);
        }
        self.pending
            .request((session, directory), move |(session, directory)| {
                let result = match Gateway::new(&url, None) {
                    Ok(client) => load(&client, &session, &directory),
                    Err(error) => BTreeMap::from([("session".into(), Err(error))]),
                };
                (session, result)
            });
    }
    pub fn take(&mut self) -> bool {
        if let Some(watch) = &self.watch {
            self.usage.extend(watch.take_usage());
        }
        let Some((session, values)) = self.pending.take() else {
            return !self.in_flight
                && super::detail_usage::apply(
                    Arc::make_mut(&mut self.values),
                    &self.session,
                    std::mem::take(&mut self.usage),
                );
        };
        if session != self.session {
            return false;
        }
        self.in_flight = false;
        self.values = Arc::new(values);
        super::detail_usage::apply(
            Arc::make_mut(&mut self.values),
            &self.session,
            std::mem::take(&mut self.usage),
        );
        if let Some(watch) = &self.watch {
            watch.descendants(
                self.values
                    .get("costs")
                    .and_then(|v| v.as_ref().ok())
                    .and_then(|v| v["ids"].as_array())
                    .into_iter()
                    .flatten()
                    .filter_map(|v| v.as_str().map(str::to_owned)),
            );
        }
        self.loaded = Some(std::time::Instant::now());
        true
    }
    pub fn capture(&mut self, url: &str, session: &str, directory: &str) -> Result<(), String> {
        self.session = session.into();
        self.values = Arc::new(load(&Gateway::new(url, None)?, session, directory));
        self.loaded = Some(std::time::Instant::now());
        Ok(())
    }
}
fn load(client: &Gateway, session: &str, directory: &str) -> Results {
    let rt = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(error) => return BTreeMap::from([("session".into(), Err(error.to_string()))]),
    };
    rt.block_on(async {
        let mut values = BTreeMap::new();
        for (key, path) in [
            ("session", format!("sessions/{session}")),
            ("vcs", "workspace/vcs".into()),
            ("mcp", "workspace/mcp".into()),
            ("skills", "workspace/skills".into()),
            ("canvases", "canvases".into()),
        ] {
            let query = if matches!(key, "vcs" | "mcp" | "skills") {
                vec![("directory", directory)]
            } else {
                vec![]
            };
            values.insert(
                key.into(),
                client.get_bounded(&path, &query, 16 * 1024 * 1024).await,
            );
        }
        values.insert("costs".into(), costs(client, session).await);
        values
    })
}
async fn costs(client: &Gateway, session: &str) -> Result<Value, String> {
    let mut seen = BTreeSet::from([session.to_owned()]);
    let mut pending = VecDeque::from([session.to_owned()]);
    let mut children = Vec::new();
    let mut total = 0.0;
    let mut by_id = BTreeMap::new();
    let mut count = 0;
    let mut more = false;
    while let Some(parent) = pending.pop_front() {
        let mut cursors = BTreeSet::new();
        let mut cursor = None::<String>;
        loop {
            let preview = parent == session && cursor.is_none();
            let query = cursor
                .as_deref()
                .map(|c| vec![("cursor", c)])
                .unwrap_or_default();
            let page: Value = client
                .get_bounded(
                    &format!("sessions/{parent}/subagents"),
                    &query,
                    16 * 1024 * 1024,
                )
                .await?;
            for child in page["data"].as_array().ok_or("Invalid subagent page")? {
                let id = child["id"].as_str().ok_or("Subagent has no session ID")?;
                if !seen.insert(id.to_owned()) {
                    continue;
                }
                if count >= 5000 {
                    return Err(
                        "This session has too many subagents to load the complete cost.".into(),
                    );
                }
                count += 1;
                total += child["cost"].as_f64().unwrap_or(0.0);
                by_id.insert(id.to_owned(), child["cost"].as_f64().unwrap_or(0.0));
                if preview {
                    children.push(child.clone());
                }
                pending.push_back(id.to_owned());
            }
            cursor = page["cursor"]["next"].as_str().map(str::to_owned);
            if preview {
                more = cursor.is_some();
            }
            let Some(next) = &cursor else {
                break;
            };
            if !cursors.insert(next.clone()) {
                return Err(
                    "OpenCode repeated a subagent page. Retry to load the complete cost.".into(),
                );
            }
        }
    }
    Ok(json!({"cost":total,"count":count,"children":children,"more":more,"ids":seen,"byID":by_id}))
}
pub fn toggle(s: &mut State) {
    s.chat.details = !s.chat.details;
    if s.chat.details {
        refresh(s);
    }
}
fn refresh(s: &mut State) {
    let (Some(url), Some(session)) = (crate::sidecar::url(), s.selected.clone()) else {
        return;
    };
    let directory = s.workspace_directory();
    s.chat
        .media
        .details
        .request(url, session, directory, s.waker.clone());
}
/// Called only for authoritative completion/workspace events, never token deltas.
/// One trailing refresh is retained while a request is in flight; events cannot
/// cancel/restart a cost traversal or enqueue one request per message.
pub fn invalidate(s: &mut State, clock: f64, tx: &mut rune::Tx) {
    let data = &mut s.chat.media.details;
    data.loaded = None;
    if s.chat.details && data.dirty_due.is_none() {
        data.dirty_due = Some(clock + 1.0);
        tx.wake_after(std::time::Duration::from_secs(1));
    }
}
pub fn poll(s: &mut State, clock: f64) {
    let data = &mut s.chat.media.details;
    if !s.chat.details {
        data.dirty_due = None;
        data.watch = None;
        return;
    }
    if data.watch.as_ref().is_some_and(|watch| watch.take()) {
        data.loaded = None;
        // The stream already coalesces its mailbox. An in-flight request keeps
        // exactly one trailing invalidation; completion wakes the main loop.
        data.dirty_due.get_or_insert(clock);
    }
    if !data.in_flight && data.dirty_due.is_some_and(|due| clock >= due) {
        data.dirty_due = None;
        data.loaded = None;
        refresh(s);
    }
}
fn number(n: u64) -> String {
    let n = n.to_string();
    let mut out = String::new();
    for (i, c) in n.chars().enumerate() {
        if i > 0 && (n.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}
fn money(n: f64) -> String {
    let mut value = format!("${n:.4}");
    while value.ends_with('0') && value.rsplit('.').next().is_some_and(|p| p.len() > 2) {
        value.pop();
    }
    value
}
fn note(s: &State, value: impl Into<String>) -> El {
    label(&s.theme, value, 12.0, 400.0, "text-tertiary").wrap()
}
fn token_total(v: &Value) -> u64 {
    [
        &v["input"],
        &v["output"],
        &v["reasoning"],
        &v["cache"]["read"],
        &v["cache"]["write"],
    ]
    .into_iter()
    .filter_map(Value::as_u64)
    .sum()
}
fn pair(s: &State, title: &str, value: String) -> El {
    row()
        .w_full()
        .gap(8.0)
        .center_y()
        .child(label(&s.theme, title, 12.0, 400.0, "text-secondary").grow(1.0))
        .child(label(&s.theme, value, 12.0, 400.0, "text-secondary"))
}
fn with_icon(s: &State, glyph: &'static rune::Icon, content: El) -> El {
    row()
        .w_full()
        .gap(8.0)
        .center_y()
        .child(icon(glyph, 16.0).color(s.theme.c("text-secondary")))
        .child(content.min_w(0.0).grow(1.0))
}
fn section(s: &State) -> El {
    col()
        .w_full()
        .py(8.0)
        .gap(6.0)
        .border_sides([1.0, 0.0, 0.0, 0.0], s.theme.c("border"))
        .border_layout()
}
fn disclosure(
    s: &State,
    title: &str,
    value: String,
    glyph: &'static rune::Icon,
    content: El,
) -> El {
    let key = format!("session-detail-{title}");
    let open = s.chat.open(&key);
    let mut section = section(s).gap(0.0).child(
        row()
            .w_full()
            .min_h(20.0)
            .gap(8.0)
            .center_y()
            .role("button")
            .focusable(true)
            .expanded(open)
            .child(icon(glyph, 16.0).color(s.theme.c("text-secondary")))
            .child(label(&s.theme, title, 12.0, 600.0, "text"))
            .child(
                icon(
                    if open {
                        &crate::icons::DOWN
                    } else {
                        &crate::icons::RIGHT
                    },
                    12.0,
                )
                .color(s.theme.c("text-secondary")),
            )
            .child(el().grow(1.0))
            .child(label(&s.theme, value, 12.0, 400.0, "text-secondary"))
            .on_press(move |s: &mut State| s.chat.toggle(&key)),
    );
    if open {
        section = section.child(content.pt(14.0));
    }
    section
}
pub fn view(s: &State, width: f32) -> El {
    let t = &s.theme;
    let gutter = ((width - 768.0) / 2.0).floor() - 24.0;
    let inline = gutter >= 240.0 && !s.workbench.open;
    let panel_width = if inline {
        gutter.clamp(240.0, 288.0)
    } else {
        288.0f32.min(width - 24.0)
    };
    let data = &s.chat.media.details;
    let values = &data.values;
    let fallback = |key: &str| {
        if values.get(key).is_some_and(Result::is_err) {
            "Unavailable"
        } else {
            "Loading…"
        }
    };
    let value = |key: &str| {
        values
            .get(key)
            .and_then(|v| v.as_ref().ok())
            .unwrap_or(&Value::Null)
    };
    let session = value("session");
    let latest = s.chat.data.messages.iter().rev().take(50).find(|m| {
        m.r#type == "assistant" && m.fields.get("tokens").is_some_and(|t| token_total(t) > 0)
    });
    let tokens = latest.and_then(|m| m.fields.get("tokens"));
    let total = tokens.map(token_total);
    let model = latest.and_then(|m| m.fields.get("model"));
    let limit = model
        .and_then(|model| {
            s.project()
                .and_then(|p| s.snapshot.models.get(&p.canonical))?
                .data
                .iter()
                .find(|m| {
                    m.id == model["id"].as_str().unwrap_or("")
                        && m.provider_id == model["providerID"].as_str().unwrap_or("")
                })
        })
        .and_then(|m| m.limit["context"].as_u64());
    let ratio = total
        .zip(limit)
        .filter(|(_, max)| *max > 0)
        .map(|(n, max)| n as f32 / max as f32);
    let mut popup = col()
        .key("session-details-content")
        .w_full()
        .px(12.0)
        .child(
            row()
                .w_full()
                .pt(6.0)
                .center_y()
                .child(label(t, "Session", 12.0, 600.0, "text").grow(1.0))
                .child(
                    icon_button(t, &crate::icons::CLOSE, "Close session details")
                        .on_press(|s: &mut State| s.chat.details = false),
                ),
        )
        .child(
            col()
                .w_full()
                .pt(4.0)
                .pb(8.0)
                .gap(8.0)
                .child(pair(
                    s,
                    "Context",
                    ratio
                        .map(|r| format!("{}%", ((r * 1000.0).round() / 10.0)))
                        .unwrap_or("—".into()),
                ))
                .child(
                    row()
                        .w_full()
                        .h(4.0)
                        .radius(4.0)
                        .fill(t.c("secondary-hover"))
                        .child(
                            el().w(
                                ((panel_width - 24.0) * ratio.unwrap_or(0.0).clamp(0.0, 1.0))
                                    .max(0.0),
                            )
                            .h(4.0)
                            .radius(4.0)
                            .fill(t.c("success")),
                        ),
                )
                .child(note(
                    s,
                    total
                        .map(|n| {
                            format!(
                                "{}{} tokens",
                                number(n),
                                limit
                                    .map(|max| format!(" / {}", number(max)))
                                    .unwrap_or_default()
                            )
                        })
                        .unwrap_or("Usage appears after the first response.".into()),
                )),
        );
    let mut project = section(s).child(with_icon(
        s,
        &crate::icons::FOLDER,
        label(
            t,
            s.project().map(|p| p.display_name()).unwrap_or("Project"),
            12.0,
            600.0,
            "text",
        ),
    ));
    if let Some(project_info) = s.project() {
        let directory = session["location"]["directory"]
            .as_str()
            .unwrap_or(&project_info.canonical);
        let checkout = if directory == project_info.canonical {
            "Local checkout"
        } else {
            directory
                .rsplit(['/', '\\'])
                .find(|p| !p.is_empty())
                .unwrap_or(directory)
        };
        project = project.child(with_icon(
            s,
            &crate::icons::WORKTREE,
            label(t, checkout, 12.0, 400.0, "text-secondary").truncate(),
        ));
    }
    let vcs = value("vcs");
    if vcs.is_object() {
        let branch = vcs["info"]["branch"]["current"]
            .as_str()
            .filter(|b| !b.is_empty())
            .unwrap_or(if vcs["info"]["provider"].is_null() {
                "No version control"
            } else {
                "Detached HEAD"
            });
        project = project.child(with_icon(
            s,
            &crate::icons::BRANCH,
            label(t, branch, 12.0, 400.0, "text-secondary").truncate(),
        ));
        if !vcs["info"]["provider"].is_null() {
            let files = vcs["files"].as_array().map(Vec::as_slice).unwrap_or(&[]);
            let adds: u64 = files.iter().filter_map(|f| f["additions"].as_u64()).sum();
            let deletes: u64 = files.iter().filter_map(|f| f["deletions"].as_u64()).sum();
            project = project.child(
                with_icon(
                    s,
                    &super::icons::CHANGES,
                    row()
                        .w_full()
                        .gap(8.0)
                        .center_y()
                        .child(
                            label(
                                t,
                                format!(
                                    "{} {} changed",
                                    number(files.len() as u64),
                                    if files.len() == 1 { "file" } else { "files" }
                                ),
                                12.0,
                                400.0,
                                "text-secondary",
                            )
                            .grow(1.0),
                        )
                        .child(
                            row()
                                .center_y()
                                .child(label(
                                    t,
                                    format!("+{}", number(adds)),
                                    12.0,
                                    400.0,
                                    "success",
                                ))
                                .child(label(t, " / ", 12.0, 400.0, "text-secondary"))
                                .child(label(
                                    t,
                                    format!("−{}", number(deletes)),
                                    12.0,
                                    400.0,
                                    "error",
                                )),
                        ),
                )
                .py(4.0)
                .role("button")
                .focusable(true)
                .label("Open working-tree changes")
                .on_press(|s: &mut State| {
                    s.chat.details = false;
                    s.select_panel(crate::workbench::Panel::Changes);
                }),
            );
        }
    } else if !values.contains_key("vcs") {
        project = project.child(note(s, "Loading project…"));
    }
    popup = popup.child(project);
    let costs = value("costs");
    if let Some(children) = costs["children"].as_array().filter(|c| !c.is_empty()) {
        let mut summary = row()
            .w_full()
            .gap(8.0)
            .py(4.0)
            .center_y()
            .child(icon(&super::icons::SUBAGENTS, 16.0).color(t.c("text-secondary")))
            .child(label(t, "Subagents", 12.0, 600.0, "text"))
            .child(icon(&crate::icons::RIGHT, 12.0).color(t.c("text-secondary")))
            .child(el().grow(1.0));
        for (index, _) in children.iter().take(3).enumerate() {
            summary = summary.child(icon(&super::icons::SUBAGENTS, 16.0).color(t.c([
                "project-pink",
                "project-orange",
                "project-purple",
            ][index])));
        }
        if children.len() > 3 {
            summary = summary.child(note(
                s,
                format!("+{} more", number((children.len() - 3) as u64)),
            ));
        }
        popup = popup.child(
            section(s).child(
                summary
                    .label(format!(
                        "Subagents: {}{} subagents",
                        children.len(),
                        if costs["more"] == true { "+" } else { "" }
                    ))
                    .role("button")
                    .focusable(true)
                    .on_press(|s: &mut State| {
                        s.chat.details = false;
                        s.select_panel(crate::workbench::Panel::Subagents);
                    }),
            ),
        );
    }
    let mut canvases = col().w_full().gap(8.0);
    let mut canvas_count = 0;
    for canvas in value("canvases")
        .as_array()
        .into_iter()
        .flatten()
        .filter(|c| c["sessionID"].as_str() == s.selected.as_deref())
    {
        let Some(id) = canvas["id"].as_str() else {
            continue;
        };
        let id = id.to_owned();
        canvas_count += 1;
        canvases = canvases.child(
            label(
                t,
                canvas["title"].as_str().unwrap_or(""),
                12.0,
                400.0,
                "text",
            )
            .role("button")
            .focusable(true)
            .on_press_tx(move |s: &mut State, tx| {
                s.chat.details = false;
                s.open_link(&format!("canvas:{id}"), tx);
            }),
        );
    }
    if canvas_count > 0 {
        popup = popup.child(disclosure(
            s,
            "Canvases",
            canvas_count.to_string(),
            &super::icons::CANVAS,
            canvases,
        ));
    }
    let cost = session["cost"]
        .as_f64()
        .zip(costs["cost"].as_f64())
        .map(|(a, b)| a + b);
    if cost != Some(0.0) {
        let mut usage = col()
            .w_full()
            .gap(8.0)
            .child(note(s, "Cost includes this session and all its subagents."));
        if let Some(total) = cost {
            usage = usage
                .child(pair(
                    s,
                    "This session",
                    money(session["cost"].as_f64().unwrap_or(0.0)),
                ))
                .child(pair(
                    s,
                    &format!("Subagents ({})", costs["count"].as_u64().unwrap_or(0)),
                    money(costs["cost"].as_f64().unwrap_or(0.0)),
                ))
                .child(pair(s, "Total cost", money(total)));
        }
        usage = usage.child(note(s, "Token totals for this session only."));
        if let Some(tokens) = session.get("tokens") {
            for (name, n) in [
                ("Input", &tokens["input"]),
                ("Output", &tokens["output"]),
                ("Reasoning", &tokens["reasoning"]),
                ("Cache read", &tokens["cache"]["read"]),
                ("Cache write", &tokens["cache"]["write"]),
            ] {
                usage = usage.child(pair(s, name, number(n.as_u64().unwrap_or(0))));
            }
        } else {
            usage = usage.child(note(s, "No usage reported yet."));
        }
        popup = popup.child(disclosure(
            s,
            "Usage",
            cost.map(money).unwrap_or_else(|| fallback("costs").into()),
            &super::icons::COINS,
            usage,
        ));
    }
    let mcp = value("mcp").as_array();
    let mut servers = col().w_full().gap(8.0);
    if let Some(mcp) = mcp {
        if mcp.is_empty() {
            servers = servers.child(note(s, "No MCP servers configured."));
        }
        for server in mcp {
            let status = server["status"]["status"].as_str().unwrap_or("");
            servers = servers.child(pair(
                s,
                server["name"].as_str().unwrap_or(""),
                if status == "needs_auth" {
                    "Needs sign-in"
                } else {
                    status
                }
                .into(),
            ));
            if let Some(error) = server["status"]["error"].as_str() {
                servers = servers.child(label(t, error, 12.0, 400.0, "error").wrap());
            }
        }
    }
    popup = popup.child(disclosure(
        s,
        "MCP",
        mcp.map(|m| {
            format!(
                "{}/{}",
                m.iter()
                    .filter(|m| m["status"]["status"] == "connected")
                    .count(),
                m.len()
            )
        })
        .unwrap_or_else(|| fallback("mcp").into()),
        &super::icons::LINK,
        servers,
    ));
    let skills = value("skills").as_array();
    let mut list = col().w_full().gap(8.0).child(note(
        s,
        "Available to this project, not necessarily loaded into this conversation.",
    ));
    if let Some(skills) = skills {
        if skills.is_empty() {
            list = list.child(note(s, "No skills available."));
        }
        for skill in skills {
            list = list.child(label(
                t,
                skill["name"].as_str().unwrap_or(""),
                12.0,
                400.0,
                "text",
            ));
            if let Some(description) = skill["description"].as_str().filter(|s| !s.is_empty()) {
                list = list.child(note(s, description));
            }
        }
    }
    popup = popup.child(disclosure(
        s,
        "Skills",
        skills
            .map(|m| format!("{} available", number(m.len() as u64)))
            .unwrap_or_else(|| fallback("skills").into()),
        &super::icons::SKILL,
        list,
    ));
    for error in values.values().filter_map(|v| v.as_ref().err()) {
        popup = popup
            .child(label(t, error, 12.0, 400.0, "error").role("alert").wrap())
            .child(
                label(t, "Retry", 12.0, 500.0, "text")
                    .role("button")
                    .focusable(true)
                    .on_press(refresh),
            );
    }
    let popup = col()
        .key("session-details")
        .w(panel_width)
        .max_h(s.window_size.1 - 72.0)
        .radius(12.0)
        .fill(t.c("surface"))
        .border(1.0, t.c("border-heavy"))
        .border_layout()
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .role(if inline { "region" } else { "dialog" })
        .label("Session details")
        .child(popup);
    if inline {
        popup.absolute((width - panel_width - 16.0).max(12.0), 16.0)
    } else {
        popup
            .absolute((width - panel_width - 12.0).max(12.0), 8.0)
            .modal(true, |s: &mut State| s.chat.details = false)
    }
}
