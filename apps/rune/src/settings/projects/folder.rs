use super::*;
fn typed(s: &State) -> Option<(String, String)> {
    let path = &s.pages.projects.directory.text;
    if !path.starts_with('/') && !path.starts_with("~/") {
        return None;
    }
    let n = path.rfind('/')?;
    Some((path[..n + 1].into(), path[n + 1..].into()))
}
pub fn load(s: &mut State) {
    s.pages.projects.suggesting = true;
    s.pages.projects.active_folder = -1;
    let Some((parent, _)) = typed(s) else {
        return;
    };
    if s.pages.projects.folder_pending.is_some() {
        return;
    }
    if s.prompt_request(oc_gateway::prompt::Request::Get {
        tag: format!("project-folders:{parent}"),
        path: "folders".into(),
        query: vec![("path".into(), parent.clone())],
    }) {
        s.pages.projects.folder_pending = Some(parent);
    }
}
pub fn receive(s: &mut State, parent: &str, result: Result<Value, String>) {
    s.pages.projects.folder_pending = None;
    if typed(s).is_some_and(|(p, _)| p != parent) {
        load(s);
        return;
    }
    match result {
        Ok(value) => s.pages.projects.folders = Some(value),
        Err(error) => s.pages.projects.error = Some(error),
    }
}
fn matches(s: &State) -> Vec<String> {
    let Some((_, name)) = typed(s) else {
        return vec![];
    };
    let mut folders: Vec<_> = s
        .pages
        .projects
        .folders
        .as_ref()
        .and_then(|v| v["folders"].as_array())
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|f| name.starts_with('.') || !f.starts_with('.'))
        .filter_map(|f| crate::composer::fuzzy::score(f, &name).map(|rank| (rank, f.to_owned())))
        .collect();
    if !name.is_empty() {
        folders.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    }
    folders.into_iter().take(50).map(|(_, f)| f).collect()
}
fn enter(s: &mut State, index: usize) {
    if let Some(folder) = matches(s).get(index) {
        if let Some((parent, _)) = typed(s) {
            s.pages.projects.directory = TextEdit::new(format!("{parent}{folder}/"));
            load(s);
        }
    }
}
pub fn submit(s: &mut State, register: bool) {
    let mut directory = s.pages.projects.directory.text.trim().to_owned();
    if s.pages.projects.suggesting && s.pages.projects.folder_pending.is_none() {
        if let Some((parent, name)) = typed(s) {
            let index = s.pages.projects.active_folder;
            if index >= 0 || !name.is_empty() {
                if let Some(folder) = matches(s).get(index.max(0) as usize) {
                    directory = format!("{parent}{folder}");
                }
            }
        }
    }
    s.pages.projects.suggesting = false;
    if directory.is_empty() {
        return;
    }
    write(
        s,
        if register { "add" } else { "open" },
        if register {
            "projects"
        } else {
            "projects/resolve"
        }
        .into(),
        "POST",
        json!({"directory":directory}),
    );
}
pub fn form(s: &State, register: bool) -> El {
    let mut body = col().w_full().gap(12.0);
    if register {
        body = body.child(
            label(
                &s.theme,
                "Choose a folder on the machine running OpenCodex.",
                13.0,
                400.0,
                "text-secondary",
            )
            .w_full()
            .wrap(),
        );
    }
    let input = text_input(&s.pages.projects.directory, TextStyle::new(13.0, 400.0))
        .key("Project directory")
        .label("Project directory")
        .role("combobox")
        .single_line()
        .grow(1.0)
        .h(36.0)
        .px(10.0)
        .color(s.theme.c("text"))
        .placeholder("~/projects/my-app", s.theme.c("text-tertiary"))
        .on_edit(|s: &mut State| &mut s.pages.projects.directory)
        .on_input_change(|s: &mut State, _| load(s))
        .on_input_key(move |s: &mut State, e, _| {
            if e.key == rune::Key::Enter {
                submit(s, register);
                return true;
            }
            if !s.pages.projects.suggesting {
                if e.key == rune::Key::Escape {
                    close(s);
                    return true;
                }
                return false;
            }
            let len = matches(s).len();
            match e.key {
                rune::Key::Down | rune::Key::Up if len > 0 => {
                    let n = s.pages.projects.active_folder;
                    let step = if e.key == rune::Key::Down { 1 } else { -1 };
                    s.pages.projects.active_folder = (n + step + len as isize) % len as isize;
                    true
                }
                rune::Key::Tab if !e.mods.shift && len > 0 => {
                    enter(s, s.pages.projects.active_folder.max(0) as usize);
                    true
                }
                rune::Key::Escape => {
                    s.pages.projects.suggesting = false;
                    true
                }
                _ => false,
            }
        });
    body=body.child(row().w_full().gap(8.0).center_y()
        .child(row().grow(1.0).min_w(0.0).center_y().radius(8.0).fill(s.theme.c("control")).border(1.0,s.theme.c("border-heavy")).child(input)
            .child(crate::sidebar::icon_button(&s.theme,&crate::icons::FOLDER_OPEN,"Browse for a project folder").disabled(s.pages.projects.busy)
                .on_press_tx(move|_:&mut State,tx|tx.open_folder(rune::FileDialogOptions{title:"Open project".into(),..Default::default()},move|s:&mut State,result,_|match result{
                    Ok(Some(path))=>{s.pages.projects.directory=TextEdit::new(path.to_string_lossy());s.pages.projects.suggesting=false;submit(s,register);},Err(_)=>s.pages.projects.error=Some("The folder picker could not be opened. Enter the path instead.".into()),_=>{}
                }))))
        .child(pages::primary_button(s,if s.pages.projects.busy{"Opening…"}else{"Open"}).disabled(s.pages.projects.directory.text.trim().is_empty()||s.pages.projects.busy).on_press(move|s:&mut State|submit(s,register))));
    if s.pages.projects.suggesting && typed(s).is_some() {
        let mut list = col()
            .w_full()
            .max_h(240.0)
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            })
            .padding(4.0)
            .radius(8.0)
            .fill(s.theme.c("elevated"))
            .border(1.0, s.theme.c("border-heavy"));
        let items = matches(s);
        if items.is_empty() {
            list = list.child(
                label(
                    &s.theme,
                    if s.pages.projects.folders.is_some() {
                        "No matching folders"
                    } else {
                        "No folders here"
                    },
                    13.0,
                    400.0,
                    "text-secondary",
                )
                .padding(10.0),
            );
        }
        for (n, item) in items.iter().enumerate() {
            list = list.child(
                row()
                    .w_full()
                    .h(28.0)
                    .px(10.0)
                    .gap(8.0)
                    .center_y()
                    .radius(4.0)
                    .fill(if s.pages.projects.active_folder == n as isize {
                        s.theme.c("hover")
                    } else {
                        rune::Color::TRANSPARENT
                    })
                    .child(
                        rune::icon(&crate::icons::FOLDER, 14.0).color(s.theme.c("text-tertiary")),
                    )
                    .child(label(&s.theme, item, 13.0, 400.0, "text"))
                    .on_press(move |s: &mut State| enter(s, n)),
            );
        }
        body = body.child(list);
    }
    with_error(s, body)
}
