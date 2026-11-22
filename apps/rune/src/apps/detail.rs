use super::*;
use crate::pages::controls as ui;
use rune::{TextStyle, el, row};
use serde_json::json;
fn tab(s: &State) -> &str {
    if s.pages.apps.tab.is_empty() {
        "app"
    } else {
        &s.pages.apps.tab
    }
}
pub fn view(s: &State, app: &Value) -> El {
    let id = app["id"].as_str().unwrap_or("").to_owned();
    let switch = id.clone();
    let runs = id.clone();
    let mut meta = index::status(app);
    let schedule = index::schedule(app);
    if !schedule.is_empty() {
        meta.push_str(&format!(" · {schedule}"));
    }
    let mut meta_row = row()
        .gap(5.0)
        .center_y()
        .child(label(&s.theme, meta, 12.0, 400.0, "text-tertiary").truncate());
    if let Some(model) = data(s, &format!("apps/{id}/model")) {
        if let Some(model_id) = model["model"]["id"].as_str() {
            let name = model["directory"]
                .as_str()
                .and_then(|d| s.snapshot.models.get(d))
                .and_then(|catalog| {
                    catalog.data.iter().find(|m| {
                        m.id == model_id
                            && Some(m.provider_id.as_str()) == model["model"]["providerID"].as_str()
                    })
                })
                .map(|m| m.name.as_str())
                .unwrap_or(model_id);
            meta_row = meta_row
                .child(label(&s.theme, "·", 12.0, 400.0, "text-tertiary"))
                .child(
                    label(&s.theme, name, 12.0, 400.0, "text-tertiary")
                        .role("button")
                        .label(name)
                        .focusable(true)
                        .on_press_tx(|s: &mut State, tx| super::open_dialog(s, "model", tx)),
                );
        }
    }
    let header = row()
        .w_full()
        .px(20.0)
        .pt(14.0)
        .pb(12.0)
        .gap(10.0)
        .center_y()
        .border_sides([0.0, 0.0, 1.0, 0.0], s.theme.c("border"))
        .child(
            index::icon(s, app, 32.0)
                .role("button")
                .label("Change icon")
                .focusable(true)
                .on_press_tx(|s: &mut State, tx| super::open_dialog(s, "icon", tx)),
        )
        .child(
            col()
                .grow(1.0)
                .min_w(0.0)
                .gap(2.0)
                .child(
                    label(
                        &s.theme,
                        app["title"].as_str().unwrap_or(""),
                        15.0,
                        600.0,
                        "text",
                    )
                    .font(TextStyle::new(15.0, 600.0).lh(19.5))
                    .truncate(),
                )
                .child(meta_row),
        )
        .child(ui::segment(
            s,
            "Show",
            tab(s),
            &[("app", "App"), ("settings", "Settings"), ("code", "Code")],
            move |s, v| {
                s.pages.apps.tab = v.into();
                if v == "code" {
                    s.page_get(&format!("canvases/{switch}/files"));
                }
                if v == "settings" {
                    s.page_get(&format!("apps/{switch}/runs"));
                }
            },
        ));
    let mut header = header;
    let action_id = id.clone();
    let anchor_id = id.clone();
    let actions = crate::sidebar::icon_button(
        &s.theme,
        &crate::icons::MORE,
        &format!("Actions for {}", app["title"].as_str().unwrap_or("")),
    )
    .key(format!("app-actions-{id}"))
    .on_layout_tx(move |s: &mut State, r, tx| {
        s.pages
            .anchors
            .insert(format!("app-actions-{anchor_id}"), r);
        tx.live_only();
    })
    .on_press_tx(move |s: &mut State, tx| {
        if let Some(r) = s.pages.anchors.get(&format!("app-actions-{action_id}")) {
            s.menus.point = Some((r[0] + r[2] - 180.0, r[1] + r[3] + 4.0));
        }
        s.menus.open = Some(crate::menus::Menu::App(action_id.clone()));
        tx.focus_when_shown("menu-Change model…", false);
    });
    if let Some(session) = app["sessionID"].as_str() {
        let session = session.to_owned();
        header = header.child(
            ui::ghost(s, "Open chat")
                .on_press(move |s: &mut State| s.open_session(Some(session.clone()))),
        );
    }
    let triggers: Vec<_> = app["triggers"]
        .as_object()
        .into_iter()
        .flat_map(|o| o.keys())
        .cloned()
        .collect();
    if triggers.len() > 1 {
        let appid = id.clone();
        let anchor = id.clone();
        header = header.child(
            pages::button(s, "Run")
                .label("Run a function")
                .key(format!("app-run-{id}"))
                .on_layout_tx(move |s: &mut State, r, tx| {
                    s.pages.anchors.insert(format!("app-run-{anchor}"), r);
                    tx.live_only();
                })
                .on_press_tx(move |s: &mut State, tx| {
                    if let Some(r) = s.pages.anchors.get(&format!("app-run-{appid}")) {
                        s.menus.point = Some((r[0] + r[2] - 180.0, r[1] + r[3] + 4.0));
                    }
                    s.menus.open = Some(crate::menus::Menu::AppRun(appid.clone()));
                    tx.focus_when_shown("menu-Run", false);
                }),
        );
    }
    for name in triggers.into_iter().take(
        if app["triggers"].as_object().is_some_and(|t| t.len() == 1) {
            1
        } else {
            0
        },
    ) {
        let call = name.clone();
        let appid = id.clone();
        let running = app["running"]
            .as_array()
            .is_some_and(|rs| rs.iter().any(|r| r == &name));
        header = header.child(
            pages::button(s, &format!("Run {name}"))
                .disabled(!s.snapshot.live || running)
                .on_press(move |s: &mut State| run(s, &appid, &call)),
        );
    }
    let mut body = col()
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .child(header.child(actions));
    if let Some(error) = app["error"].as_str().or_else(|| {
        s.pages
            .errors
            .get(&format!("apps/{id}/runs"))
            .map(String::as_str)
    }) {
        body = body.child(
            label(&s.theme, error, 13.0, 400.0, "error")
                .padding(12.0)
                .w_full()
                .wrap()
                .role("alert"),
        );
    }
    body = body.child(match tab(s) {
        "settings" => settings(s, app),
        "code" => code(s, &id),
        _ => super::canvas_host(s, &id),
    });
    let expanded = s.pages.apps.runs_open;
    let toggle = row()
        .w_full()
        .h(34.0)
        .px(20.0)
        .gap(6.0)
        .center_y()
        .role("button")
        .label("Runs")
        .focusable(true)
        .child(
            rune::icon(
                if expanded {
                    &crate::icons::DOWN
                } else {
                    &crate::icons::RIGHT
                },
                12.0,
            )
            .color(s.theme.c("text-secondary")),
        )
        .child(label(&s.theme, "Runs", 12.5, 550.0, "text-secondary"))
        .child(label(
            &s.theme,
            app["runCount"].as_u64().unwrap_or(0).to_string(),
            12.5,
            400.0,
            "text-tertiary",
        ))
        .on_press(move |s: &mut State| {
            s.pages.apps.runs_open = !s.pages.apps.runs_open;
            if s.pages.apps.runs_open {
                s.page_get(&format!("apps/{runs}/runs"));
            }
        });
    let mut panel = col()
        .w_full()
        .max_h(s.window_size.1 * 0.4)
        .border_sides([1.0, 0.0, 0.0, 0.0], s.theme.c("border"))
        .child(toggle);
    if expanded {
        panel = panel.child(run_list(s, &id));
    }
    body.child(panel)
}
pub(crate) fn run(s: &mut State, id: &str, name: &str) {
    s.page_mutate(
        &format!("canvases/{id}/functions/{name}"),
        json!({"args":[]}),
        &format!("apps/{id}/runs"),
        false,
    );
}
fn run_list(s: &State, id: &str) -> El {
    let path = format!("apps/{id}/runs");
    let mut list = col()
        .w_full()
        .min_h(0.0)
        .px(12.0)
        .pb(10.0)
        .scroll(ScrollSpec {
            stick_bottom: false,
        });
    if let Some(status) = pages::status(s, &path) {
        return list.child(status);
    }
    let runs = data(s, &path).and_then(Value::as_array);
    if runs.is_none_or(Vec::is_empty) {
        return list
            .child(label(&s.theme, "No runs yet.", 13.0, 400.0, "text-tertiary").padding(24.0));
    }
    for run in runs.into_iter().flatten() {
        let id = run["id"].as_str().unwrap_or("").to_owned();
        let toggle = id.clone();
        let status = run["status"].as_str().unwrap_or("");
        let open = s.pages.apps.open_runs.contains(&id)
            || (status == "error" && !s.pages.apps.closed_runs.contains(&id));
        let detail = !run["error"].is_null()
            || ["logs", "sessions", "calls"]
                .iter()
                .any(|k| run[*k].as_array().is_some_and(|v| !v.is_empty()));
        let ms = run["ended"]
            .as_i64()
            .unwrap_or_else(|| chrono::Local::now().timestamp_millis())
            - run["started"].as_i64().unwrap_or(0);
        let duration = if ms < 1000 {
            format!("{ms} ms")
        } else if ms < 60000 {
            format!("{:.1} s", ms as f64 / 1000.0)
        } else {
            format!("{} min", (ms as f64 / 60000.0).round() as i64)
        };
        list = list.child(
            row()
                .w_full()
                .px(8.0)
                .py(5.0)
                .gap(8.0)
                .center_y()
                .radius(6.0)
                .hover(s.theme.c("hover"))
                .role("button")
                .label(format!("{}()", run["fn"].as_str().unwrap_or("")))
                .focusable(true)
                .disabled(!detail)
                .child(
                    el().size(6.0, 6.0)
                        .radius(3.0)
                        .fill(s.theme.c(match status {
                            "ok" => "success",
                            "error" => "error",
                            "running" => "warning",
                            _ => "text-tertiary",
                        })),
                )
                .child(
                    label(
                        &s.theme,
                        format!("{}()", run["fn"].as_str().unwrap_or("")),
                        12.0,
                        400.0,
                        "text",
                    )
                    .font(TextStyle::new(12.0, 400.0).mono()),
                )
                .child(label(
                    &s.theme,
                    format!(
                        "{status} · {} · {} · {duration}",
                        run["source"].as_str().unwrap_or(""),
                        index::ago(run["started"].as_i64().unwrap_or(0))
                    ),
                    12.5,
                    400.0,
                    "text-tertiary",
                ))
                .on_press(move |s: &mut State| {
                    if open {
                        s.pages.apps.open_runs.remove(&toggle);
                        s.pages.apps.closed_runs.insert(toggle.clone());
                    } else {
                        s.pages.apps.closed_runs.remove(&toggle);
                        s.pages.apps.open_runs.insert(toggle.clone());
                    }
                }),
        );
        if open {
            for session in run["sessions"].as_array().into_iter().flatten() {
                if let Some(id) = session["id"].as_str() {
                    let id = id.to_owned();
                    list = list.child(
                        ui::ghost(s, session["title"].as_str().unwrap_or("Open chat"))
                            .on_press(move |s: &mut State| s.open_session(Some(id.clone()))),
                    );
                }
            }
            for call in run["calls"].as_array().into_iter().flatten() {
                let source = match call["source"].as_str().unwrap_or("") {
                    "code" => "set in code",
                    "app" => "app model",
                    "chat" => "chat’s model",
                    "default" => "default model",
                    "thread" => "continued thread",
                    _ => "",
                };
                let elapsed = call["ended"]
                    .as_i64()
                    .map(|end| {
                        let ms = end - call["started"].as_i64().unwrap_or(end);
                        if ms < 1000 {
                            format!("{ms} ms")
                        } else if ms < 60000 {
                            format!("{:.1} s", ms as f64 / 1000.0)
                        } else {
                            format!("{} min", (ms as f64 / 60000.0).round() as i64)
                        }
                    })
                    .unwrap_or_else(|| "running".into());
                list = list.child(
                    row()
                        .w_full()
                        .gap(8.0)
                        .pl(22.0)
                        .py(2.0)
                        .child(
                            label(
                                &s.theme,
                                format!("oc.{}", call["kind"].as_str().unwrap_or("")),
                                11.5,
                                400.0,
                                "text-secondary",
                            )
                            .font(TextStyle::new(11.5, 400.0).mono()),
                        )
                        .child(
                            label(
                                &s.theme,
                                call["model"].as_str().unwrap_or("choosing model…"),
                                12.0,
                                400.0,
                                "text",
                            )
                            .truncate(),
                        )
                        .child(label(
                            &s.theme,
                            format!("{source} · {elapsed}"),
                            11.5,
                            400.0,
                            "text-tertiary",
                        )),
                );
                if let Some(error) = call["error"].as_str() {
                    list = list.child(
                        label(&s.theme, error, 11.5, 400.0, "error")
                            .pl(22.0)
                            .w_full()
                            .wrap(),
                    );
                }
            }
            if let Some(error) = run["error"].as_str() {
                list = list.child(
                    label(&s.theme, error, 11.5, 400.0, "error")
                        .w_full()
                        .wrap()
                        .padding(8.0),
                );
            }
            for log in run["logs"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
            {
                list = list.child(
                    label(&s.theme, log, 11.5, 400.0, "text-secondary")
                        .font(TextStyle::new(11.5, 400.0).mono())
                        .w_full()
                        .wrap()
                        .selectable(true),
                );
            }
        }
    }
    list
}
fn settings(s: &State, app: &Value) -> El {
    let group = |title: &str| crate::settings::group(s, title);
    let field =
        |title: &str, description: &str| crate::settings::setting_row(s, title, description);
    let id = app["id"].as_str().unwrap_or("");
    let created = app["created"]
        .as_i64()
        .and_then(chrono::DateTime::from_timestamp_millis)
        .map(|t| {
            t.with_timezone(&chrono::Local)
                .format("%e %b %Y, %-I:%M %p")
                .to_string()
        })
        .unwrap_or_default();
    let mut body = col().w_full().max_w(720.0).padding(24.0).gap(16.0).child(
        group("App")
            .child(
                field("Icon", "").child(
                    index::icon(s, app, 28.0)
                        .role("button")
                        .label("Change icon")
                        .focusable(true)
                        .on_press_tx(|s: &mut State, tx| super::open_dialog(s, "icon", tx)),
                ),
            )
            .child(field("Name", app["title"].as_str().unwrap_or("")))
            .child(field("Created", &created))
            .child(field("Folder", app["path"].as_str().unwrap_or(""))),
    );
    let model_path = format!("apps/{id}/model");
    let model = data(s, &model_path);
    body = body.child(
        group("Model").child(
            field(
                model
                    .and_then(|m| m["model"]["id"].as_str())
                    .unwrap_or("No model"),
                "Used by oc.ask and oc.run unless the code names one.",
            )
            .child(
                pages::button(s, "Change")
                    .on_press_tx(|s: &mut State, tx| super::open_dialog(s, "model", tx)),
            ),
        ),
    );
    let mut functions = group("Functions");
    if app["functions"].as_array().is_none_or(Vec::is_empty) {
        functions = functions.child(field("No functions", "server.ts exports no functions yet."));
    }
    for name in app["functions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
    {
        let mut line = field(
            name,
            if app["triggers"][name].is_null() {
                "On demand · never run"
            } else {
                "Scheduled"
            },
        );
        if !app["triggers"][name].is_null() {
            let id = id.to_owned();
            let name = name.to_owned();
            line = line
                .child(pages::button(s, "Run").on_press(move |s: &mut State| run(s, &id, &name)));
        }
        functions = functions.child(line);
    }
    col()
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .items_center()
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(body.child(functions))
}
fn code(s: &State, id: &str) -> El {
    super::code::view(s, id)
}
