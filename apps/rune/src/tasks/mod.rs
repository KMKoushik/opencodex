use crate::{
    State,
    pages::{self, button, data, heading},
    sidebar::label,
};
use rune::{El, ScrollSpec, TextStyle, col, row, text_input};
use serde_json::{Value, json};
pub fn view(s: &State) -> El {
    if let Some(plugin) = data(s, "tasks/plugin") {
        if plugin["state"] != "active" && plugin["state"] != "outdated" {
            return setup(s, plugin);
        }
    } else {
        let message = match s.pages.data.get("tasks/plugin") {
            Some(Err(error)) => error.as_str(),
            _ => "Loading tasks…",
        };
        return col().w_full().grow(1.0).padding(24.0).child(label(
            &s.theme,
            message,
            13.0,
            400.0,
            "text-tertiary",
        ));
    }
    let mut body = col()
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .padding(28.0)
        .gap(16.0)
        .child(heading(
            s,
            "Tasks",
            "Plan your day across Today, This week, and Someday.",
        ));
    if let Some(status) = pages::status(s, "tasks") {
        return body.child(status);
    }
    body = body.child(
        row()
            .w_full()
            .gap(8.0)
            .child(
                text_input(&s.pages.task_title, TextStyle::new(13.0, 400.0))
                    .key("task-title")
                    .on_edit(|s: &mut State| &mut s.pages.task_title)
                    .placeholder("Add a task…", s.theme.c("text-tertiary"))
                    .color(s.theme.c("text"))
                    .grow(1.0)
                    .h(34.0)
                    .px(10.0)
                    .border(1.0, s.theme.c("border"))
                    .radius(6.0),
            )
            .child(button(s, "Add task").on_press(|s: &mut State| {
                let title = s.pages.task_title.text.trim().to_owned();
                if !title.is_empty() {
                    s.page_mutate(
                        "tasks",
                        json!({"title":title,"bucket":"today"}),
                        "tasks",
                        false,
                    );
                    s.pages.task_title.clear();
                }
            })),
    );
    let mut columns = row().w_full().grow(1.0).min_h(0.0).gap(16.0);
    for (bucket, title, empty) in [
        ("today", "Today", "Nothing planned for today."),
        ("week", "This week", "Nothing else this week."),
        ("someday", "Someday", "Ideas and later work go here."),
        ("done", "Done", "Completed tasks stay here for two weeks."),
    ] {
        let entries: Vec<_> = data(s, "tasks")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|task| task["bucket"] == bucket)
            .collect();
        let mut column = col()
            .grow(1.0)
            .w(0.0)
            .min_w(0.0)
            .gap(10.0)
            .scroll(ScrollSpec {
                stick_bottom: false,
            })
            .child(label(
                &s.theme,
                format!("{title}  {}", entries.len()),
                13.0,
                500.0,
                "text",
            ));
        if entries.is_empty() {
            column = column.child(
                label(&s.theme, empty, 12.0, 400.0, "text-tertiary")
                    .w_full()
                    .wrap()
                    .py(24.0),
            );
        }
        for task in entries.into_iter().take(200) {
            let id = task["id"].as_str().unwrap_or("").to_owned();
            let complete = id.clone();
            let start = id.clone();
            column = column.child(
                col()
                    .w_full()
                    .padding(12.0)
                    .gap(8.0)
                    .radius(8.0)
                    .border(1.0, s.theme.c("border"))
                    .child(label(
                        &s.theme,
                        task["title"].as_str().unwrap_or(""),
                        13.0,
                        400.0,
                        "text",
                    ))
                    .child(label(
                        &s.theme,
                        task["notes"].as_str().unwrap_or(""),
                        12.0,
                        400.0,
                        "text-secondary",
                    ))
                    .child(button(s, "Delete").on_press(move |s: &mut State| {
                        s.page_mutate(&format!("tasks/{id}"), Value::Null, "tasks", true)
                    }))
                    .child(
                        button(
                            s,
                            if bucket == "done" {
                                "Reopen"
                            } else {
                                "Complete"
                            },
                        )
                        .on_press(move |s: &mut State| {
                            s.page_write(
                                &format!("tasks/{complete}"),
                                "PATCH",
                                json!({"bucket":if bucket=="done"{"today"}else{"done"}}),
                                "tasks",
                            );
                        }),
                    )
                    .child(button(s, "Start agent").on_press(move |s: &mut State| {
                        s.page_mutate(
                            &format!("tasks/{start}/start"),
                            json!({}),
                            "task-start",
                            false,
                        )
                    })),
            );
        }
        columns = columns.child(column);
    }
    body.child(columns)
}
fn setup(s: &State, plugin: &Value) -> El {
    let state = plugin["state"].as_str().unwrap_or("");
    let mut content = col().w_full().max_w(440.0).mt(s.window_size.1 * 0.12)
        .items_center().gap(12.0)
        .child(s.theme.shadow(s.theme.paint(rune::el().size(44.0, 44.0).center().radius(12.0)
            .child(rune::icon(&crate::icons::TASKS, 22.0).color(s.theme.c("text"))), "glaze"), "glaze-shadow"))
        .child(label(&s.theme, "Tasks", 20.0, 600.0, "text"))
        .child(label(&s.theme, "Plan your day across Today, This week, and Someday. Tasks are saved in OpenCode by a small OpenCodex plugin, so agents can add and update them when you ask.", 14.0, 400.0, "text-secondary")
            .w_full().wrap().align(rune::Align::Center));
    if matches!(state, "failed" | "unavailable") {
        content = content.child(
            label(
                &s.theme,
                plugin["message"].as_str().unwrap_or(""),
                14.0,
                400.0,
                "error",
            )
            .role("alert")
            .w_full()
            .wrap(),
        );
    } else if state == "loading" {
        content = content.child(
            label(&s.theme, "Starting Tasks…", 14.0, 400.0, "text-secondary").role("status"),
        );
    } else {
        let pending = s.pages.pending.contains("tasks/plugin");
        content = content.child(
            pages::primary_button(
                s,
                if pending {
                    "Turning on…"
                } else {
                    "Turn on Tasks"
                },
            )
            .disabled(pending)
            .on_press(|s: &mut State| {
                s.page_write("tasks/plugin", "PUT", json!({}), "tasks/plugin")
            }),
        );
    }
    if let Some(path) = plugin["path"].as_str() {
        content = content.child(
            label(&s.theme, path, 12.0, 400.0, "text-tertiary")
                .font(TextStyle::new(12.0, 400.0).mono().lh(18.0))
                .w_full()
                .wrap()
                .align(rune::Align::Center),
        );
    }
    col()
        .w_full()
        .grow(1.0)
        .px(24.0)
        .pt(24.0)
        .pb(32.0)
        .items_center()
        .child(content)
}
