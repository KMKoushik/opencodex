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
    request(s);
}
fn request(s: &mut State) {
    let Some((parent, _)) = typed(s) else {
        return;
    };
    if let Some((time, value)) = s
        .pages
        .projects
        .folder_cache
        .get(&parent)
        .filter(|(time, _)| time.elapsed().as_secs() < 30)
    {
        let _ = time;
        s.pages.projects.folders = Some(value.clone());
        s.pages.projects.folders_parent = Some(parent);
        s.pages.projects.folder_error = None;
        return;
    }
    if s.pages.projects.folder_pending.is_some() {
        return;
    }
    s.pages.projects.folder_error = None;
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
    if let Ok(value) = &result {
        if s.pages.projects.folder_cache.len() >= 8
            && !s.pages.projects.folder_cache.contains_key(parent)
        {
            if let Some(oldest) = s
                .pages
                .projects
                .folder_cache
                .iter()
                .min_by_key(|(_, (time, _))| *time)
                .map(|(path, _)| path.clone())
            {
                s.pages.projects.folder_cache.remove(&oldest);
            }
        }
        s.pages
            .projects
            .folder_cache
            .insert(parent.into(), (std::time::Instant::now(), value.clone()));
    }
    if typed(s).is_none_or(|(p, _)| p != parent) {
        if s.pages.projects.suggesting {
            request(s);
        }
        return;
    }
    s.pages.projects.folders_parent = Some(parent.into());
    match result {
        Ok(value) => {
            s.pages.projects.folders = Some(value);
            s.pages.projects.folder_error = None;
        }
        Err(error) => s.pages.projects.folder_error = Some(error),
    }
}
fn matches(s: &State) -> (Vec<String>, usize) {
    let Some((_, name)) = typed(s) else {
        return (vec![], 0);
    };
    let visible: Vec<_> = s
        .pages
        .projects
        .folders
        .as_ref()
        .and_then(|v| v["folders"].as_array())
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|f| name.starts_with('.') || !f.starts_with('.'))
        .collect();
    let total = visible.len();
    let mut folders: Vec<_> = visible
        .into_iter()
        .filter_map(|f| crate::composer::fuzzy::score(f, &name).map(|rank| (rank, f.to_owned())))
        .collect();
    if !name.is_empty() {
        folders.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    }
    (
        folders.into_iter().take(50).map(|(_, f)| f).collect(),
        total,
    )
}
fn active(s: &State, items: &[String]) -> isize {
    if s.pages.projects.active_folder >= 0 {
        return s.pages.projects.active_folder;
    }
    if typed(s).is_some_and(|(_, name)| !name.is_empty()) && !items.is_empty() {
        0
    } else {
        -1
    }
}
fn stale(s: &State) -> bool {
    typed(s).is_some_and(|(parent, _)| s.pages.projects.folders_parent.as_deref() != Some(&parent))
}
fn showing(s: &State) -> bool {
    s.pages.projects.suggesting
        && typed(s).is_some()
        && (s.pages.projects.folders.is_some() || s.pages.projects.folder_error.is_some())
}
fn enter(s: &mut State, index: usize, tx: &mut rune::Tx) {
    if stale(s) {
        return;
    }
    if let Some(folder) = matches(s).0.get(index) {
        if let Some((parent, _)) = typed(s) {
            s.pages.projects.directory = TextEdit::new(format!("{parent}{folder}/"));
            load(s);
            tx.focus("Project directory", false);
        }
    }
}
pub fn submit(s: &mut State, register: bool) {
    let mut directory = s.pages.projects.directory.text.trim().to_owned();
    let (items, _) = matches(s);
    let index = active(s, &items);
    if showing(s) && !stale(s) && index >= 0 {
        if let (Some((parent, _)), Some(folder)) = (typed(s), items.get(index as usize)) {
            directory = format!("{parent}{folder}");
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
    let input = text_input(
        &s.pages.projects.directory,
        TextStyle::new(13.0, 400.0).mono().lh(19.5),
    )
    .key("Project directory")
    .label("Project directory")
    .role("combobox")
    .single_line()
    .grow(1.0)
    .h(36.0)
    .pl(12.0)
    .pr(4.0)
    .py(8.0)
    .color(s.theme.c("text"))
    .placeholder("~/projects/my-app", s.theme.c("text-tertiary"))
    .on_edit(|s: &mut State| &mut s.pages.projects.directory)
    .on_input_change(|s: &mut State, _| load(s))
    .on_input_key(move |s: &mut State, event, tx| {
        if event.key == rune::Key::Enter {
            submit(s, register);
            return true;
        }
        if !showing(s) {
            if event.key == rune::Key::Escape && s.pages.projects.dialog.is_some() {
                close(s);
                return true;
            }
            return false;
        }
        let (items, _) = matches(s);
        let len = items.len() as isize;
        let active = active(s, &items);
        match event.key {
            rune::Key::Down | rune::Key::Up => {
                if len > 0 {
                    let step = if event.key == rune::Key::Down { 1 } else { -1 };
                    let from = if active < 0 && step < 0 { 0 } else { active };
                    let next = (from + step + len) % len;
                    s.pages.projects.active_folder = next;
                    tx.scroll_into_view_in("project-folders", format!("project-folder-{next}"));
                }
                true
            }
            rune::Key::Tab if !event.mods.shift && !stale(s) && len > 0 => {
                enter(s, active.max(0) as usize, tx);
                true
            }
            rune::Key::Escape => {
                s.pages.projects.suggesting = false;
                true
            }
            _ => false,
        }
    });
    let disabled = s.pages.projects.directory.text.trim().is_empty() || s.pages.projects.busy;
    body=body.child(row().w_full().gap(8.0).center_y()
        .child(row().key("project-directory-field").grow(1.0).min_w(0.0).center_y().radius(10.0).fill(s.theme.c("control")).border(1.0,s.theme.c(if s.pages.projects.directory.focused{"accent"}else{"border-heavy"})).child(input)
            .on_layout_tx(|s:&mut State,rect,tx|{s.pages.anchors.insert("project-directory-field".into(),rect);tx.live_only();})
            .child(crate::sidebar::icon_button(&s.theme,&crate::icons::FOLDER_OPEN,"Browse for a project folder").disabled(s.pages.projects.busy)
                .on_press_tx(move|_:&mut State,tx|tx.open_folder(rune::FileDialogOptions{title:"Open project".into(),..Default::default()},move|s:&mut State,result,_|match result{
                    Ok(Some(path))=>{s.pages.projects.directory=TextEdit::new(path.to_string_lossy());s.pages.projects.suggesting=false;submit(s,register);},Err(_)=>s.pages.projects.error=Some("The folder picker could not be opened. Enter the path instead.".into()),_=>{}
                }))))
        .child(pages::primary_button(s,if s.pages.projects.busy{"Opening…"}else{"Open"}).h(36.0).disabled(disabled).dim(if disabled{0.45}else{1.0}).on_press(move|s:&mut State|submit(s,register))));
    with_error(s, body)
}
pub fn overlay(s: &State) -> Option<El> {
    if !showing(s) {
        return None;
    }
    let rect = s.pages.anchors.get("project-directory-field")?;
    let (items, total) = matches(s);
    let active = active(s, &items);
    let stale = stale(s);
    let height = (total.clamp(1, 8) as f32 * 30.0 + 10.0).min((s.window_size.1 - 16.0).max(40.0));
    let mut list = col()
        .key("project-folders")
        .role("listbox")
        .label("Folders")
        .w(rect[2])
        .h(height)
        .padding(4.0)
        .radius(10.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        });
    if let Some(error) = &s.pages.projects.folder_error {
        list = list.child(
            label(&s.theme, error, 12.0, 400.0, "text-tertiary")
                .px(8.0)
                .py(6.0)
                .w_full()
                .wrap(),
        );
    } else if items.is_empty() {
        list = list.child(
            label(
                &s.theme,
                if total > 0 {
                    "No matching folders"
                } else {
                    "No folders here"
                },
                12.0,
                400.0,
                "text-tertiary",
            )
            .px(8.0)
            .py(6.0),
        );
    } else {
        for (n, item) in items.iter().enumerate() {
            list = list.child(
                row()
                    .key(format!("project-folder-{n}"))
                    .role("option")
                    .label(item)
                    .checked(active == n as isize)
                    .w_full()
                    .h(30.0)
                    .px(8.0)
                    .gap(8.0)
                    .center_y()
                    .radius(6.0)
                    .dim(if stale { 0.5 } else { 1.0 })
                    .fill(if active == n as isize {
                        s.theme.c("hover")
                    } else {
                        rune::Color::TRANSPARENT
                    })
                    .child(
                        rune::icon(&crate::icons::FOLDER, 14.0).color(s.theme.c("text-tertiary")),
                    )
                    .child(
                        label(
                            &s.theme,
                            item,
                            12.5,
                            400.0,
                            if active == n as isize {
                                "text"
                            } else {
                                "text-secondary"
                            },
                        )
                        .font(TextStyle::new(12.5, 400.0).mono())
                        .truncate(),
                    )
                    .on_pointer_move(move |s: &mut State, _| {
                        s.pages.projects.active_folder = n as isize
                    })
                    .on_press_tx(move |s: &mut State, tx| enter(s, n, tx)),
            );
        }
    }
    Some(s.theme.shadow(list, "shadow").anchored_fit(
        "project-directory-field",
        rune::Side::Bottom,
        rune::Align::Start,
        4.0,
    ))
}
pub fn after_frame(rt: &rune::Runtime<State>, handle: &rune::AppHandle<State>) {
    let relevant = matches!(rt.state.pages.projects.dialog, Some(Dialog::Open(_)))
        || rt.state.pages.route == pages::Route::ProjectSetup
        || (rt.state.pages.route == pages::Route::Chat
            && rt.state.selected.is_none()
            && rt.state.project().is_none());
    if !relevant {
        if rt.state.pages.projects.directory_focused {
            handle.update(|s, _| {
                s.pages.projects.directory_focused = false;
                s.pages.projects.suggesting = false;
            });
        }
        return;
    }
    let focused = rt
        .elements()
        .iter()
        .any(|e| e.focused && e.key.as_deref() == Some("Project directory"));
    if focused == rt.state.pages.projects.directory_focused {
        return;
    }
    handle.update(move |s, _| {
        s.pages.projects.directory_focused = focused;
        if focused && !s.pages.projects.directory.text.is_empty() {
            load(s);
        } else if !focused {
            s.pages.projects.suggesting = false;
        }
    });
}
pub fn capture(s: &mut State, page: &str) -> bool {
    if !matches!(page, "project-folder-suggestions" | "project-folder-empty") {
        return false;
    }
    let Some(base) = crate::OPTIONS.get().unwrap().gateway.clone() else {
        return true;
    };
    let parent = "/tmp/ocr-parity/proj/";
    s.pages.route = pages::Route::ProjectSetup;
    s.pages.projects.directory = TextEdit::new(if page == "project-folder-empty" {
        format!("{parent}zzzz")
    } else {
        parent.into()
    });
    s.pages.projects.suggesting = true;
    s.pages.projects.active_folder = -1;
    s.pages.projects.capture_focus = true;
    let result = std::thread::spawn(move || {
        oc_gateway::capture_page_query(&base, "folders", &[("path", parent)])
    })
    .join()
    .unwrap();
    receive(s, parent, result);
    true
}
