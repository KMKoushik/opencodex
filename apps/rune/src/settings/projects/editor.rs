use super::*;
fn with_editor_error(s: &State, body: El) -> El {
    if let Some(error) = s
        .pages
        .projects
        .editor_save_error
        .as_ref()
        .or(s.pages.projects.upload_error.as_ref())
        .or(s.pages.projects.url_error.as_ref())
        .or(s.pages.projects.error.as_ref())
    {
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
fn input(
    s: &State,
    name: &'static str,
    value: &TextEdit,
    edit: impl Fn(&mut State) -> &mut TextEdit + 'static,
) -> El {
    text_input(value, TextStyle::new(13.0, 400.0))
        .key(name)
        .label(name)
        .single_line()
        .w_full()
        .h(36.0)
        .px(10.0)
        .color(s.theme.c("text"))
        .fill(s.theme.c("control"))
        .border(1.0, s.theme.c("border-heavy"))
        .border_layout()
        .radius(8.0)
        .disabled(
            s.pages.projects.busy
                && (name != "Project name" || s.pages.projects.preparing.is_none()),
        )
        .on_edit(edit)
        .on_input_paste(move |s: &mut State, c, _| {
            if name != "Project name" {
                return false;
            }
            let field = if name == "Project name" {
                &mut s.pages.projects.name
            } else {
                &mut s.pages.projects.url
            };
            ui::limit_input(
                field,
                c.text(),
                if name == "Project name" { 256 } else { 4096 },
            )
        })
        .on_input_key(move |s: &mut State, e, _| {
            if e.key == rune::Key::Enter && name == "Project name" {
                save_current(s);
                return true;
            }
            if e.key == rune::Key::Escape {
                close(s);
                true
            } else {
                let field = if name == "Project name" {
                    &mut s.pages.projects.name
                } else {
                    &mut s.pages.projects.url
                };
                name == "Project name" && ui::limit_key(field, e, 256)
            }
        })
}
pub fn view(s: &State, id: &str) -> El {
    let p = &s.pages.projects;
    let id = id.to_owned();
    let busy = p.busy;
    let saved_source = if !p.image.is_empty() {
        p.image.as_str()
    } else if p.color.is_empty() {
        s.snapshot
            .projects
            .iter()
            .find(|project| project.id == id)
            .and_then(|project| project.icon.as_ref())
            .and_then(|icon| icon.url.as_deref())
            .unwrap_or("")
    } else {
        ""
    };
    let name = if p.name.text.is_empty() {
        project_name(s, &id)
    } else {
        &p.name.text
    };
    let avatar = if let Some(image) = &p.preview {
        el().size(48.0, 48.0).radius(10.0).pixels(image.pixels())
    } else if let Some(image) = super::images::view(s, saved_source, 48.0) {
        image
    } else {
        super::avatar(s, name, &p.color, 48.0)
    };
    let mut icon = row().w_full().gap(12.0).center_y().child(avatar).child(
        col()
            .grow(1.0)
            .gap(6.0)
            .child(
                pages::button(
                    s,
                    if busy && p.preparing == Some("upload") {
                        "Preparing icon…"
                    } else {
                        "Upload icon"
                    },
                )
                .disabled(busy)
                .on_press_tx(|_: &mut State, tx| {
                    tx.open_file(
                        rune::FileDialogOptions {
                            title: "Project icon".into(),
                            ..Default::default()
                        },
                        |s: &mut State, result, _| match result {
                            Ok(Some(path)) => {
                                request(s, path.to_string_lossy().into_owned(), true, false)
                            }
                            Err(_) => {
                                s.pages.projects.error =
                                    Some("The project icon could not be prepared.".into())
                            }
                            _ => {}
                        },
                    )
                }),
            )
            .child(label(
                &s.theme,
                "Images are cropped to a square.",
                12.0,
                400.0,
                "text-tertiary",
            )),
    );
    if !p.image.is_empty() {
        icon = icon.child(
            ui::ghost(s, "Remove icon")
                .disabled(busy)
                .on_press(|s: &mut State| {
                    s.pages.projects.image.clear();
                    s.pages.projects.preview = None;
                    s.pages.projects.url.clear();
                    s.pages.projects.error = None;
                    s.pages.projects.upload_error = None;
                    s.pages.projects.url_error = None;
                }),
        );
    }
    let mut colors = row().w_full().gap(4.0);
    for color in ["gray", "blue", "green", "orange", "pink", "purple"] {
        let checked = if p.color.is_empty() {
            color == "gray"
        } else {
            p.color == color
        };
        colors = colors.child(
            el().key(format!("project-color-{color}"))
                .role("radio")
                .label(format!(
                    "{} icon",
                    format!("{}{}", color[..1].to_uppercase(), &color[1..])
                ))
                .checked(checked)
                .focusable(true)
                .size(36.0, 36.0)
                .radius(8.0)
                .center()
                .fill(if checked {
                    s.theme.c("selected")
                } else {
                    rune::Color::TRANSPARENT
                })
                .child(super::avatar(s, name, color, 20.0))
                .disabled(busy)
                .on_press(move |s: &mut State| {
                    s.pages.projects.color = color.into();
                    s.pages.projects.image.clear();
                    s.pages.projects.preview = None;
                    s.pages.projects.url.clear();
                    s.pages.projects.error = None;
                    s.pages.projects.upload_error = None;
                    s.pages.projects.url_error = None;
                }),
        );
    }
    let url = input(s, "Website or icon URL", &p.url, |s| {
        &mut s.pages.projects.url
    })
    .placeholder("https://example.com", s.theme.c("text-tertiary"))
    .on_input_key(|s: &mut State, e, _| {
        if e.key == rune::Key::Escape {
            close(s);
            return true;
        }
        if e.key == rune::Key::Enter
            && !s.pages.projects.busy
            && !s.pages.projects.url.text.trim().is_empty()
        {
            request(s, s.pages.projects.url.text.clone(), false, true);
            true
        } else {
            false
        }
    })
    .on_input_change(|s: &mut State, _| s.pages.projects.url_error = None);
    with_editor_error(s,col().w_full().gap(20.0)
        .child(col().w_full().gap(8.0).child(label(&s.theme,"Project name",13.0,400.0,"text"))
            .child(input(s,"Project name",&p.name,|s|&mut s.pages.projects.name)))
        .child(icon)
        .child(col().w_full().gap(8.0).child(label(&s.theme,"Website or icon URL",13.0,400.0,"text")).child(url)
            .child(row().gap(8.0)
                .child(pages::button(s,if busy && p.preparing==Some("favicon") {"Loading favicon…"} else {"Use favicon"}).disabled(busy||p.url.text.trim().is_empty()).on_press(|s:&mut State|request(s,s.pages.projects.url.text.clone(),false,true)))
                .child(pages::button(s,if busy && p.preparing==Some("image") {"Loading image…"} else {"Use image URL"}).disabled(busy||p.url.text.trim().is_empty()).on_press(|s:&mut State|request(s,s.pages.projects.url.text.clone(),false,false))))
            .child(label(&s.theme,"Favicon uses the site's /favicon.ico. URL icons need an internet connection.",12.0,400.0,"text-tertiary").mt(6.0).w_full().wrap()))
        .child(col().gap(8.0).child(label(&s.theme,"Icon color",13.0,400.0,"text")).child(colors))
        .child(label(&s.theme,s.snapshot.projects.iter().find(|p|p.id==id).map(|p|p.canonical.as_str()).unwrap_or(""),12.0,400.0,"text-tertiary").w_full().wrap()))
        .child(footer(s,true,save_current))
}
fn save_current(s: &mut State) {
    if s.pages.projects.busy {
        return;
    }
    s.pages.projects.preparing = None;
    s.pages.projects.editor_save_error = None;
    let Some(Dialog::Edit(saveid)) = s.pages.projects.dialog.clone() else {
        return;
    };
    let mut body = json!({"name":s.pages.projects.name.text.trim()});
    if let Some(p) = s.snapshot.projects.iter().find(|p| p.id == saveid) {
        let color = p
            .icon
            .as_ref()
            .and_then(|i| i.color.as_deref())
            .unwrap_or("");
        let image = p
            .icon
            .as_ref()
            .and_then(|i| i.r#override.as_deref())
            .unwrap_or("");
        if color != s.pages.projects.color || image != s.pages.projects.image {
            body["icon"] =
                json!({"color":s.pages.projects.color,"override":s.pages.projects.image});
        }
    }
    write(s, "save", format!("projects/{saveid}"), "PATCH", body);
}
fn request(s: &mut State, source: String, local: bool, favicon: bool) {
    if s.pages.projects.busy {
        return;
    }
    s.pages.projects.error = None;
    s.pages.projects.upload_error = None;
    s.pages.projects.url_error = None;
    s.pages.projects.preparing = Some(if local {
        "upload"
    } else if favicon {
        "favicon"
    } else {
        "image"
    });
    s.pages.projects.busy = s.prompt_request(oc_gateway::prompt::Request::ProjectIcon {
        source,
        local,
        favicon,
    });
    if !s.pages.projects.busy {
        s.pages.projects.error = s.error.clone();
    }
}
pub fn receive_icon(s: &mut State, value: Value) {
    let local = s.pages.projects.preparing.take() == Some("upload");
    s.pages.projects.image = value["url"].as_str().unwrap_or("").into();
    if local {
        s.pages.projects.url.clear();
    }
    if let Some(bytes) = value["png"].as_array() {
        let bytes: Vec<_> = bytes
            .iter()
            .filter_map(|v| v.as_u64().map(|b| b as u8))
            .collect();
        let cache = rune::ImageCache::new(
            s.waker
                .clone()
                .unwrap_or_else(|| std::sync::Arc::new(|| {})),
        );
        s.pages.projects.preview = Some(cache.load(bytes));
    }
}
