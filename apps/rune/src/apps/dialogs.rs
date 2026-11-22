use super::*;
use crate::pages::controls as ui;
use rune::{TextStyle, el, row, text_input};
use serde_json::json;
pub fn view(s: &State) -> Option<El> {
    let kind = s.pages.apps.dialog?;
    let id = s.pages.app.as_ref()?;
    let app = data(s, "apps")?
        .as_array()?
        .iter()
        .find(|a| a["id"] == *id)?;
    let title = match kind {
        "icon" => "App icon",
        "delete" => "Delete app?",
        "model" => "App model",
        _ => return None,
    };
    let content = match kind {
        "icon" => icon_picker(s, app),
        "delete" => delete(s, app),
        _ => model(s, app),
    };
    let panel = col()
        .w(440.0f32.min(s.window_size.0 - 32.0))
        .max_h(s.window_size.1 - 32.0)
        .padding(20.0)
        .radius(14.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .child(
            row()
                .w_full()
                .h(28.0)
                .center_y()
                .mb(20.0)
                .child(label(&s.theme, title, 16.0, 600.0, "text").grow(1.0))
                .child(
                    crate::sidebar::icon_button(&s.theme, &crate::icons::CLOSE, "Close dialog")
                        .disabled(s.pages.apps.busy)
                        .on_press(close_dialog),
                ),
        )
        .child(content);
    Some(
        el().absolute(0.0, 0.0)
            .size(s.window_size.0, s.window_size.1)
            .center()
            .modal(true, close_dialog)
            .child(
                el().absolute(0.0, 0.0)
                    .size(s.window_size.0, s.window_size.1)
                    .fill(s.theme.c("scrim"))
                    .on_press(close_dialog),
            )
            .child(s.theme.shadow(panel, "shadow")),
    )
}
fn error(s: &State, body: El) -> El {
    if let Some(error) = &s.pages.apps.error {
        body.child(
            label(&s.theme, error, 13.0, 400.0, "error")
                .w_full()
                .wrap()
                .role("alert"),
        )
    } else {
        body
    }
}
fn actions(s: &State, button: &str, save: impl Fn(&mut State) + 'static) -> El {
    row()
        .w_full()
        .gap(8.0)
        .justify_end()
        .child(
            pages::button(s, "Cancel")
                .key("app-dialog-cancel")
                .disabled(s.pages.apps.busy)
                .on_press(close_dialog),
        )
        .child(
            pages::primary_button(s, button)
                .disabled(s.pages.apps.busy)
                .on_press(save),
        )
}
fn delete(s: &State, app: &Value) -> El {
    let id = app["id"].as_str().unwrap_or("").to_owned();
    let title = app["title"].as_str().unwrap_or("");
    error(s,col().w_full().gap(16.0).child(label(&s.theme,format!("“{title}” stops running. Its code, data, run history, and the agent sessions it started are deleted. Pull requests and other changes it already made stay."),14.0,400.0,"text").w_full().wrap()))
        .child(actions(s,if s.pages.apps.busy{"Deleting…"}else{"Delete"},move|s:&mut State|write(s,"app-delete",format!("canvases/{id}"),"DELETE",Value::Null)))
}
fn icon_picker(s: &State, app: &Value) -> El {
    let id = app["id"].as_str().unwrap_or("").to_owned();
    let query = s.pages.apps.query.text.trim().to_lowercase();
    let mut preview = app.clone();
    preview["icon"] = json!({"color":s.pages.apps.color});
    if !s.pages.apps.glyph.is_empty() {
        preview["icon"]["glyph"] = json!(s.pages.apps.glyph);
    }
    let mut body = col()
        .w_full()
        .gap(16.0)
        .child(
            row()
                .gap(12.0)
                .center_y()
                .child(index::icon(s, &preview, 48.0))
                .child(
                    label(
                        &s.theme,
                        app["title"].as_str().unwrap_or(""),
                        14.0,
                        500.0,
                        "text",
                    )
                    .truncate(),
                ),
        )
        .child(label(&s.theme, "Symbol", 13.0, 400.0, "text"))
        .child(
            text_input(&s.pages.apps.query, TextStyle::new(13.0, 400.0))
                .key("Search symbols")
                .label("Search symbols")
                .placeholder("Search symbols", s.theme.c("text-tertiary"))
                .single_line()
                .w_full()
                .h(34.0)
                .px(10.0)
                .radius(8.0)
                .fill(s.theme.c("control"))
                .color(s.theme.c("text"))
                .on_edit(|s: &mut State| &mut s.pages.apps.query)
                .on_input_key(|s: &mut State, e, _| {
                    if e.key == rune::Key::Escape {
                        close_dialog(s);
                        true
                    } else {
                        false
                    }
                }),
        );
    let words: Vec<_> = query.split_whitespace().collect();
    let mut groups = col()
        .key("app-glyph-scroll")
        .on_layout_tx(|s: &mut State, _, tx| {
            if s.pages.apps.scroll_icon {
                s.pages.apps.scroll_icon = false;
                tx.focus_when_shown("app-dialog-cancel", false);
                tx.scroll_center_in_instant(
                    "app-glyph-scroll",
                    format!("app-glyph-{}", s.pages.apps.glyph),
                );
            } else {
                tx.live_only();
            }
        })
        .w_full()
        .max_h(260.0)
        .gap(12.0)
        .scroll(ScrollSpec {
            stick_bottom: false,
        });
    let mut count = 0;
    if query.is_empty() {
        groups = groups.child(glyph_button(s, "", "Initial", None));
    }
    for &(group, glyphs) in glyphs::GROUPS {
        let matches: Vec<_> = glyphs
            .iter()
            .filter(|g| {
                let text = format!("{group} {}", g.replace('-', " ")).to_lowercase();
                words.iter().all(|w| text.contains(w))
            })
            .collect();
        if matches.is_empty() {
            continue;
        }
        count += matches.len();
        let mut section =
            col()
                .w_full()
                .gap(4.0)
                .child(label(&s.theme, group, 12.0, 500.0, "text-tertiary"));
        for chunk in matches.chunks(10) {
            let mut line = row().w_full().gap(4.0);
            for &&value in chunk {
                let name = format!(
                    "{}{}",
                    value[..1].to_uppercase(),
                    value[1..].replace('-', " ")
                );
                line = line.child(glyph_button(s, value, &name, glyphs::get(value)));
            }
            section = section.child(line);
        }
        groups = groups.child(section);
    }
    if count == 0 {
        groups = groups.child(label(
            &s.theme,
            format!("No symbols match “{}”.", s.pages.apps.query.text.trim()),
            13.0,
            400.0,
            "text-tertiary",
        ));
    }
    body = body
        .child(groups)
        .child(label(&s.theme, "Color", 13.0, 400.0, "text"));
    let mut colors = row().gap(4.0);
    for color in ["gray", "blue", "green", "orange", "pink", "purple"] {
        let mut p = preview.clone();
        p["icon"]["color"] = json!(color);
        colors = colors.child(
            el().role("radio")
                .label(color)
                .checked(s.pages.apps.color == color)
                .focusable(true)
                .size(36.0, 36.0)
                .center()
                .radius(8.0)
                .fill(if s.pages.apps.color == color {
                    s.theme.c("selected")
                } else {
                    rune::Color::TRANSPARENT
                })
                .child(index::icon(s, &p, 20.0))
                .on_press(move |s: &mut State| s.pages.apps.color = color.into()),
        );
    }
    error(s, body.child(colors)).child(actions(
        s,
        if s.pages.apps.busy {
            "Saving…"
        } else {
            "Save"
        },
        move |s: &mut State| {
            let mut icon = json!({"color":s.pages.apps.color});
            if !s.pages.apps.glyph.is_empty() {
                icon["glyph"] = json!(s.pages.apps.glyph);
            }
            write(
                s,
                "app-icon",
                format!("apps/{id}/icon"),
                "PUT",
                json!({"icon":icon}),
            );
        },
    ))
}
fn glyph_button(s: &State, value: &str, name: &str, icon: Option<&'static rune::Icon>) -> El {
    let value = value.to_owned();
    let mut button = el()
        .key(format!("app-glyph-{value}"))
        .role("radio")
        .label(name)
        .checked(s.pages.apps.glyph == value)
        .focusable(true)
        .size(36.0, 36.0)
        .radius(8.0)
        .center()
        .fill(if s.pages.apps.glyph == value {
            s.theme.c("selected")
        } else {
            rune::Color::TRANSPARENT
        });
    if let Some(icon) = icon {
        button = button.child(rune::icon(icon, 18.0).color(s.theme.c("text")));
    } else {
        if let Some(app) = data(s, "apps").and_then(Value::as_array).and_then(|apps| {
            apps.iter()
                .find(|a| a["id"].as_str() == s.pages.app.as_deref())
        }) {
            let mut app = app.clone();
            app["icon"] = json!({"color":s.pages.apps.color});
            button = button.child(index::icon(s, &app, 24.0));
        }
    }
    button
        .disabled(s.pages.apps.busy)
        .on_press(move |s: &mut State| s.pages.apps.glyph = value.clone())
}
fn model(s: &State, app: &Value) -> El {
    let id = app["id"].as_str().unwrap_or("");
    let path = format!("apps/{id}/model");
    let current = data(s, &path);
    let directory = current.and_then(|v| v["directory"].as_str());
    let catalog = directory.and_then(|d| s.snapshot.models.get(d));
    let mut body = col().w_full().gap(16.0).child(
        label(
            &s.theme,
            "Used by oc.ask and oc.run unless server.ts names a model.",
            13.0,
            400.0,
            "text-secondary",
        )
        .w_full()
        .wrap(),
    );
    if let Some(catalog) = catalog {
        let selected = current
            .map(|m| {
                format!(
                    "{}/{}",
                    m["model"]["providerID"].as_str().unwrap_or(""),
                    m["model"]["id"].as_str().unwrap_or("")
                )
            })
            .unwrap_or_default();
        let options = catalog
            .data
            .iter()
            .map(|m| ui::Choice {
                value: format!("{}/{}", m.provider_id, m.id),
                label: m.name.clone(),
            })
            .collect();
        let appid = id.to_owned();
        body = body.child(
            ui::select(
                s,
                "App model",
                "App model",
                &selected,
                options,
                move |s, v| {
                    if let Some((provider, id)) = v.split_once('/') {
                        write(
                            s,
                            "app-model",
                            format!("apps/{appid}/model"),
                            "PUT",
                            json!({"model":{"providerID":provider,"id":id}}),
                        );
                    }
                },
            )
            .w_full(),
        );
    } else {
        body = body.child(label(&s.theme, "Loading…", 13.0, 400.0, "text-tertiary"));
    }
    let source = current.and_then(|v| v["source"].as_str());
    if let Some(source) = source {
        body = body.child(label(
            &s.theme,
            match source {
                "app" => "Picked for this app.",
                "chat" => "Following the chat that made this app.",
                "none" => "No model is available.",
                _ => "OpenCode’s default model.",
            },
            13.0,
            400.0,
            "text-secondary",
        ));
    }
    let mut buttons = row().w_full().gap(8.0).justify_end();
    if source == Some("app") {
        let id = id.to_owned();
        buttons = buttons.child(
            ui::ghost(s, "Use the chat’s model")
                .disabled(s.pages.apps.busy)
                .on_press(move |s: &mut State| {
                    write(
                        s,
                        "app-model",
                        format!("apps/{id}/model"),
                        "PUT",
                        json!({"model":null}),
                    )
                }),
        );
    }
    error(s, body).child(buttons.child(pages::primary_button(s, "Done").on_press(close_dialog)))
}
