use super::*;
use crate::icons as i;
pub fn view(s: &State, task: &Value) -> El {
    let id = task["id"].as_str().unwrap_or("").to_owned();
    if s.pages.tasks.editor.as_ref().is_some_and(|e| e.id == id) {
        return editor(s);
    }
    let title = task["title"].as_str().unwrap_or("");
    let done = task["bucket"] == "done";
    let agent = task["assignee"] == "agent";
    let complete = id.clone();
    let reopen = task["reopen"].as_str().unwrap_or("today").to_owned();
    let edit = task.clone();
    let editnotes = task.clone();
    let remove = id.clone();
    let mut body = col().grow(1.0).min_w(0.0).gap(6.0).child(
        label(
            &s.theme,
            title,
            13.0,
            400.0,
            if done { "text-tertiary" } else { "text" },
        )
        .font(TextStyle::new(13.0, 400.0).lh(18.85))
        .strike(
            0,
            if done { title.len() } else { 0 },
            Some(s.theme.c("border-heavy")),
        )
        .w_full()
        .wrap()
        .role("button")
        .key(format!("task-title-{id}"))
        .label(title)
        .focusable(true)
        .on_press_tx(move |s: &mut State, tx| super::edit(s, &edit, tx)),
    );
    if let Some(notes) = task["notes"].as_str().filter(|n| !n.trim().is_empty()) {
        body = body.child(
            notes_view(s, notes, done)
                .w_full()
                .wrap()
                .max_h(72.5)
                .on_press_tx(move |s: &mut State, tx| super::edit(s, &editnotes, tx)),
        );
    }
    let mut meta = row().w_full().flex_wrap().gap(4.0).center_y().child(
        el().size(22.0, 20.0)
            .radius(6.0)
            .center()
            .fill(if agent {
                s.theme.tint("project-purple", 0.18)
            } else {
                s.theme.c("secondary")
            })
            .role("img")
            .label(if agent { "For an agent" } else { "For you" })
            .help(if agent { "For an agent" } else { "For you" })
            .child(
                rune::icon(if agent { &i::ROBOT } else { &i::USER }, 12.0).color(if agent {
                    s.theme.blend("project-purple", "text", 0.6)
                } else {
                    s.theme.c("text-secondary")
                }),
            ),
    );
    if let Some(directory) = task["project"]["directory"].as_str() {
        let project = s
            .snapshot
            .projects
            .iter()
            .find(|p| p.canonical == directory);
        let name = project
            .map(|p| p.display_name())
            .unwrap_or_else(|| directory.rsplit('/').next().unwrap_or(directory));
        meta = meta.child(
            el().size(22.0, 20.0)
                .radius(6.0)
                .center()
                .fill(s.theme.c("secondary"))
                .help(name)
                .role("img")
                .label(name)
                .child(crate::settings::projects::avatar(
                    s,
                    name,
                    project
                        .and_then(|p| p.icon.as_ref())
                        .and_then(|i| i.color.as_deref())
                        .unwrap_or("gray"),
                    14.0,
                )),
        );
    }
    for (field, name) in [
        ("workSessionID", "Open the agent’s chat"),
        ("sessionID", "Open the chat that added this task"),
    ] {
        if field == "sessionID" && task["sessionID"] == task["workSessionID"] {
            continue;
        }
        if let Some(session) = task[field].as_str() {
            let session = session.to_owned();
            meta = meta.child(
                crate::sidebar::icon_button(&s.theme, &i::CHAT, name)
                    .size(22.0, 20.0)
                    .radius(6.0)
                    .fill(s.theme.c("secondary"))
                    .on_press(move |s: &mut State| s.open_session(Some(session.clone()))),
            );
        }
    }
    if agent && !done && task["workSessionID"].is_null() {
        let start = id.clone();
        let has_project = !task["project"].is_null();
        let pending = s.pages.pending.contains("task-start")
            && s.pages.tasks.starting.as_deref() == Some(&id);
        let enabled = has_project && !pending;
        let foreground = if enabled {
            s.theme.blend("project-purple", "text", 0.6)
        } else {
            s.theme.c("text-tertiary")
        };
        meta = meta.child(
            row()
                .role("button")
                .label(if has_project {
                    "Start"
                } else {
                    "Needs a project"
                })
                .focusable(true)
                .h(20.0)
                .px(7.0)
                .gap(5.0)
                .radius(6.0)
                .center_y()
                .fill(if enabled {
                    s.theme.tint("project-purple", 0.18)
                } else {
                    s.theme.c("secondary")
                })
                .disabled(!has_project || pending)
                .child(rune::icon(&i::PLAY, 12.0).color(foreground))
                .child(
                    label(
                        &s.theme,
                        if pending {
                            "Starting…"
                        } else if has_project {
                            "Start"
                        } else {
                            "Needs a project"
                        },
                        11.5,
                        if enabled { 550.0 } else { 400.0 },
                        "text-secondary",
                    )
                    .color(foreground),
                )
                .on_press(move |s: &mut State| {
                    s.pages.tasks.starting = Some(start.clone());
                    s.page_mutate(
                        &format!("tasks/{start}/start"),
                        json!({}),
                        "task-start",
                        false,
                    )
                }),
        );
    }
    let days = delayed(task);
    if days > 0 {
        meta = meta.child(
            row()
                .h(20.0)
                .px(7.0)
                .gap(5.0)
                .center_y()
                .radius(6.0)
                .fill(s.theme.tint("warning", 0.14))
                .child(rune::icon(&i::CLOCK, 12.0).color(s.theme.c("warning")))
                .child(label(
                    &s.theme,
                    if days == 1 {
                        "From yesterday".into()
                    } else {
                        format!("Delayed {days} days")
                    },
                    11.5,
                    400.0,
                    "warning",
                )),
        );
    }
    if done {
        if let Some(time) = task["time"]["completed"].as_i64() {
            meta = meta.child(
                label(&s.theme, short_date(time), 11.5, 400.0, "text-secondary")
                    .h(20.0)
                    .px(7.0)
                    .radius(6.0)
                    .fill(s.theme.c("secondary")),
            );
        }
    }
    body = body.child(meta);
    let anchor = id.clone();
    let dragid = id.clone();
    row()
        .key(format!("task-card-{id}"))
        .hover_group_focus()
        .on_layout_tx(move |s: &mut State, r, tx| {
            s.pages.anchors.insert(format!("task-card-{anchor}"), r);
            tx.live_only();
        })
        .on_drag(move |s: &mut State, event, _| super::drag(s, &dragid, event))
        .dim(if s.pages.tasks.dragging.as_deref() == Some(&id) {
            0.4
        } else {
            1.0
        })
        .role("article")
        .label(title)
        .w_full()
        .pl(12.0)
        .pr(9.0)
        .py(11.0)
        .gap(10.0)
        .radius(10.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border"))
        .child(
            el().key(format!("task-check-{id}"))
                .role("checkbox")
                .label(format!(
                    "{} “{title}”",
                    if done { "Reopen" } else { "Complete" }
                ))
                .checked(done)
                .focusable(true)
                .size(17.0, 17.0)
                .mt(1.0)
                .radius(8.5)
                .center()
                .fill(if done {
                    s.theme.c("success")
                } else {
                    rune::Color::TRANSPARENT
                })
                .border(
                    1.5,
                    s.theme.c(if done { "success" } else { "border-heavy" }),
                )
                .child(rune::icon(&i::TICK, 11.0).color(if done {
                    s.theme.c("on-accent")
                } else {
                    rune::Color::TRANSPARENT
                }))
                .on_press(move |s: &mut State| {
                    s.page_write(
                        &format!("tasks/{complete}"),
                        "PATCH",
                        json!({"bucket":if done{reopen.as_str()}else{"done"}}),
                        "tasks",
                    )
                }),
        )
        .child(body)
        .child(
            crate::sidebar::icon_button(&s.theme, &i::DELETE, &format!("Delete “{title}”"))
                .size(20.0, 20.0)
                .group_opacity(0.0, 1.0)
                .on_press(move |s: &mut State| {
                    s.page_mutate(&format!("tasks/{remove}"), Value::Null, "tasks", true)
                }),
        )
}
fn notes_view(s: &State, source: &str, done: bool) -> El {
    let width = (((s.window_size.0
        - if s.prefs.sidebar_closed {
            0.0
        } else {
            s.sidebar_width()
        }
        - 84.0)
        / 4.0)
        .max(232.0)
        - 96.0)
        .max(40.0);
    let font = TextStyle::new(12.5, 400.0).lh(18.125);
    let mut style = rune_kit::MarkdownStyle::neutral(s.theme.dark)
        .body_font(font.clone())
        .text(s.theme.c(if done {
            "text-tertiary"
        } else {
            "text-secondary"
        }))
        .muted(s.theme.c(if done {
            "text-tertiary"
        } else {
            "text-secondary"
        }))
        .text_width(width)
        .link(s.theme.c("link"))
        .link_underline(s.theme.c("link-underline"))
        .inline_code_bg(s.theme.c("code-bg"))
        .list(16.0, 4.0)
        .syntax_highlight(false);
    for level in 1..=4 {
        style = style.heading_font(level, TextStyle::new(12.5, 600.0).lh(18.125));
    }
    rune_kit::Markdown::new(source)
        .render(&style)
        .gap(4.0)
        .clip_rounded(0.0)
}
fn editor(s: &State) -> El {
    let e = s.pages.tasks.editor.as_ref().unwrap();
    let delete = e.id.clone();
    let cancel = e.id.clone();
    let mut project_options = vec![ui::Choice {
        value: "".into(),
        label: "No project".into(),
    }];
    project_options.extend(s.snapshot.projects.iter().map(|p| ui::Choice {
        value: p.canonical.clone(),
        label: p.display_name().into(),
    }));
    if !e.directory.is_empty() && !project_options.iter().any(|o| o.value == e.directory) {
        project_options.push(ui::Choice {
            value: e.directory.clone(),
            label: e
                .directory
                .rsplit('/')
                .next()
                .unwrap_or(&e.directory)
                .into(),
        });
    }
    col()
        .key("task-editor")
        .w_full()
        .padding(11.0)
        .gap(10.0)
        .radius(10.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .on_key(|s: &mut State, event, tx| {
            if event.key == rune::Key::Escape {
                if let Some(e) = s.pages.tasks.editor.take() {
                    tx.return_focus(format!("task-title-{}", e.id), false);
                }
                true
            } else {
                false
            }
        })
        .child(
            text_input(&e.title, TextStyle::new(13.0, 500.0))
                .key("Edit task title")
                .label("Task title")
                .single_line()
                .w_full()
                .color(s.theme.c("text"))
                .on_edit(|s: &mut State| &mut s.pages.tasks.editor.as_mut().unwrap().title)
                .on_input_paste(|s: &mut State, content, _| {
                    ui::limit_input(
                        &mut s.pages.tasks.editor.as_mut().unwrap().title,
                        content.text(),
                        500,
                    )
                })
                .on_input_key(|s: &mut State, e, tx| {
                    if e.key == rune::Key::Escape {
                        cancel_edit(s, tx);
                        return true;
                    }
                    if e.key == rune::Key::Enter {
                        save(s, tx);
                        true
                    } else {
                        ui::limit_key(&mut s.pages.tasks.editor.as_mut().unwrap().title, e, 500)
                    }
                }),
        )
        .child(
            rune::auto_grow(
                text_input(&e.notes, TextStyle::new(13.0, 400.0).lh(18.85))
                    .key("Edit task notes")
                    .label("Notes")
                    .placeholder("Notes", s.theme.c("text-tertiary"))
                    .w_full()
                    .color(s.theme.c("text-secondary"))
                    .on_edit(|s: &mut State| &mut s.pages.tasks.editor.as_mut().unwrap().notes)
                    .on_input_paste(|s: &mut State, content, _| {
                        ui::limit_input(
                            &mut s.pages.tasks.editor.as_mut().unwrap().notes,
                            content.text(),
                            10000,
                        )
                    })
                    .on_input_key(|s: &mut State, e, tx| {
                        if e.key == rune::Key::Escape {
                            cancel_edit(s, tx);
                            return true;
                        }
                        if e.key == rune::Key::Enter && (e.mods.cmd || e.mods.ctrl) {
                            save(s, tx);
                            true
                        } else {
                            ui::limit_key(
                                &mut s.pages.tasks.editor.as_mut().unwrap().notes,
                                e,
                                10000,
                            )
                        }
                    }),
                3,
                17,
            )
            .min_h(56.0)
            .max_h(320.0),
        )
        .child(
            row()
                .w_full()
                .flex_wrap()
                .gap(6.0)
                .child(
                    ui::select(
                        s,
                        "Task list",
                        "List",
                        &e.bucket,
                        COLUMNS
                            .iter()
                            .map(|(b, t, _)| ui::Choice {
                                value: (*b).into(),
                                label: (*t).into(),
                            })
                            .collect(),
                        |s, v| {
                            if let Some(e) = &mut s.pages.tasks.editor {
                                e.bucket = v.into();
                            }
                        },
                    )
                    .w(120.0)
                    .grow(1.0)
                    .min_w(120.0)
                    .h(28.0),
                )
                .child(
                    ui::select(
                        s,
                        "Task assignee",
                        "Assignee",
                        &e.assignee,
                        vec![
                            ui::Choice {
                                value: "user".into(),
                                label: "For me".into(),
                            },
                            ui::Choice {
                                value: "agent".into(),
                                label: "For an agent".into(),
                            },
                        ],
                        |s, v| {
                            if let Some(e) = &mut s.pages.tasks.editor {
                                e.assignee = v.into();
                            }
                        },
                    )
                    .w(120.0)
                    .grow(1.0)
                    .min_w(120.0)
                    .h(28.0),
                )
                .child(
                    ui::select(
                        s,
                        "Task project",
                        "Project",
                        &e.directory,
                        project_options,
                        |s, v| {
                            if let Some(e) = &mut s.pages.tasks.editor {
                                e.directory = v.into();
                            }
                        },
                    )
                    .w(120.0)
                    .grow(1.0)
                    .min_w(120.0)
                    .h(28.0),
                ),
        )
        .child(
            row()
                .w_full()
                .gap(4.0)
                .child(
                    ui::ghost_tone(s, "Delete", "error").on_press(move |s: &mut State| {
                        s.pages.tasks.editor = None;
                        s.page_mutate(&format!("tasks/{delete}"), Value::Null, "tasks", true);
                    }),
                )
                .child(el().grow(1.0))
                .child(
                    ui::ghost(s, "Cancel").on_press_tx(move |s: &mut State, tx| {
                        s.pages.tasks.editor = None;
                        tx.return_focus(format!("task-title-{cancel}"), false);
                    }),
                )
                .child(
                    pages::primary_small_button(s, "Save")
                        .disabled(e.title.text.trim().is_empty())
                        .on_press_tx(save),
                ),
        )
}
fn cancel_edit(s: &mut State, tx: &mut rune::Tx) {
    if let Some(e) = s.pages.tasks.editor.take() {
        tx.return_focus(format!("task-title-{}", e.id), false);
    }
}
