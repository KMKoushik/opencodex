use crate::{
    State,
    pages::{self, controls as ui},
    sidebar::label,
};
use rune::{El, TextEdit, TextStyle, col, el, row, text_input};
use serde_json::{Value, json};
pub mod card;
pub const COLUMNS: [(&str, &str, &str); 4] = [
    ("today", "Today", "Nothing planned for today."),
    ("week", "This week", "Nothing else this week."),
    ("someday", "Someday", "Ideas and later work go here."),
    ("done", "Done", "Completed tasks stay here for two weeks."),
];
pub struct Editor {
    pub id: String,
    pub title: TextEdit,
    pub notes: TextEdit,
    pub directory: String,
    pub bucket: String,
    pub assignee: String,
}
#[derive(Default)]
pub struct Board {
    pub capture_focus: bool,
    pub starting: Option<String>,
    pub filter: String,
    pub adding: Option<String>,
    pub editor: Option<Editor>,
    pub dragging: Option<String>,
    pub drop: Option<(String, usize)>,
    pub minute: i64,
}
pub fn delayed(task: &Value) -> i64 {
    if task["bucket"] != "today" {
        return 0;
    }
    task["time"]["moved"]
        .as_i64()
        .and_then(chrono::DateTime::from_timestamp_millis)
        .map(|time| {
            (chrono::Local::now().date_naive() - time.with_timezone(&chrono::Local).date_naive())
                .num_days()
                .max(0)
        })
        .unwrap_or(0)
}
pub fn short_date(time: i64) -> String {
    let Some(time) = chrono::DateTime::from_timestamp_millis(time) else {
        return String::new();
    };
    let local = time.with_timezone(&chrono::Local);
    match (chrono::Local::now().date_naive() - local.date_naive()).num_days() {
        0 => "Today".into(),
        1 => "Yesterday".into(),
        _ => local.format("%e %b").to_string().trim().into(),
    }
}
pub fn tasks(s: &State, bucket: &str) -> Vec<Value> {
    let filter = &s.pages.tasks.filter;
    let assignee = &s.prefs.task_assignee;
    let mut items: Vec<_> = pages::data(s, "tasks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|t| {
            t["bucket"] == bucket
                && (filter.is_empty()
                    || filter == "all"
                    || if filter == "none" {
                        t["project"].is_null()
                    } else {
                        t["project"]["directory"] == filter.as_str()
                    })
                && (assignee.is_empty()
                    || assignee == "all"
                    || t["assignee"].as_str().unwrap_or("user") == assignee)
        })
        .cloned()
        .collect();
    items.sort_by(|a, b| {
        if bucket == "done" {
            b["time"]["completed"]
                .as_f64()
                .unwrap_or(0.0)
                .total_cmp(&a["time"]["completed"].as_f64().unwrap_or(0.0))
        } else {
            a["order"]
                .as_f64()
                .unwrap_or(0.0)
                .total_cmp(&b["order"].as_f64().unwrap_or(0.0))
        }
    });
    items
}
pub fn view(s: &State) -> El {
    let open: usize = ["today", "week", "someday"]
        .iter()
        .map(|b| tasks(s, b).len())
        .sum();
    let delayed_count = tasks(s, "today").iter().filter(|t| delayed(t) > 0).count();
    let mut options = vec![
        ui::Choice {
            value: "all".into(),
            label: "All projects".into(),
        },
        ui::Choice {
            value: "none".into(),
            label: "No project".into(),
        },
    ];
    let mut projects: Vec<_> = s.snapshot.projects.iter().collect();
    let used = |directory: &str| {
        pages::data(s, "tasks")
            .and_then(Value::as_array)
            .is_some_and(|tasks| tasks.iter().any(|t| t["project"]["directory"] == directory))
    };
    projects.sort_by_key(|p| !used(&p.canonical));
    options.extend(projects.iter().map(|p| ui::Choice {
        value: p.canonical.clone(),
        label: p.display_name().into(),
    }));
    let header = row()
        .w_full()
        .gap(16.0)
        .center_y()
        .child(
            col()
                .grow(1.0)
                .gap(2.0)
                .child(
                    label(&s.theme, "Tasks", 20.0, 600.0, "text")
                        .font(TextStyle::new(20.0, 600.0).lh(26.0)),
                )
                .child(label(
                    &s.theme,
                    if pages::data(s, "tasks").is_some() {
                        format!(
                            "{open} open{}",
                            if delayed_count > 0 {
                                format!(" · {delayed_count} delayed")
                            } else {
                                String::new()
                            }
                        )
                    } else {
                        match s.pages.data.get("tasks") {
                            Some(Err(e)) => e.clone(),
                            _ => "Loading…".into(),
                        }
                    },
                    13.0,
                    400.0,
                    "text-tertiary",
                )),
        )
        .child(ui::segment(
            s,
            "Filter by assignee",
            if s.prefs.task_assignee.is_empty() {
                "all"
            } else {
                &s.prefs.task_assignee
            },
            &[("all", "Everyone"), ("user", "Me"), ("agent", "Agent")],
            |s, v| {
                s.prefs.task_assignee = v.into();
                s.save();
            },
        ))
        .child(
            ui::select(
                s,
                "Filter by project",
                "Filter by project",
                if s.pages.tasks.filter.is_empty() {
                    "all"
                } else {
                    &s.pages.tasks.filter
                },
                options,
                |s, v| s.pages.tasks.filter = v.into(),
            )
            .w(200.0),
        );
    let mut body = col()
        .on_press_tx(|s: &mut State, tx| {
            save_with_focus(s, tx, false);
            if s.pages.task_title.text.trim().is_empty() {
                s.pages.tasks.adding = None;
            }
        })
        .on_layout_tx(|s: &mut State, _, tx| {
            if s.pages.tasks.capture_focus {
                s.pages.tasks.capture_focus = false;
                tx.focus_when_shown(
                    if s.pages.tasks.editor.is_some() {
                        "Edit task title"
                    } else {
                        "New task"
                    },
                    false,
                );
            } else {
                tx.live_only();
            }
        })
        .w_full()
        .max_w(1440.0)
        .grow(1.0)
        .min_h(0.0)
        .px(24.0)
        .pt(24.0)
        .pb(32.0)
        .gap(18.0)
        .child(header);
    if pages::data(s, "tasks/plugin").is_some_and(|p| p["state"] == "outdated") {
        body = body.child(
            row()
                .w_full()
                .padding(8.0)
                .pl(14.0)
                .gap(12.0)
                .center_y()
                .radius(10.0)
                .border(1.0, s.theme.c("border"))
                .child(
                    label(
                        &s.theme,
                        "A newer version of the Tasks plugin is available.",
                        13.0,
                        400.0,
                        "text-secondary",
                    )
                    .grow(1.0),
                )
                .child(
                    pages::button(
                        s,
                        if s.pages.pending.contains("tasks/plugin") {
                            "Updating…"
                        } else {
                            "Update"
                        },
                    )
                    .disabled(s.pages.pending.contains("tasks/plugin"))
                    .on_press(|s: &mut State| {
                        s.page_write("tasks/plugin", "PUT", json!({}), "tasks/plugin")
                    }),
                ),
        );
    }
    if let Some(error) = s
        .pages
        .errors
        .get("task-start")
        .or_else(|| s.pages.errors.get("tasks"))
    {
        body = body.child(
            label(&s.theme, error, 13.0, 400.0, "error")
                .w_full()
                .padding(8.0)
                .pl(14.0)
                .radius(10.0)
                .border(1.0, s.theme.c("border"))
                .wrap()
                .role("alert"),
        );
    }
    let mut columns = row().w_full().gap(12.0).min_h(0.0).items_start();
    for (bucket, title, empty) in COLUMNS {
        let entries = tasks(s, bucket);
        let (icon, tint) = match bucket {
            "today" => (&crate::icons::SUN, "warning"),
            "week" => (&crate::icons::CALENDAR, "project-blue"),
            "someday" => (&crate::icons::ARCHIVE, "project-purple"),
            _ => (&crate::icons::COMPLETE, "success"),
        };
        let mut head = row()
            .w_full()
            .h(30.0)
            .pl(6.0)
            .pr(2.0)
            .gap(8.0)
            .center_y()
            .child(rune::icon(icon, 16.0).color(s.theme.c(tint)))
            .child(label(&s.theme, title, 13.0, 600.0, "text"))
            .child(
                label(
                    &s.theme,
                    entries.len().to_string(),
                    11.0,
                    500.0,
                    "text-tertiary",
                )
                .px(6.0)
                .py(1.0)
                .radius(999.0)
                .fill(s.theme.c("secondary")),
            )
            .child(el().grow(1.0));
        if bucket != "done" {
            head = head.child(
                crate::sidebar::icon_button(
                    &s.theme,
                    &crate::icons::PLUS,
                    &format!("Add a task to {title}"),
                )
                .on_press_tx(move |s: &mut State, tx| add(s, bucket, tx)),
            );
        }
        let mut list = col()
            .key(format!("task-scroll-{bucket}"))
            .w_full()
            .gap(6.0)
            .min_h(0.0)
            .max_h((s.window_size.1 - 230.0).max(160.0))
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            });
        if entries.len() > 40 {
            let rows = std::rc::Rc::new(entries.clone());
            let keys = rows.clone();
            list = list.child(
                col()
                    .key(format!("task-rows-{bucket}"))
                    .w_full()
                    .gap(6.0)
                    .growth(rune::GrowthSpec::default())
                    .virtual_rows(
                        rows.len(),
                        96.0,
                        move |_: &State, n| {
                            std::borrow::Cow::Owned(format!(
                                "task-{}",
                                keys[n]["id"].as_str().unwrap_or("")
                            ))
                        },
                        move |s: &State, n| card::view(s, &rows[n]),
                    ),
            );
        } else {
            for (index, task) in entries.iter().enumerate() {
                if bucket != "done"
                    && s.pages
                        .tasks
                        .drop
                        .as_ref()
                        .is_some_and(|(b, n)| b == bucket && *n == index)
                {
                    list = list.child(el().w_full().h(2.0).fill(s.theme.c(tint)));
                }
                list = list.child(card::view(s, task));
            }
        }
        if bucket != "done"
            && s.pages
                .tasks
                .drop
                .as_ref()
                .is_some_and(|(b, n)| b == bucket && *n >= entries.len())
        {
            list = list.child(el().w_full().h(2.0).fill(s.theme.c(tint)));
        }
        if s.pages.tasks.adding.as_deref() == Some(bucket) {
            list = list.child(new_task(s, bucket));
        } else if entries.is_empty() {
            list = list.child(
                label(&s.theme, empty, 12.5, 400.0, "text-tertiary")
                    .w_full()
                    .wrap()
                    .px(8.0)
                    .pt(14.0)
                    .pb(6.0)
                    .align(rune::Align::Center),
            );
        }
        if bucket != "done" && s.pages.tasks.adding.as_deref() != Some(bucket) {
            list = list.child(
                row()
                    .role("button")
                    .label("New task")
                    .focusable(true)
                    .w_full()
                    .h(32.0)
                    .px(10.0)
                    .gap(8.0)
                    .center_y()
                    .radius(8.0)
                    .hover(s.theme.c("hover"))
                    .child(rune::icon(&crate::icons::PLUS, 14.0).color(s.theme.c("text-tertiary")))
                    .child(label(&s.theme, "New task", 13.0, 400.0, "text-tertiary"))
                    .on_press_tx(move |s: &mut State, tx| add(s, bucket, tx)),
            );
        }
        columns = columns.child(
            col()
                .key(format!("task-column-{bucket}"))
                .on_drawn_layout_tx(move |s: &mut State, r, tx| {
                    s.pages.anchors.insert(format!("task-column-{bucket}"), r);
                    tx.live_only();
                })
                .grow(1.0)
                .w(0.0)
                .min_w(232.0)
                .min_h(160.0)
                .padding(9.0)
                .gap(6.0)
                .radius(14.0)
                .fill(s.theme.c("surface-under"))
                .border(1.0, s.theme.c("border"))
                .child(head)
                .child(list),
        );
    }
    body.child(columns)
}
pub fn drag(s: &mut State, id: &str, event: &rune::Drag) {
    match event.phase {
        rune::Phase::Down => {}
        rune::Phase::Move => {
            if event.dx.abs() + event.dy.abs() < 4.0 && s.pages.tasks.dragging.is_none() {
                return;
            }
            s.pages.tasks.dragging = Some(id.into());
            let [x, y] = event.window_point();
            s.pages.tasks.drop = None;
            for (bucket, _, _) in COLUMNS {
                if let Some(r) = s.pages.anchors.get(&format!("task-column-{bucket}")) {
                    if x < r[0] || x > r[0] + r[2] || y < r[1] || y > r[1] + r[3] {
                        continue;
                    }
                    let items: Vec<_> = tasks(s, bucket)
                        .into_iter()
                        .filter(|t| t["id"] != id)
                        .collect();
                    let index = items
                        .iter()
                        .position(|t| {
                            s.pages
                                .anchors
                                .get(&format!("task-card-{}", t["id"].as_str().unwrap_or("")))
                                .is_some_and(|r| y < r[1] + r[3] / 2.0)
                        })
                        .unwrap_or(items.len());
                    s.pages.tasks.drop = Some((bucket.into(), index));
                    break;
                }
            }
        }
        rune::Phase::Up => {
            let dragged = s.pages.tasks.dragging.take();
            let drop = s.pages.tasks.drop.take();
            if event.cancelled() || dragged.as_deref() != Some(id) {
                return;
            }
            if let Some((bucket, index)) = drop {
                let original = pages::data(s, "tasks")
                    .and_then(Value::as_array)
                    .and_then(|ts| ts.iter().find(|t| t["id"] == id));
                let same = original.is_some_and(|t| t["bucket"] == bucket);
                if bucket == "done" {
                    if !same {
                        s.page_write(
                            &format!("tasks/{id}"),
                            "PATCH",
                            json!({"bucket":"done"}),
                            "tasks",
                        );
                    }
                    return;
                }
                let items = tasks(s, &bucket);
                if same && items.iter().position(|t| t["id"] == id) == Some(index) {
                    return;
                }
                let siblings: Vec<_> = items.iter().filter(|t| t["id"] != id).collect();
                let before = index
                    .checked_sub(1)
                    .and_then(|n| siblings.get(n))
                    .and_then(|t| t["order"].as_f64());
                let after = siblings.get(index).and_then(|t| t["order"].as_f64());
                let order = match (before, after) {
                    (Some(a), Some(b)) => (a + b) / 2.0,
                    (Some(a), None) => a + 1.0,
                    (None, Some(b)) => b - 1.0,
                    _ => 1.0,
                };
                let mut input = json!({"order":order});
                if !same {
                    input["bucket"] = json!(bucket);
                }
                s.page_write(&format!("tasks/{id}"), "PATCH", input, "tasks");
            }
        }
    }
}
fn add(s: &mut State, bucket: &str, tx: &mut rune::Tx) {
    s.pages.tasks.adding = Some(bucket.into());
    s.pages.task_title.clear();
    tx.focus_when_shown("New task", false);
}
fn new_task(s: &State, bucket: &'static str) -> El {
    row()
        .w_full()
        .padding(11.0)
        .gap(10.0)
        .radius(10.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border"))
        .child(
            el().size(17.0, 17.0)
                .radius(8.5)
                .border(1.5, s.theme.c("border-heavy")),
        )
        .child(
            text_input(&s.pages.task_title, TextStyle::new(13.0, 400.0))
                .key("New task")
                .label("New task")
                .single_line()
                .spellcheck(true)
                .grow(1.0)
                .color(s.theme.c("text"))
                .placeholder("New task", s.theme.c("text-tertiary"))
                .on_edit(|s: &mut State| &mut s.pages.task_title)
                .on_input_paste(|s: &mut State, c, _| {
                    ui::limit_input(&mut s.pages.task_title, c.text(), 500)
                })
                .on_input_key(move |s: &mut State, e, _| match e.key {
                    rune::Key::Escape => {
                        s.pages.tasks.adding = None;
                        true
                    }
                    rune::Key::Enter => {
                        let title = s.pages.task_title.text.trim().to_owned();
                        if !title.is_empty() {
                            let mut body = json!({"title":title,"bucket":bucket});
                            if s.prefs.task_assignee == "agent" {
                                body["assignee"] = json!("agent");
                            }
                            if let Some(p) = s
                                .snapshot
                                .projects
                                .iter()
                                .find(|p| p.canonical == s.pages.tasks.filter)
                            {
                                body["project"] = json!({"id":p.id,"directory":p.canonical});
                            }
                            s.page_mutate("tasks", body, "tasks", false);
                            s.pages.task_title.clear();
                        }
                        true
                    }
                    _ => ui::limit_key(&mut s.pages.task_title, e, 500),
                }),
        )
}
pub fn edit(s: &mut State, task: &Value, tx: &mut rune::Tx) {
    if s.pages
        .tasks
        .editor
        .as_ref()
        .is_some_and(|e| task["id"] != e.id)
    {
        save_with_focus(s, tx, false);
    }
    s.pages.tasks.editor = Some(editor_for(task));
    tx.focus_when_shown("Edit task title", false);
}
pub fn editor_for(task: &Value) -> Editor {
    Editor {
        id: task["id"].as_str().unwrap().into(),
        title: TextEdit::new(task["title"].as_str().unwrap_or("")),
        notes: TextEdit::new(task["notes"].as_str().unwrap_or("")),
        directory: task["project"]["directory"].as_str().unwrap_or("").into(),
        bucket: task["bucket"].as_str().unwrap().into(),
        assignee: task["assignee"].as_str().unwrap_or("user").into(),
    }
}
pub fn save(s: &mut State, tx: &mut rune::Tx) {
    save_with_focus(s, tx, true);
}
fn save_with_focus(s: &mut State, tx: &mut rune::Tx, focus: bool) {
    let Some(editor) = s.pages.tasks.editor.take() else {
        return;
    };
    let mut input = json!({});
    if let Some(task) = pages::data(s, "tasks")
        .and_then(Value::as_array)
        .and_then(|ts| ts.iter().find(|t| t["id"] == editor.id))
    {
        if !editor.title.text.trim().is_empty()
            && task["title"].as_str() != Some(editor.title.text.trim())
        {
            input["title"] = json!(editor.title.text);
        }
        if task["notes"].as_str().unwrap_or("") != editor.notes.text.trim() {
            input["notes"] = json!(editor.notes.text);
        }
        if task["bucket"] != editor.bucket {
            input["bucket"] = json!(editor.bucket);
        }
        if task["assignee"].as_str().unwrap_or("user") != editor.assignee {
            input["assignee"] = json!(editor.assignee);
        }
        if task["project"]["directory"].as_str().unwrap_or("") != editor.directory {
            input["project"] = s
                .snapshot
                .projects
                .iter()
                .find(|p| p.canonical == editor.directory)
                .map(|p| json!({"id":p.id,"directory":p.canonical}))
                .unwrap_or(Value::Null);
        }
    }
    if input.as_object().is_some_and(|o| !o.is_empty()) {
        s.page_write(&format!("tasks/{}", editor.id), "PATCH", input, "tasks");
    }
    if focus {
        tx.return_focus(format!("task-title-{}", editor.id), false);
    }
}
pub fn after_frame(rt: &rune::Runtime<State>, handle: &rune::AppHandle<State>) {
    if (rt.state.pages.tasks.editor.is_none() && rt.state.pages.tasks.adding.is_none())
        || rt.state.menus.open.is_some()
        || rt.pressing()
    {
        return;
    }
    let elements = rt.elements();
    let Some(index) = elements.iter().position(|e| e.focused) else {
        return;
    };
    if rt.state.pages.tasks.editor.is_none() {
        if rt.state.pages.task_title.text.trim().is_empty()
            && elements[index].key.as_deref() != Some("New task")
        {
            handle.update(|s, _| s.pages.tasks.adding = None);
        }
        return;
    }
    let mut parent = Some(index);
    while let Some(index) = parent {
        if elements[index].key.as_deref() == Some("task-editor") {
            return;
        }
        parent = elements[index].parent;
    }
    handle.update(|s, tx| save_with_focus(s, tx, false));
}
