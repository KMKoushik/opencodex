use super::worker::Operation;
use crate::{
    State,
    chat::icons,
    sidebar::{icon_button, label},
};
use rune::{Align, El, Side, col, icon, row};

pub fn trigger(s: &State, index: usize) -> El {
    row()
        .key("file-actions")
        .h(28.0)
        .px(5.0)
        .gap(2.0)
        .center_y()
        .radius(7.0)
        .hover(s.theme.c("hover"))
        .child(icon(&icons::OPEN, 16.0).color(s.theme.c("text-secondary")))
        .child(icon(&crate::icons::DOWN, 10.0).color(s.theme.c("text-tertiary")))
        .role("button")
        .label("File actions")
        .focusable(true)
        .expanded(s.workbench.file_actions == Some(index))
        .on_press(move |s: &mut State| {
            s.workbench.file_actions = if s.workbench.file_actions == Some(index) {
                None
            } else {
                Some(index)
            }
        })
        .on_key(move |s: &mut State, key, _| {
            if matches!(key.key, rune::Key::Down | rune::Key::Up) {
                s.workbench.file_actions = Some(index);
                true
            } else {
                false
            }
        })
}
pub fn overlay(s: &State) -> El {
    let Some(index) = s.workbench.file_actions else {
        return rune::el();
    };
    let Some(doc) = s.workbench.docs.get(index) else {
        return rune::el();
    };
    let t = &s.theme;
    let directory = doc.directory.clone();
    let path = doc.path.clone();
    let absolute = std::path::Path::new(&directory)
        .join(&path)
        .to_string_lossy()
        .into_owned();
    let copy = row()
        .h(32.0)
        .w_full()
        .gap(8.0)
        .px(8.0)
        .center_y()
        .radius(6.0)
        .hover(t.c("hover"))
        .child(icon(&icons::COPY, 16.0).color(t.c("text-secondary")))
        .child(label(t, "Copy Path", 13.0, 400.0, "text"))
        .key("file-copy-path")
        .role("menuitem")
        .focusable(true)
        .autofocus()
        .disabled(s.workbench.pending.contains("reveal-file"))
        .on_press_tx(move |s: &mut State, tx| {
            tx.copy(absolute.clone());
            s.workbench.file_actions = None;
            s.menus.toast = Some("File path copied".into());
            s.menus.toast_due = Some(tx.clock() + 2.0);
            tx.wake_after(std::time::Duration::from_secs(2));
            tx.focus("file-actions", false);
        });
    let reveal = row()
        .h(32.0)
        .w_full()
        .gap(8.0)
        .px(8.0)
        .center_y()
        .radius(6.0)
        .hover(t.c("hover"))
        .child(icon(&icons::OPEN, 16.0).color(t.c("text-secondary")))
        .child(label(t, "Show in Finder", 13.0, 400.0, "text"))
        .key("file-show-finder")
        .role("menuitem")
        .focusable(true)
        .disabled(s.workbench.pending.contains("reveal-file"))
        .on_press(move |s: &mut State| {
            s.workspace_request(
                "reveal-file".into(),
                Operation::RevealFile {
                    directory: directory.clone(),
                    path: path.clone(),
                },
            );
        });
    t.shadow(
        col()
            .w(220.0)
            .padding(5.0)
            .radius(10.0)
            .fill(t.c("elevated"))
            .border(1.0, t.c("border-heavy"))
            .role("menu")
            .label(format!("Actions for {}", doc.path))
            .child(copy)
            .child(reveal)
            .on_key(|s: &mut State, key, tx| {
                if key.key == rune::Key::Escape || key.key == rune::Key::Tab {
                    s.workbench.file_actions = None;
                    tx.focus("file-actions", false);
                    return true;
                }
                if matches!(
                    key.key,
                    rune::Key::Up | rune::Key::Down | rune::Key::Home | rune::Key::End
                ) {
                    let first = key.key == rune::Key::Home
                        || (key.key != rune::Key::End && tx.focused() == Some("file-show-finder"));
                    tx.focus(
                        if first {
                            "file-copy-path"
                        } else {
                            "file-show-finder"
                        },
                        true,
                    );
                    return true;
                }
                false
            })
            .anchored("file-actions", Side::Bottom, Align::End, 4.0)
            .modal(true, |s: &mut State| s.workbench.file_actions = None),
        "shadow",
    )
}

pub fn save(s: &State, index: usize) -> El {
    let doc = &s.workbench.docs[index];
    icon_button(
        &s.theme,
        &icons::SAVE,
        if doc.saving.is_some() {
            "Saving file…"
        } else {
            "Save file"
        },
    )
    .disabled(!doc.dirty() || doc.saving.is_some())
    .on_press(|s: &mut State| s.save_workspace_file())
}
