use crate::{State, chat::icons, sidebar::label};
use rune::{El, TextStyle, icon, row};

pub fn documents(s: &State) -> El {
    let t = &s.theme;
    let mut tabs = row()
        .h(40.0)
        .pl(10.0)
        .gap(4.0)
        .center_y()
        .scroll_x()
        .role("tablist")
        .label("Open files");
    for (index, doc) in s.workbench.docs.iter().enumerate() {
        let active = s.workbench.selected == Some(index);
        let name = doc.path.rsplit('/').next().unwrap_or(&doc.path);
        let mut font = TextStyle::new(12.5, 400.0);
        font.italic = !doc.pinned && !doc.dirty();
        let mut button = row()
            .key(format!("document-tab-{index}"))
            .min_w(0.0)
            .gap(7.0)
            .pl(10.0)
            .pr(6.0)
            .py(4.0)
            .center_y()
            .child(
                icon(
                    if doc.is_diff {
                        &icons::CHANGES
                    } else {
                        &icons::READ
                    },
                    14.0,
                )
                .color(t.c(if active { "text" } else { "text-tertiary" })),
            )
            .child(
                label(
                    t,
                    name,
                    12.5,
                    400.0,
                    if active { "text" } else { "text-tertiary" },
                )
                .font(font)
                .truncate(),
            );
        if doc.is_diff {
            button = button.child(label(
                t,
                if s.workbench.mode == "branch" {
                    "base diff"
                } else {
                    "diff"
                },
                10.0,
                400.0,
                "text-tertiary",
            ));
        }
        if doc.dirty() {
            button = button.child(label(t, "●", 10.0, 400.0, "text").label("Unsaved edits"));
        }
        let button = button
            .role("tab")
            .label(name)
            .checked(active)
            .focusable(true)
            .on_press(move |s: &mut State| s.workbench.selected = Some(index))
            .on_double_press(move |s: &mut State| s.workbench.docs[index].pinned = true)
            .on_key(move |s: &mut State, key, tx| {
                let count = s.workbench.docs.len();
                let next = match key.key {
                    rune::Key::Left => (index + count - 1) % count,
                    rune::Key::Right => (index + 1) % count,
                    rune::Key::Home => 0,
                    rune::Key::End => count - 1,
                    _ => return false,
                };
                s.workbench.selected = Some(next);
                tx.focus(format!("document-tab-{next}"), false);
                true
            });
        let close = crate::sidebar::icon_button(
            t,
            &crate::icons::CLOSE,
            &format!(
                "Close {}{}",
                doc.path,
                if doc.is_diff { " diff" } else { "" }
            ),
        )
        .size(18.0, 18.0)
        .radius(5.0)
        .disabled(doc.dirty())
        .on_press(move |s: &mut State| s.close_workspace_document(index));
        let tab = row()
            .h(28.0)
            .max_w(240.0)
            .pr(4.0)
            .gap(2.0)
            .center_y()
            .radius(8.0)
            .child(button)
            .child(close);
        tabs = tabs.child(if active {
            t.shadow(t.paint(tab, "glaze"), "glaze-shadow")
        } else {
            tab
        });
    }
    tabs
}
