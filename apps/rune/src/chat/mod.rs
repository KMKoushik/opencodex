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
pub(crate) mod comments;
mod html;
pub(crate) mod icons;
mod markdown;
pub(crate) use markdown::render as markdown_view;
mod attachments;
mod copy;
mod detail_events;
mod detail_usage;
pub(crate) mod details;
mod document;
pub(crate) use attachments::download as download_attachment;
pub(crate) use document::open as open_document;
mod measure;
mod media;
pub use measure::ScrollStart;
pub(crate) mod follow;
#[cfg(target_os = "macos")]
mod pasteboard;
pub mod preview;
pub mod probe;
mod reader;
mod tools;
mod user;
pub use reader::reader;

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
    pub scroll_start: ScrollStart,
    pub measurements: measure::Measurements,
    pub details: bool,
    pub context: bool,
    pub comment_editor: Option<comments::Editor>,
    pub selected_response: Option<serde_json::Value>,
    pub selected_marks: Vec<rune::TextMark>,
    pub selection_point: Cell<Option<[f32; 2]>>,
    pub annotation_preview: Option<Arc<oc_gateway::types::Message>>,
    pub media: media::Media,
    pub preview: Option<String>,
    pub preview_name: String,
    pub tick_due: Option<f64>,
    pub now_ms: f64,
    pub copied: Option<(String, f64)>,
    pub copy_pending: Option<String>,
    pub copy_error: Option<String>,
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
            scroll_start: ScrollStart::Initial,
            measurements: Default::default(),
            details: false,
            context: false,
            comment_editor: None,
            selected_response: None,
            selected_marks: Vec::new(),
            selection_point: Cell::new(None),
            annotation_preview: None,
            media: media::Media::default(),
            preview: None,
            preview_name: "Image".into(),
            tick_due: None,
            now_ms: crate::unix_ms() as f64,
            copied: None,
            copy_pending: None,
            copy_error: None,
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
        .clip_fade_linear(0.0, 0.0, 0.0, 32.0)
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
                .whole_rows()
                .virtual_rows(
                    s.chat.rows.len() + 2,
                    s.chat.measurements.estimate(),
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
                            let mut end = col().key("transcript-end").min_h(52.0).w(width_for_row(s)).px(24.0).pb(32.0).gap(20.0);
                            if crate::composer::running::has_inbox(s) {
                                end = end.child(crate::composer::running::inbox(s));
                            }
                            if crate::docks::has_permissions(s) {
                                end = end.child(crate::docks::permissions(s));
                            }
                            if !s.chat.data.running && s.chat.data.info.as_ref().is_some_and(|i| i.outcome.as_deref() == Some("failed")) {
                                end = end.child(label(&s.theme, "The run failed. Check OpenCode’s provider configuration and try again.", 14.0, 400.0, "error").role("alert").wrap());
                            }
                            if crate::docks::active(s) {
                                end = end.child(
                                    label(
                                        &s.theme,
                                        crate::docks::waiting_label(s),
                                        12.0,
                                        400.0,
                                        "text-tertiary",
                                    )
                                    .w_full(),
                                );
                            }
                            else if !s.chat.data.running && crate::composer::running::has_inbox(s) {
                                end = end.child(label(&s.theme, "Message accepted; waiting to run…", 12.0, 400.0, "text-tertiary").role("status"));
                            }
                            else if !s.chat.data.running && s.chat.data.info.as_ref().is_some_and(|i| i.outcome.as_deref() == Some("interrupted")) {
                                end = end.child(label(&s.theme, "Stopped", 12.0, 400.0, "text-tertiary").role("status"));
                            }
                            return end;
                        }
                        let r = &s.chat.rows[n - 1];
                        let id = r.id.clone();
                        render_row(s, r).on_layout_tx(move |s: &mut State, rect, tx| {
                            if !s.chat.measurements.record(&id, rect[2], s.prefs.chat_font_size.unwrap_or(14.0), rect[3]) {
                                tx.live_only();
                            }
                        })
                    },
                )
                .virtual_rows_version(
                    s.chat
                        .data
                        .revision
                        .wrapping_add(s.chat.disclosure_revision)
                        .wrapping_add(s.docks.revision)
                        .wrapping_add(s.composer.running.revision)
                        .wrapping_mul(2)
                        .wrapping_add(u64::from(s.composer.access_pending))
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
    body = body.child(follow::viewport(scroll, false));
    if s.chat.jump {
        let height = rune::memo::layout_size("timeline")
            .map(|size| size[1])
            .unwrap_or(s.window_size.1 - 180.0);
        body = body.child(jump_pill(s, width, height, false));
    }
    body = body.child(comments::selected_actions(s));
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
    if s.find.open {
        body = body.child(crate::find::view(s));
    }
    body.child(user::popover(s, false))
}
fn jump_pill(s: &State, width: f32, height: f32, reader: bool) -> El {
    let t = &s.theme;
    row()
        .w(160.0)
        .h(28.0)
        .absolute((width - 160.0) / 2.0, height - 36.0)
        .center()
        .enter_delay(0.15)
        .child(
            t.shadow(
                row()
                    .h(28.0)
                    .px(10.0)
                    .gap(6.0)
                    .center_y()
                    .radius(20.0)
                    .fill(t.c("elevated"))
                    .hover(t.c("secondary-hover"))
                    .border(1.0, t.c("border-heavy"))
                    .child(icon(&icons::LATEST, 14.0).color(t.c("text")))
                    .child(label(t, "Jump to latest", 12.0, 500.0, "text"))
                    .role("button")
                    .label("Jump to latest")
                    .focusable(true)
                    .on_press_tx(move |s: &mut State, tx| {
                        tx.scroll_to_bottom(if reader {
                            "workspace-conversation".into()
                        } else {
                            scroll_key(s)
                        });
                        conversation_mut(s, reader).jump = false;
                    }),
                "chip-shadow",
            ),
        )
}
pub fn scroll_key(s: &State) -> String {
    format!("conversation-{}", s.selected.as_deref().unwrap_or(""))
}
fn history(s: &State) -> El {
    let title = if s.chat.data.error.is_some() {
        "Retry loading history"
    } else if s.chat.loading_earlier {
        "Loading earlier messages…"
    } else if s.chat.data.cursor.is_none() {
        "Beginning of conversation"
    } else {
        ""
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
    rune::memo::layout_size("chat")
        .map(|size| size[0])
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
    conversation_row(s, r, width_for_row(s), false)
}
pub(super) fn conversation(s: &State, reader: bool) -> &Chat {
    if reader {
        &s.workbench.reader_chat
    } else {
        &s.chat
    }
}
pub(super) fn conversation_mut(s: &mut State, reader: bool) -> &mut Chat {
    if reader {
        &mut s.workbench.reader_chat
    } else {
        &mut s.chat
    }
}
pub(super) fn conversation_row(s: &State, r: &Row, width: f32, reader: bool) -> El {
    let t = &s.theme;
    let chat = conversation(s, reader);
    let side_chat = reader && !chat.read_only();
    let inset = if side_chat { 16.0 } else { 24.0 };
    let padding = match &r.kind {
        Kind::Turn { .. } => 12.0,
        Kind::Activity { .. } => 8.0,
        Kind::Message(m) if m.r#type == "user" => 28.0,
        _ => 20.0,
    };
    rune::memo(
        format!("chat-row-{reader}-{}", r.id),
        (
            r.version,
            chat.disclosure_revision,
            chat.copied.as_ref().map(|(id, _)| id.as_str()),
            &chat.copy_pending,
            &chat.copy_error,
            s.draft().revision,
            s.prefs.chat_font_size.unwrap_or(14.0).to_bits(),
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
                chat.now_ms as u64 / 1000
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
                    ordinal,
                } => {
                    let message_id = message.id.clone();
                    let ordinal = *ordinal;
                    let response_key = format!("response-{reader}-{message_id}-{ordinal}");
                    let mut content = col().w_full().gap(14.0).child(
                        markdown::response(
                            s,
                            text,
                            message.time.completed.is_none() && !crate::docks::active(s),
                            width - 2.0 * inset,
                            &message_id,
                            ordinal,
                            if reader { "" } else { &r.id },
                            reader,
                        )
                        .key(response_key.clone()),
                    );
                    if message.time.completed.is_none()
                        && chat.data.running
                        && !crate::docks::active(s)
                    {
                        content = content.child(el().size(5.0, 15.0).fill(t.c("text-secondary")));
                    }
                    if *copyable {
                        content = content.child(copy::view(s, &r.id, text, reader));
                    }
                    content.hover_group().selection_group(true)
                        .on_key(|s: &mut State, key, tx| {
                            if key.key == rune::Key::Escape {
                                s.chat.selected_response = None;
                                return true;
                            }
                            if rune::Chord::parse("mod+shift+m").is_ok_and(|chord| chord.matches_tx(key, tx)) {
                                if let Some(target) = s.chat.selected_response.clone() {
                                    comments::begin(s, target);
                                    return true;
                                }
                            }
                            false
                        })
                        .on_selection_change(move |s: &mut State, change, _| {
                            if reader || change.dragging() || s.chat.comment_editor.is_some() { return; }
                            s.chat.selected_marks = change.selection().map(|selection| selection.texts().iter().filter(|t| t.is_selected()).map(|t| t.mark()).collect()).unwrap_or_default();
                            let quote = change.selection().map(|v| v.text().trim()).filter(|v| !v.is_empty());
                             let native_marks = s.chat.selected_marks.iter().map(|m| serde_json::json!({"path":m.path(),"start":m.range().start,"end":m.range().end,"text":m.text()})).collect::<Vec<_>>();
                             s.chat.selected_response = quote.map(|quote| serde_json::json!({"messageID":message_id,"ordinal":ordinal,"quote":comments::selected_quote(quote), "nativeMarks":native_marks, "responseAnchor":response_key, "scroll":s.chat.position.get().offset[1]}));
                        })
                }
                Kind::Message(m) if m.r#type == "user" => {
                    let mut bubble = col().w_full().items_end().gap(8.0);
                    if let Some(side) = m
                        .fields
                        .get("metadata")
                        .and_then(|v| v["opencodexFromSideChat"]["sessionID"].as_str())
                    {
                        let side = side.to_owned();
                        bubble = bubble.child(
                            row()
                                .gap(5.0)
                                .center_y()
                                .mb(-2.0)
                                .child(icon(&icons::CHAT, 13.0).color(t.c("text-tertiary")))
                                .child(label(t, "From side chat", 12.0, 400.0, "text-tertiary"))
                                .role("button")
                                .label("From side chat")
                                .focusable(true)
                                .on_press(move |s: &mut State| {
                                    s.workbench.open = true;
                                    s.workbench.panel = crate::workbench::Panel::Side;
                                    s.load_panel(false);
                                    s.open_workspace_reader(side.clone());
                                }),
                        );
                    }
                    let attachments = attachments::sent(s, m, width, reader);
                    let txt = m
                        .fields
                        .get("text")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    if let Some(chip) = user::chip(s, m, reader) {
                        bubble = bubble.child(chip);
                    }
                    let txt = user::own(txt, &m.fields);
                    if !txt.is_empty() {
                        bubble = bubble.child(
                            text(txt)
                                .spans(user::spans(
                                    s,
                                    txt,
                                    &m.fields,
                                    if reader { "" } else { &r.id },
                                ))
                                .font(
                                    TextStyle::new(s.prefs.chat_font_size.unwrap_or(14.0), 400.0)
                                        .lh(s.prefs.chat_font_size.unwrap_or(14.0) * 1.625),
                                )
                                .color(t.c("text"))
                                .exact_lines()
                                .wrap()
                                .selectable(true)
                                .max_w(if side_chat {
                                    width - 2.0 * inset
                                } else {
                                    ((width - 2.0 * inset) * 0.7).min(456.0)
                                })
                                .px(12.0)
                                .py(8.0)
                                .radius(16.0)
                                .fill(t.c("user-message")),
                        );
                    }
                    if m.fields
                        .get("files")
                        .and_then(serde_json::Value::as_array)
                        .is_some_and(|files| files.iter().any(|file| file["mention"].is_null()))
                    {
                        bubble.child(attachments)
                    } else {
                        bubble
                    }
                }
                Kind::Turn {
                    status,
                    start,
                    end,
                    open,
                } => {
                    let duration = end
                        .or_else(|| (*status == "working").then_some(chat.now_ms))
                        .map(|end| format_duration((end - start).max(0.0)));
                    let title = match (*status, duration) {
                        ("working", Some(d)) if chat.now_ms - start >= 1000.0 => {
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
                            let chat = conversation_mut(s, reader);
                            chat.jump = true;
                            chat.overrides.insert(id.clone(), open);
                            chat.disclosure_revision += 1;
                            chat.rebuild();
                            tx.keep_on_screen(id.clone());
                            tx.instant();
                        })
                }
                Kind::Activity {
                    entries,
                    summary,
                    active,
                    errors,
                } => tools::activity(s, &r.id, entries, summary, *active, *errors, reader),
                Kind::Message(m) => {
                    let error = m.fields.get("error").and_then(|e| e["message"].as_str());
                    if m.r#type == "assistant" {
                        let mut status = col().gap(14.0).w_full();
                        if let Some(retry) = m
                            .fields
                            .get("retry")
                            .and_then(|v| v["error"]["message"].as_str())
                        {
                            status = status.child(
                                label(
                                    t,
                                    format!("Retrying: {retry}"),
                                    12.0,
                                    400.0,
                                    "text-tertiary",
                                )
                                .role("status")
                                .wrap(),
                            );
                        }
                        if let Some(error) = error {
                            status = status
                                .child(label(t, error, 14.0, 400.0, "error").role("alert").wrap());
                        }
                        status
                    } else if m.r#type == "shell" {
                        tools::shell(s, m, reader)
                    } else {
                        let value = |key: &str| {
                            m.fields
                                .get(key)
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("")
                        };
                        let note = match m.r#type.as_str() {
                            "compaction" => match value("status") {
                                "running" => "Compacting context…".into(),
                                "failed" => format!("Compaction failed: {}", error.unwrap_or("")),
                                _ => "Context compacted".into(),
                            },
                            "agent-switched" => format!("Agent: {}", value("agent")),
                            "model-switched" => format!(
                                "Model: {}",
                                m.fields
                                    .get("model")
                                    .and_then(|v| v["id"].as_str())
                                    .unwrap_or("")
                            ),
                            "location-switched" => format!(
                                "Directory: {}",
                                m.fields
                                    .get("location")
                                    .and_then(|v| v["directory"].as_str())
                                    .unwrap_or("")
                            ),
                            _ => String::new(),
                        };
                        label(t, note, 12.0, 400.0, "text-tertiary").wrap()
                    }
                }
                _ => el(),
            };
            col()
                .key(r.id.clone())
                .w(width)
                .px(inset)
                .pb(padding)
                .min_w(0.0)
                .child(content)
        },
    )
}
pub fn toolbar(s: &State) -> El {
    let t = &s.theme;
    row()
        .gap(8.0)
        .center_y()
        .child(
            icon_button(t, &icons::MORE, "Thread actions")
                .on_layout_tx(|s: &mut State, rect, tx| {
                    s.pages.anchors.insert("Thread actions".into(), rect);
                    tx.live_only();
                })
                .on_press(|s: &mut State| {
                    if let Some(id) = &s.selected {
                        s.menus.open = Some(crate::menus::Menu::Thread(id.clone()));
                        s.menus.point = s
                            .pages
                            .anchors
                            .get("Thread actions")
                            .map(|r| (r[0] + r[2] - 180.0, r[1] + r[3] + 4.0));
                    }
                }),
        )
        .child(
            crate::sidebar::icon_button_size(t, &icons::INFO, "Session details", 17.0)
                .key("session-details-toggle")
                .fill(if s.chat.details {
                    t.c("hover")
                } else {
                    rune::Color::TRANSPARENT
                })
                .checked(s.chat.details)
                .on_press(details::toggle),
        )
        .child(
            crate::sidebar::icon_button_size(t, &icons::PANEL, "Toggle workspace", 17.0)
                .ml(4.0)
                .on_press(|s: &mut State| {
                    let panel = s.workbench.panel;
                    s.select_panel(panel);
                }),
        )
}
fn details(s: &State, width: f32) -> El {
    details::view(s, width)
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
