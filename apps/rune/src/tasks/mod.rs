use crate::{
    State,
    pages::{self, button, data, heading},
    sidebar::label,
};
use rune::{El, ScrollSpec, TextStyle, col, row, text_input};
use serde_json::{Value, json};
pub fn view(s: &State) -> El {
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
    if let Some(plugin) = data(s, "tasks/plugin") {
        if plugin["state"] != "active" && plugin["state"] != "outdated" {
            return body.child(label(&s.theme,"Tasks are saved in OpenCode by a small OpenCodex plugin, so agents can add and update them when you ask.",13.0,400.0,"text-secondary"))
                .child(button(s,"Install tasks plugin").on_press(|s:&mut State|s.page_write("tasks/plugin","PUT",json!({}),"tasks/plugin")));
        }
    }
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
