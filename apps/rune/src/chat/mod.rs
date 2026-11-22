use crate::{
    State, icons as i,
    sidebar::{icon_button, label},
};
use oc_gateway::{
    messages::Messages,
    timeline::{Kind, Projector, Row},
};
use rune::{El, GrowthSpec, ScrollSpec, TextStyle, col, el, icon, row, text};
use std::{cell::Cell, collections::BTreeMap, rc::Rc, sync::Arc};
mod icons;
mod markdown;
mod media;
pub mod preview;
pub mod probe;
mod tools;

pub struct Chat {
    pub data: Arc<Messages>,
    pub rows: Vec<Arc<Row>>,
    projector: Projector,
    pub overrides: BTreeMap<String, bool>,
    pub disclosures: BTreeMap<String, bool>,
    pub disclosure_revision: u64,
    pub position: Rc<Cell<rune::ScrollPos>>,
    pub jump: bool,
    pub loading_earlier: bool,
    pub scroll_applied: bool,
    pub details: bool,
    pub media: media::Media,
    pub preview: Option<String>,
    pub tick_due: Option<f64>,
    pub now_ms: f64,
}

/// Bench evidence must be visible new assistant output, not the prompt or forked history.
pub fn rendered_reply(elements: &[rune::ElementInfo], data: &Messages, after: f64) -> bool {
    elements.iter().any(|element| {
        element.visible[2] > 0.0
            && element.visible[3] > 0.0
            && element
                .text
                .as_deref()
                .is_some_and(|text| text.contains("BENCH-END"))
            && element
                .path
                .split('/')
                .filter_map(|part| part.split_once(":text:"))
                .any(|(id, _)| {
                    data.messages.iter().any(|message| {
                        message.id == id
                            && message.r#type == "assistant"
                            && message.time.created >= after
                    })
                })
    })
}
impl Default for Chat {
    fn default() -> Self {
        Self {
            data: Arc::default(),
            rows: Vec::new(),
            projector: Projector::default(),
            overrides: BTreeMap::new(),
            disclosures: BTreeMap::new(),
            disclosure_revision: 0,
            position: Rc::new(Cell::default()),
            jump: false,
            loading_earlier: false,
            scroll_applied: false,
            details: false,
            media: media::Media::default(),
            preview: None,
            tick_due: None,
            now_ms: crate::unix_ms() as f64,
        }
    }
}
impl Chat {
    pub fn read_only(&self) -> bool {
        self.data.info.as_ref().is_some_and(|info| {
            info.parent_id.is_some()
                && !info
                    .metadata
                    .as_ref()
                    .is_some_and(|m| m["opencodexSideChat"].is_object())
        })
    }
    pub fn expand(&mut self, mode: &str) {
        for row in &self.rows {
            if matches!(row.kind, Kind::Turn { .. }) {
                self.overrides.insert(row.id.clone(), true);
            }
        }
        self.rebuild();
        for row in &self.rows {
            if let Kind::Activity { entries, .. } = &row.kind {
                self.disclosures.insert(row.id.clone(), true);
                for entry in entries {
                    if (mode == "details" && matches!(entry.kind, Kind::Tool(_)))
                        || (mode == "thoughts" && matches!(entry.kind, Kind::Reasoning { .. }))
                    {
                        self.disclosures.insert(entry.id.clone(), true);
                    }
                }
            }
        }
        self.disclosure_revision += 1;
    }
    pub fn accept(&mut self, data: Arc<Messages>) {
        if self.loading_earlier || self.data.error != data.error {
            self.disclosure_revision += 1;
        }
        self.data = data;
        self.loading_earlier = false;
        self.rebuild();
    }
    pub fn rebuild(&mut self) {
        self.rows = self.projector.project(&self.data, &self.overrides);
    }
    pub fn toggle(&mut self, id: &str) {
        let v = self.disclosures.entry(id.into()).or_default();
        *v = !*v;
        self.disclosure_revision += 1;
    }
    pub fn open(&self, id: &str) -> bool {
        self.disclosures.get(id).copied().unwrap_or(false)
    }
}
pub fn view(s: &State, width: f32) -> El {
    let t = &s.theme;
    let position = s.chat.position.clone();
    let wake = s.waker.clone();
    let scroll = col()
        .key(format!(
            "conversation-{}",
            s.selected.as_deref().unwrap_or("")
        ))
        .role("log")
        .label("Conversation")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .scroll(ScrollSpec { stick_bottom: true })
        .scroll_anchor()
        .on_scroll_offset(move |at| {
            let old = position.replace(at);
            let away = |p: rune::ScrollPos| p.max[1] - p.offset[1] > 40.0;
            if away(old) != away(at)
                || (old.offset[1] >= 240.0 && at.offset[1] < 240.0)
                || old.viewport[1] == 0.0
            {
                if let Some(wake) = &wake {
                    wake();
                }
            }
        })
        .child(
            col()
                .key("transcript-rows")
                .w_full()
                .items_center()
                .growth(GrowthSpec::default())
                .virtual_rows(
                    s.chat.rows.len() + 2,
                    100.0,
                    |s: &State, n| {
                        if n == 0 {
                            "history-status".into()
                        } else if n > s.chat.rows.len() {
                            "transcript-end".into()
                        } else {
                            s.chat.rows[n - 1].id.clone().into()
                        }
                    },
                    |s: &State, n| {
                        if n == 0 {
                            return history(s);
                        }
                        if n > s.chat.rows.len() {
                            let mut end =
                                col().key("transcript-end").h(52.0).w_full().items_center();
                            if crate::docks::active(s) {
                                end = end.child(
                                    label(
                                        &s.theme,
                                        crate::docks::waiting_label(s),
                                        12.0,
                                        400.0,
                                        "text-tertiary",
                                    )
                                    .w(width_for_row(s) - 48.0),
                                );
                            }
                            return end;
                        }
                        render_row(s, &s.chat.rows[n - 1])
                    },
                )
                .virtual_rows_version(
                    s.chat
                        .data
                        .revision
                        .wrapping_add(s.chat.disclosure_revision)
                        .wrapping_mul(2)
                        .wrapping_add(u64::from(crate::docks::active(s))),
                ),
        );
    let mut body = col().key("timeline").w_full().grow(1.0).min_h(0.0);
    if let Some(info) = &s.chat.data.info {
        let side = info
            .metadata
            .as_ref()
            .and_then(|m| m["opencodexSideChat"]["parentID"].as_str());
        if let Some(parent) = side.or(info.parent_id.as_deref()) {
            let parent = parent.to_owned();
            body = body.child(
                row()
                    .w_full()
                    .h(32.0)
                    .px(24.0)
                    .gap(8.0)
                    .center_y()
                    .child(label(
                        t,
                        if s.chat.read_only() {
                            "Subagent conversation · Read only"
                        } else {
                            "Side chat"
                        },
                        12.0,
                        500.0,
                        "text-secondary",
                    ))
                    .child(
                        label(t, "Back to parent", 12.0, 400.0, "link")
                            .role("button")
                            .focusable(true)
                            .on_press(move |s: &mut State| s.open_session(Some(parent.clone()))),
                    ),
            );
        }
    }
    body = body.child(scroll);
    if s.chat.jump {
        let height = rune::memo::layout_size("timeline")
            .map(|size| size[1])
            .unwrap_or(s.window_size.1 - 180.0);
        body = body.child(
            row()
                .w(160.0)
                .h(36.0)
                .absolute((width - 160.0) / 2.0, height - 40.0)
                .center()
                .child(
                    row()
                        .h(28.0)
                        .px(10.0)
                        .gap(6.0)
                        .center_y()
                        .radius(20.0)
                        .fill(t.c("elevated"))
                        .border(1.0, t.c("border-heavy"))
                        .child(icon(&i::DOWN, 14.0).color(t.c("text-secondary")))
                        .child(label(t, "Jump to latest", 12.0, 500.0, "text-secondary"))
                        .role("button")
                        .label("Jump to latest")
                        .focusable(true)
                        .on_press_tx(|s: &mut State, tx| {
                            tx.scroll_to_bottom(scroll_key(s));
                            s.chat.jump = false;
                        }),
                ),
        );
    }
    if s.chat.details {
        body = body.child(details(s, width));
    }
    if let Some(error) = &s.chat.data.error {
        body = body.child(
            label(t, error, 12.0, 400.0, "error")
                .px(24.0)
                .py(8.0)
                .wrap(),
        );
    }
    if s.chat
        .data
        .info
        .as_ref()
        .is_some_and(|info| info.revert.is_some())
    {
        body=body.child(label(t,"Conversation undone. Use /redo to restore it, or send a message to continue from here.",12.0,400.0,"text-tertiary").role("status").px(24.0).py(8.0).wrap());
    }
    if s.find.open {
        body = body.child(crate::find::view(s));
    }
    body
}
pub fn scroll_key(s: &State) -> String {
    format!("conversation-{}", s.selected.as_deref().unwrap_or(""))
}
fn history(s: &State) -> El {
    let title = if let Some(error) = &s.chat.data.error {
        error.as_str()
    } else if s.chat.loading_earlier {
        "Loading earlier messages…"
    } else if s.chat.data.cursor.is_none() {
        "Beginning of conversation"
    } else {
        "Load earlier messages"
    };
    row()
        .key("history-status")
        .h(44.0)
        .w_full()
        .center()
        .child(label(&s.theme, title, 11.0, 400.0, "text-tertiary"))
        .on_press(|s: &mut State| {
            if s.chat.data.error.is_some() && s.chat.rows.is_empty() {
                if let Some(id) = s.selected.clone() {
                    s.command(oc_gateway::Command::OpenSession(id));
                }
                return;
            }
            if !s.chat.loading_earlier {
                s.load_earlier();
            }
        })
}
fn width_for_row(s: &State) -> f32 {
    rune::memo::layout_size("main")
        .map(|size| size[0] - 44.0)
        .unwrap_or(
            s.window_size.0
                - if s.prefs.sidebar_closed {
                    0.0
                } else {
                    s.sidebar_width()
                }
                - 44.0,
        )
        .min(768.0)
}
fn render_row(s: &State, r: &Row) -> El {
    let t = &s.theme;
    let width = width_for_row(s);
    let padding = match &r.kind {
        Kind::Turn { .. } => 12.0,
        Kind::Activity { .. } => 8.0,
        Kind::Message(m) if m.r#type == "user" => 28.0,
        _ => 20.0,
    };
    rune::memo(
        format!("chat-row-{}", r.id),
        (
            r.version,
            s.chat.disclosure_revision,
            crate::docks::active(s),
            width.to_bits(),
            s.theme.dark,
            &s.theme.preset.id,
            if matches!(
                r.kind,
                Kind::Turn {
                    status: "working",
                    ..
                }
            ) {
                s.chat.now_ms as u64 / 1000
            } else {
                0
            },
        ),
        || {
            let content = match &r.kind {
                Kind::Text {
                    message,
                    text,
                    copyable,
                    ..
                } => {
                    let mut content = col().w_full().gap(14.0).child(markdown::render(
                        s,
                        text,
                        message.time.completed.is_none() && !crate::docks::active(s),
                        width - 48.0,
                    ));
                    if message.time.completed.is_none()
                        && s.chat.data.running
                        && !crate::docks::active(s)
                    {
                        content = content.child(el().size(5.0, 15.0).fill(t.c("text-secondary")));
                    }
                    if *copyable {
                        let copy = text.clone();
                        content = content.child(
                            icon_button(t, &icons::COPY, "Copy response")
                                .group_opacity(0.0, 1.0)
                                .on_press_tx(move |_: &mut State, tx| tx.copy(copy.clone())),
                        );
                    }
                    content.hover_group()
                }
                Kind::Message(m) if m.r#type == "user" => {
                    let mut bubble = col().w_full().items_end().gap(8.0);
                    if let Some(files) = m.fields.get("files").and_then(serde_json::Value::as_array)
                    {
                        for file in files {
                            if !file["mention"].is_null() {
                                continue;
                            }
                            if let (Some(mime), Some(data)) =
                                (file["mime"].as_str(), file["data"].as_str())
                            {
                                if mime.starts_with("image/") {
                                    let source = format!("data:{mime};base64,{data}");
                                    if let Some(Ok(image)) = s.chat.media.images.get(&source) {
                                        bubble = bubble.child(
                                            el().size(96.0, 76.0)
                                                .radius(10.0)
                                                .pixels_fit(image.pixels(), rune::SurfaceFit::Fill)
                                                .role("button")
                                                .label(
                                                    file["name"]
                                                        .as_str()
                                                        .unwrap_or("Attached image"),
                                                )
                                                .focusable(true)
                                                .on_press(move |s: &mut State| {
                                                    s.chat.preview = Some(source.clone())
                                                }),
                                        );
                                        continue;
                                    }
                                }
                            }
                            bubble = bubble.child(
                                row()
                                    .w(240.0)
                                    .h(76.0)
                                    .px(12.0)
                                    .center_y()
                                    .radius(10.0)
                                    .border(1.0, t.c("border-heavy"))
                                    .child(icon(&i::FOLDER, 20.0).color(t.c("text-secondary")))
                                    .child(label(
                                        t,
                                        file["name"].as_str().unwrap_or("Attachment"),
                                        14.0,
                                        400.0,
                                        "text",
                                    )),
                            );
                        }
                    }
                    let txt = m
                        .fields
                        .get("text")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    bubble.child(
                        text(txt)
                            .spans(crate::find::highlights(s, txt))
                            .font(TextStyle::new(14.0, 400.0).lh(22.75))
                            .color(t.c("text"))
                            .wrap()
                            .selectable(true)
                            .max_w(((width - 48.0) * 0.7).min(456.0))
                            .px(12.0)
                            .py(8.0)
                            .radius(16.0)
                            .fill(t.c("user-message")),
                    )
                }
                Kind::Turn {
                    status,
                    start,
                    end,
                    open,
                } => {
                    let duration = end
                        .or_else(|| (*status == "working").then_some(s.chat.now_ms))
                        .map(|end| format_duration((end - start).max(0.0)));
                    let title = match (*status, duration) {
                        ("working", Some(d)) if s.chat.now_ms - start >= 1000.0 => {
                            format!("Working for {d}")
                        }
                        ("working", _) => "Working".into(),
                        ("stopped", Some(d)) => format!("Stopped after {d}"),
                        ("stopped", None) => "Stopped".into(),
                        (_, Some(d)) => format!("Worked for {d}"),
                        _ => "Worked".into(),
                    };
                    let id = r.id.clone();
                    let open = !*open;
                    row()
                        .min_h(24.0)
                        .gap(6.0)
                        .center_y()
                        .role("button")
                        .label(&title)
                        .focusable(true)
                        .expanded(!open)
                        .child(label(t, title, 13.0, 400.0, "text-tertiary"))
                        .child(
                            icon(if open { &i::RIGHT } else { &i::DOWN }, 12.0)
                                .color(t.c("text-tertiary")),
                        )
                        .on_press_tx(move |s: &mut State, tx| {
                            s.chat.overrides.insert(id.clone(), open);
                            s.chat.disclosure_revision += 1;
                            s.chat.rebuild();
                            tx.keep_on_screen(id.clone());
                            tx.instant();
                        })
                }
                Kind::Activity {
                    entries,
                    summary,
                    active,
                    errors,
                } => tools::activity(s, &r.id, entries, summary, *active, *errors),
                Kind::Message(m) => {
                    let error = m.fields.get("error").and_then(|e| e["message"].as_str());
                    if let Some(error) = error {
                        label(t, error, 13.0, 400.0, "error").wrap()
                    } else if m.r#type == "shell" {
                        tools::shell(s, m)
                    } else {
                        label(
                            t,
                            format!(
                                "{} {}",
                                m.r#type,
                                m.fields
                                    .get("name")
                                    .and_then(serde_json::Value::as_str)
                                    .unwrap_or("")
                            ),
                            12.0,
                            400.0,
                            "text-tertiary",
                        )
                        .wrap()
                    }
                }
                _ => el(),
            };
            col()
                .key(r.id.clone())
                .w(width)
                .px(24.0)
                .pb(padding)
                .min_w(0.0)
                .child(content)
        },
    )
}
pub fn toolbar(s: &State) -> El {
    let t = &s.theme;
    row()
        .gap(4.0)
        .center_y()
        .child(
            icon_button(t, &icons::MORE, "Thread actions").on_press(|s: &mut State| {
                if let Some(id) = &s.selected {
                    s.menus.open = Some(crate::menus::Menu::Thread(id.clone()));
                    s.menus.point = Some((s.window_size.0 - 216.0, 40.0));
                }
            }),
        )
        .child(
            icon_button(t, &icons::INFO, "Session details")
                .on_press(|s: &mut State| s.chat.details = !s.chat.details),
        )
        .child(
            icon_button(t, &icons::PANEL, "Toggle workspace")
                .help("Workspace panels — milestone 3"),
        )
}
fn details(s: &State, width: f32) -> El {
    let t = &s.theme;
    let mut view = col()
        .w(288.0)
        .absolute((width - 300.0).max(12.0), 8.0)
        .radius(12.0)
        .padding(16.0)
        .gap(8.0)
        .fill(t.c("elevated"))
        .border(1.0, t.c("border-heavy"));
    if let Some(info) = &s.chat.data.info {
        view = view
            .child(label(t, "Session details", 14.0, 600.0, "text"))
            .child(label(
                t,
                &info.location.directory,
                12.0,
                400.0,
                "text-secondary",
            ));
        if let Some(parent) = &info.parent_id {
            view = view.child(label(
                t,
                "Subagent conversation",
                12.0,
                500.0,
                "text-secondary",
            ));
            let parent = parent.clone();
            view = view.child(
                label(t, "Back to parent", 12.0, 400.0, "link")
                    .on_press(move |s: &mut State| s.open_session(Some(parent.clone()))),
            );
        }
    }
    view
}
fn format_duration(ms: f64) -> String {
    let seconds = (ms / 1000.0).round() as u64;
    if seconds < 60 {
        format!("{seconds}s")
    } else if seconds < 3600 {
        if seconds % 60 == 0 {
            format!("{}m", seconds / 60)
        } else {
            format!("{}m {}s", seconds / 60, seconds % 60)
        }
    } else {
        let minutes = (seconds % 3600) / 60;
        if minutes == 0 {
            format!("{}h", seconds / 3600)
        } else {
            format!("{}h {minutes}m", seconds / 3600)
        }
    }
}
pub fn rail(s: &State) -> El {
    let t = &s.theme;
    let mut rail = col()
        .w(44.0)
        .h_full()
        .px(4.0)
        .pb(6.0)
        .gap(4.0)
        .border_sides([0.0, 0.0, 0.0, 1.0], t.c("border"))
        .border_layout();
    for (glyph, name) in [
        (&icons::OPEN, "Open in app"),
        (&icons::FILES, "Files"),
        (&icons::CHANGES, "Changes"),
        (&icons::SUBAGENTS, "Subagents"),
        (&icons::CHAT, "Side chats"),
        (&icons::CANVAS, "Canvas"),
        (&icons::TERMINAL, "Terminal"),
    ] {
        rail = rail.child(
            el().size(36.0, 36.0)
                .center()
                .radius(10.0)
                .hover(t.c("hover"))
                .child(icon(glyph, 18.0).color(t.c("text-tertiary")))
                .help(format!("{name} — workspace milestone")),
        );
    }
    rail
}
