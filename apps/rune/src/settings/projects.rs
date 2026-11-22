use crate::{
    State,
    pages::{self, controls as ui},
    sidebar::label,
};
use rune::{El, TextEdit, TextStyle, col, el, row, text_input};
use serde_json::{Value, json};
pub mod editor;
pub mod folder;
#[derive(Clone, PartialEq)]
pub enum Dialog {
    Open(bool),
    Edit(String),
    Instructions(String),
    Worktrees(String),
}
#[derive(Default)]
pub struct Projects {
    pub search: TextEdit,
    pub dialog: Option<Dialog>,
    pub directory: TextEdit,
    pub name: TextEdit,
    pub url: TextEdit,
    pub color: String,
    pub image: String,
    pub preview: Option<rune::Image>,
    pub preparing: Option<&'static str>,
    pub busy: bool,
    pub error: Option<String>,
    pub folders: Option<Value>,
    pub folders_parent: Option<String>,
    pub folder_error: Option<String>,
    pub folder_cache: std::collections::BTreeMap<String, (std::time::Instant, Value)>,
    pub folder_pending: Option<String>,
    pub suggesting: bool,
    pub active_folder: isize,
    pub directory_focused: bool,
    pub removing: Option<String>,
    pub capture_focus: bool,
}
pub fn open(s: &mut State, dialog: Dialog, tx: &mut rune::Tx) {
    s.menus.open = None;
    s.pages.projects.error = None;
    s.pages.projects.busy = false;
    match &dialog {
        Dialog::Open(_) => {
            s.pages.projects.directory.clear();
            s.pages.projects.suggesting = false;
            tx.focus_when_shown("Project directory", false);
        }
        Dialog::Edit(id) => {
            s.pages.projects.preview = None;
            if let Some(p) = s.snapshot.projects.iter().find(|p| &p.id == id) {
                s.pages.projects.name = TextEdit::new(p.display_name());
                s.pages.projects.color = p
                    .icon
                    .as_ref()
                    .and_then(|i| i.color.clone())
                    .unwrap_or_default();
                s.pages.projects.image = p
                    .icon
                    .as_ref()
                    .and_then(|i| i.r#override.clone())
                    .unwrap_or_default();
                s.pages.projects.url =
                    TextEdit::new(if s.pages.projects.image.starts_with("http") {
                        &s.pages.projects.image
                    } else {
                        ""
                    });
                tx.focus_when_shown("project-dialog-close", false);
            }
        }
        Dialog::Instructions(id) => {
            s.pages.instructions_project = Some(id.clone());
            s.pages.instructions.clear();
            s.pages.instructions_dirty = false;
            s.pages.data.remove(&format!("projects/{id}/instructions"));
            s.page_get(&format!("projects/{id}/instructions"));
            tx.focus_when_shown("project-instructions", false);
        }
        Dialog::Worktrees(id) => {
            tx.focus_when_shown("project-dialog-close", false);
            s.pages.projects.removing = None;
            s.pages.data.remove(&format!("projects/{id}/worktrees"));
            s.page_get(&format!("projects/{id}/worktrees"));
        }
    }
    s.pages.projects.dialog = Some(dialog);
}
pub fn close(s: &mut State) {
    if !s.pages.projects.busy {
        s.pages.projects.dialog = None;
        s.pages.projects.suggesting = false;
    }
}
pub fn select(s: &mut State, directory: String) {
    s.prefs.closed_projects.retain(|p| p != &directory);
    s.prefs.project = Some(directory.clone());
    if let Some(p) = s
        .snapshot
        .projects
        .iter()
        .find(|p| p.canonical == directory)
    {
        s.folded.remove(&p.id);
    }
    s.open_session(None);
    crate::sidebar::rebuild(s);
    s.save();
}
pub fn close_project(s: &mut State, id: &str) {
    let Some(path) = s
        .snapshot
        .projects
        .iter()
        .find(|p| p.id == id)
        .map(|p| p.canonical.clone())
    else {
        return;
    };
    let current = s.project().is_some_and(|p| p.canonical == path);
    if !s.prefs.closed_projects.contains(&path) {
        s.prefs.closed_projects.push(path);
    }
    if current {
        s.prefs.project = s
            .snapshot
            .projects
            .iter()
            .find(|p| !s.prefs.closed_projects.contains(&p.canonical))
            .map(|p| p.canonical.clone());
        s.open_session(None);
    }
    crate::sidebar::rebuild(s);
    s.save();
}
pub fn setup(s: &State) -> El {
    let mut content = col()
        .on_layout_tx(|s: &mut State, _, tx| {
            if s.pages.projects.capture_focus {
                s.pages.projects.capture_focus = false;
                tx.focus_when_shown("Project directory", false);
            } else {
                tx.live_only();
            }
        })
        .w_full()
        .max_w(520.0)
        .px(24.0)
        .pt(48.0)
        .pb(s.window_size.1 * 0.16)
        .items_center();
    if let Some(assets) = &s.assets {
        content = content.child(el().size(176.0, 176.0).pixels(assets.hero.pixels()).mb(4.0));
    }
    content = content
        .child(
            label(&s.theme, "Open a project", 30.0, 600.0, "text")
                .font(TextStyle::new(30.0, 600.0).lh(37.5).tracking(-0.6)),
        )
        .child(
            label(
                &s.theme,
                "Choose a folder on the machine running OpenCodex.",
                14.5,
                400.0,
                "text-secondary",
            )
            .mt(10.0),
        )
        .child(folder::form(s, false).w_full().mt(24.0));
    col()
        .w_full()
        .grow(1.0)
        .justify_center()
        .items_center()
        .child(content)
}
pub fn view(s: &State, mut body: El) -> El {
    let header = row()
        .w_full()
        .gap(16.0)
        .center_y()
        .child(
            col()
                .grow(1.0)
                .gap(8.0)
                .child(
                    label(&s.theme, "Projects", 20.0, 600.0, "text")
                        .font(TextStyle::new(20.0, 600.0).lh(26.0)),
                )
                .child(label(
                    &s.theme,
                    "Manage projects and their settings.",
                    14.0,
                    400.0,
                    "text-secondary",
                )),
        )
        .child(
            row()
                .role("button")
                .label("Add project")
                .focusable(true)
                .px(10.0)
                .gap(6.0)
                .center_y()
                .child(rune::icon(&crate::icons::PLUS, 16.0).color(s.theme.c("text-secondary")))
                .child(label(
                    &s.theme,
                    "Add project",
                    13.0,
                    500.0,
                    "text-secondary",
                ))
                .h(32.0)
                .on_press_tx(|s: &mut State, tx| open(s, Dialog::Open(true), tx)),
        );
    body = body.gap(24.0).child(header).child(
        row()
            .w_full()
            .h(44.0)
            .px(16.0)
            .gap(10.0)
            .center_y()
            .radius(8.0)
            .fill(s.theme.c("secondary"))
            .child(rune::icon(&crate::icons::SEARCH, 18.0).color(s.theme.c("text-tertiary")))
            .child(
                text_input(&s.pages.projects.search, TextStyle::new(14.0, 400.0))
                    .key("Search projects")
                    .label("Search projects")
                    .single_line()
                    .grow(1.0)
                    .color(s.theme.c("text"))
                    .placeholder("Search projects", s.theme.c("text-tertiary"))
                    .on_edit(|s: &mut State| &mut s.pages.projects.search),
            ),
    );
    if let Some(notice) = &s.pages.project_notice {
        body = body.child(label(&s.theme, notice, 13.0, 400.0, "text-secondary").role("status"));
    }
    let search = s.pages.projects.search.text.trim().to_lowercase();
    let items: Vec<_> = s
        .snapshot
        .projects
        .iter()
        .filter(|p| {
            format!("{}\n{}", p.display_name(), p.canonical)
                .to_lowercase()
                .contains(&search)
        })
        .collect();
    if items.is_empty() {
        return body.child(label(
            &s.theme,
            if search.is_empty() {
                "No projects yet. Add a folder to get started."
            } else {
                "No projects match your search."
            },
            14.0,
            400.0,
            "text-secondary",
        ));
    }
    let mut list = col()
        .w_full()
        .px(16.0)
        .radius(10.0)
        .fill(s.theme.c("secondary"))
        .border(1.0, s.theme.c("border"));
    for (n, p) in items.iter().enumerate() {
        let id = p.id.clone();
        let edit = id.clone();
        let actions = id.clone();
        let key = format!("project-actions-{id}");
        let anchor = key.clone();
        let name = p.display_name();
        list = list.child(
            row()
                .w_full()
                .min_h(56.0)
                .gap(8.0)
                .center_y()
                .border_sides(
                    [if n > 0 { 1.0 } else { 0.0 }, 0.0, 0.0, 0.0],
                    s.theme.c("border"),
                )
                .child(
                    row()
                        .grow(1.0)
                        .min_w(0.0)
                        .h(56.0)
                        .gap(10.0)
                        .center_y()
                        .role("button")
                        .label(name)
                        .focusable(true)
                        .child(avatar(
                            s,
                            name,
                            p.icon
                                .as_ref()
                                .and_then(|i| i.color.as_deref())
                                .unwrap_or("gray"),
                            20.0,
                        ))
                        .child(label(&s.theme, name, 14.0, 500.0, "text").truncate())
                        .on_press_tx(move |s: &mut State, tx| {
                            open(s, Dialog::Edit(edit.clone()), tx)
                        }),
                )
                .child(
                    crate::sidebar::icon_button(
                        &s.theme,
                        &crate::icons::MORE,
                        &format!("Actions for {name}"),
                    )
                    .key(&key)
                    .on_layout_tx(move |s: &mut State, r, tx| {
                        s.pages.anchors.insert(anchor.clone(), r);
                        tx.live_only();
                    })
                    .on_press_tx(move |s: &mut State, tx| {
                        if let Some(r) = s.pages.anchors.get(&key) {
                            s.menus.point = Some((r[0] + r[2] - 180.0, r[1] + r[3] + 4.0));
                        }
                        s.menus.open = Some(crate::menus::Menu::Project(actions.clone()));
                        tx.focus_when_shown("menu-Open project", false);
                    }),
                ),
        );
    }
    body.child(list)
}
pub fn avatar(s: &State, name: &str, color: &str, size: f32) -> El {
    let color = if ["gray", "blue", "green", "orange", "pink", "purple"].contains(&color) {
        color
    } else {
        "gray"
    };
    el().size(size, size)
        .radius(size / 4.0)
        .center()
        .fill(s.theme.c(&format!("project-{color}")))
        .border(1.0, s.theme.c("border-heavy"))
        .child(label(
            &s.theme,
            name.chars()
                .next()
                .unwrap_or('?')
                .to_uppercase()
                .to_string(),
            size * 0.65,
            500.0,
            "on-project",
        ))
}
pub fn dialog(s: &State) -> Option<El> {
    if s.pages.remote.pairing_at.is_some() {
        return super::pairing::dialog(s);
    }
    let dialog = s.pages.projects.dialog.as_ref()?;
    let (title, width, content): (String, f32, El) = match dialog {
        Dialog::Open(register) => (
            if *register {
                "Add project"
            } else {
                "Open project"
            }
            .to_string(),
            440.0,
            folder::form(s, *register),
        ),
        Dialog::Edit(id) => ("Edit project".into(), 440.0, editor::view(s, id)),
        Dialog::Instructions(id) => (
            format!("{} instructions", project_name(s, id)),
            600.0,
            instructions(s, id),
        ),
        Dialog::Worktrees(id) => (
            format!("Worktrees · {}", project_name(s, id)),
            440.0,
            worktrees(s, id),
        ),
    };
    let header = row()
        .w_full()
        .h(28.0)
        .center_y()
        .mb(20.0)
        .child(label(&s.theme, &title, 16.0, 600.0, "text").grow(1.0))
        .child(
            crate::sidebar::icon_button(
                &s.theme,
                &crate::icons::CLOSE,
                &format!("Close {}", title.to_lowercase()),
            )
            .key("project-dialog-close")
            .disabled(s.pages.projects.busy)
            .on_press(|s: &mut State| close(s)),
        );
    let panel = col()
        .on_layout_tx(|s: &mut State, _, tx| {
            if !s.pages.projects.capture_focus {
                tx.live_only();
                return;
            }
            s.pages.projects.capture_focus = false;
            tx.focus_when_shown(
                match s.pages.projects.dialog {
                    Some(Dialog::Instructions(_)) => "project-instructions",
                    Some(Dialog::Open(_)) => "Project directory",
                    _ => "project-dialog-close",
                },
                false,
            );
        })
        .w(width.min(s.window_size.0 - 32.0))
        .max_h(s.window_size.1 - 32.0)
        .padding(20.0)
        .radius(14.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .child(header)
        .child(content);
    Some(
        el().absolute(0.0, 0.0)
            .size(s.window_size.0, s.window_size.1)
            .center()
            .modal(true, |s: &mut State| close(s))
            .child(
                el().absolute(0.0, 0.0)
                    .size(s.window_size.0, s.window_size.1)
                    .fill(s.theme.c("scrim"))
                    .on_press(|s: &mut State| close(s)),
            )
            .child(s.theme.shadow(panel, "shadow")),
    )
}
fn project_name<'a>(s: &'a State, id: &str) -> &'a str {
    s.snapshot
        .projects
        .iter()
        .find(|p| p.id == id)
        .map(|p| p.display_name())
        .unwrap_or("Project")
}
pub fn write(s: &mut State, tag: &str, path: String, method: &str, body: Value) {
    if s.pages.projects.busy {
        return;
    }
    s.pages.projects.error = None;
    s.pages.projects.busy = s.prompt_request(oc_gateway::prompt::Request::Write {
        tag: format!("project-{tag}"),
        path,
        method: method.into(),
        body,
    });
    if !s.pages.projects.busy {
        s.pages.projects.error = s.error.clone();
    }
}
pub fn receive(s: &mut State, tag: &str, result: Result<Value, String>) {
    if let Some(parent) = tag.strip_prefix("project-folders:") {
        folder::receive(s, parent, result);
        return;
    }
    s.pages.projects.busy = false;
    match result {
        Err(error) => s.pages.projects.error = Some(error),
        Ok(value) => match tag {
            "project-open" => {
                if let Some(path) = value["directory"]
                    .as_str()
                    .or_else(|| value["canonical"].as_str())
                {
                    if !s.snapshot.projects.iter().any(|p| p.canonical == path) {
                        write(
                            s,
                            "register-open",
                            "projects".into(),
                            "POST",
                            json!({"directory":path}),
                        );
                        return;
                    }
                    s.pages.projects.dialog = None;
                    select(s, path.into());
                }
                s.command(oc_gateway::Command::Refresh);
            }
            "project-register-open" => {
                s.pages.projects.dialog = None;
                if let Some(path) = value["canonical"].as_str() {
                    select(s, path.into());
                }
                s.command(oc_gateway::Command::Refresh);
            }
            "project-add" => {
                s.pages.projects.dialog = None;
                s.pages.projects.search.clear();
                if let Some(path) = value["canonical"].as_str() {
                    select(s, path.into());
                }
                s.command(oc_gateway::Command::Refresh);
            }
            "project-icon" => editor::receive_icon(s, value),
            "project-save" | "project-instructions" => {
                s.pages.projects.dialog = None;
                s.command(oc_gateway::Command::Refresh);
            }
            "project-remove-worktree" => {
                s.pages.projects.removing = None;
                if let Some(Dialog::Worktrees(id)) = &s.pages.projects.dialog {
                    s.page_get(&format!("projects/{id}/worktrees"));
                }
                s.command(oc_gateway::Command::Refresh);
            }
            _ => {}
        },
    }
}
pub fn error(s: &State) -> El {
    if let Some(error) = &s.pages.projects.error {
        label(&s.theme, error, 13.0, 400.0, "error")
            .w_full()
            .wrap()
            .role("alert")
    } else {
        el()
    }
}
pub fn with_error(s: &State, body: El) -> El {
    if s.pages.projects.error.is_some() {
        body.child(error(s))
    } else {
        body
    }
}
fn footer(s: &State, enabled: bool, save: impl Fn(&mut State) + 'static) -> El {
    row()
        .w_full()
        .gap(8.0)
        .justify_end()
        .child(
            pages::button(s, "Cancel")
                .disabled(s.pages.projects.busy)
                .on_press(|s: &mut State| close(s)),
        )
        .child(
            pages::primary_button(
                s,
                if s.pages.projects.busy {
                    "Saving…"
                } else {
                    "Save"
                },
            )
            .disabled(!enabled || s.pages.projects.busy)
            .on_press(save),
        )
}
fn instructions(s: &State, id: &str) -> El {
    let path = format!("projects/{id}/instructions");
    let ready = pages::data(s, &path).is_some();
    let savepath = path.clone();
    let mut body=col().w_full().gap(12.0).child(label(&s.theme,"Sent with every chat in this project, on desktop and iPhone. They're saved on this computer, not in the repo; for instructions your team shares, use the repo's AGENTS.md.",13.0,400.0,"text-secondary").w_full().wrap());
    if let Some(Err(error)) = s.pages.data.get(&path) {
        let retry = path.clone();
        body = body
            .child(label(&s.theme, error, 13.0, 400.0, "error").w_full().wrap())
            .child(pages::button(s, "Retry").on_press(move |s: &mut State| s.page_get(&retry)));
    } else {
        let save = savepath.clone();
        body=body.child(text_input(&s.pages.instructions,TextStyle::new(13.0,400.0).lh(20.15)).key("project-instructions").label("Project instructions").w_full().h(260.0).px(12.0).py(10.0).radius(8.0).color(s.theme.c("text")).fill(s.theme.c("control")).border(1.0,s.theme.c("border-heavy"))
        .disabled(!ready||s.pages.projects.busy).placeholder(if ready{"For example: Use pnpm, not npm. Run pnpm test before saying a change works. Ask before touching the database schema."}else{"Loading…"},s.theme.c("text-tertiary"))
        .on_edit(|s:&mut State|&mut s.pages.instructions)
        .on_input_change(|s:&mut State,_|s.pages.instructions_dirty=true)
        .on_input_key(move|s:&mut State,e,_|{if e.key==rune::Key::Escape{close(s);true}else if e.key==rune::Key::Enter&&(e.mods.cmd||e.mods.ctrl){if s.pages.instructions.text.encode_utf16().count()<=50000{write(s,"instructions",save.clone(),"PUT",json!({"text":s.pages.instructions.text}));}true}else{false}}));
    }
    let count = s.pages.instructions.text.encode_utf16().count();
    with_error(s, body)
        .child(label(
            &s.theme,
            if count > 45000 {
                format!("{count} of 50,000 characters.")
            } else {
                "Open chats use the new instructions from their next message.".into()
            },
            12.0,
            400.0,
            "text-tertiary",
        ))
        .child(footer(s, ready && count <= 50000, move |s: &mut State| {
            write(
                s,
                "instructions",
                savepath.clone(),
                "PUT",
                json!({"text":s.pages.instructions.text}),
            )
        }))
}
fn worktrees(s: &State, id: &str) -> El {
    let path = format!("projects/{id}/worktrees");
    let canonical = s
        .snapshot
        .projects
        .iter()
        .find(|p| p.id == id)
        .map(|p| p.canonical.as_str())
        .unwrap_or("");
    let mut body=col().w_full().gap(0.0).child(label(&s.theme,"Chats started in a new worktree get their own checkout. Removing one deletes it from disk; Git refuses if it has uncommitted changes, and its chats stay as read-only history.",12.0,400.0,"text-tertiary").w_full().wrap());
    if let Some(Err(error)) = s.pages.data.get(&path) {
        let retry = path.clone();
        return body
            .child(
                label(&s.theme, error, 13.0, 400.0, "error")
                    .w_full()
                    .wrap()
                    .role("alert"),
            )
            .child(ui::ghost(s, "Retry").on_press(move |s: &mut State| s.page_get(&retry)));
    }
    if pages::data(s, &path).is_none() {
        return body.child(
            label(
                &s.theme,
                "Loading worktrees…",
                13.0,
                400.0,
                "text-secondary",
            )
            .role("status"),
        );
    }
    let entries: Vec<_> = pages::data(s, &path)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|v| v["strategy"] == "git" && v["directory"].as_str() != Some(canonical))
        .collect();
    if entries.is_empty() {
        body = body.child(
            label(
                &s.theme,
                "No worktrees yet. Choose “New worktree” below a new chat.",
                13.0,
                400.0,
                "text-secondary",
            )
            .w_full()
            .wrap(),
        );
    }
    for entry in entries {
        let directory = entry["directory"].as_str().unwrap_or("").to_owned();
        let remove = directory.clone();
        let id = id.to_owned();
        let mut line = row().w_full().gap(8.0).center_y().child(
            col()
                .grow(1.0)
                .min_w(0.0)
                .gap(4.0)
                .child(label(
                    &s.theme,
                    directory.rsplit('/').next().unwrap_or(""),
                    13.0,
                    600.0,
                    "text",
                ))
                .child(
                    label(&s.theme, &directory, 12.0, 400.0, "text-secondary")
                        .w_full()
                        .wrap(),
                ),
        );
        if s.pages.projects.removing.as_ref() == Some(&directory) {
            line = line
                .child(
                    ui::ghost(s, "Cancel")
                        .disabled(s.pages.projects.busy)
                        .on_press(|s: &mut State| s.pages.projects.removing = None),
                )
                .child(
                    pages::primary_button(
                        s,
                        if s.pages.projects.busy {
                            "Removing…"
                        } else {
                            "Remove"
                        },
                    )
                    .disabled(s.pages.projects.busy)
                    .on_press(move |s: &mut State| {
                        s.pages.projects.error = None;
                        s.pages.projects.busy =
                            s.prompt_request(oc_gateway::prompt::Request::DeleteQuery {
                                tag: "project-remove-worktree".into(),
                                path: format!("projects/{id}/worktrees"),
                                query: vec![("directory".into(), remove.clone())],
                            });
                    }),
                );
        } else {
            line = line.child(
                ui::ghost(s, "Remove…")
                    .disabled(s.pages.projects.busy)
                    .on_press(move |s: &mut State| {
                        s.pages.projects.removing = Some(remove.clone());
                        s.pages.projects.error = None;
                    }),
            );
        }
        body = body.child(line);
    }
    with_error(s, body)
}
