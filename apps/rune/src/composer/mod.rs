use crate::{
    State, icons as i,
    sidebar::{icon_button_size, label},
};
use rune::{El, TextStyle, col, el, icon, row, text_input};
mod icons;

pub fn view(s: &State, width: f32, height: f32) -> El {
    let t = &s.theme;
    let column = width.min(768.0);
    let inner = (column - 48.0).max(200.0);
    let project = s.project();
    let title = project
        .map(|p| p.display_name())
        .unwrap_or("Choose a project");
    let mut hero = col()
        .key("chat-empty")
        .w(column)
        .px(24.0)
        .pb(28.0)
        .items_center();
    if let Some(a) = &s.assets {
        hero = hero.child(el().size(176.0, 176.0).mb(4.0).pixels(a.hero.pixels()));
    } else {
        hero = hero.child(el().size(176.0, 176.0).mb(4.0));
    }
    hero = hero
        .child(
            label(t, "What should we build?", 30.0, 600.0, "text")
                .font(TextStyle::new(30.0, 600.0).lh(37.5).tracking(-0.6)),
        )
        .child(
            label(
                t,
                "Any model, any provider. Your repo stays on your machine.",
                14.5,
                400.0,
                "text-secondary",
            )
            .mt(10.0),
        )
        .child(
            t.shadow(
                row()
                    .key("project-switcher")
                    .h(44.0)
                    .mt(8.0)
                    .px(10.0)
                    .gap(8.0)
                    .center_y()
                    .radius(9.0)
                    .fill(t.c("surface")),
                "chip-shadow",
            )
            .child(
                label(t, title, 20.0, 500.0, "text-secondary")
                    .font(TextStyle::new(20.0, 500.0).lh(30.0).tracking(-0.4)),
            )
            .child(icon(&i::DOWN, 14.0).color(t.c("text-tertiary")))
            .role("button")
            .label("Choose project")
            .focusable(true)
            .on_press_tx(|s: &mut State, tx| {
                let selected = s.project().map(|p| p.canonical.clone()).unwrap_or_default();
                let choices = s
                    .snapshot
                    .projects
                    .iter()
                    .map(|p| (p.canonical.clone(), p.display_name().to_owned()));
                tx.popup_menu(
                    rune::PopupMenu::picker(choices, &selected),
                    "project-switcher",
                    |s: &mut State, picked, _| {
                        if let Some(directory) = picked {
                            if let Some(p) = s
                                .snapshot
                                .projects
                                .iter()
                                .find(|p| p.canonical == directory)
                            {
                                s.folded.remove(&p.id);
                            }
                            s.prefs.project = Some(directory.to_owned());
                            s.selected = None;
                            s.command(oc_gateway::Command::Details(directory.to_owned()));
                            crate::sidebar::rebuild(s);
                            s.save();
                        }
                    },
                );
            }),
        )
        .child(starters(s, inner));
    let input = text_input(&s.draft, TextStyle::new(14.0, 400.0).lh(21.0))
        .key("message")
        .label("Message")
        .w_full()
        .min_h(52.0)
        .max_h(240.0)
        .padding(2.0)
        .color(t.c("text"))
        .placeholder(
            "Ask anything, or describe what to build",
            t.c("text-tertiary"),
        )
        .on_edit(|s: &mut State| &mut s.draft);
    let mut controls = row().grow(1.0).min_w(0.0).center_y().justify_end().gap(4.0);
    controls = controls.child(
        t.shadow(
            t.paint(
                row()
                    .h(30.0)
                    .px(8.0)
                    .gap(8.0)
                    .center_y()
                    .radius(9.0)
                    .border(1.0, t.c("chip-border"))
                    .border_layout(),
                "chip",
            ),
            "chip-shadow",
        )
        .child(icon(&icons::OPENCODE, 18.0).color(t.c("text")))
        .child(label(t, s.model_name(), 12.5, 500.0, "text"))
        .child(icon(&i::DOWN, 14.0).color(t.c("text-tertiary"))),
    );
    controls = controls.child(
        row()
            .h(30.0)
            .px(8.0)
            .gap(8.0)
            .center_y()
            .border(1.0, rune::Color::TRANSPARENT)
            .border_layout()
            .child(label(
                t,
                "No thinking options",
                12.5,
                500.0,
                "text-tertiary",
            ))
            .child(icon(&i::DOWN, 14.0).color(t.c("text-tertiary")))
            .dim(0.45),
    );
    let permission = row()
        .h(30.0)
        .px(8.0)
        .gap(6.0)
        .center_y()
        .child(icon(&i::SHIELD, 16.0).color(t.c("text-secondary")))
        .child(label(t, "Permissions", 12.5, 500.0, "text-secondary"));
    let send = t
        .shadow(
            t.paint(
                el().size(34.0, 34.0)
                    .radius(12.0)
                    .center()
                    .border(1.0, t.c("chip-border")),
                "chip",
            ),
            "chip-shadow",
        )
        .child(icon(&i::UP, 16.0).color(t.c("text-tertiary")))
        .label("Send message (milestone 2)");
    let attach = icon_button_size(t, &i::PLUS, "Attach files", 18.0)
        .size(30.0, 30.0)
        .radius(9.0);
    let footer = if inner <= 480.0 {
        col()
            .w_full()
            .mt(8.0)
            .gap(4.0)
            .child(controls.grow(0.0).w_full().justify_start())
            .child(
                row()
                    .w_full()
                    .gap(8.0)
                    .center_y()
                    .child(attach)
                    .child(permission)
                    .child(el().grow(1.0))
                    .child(send),
            )
    } else {
        row()
            .w_full()
            .mt(8.0)
            .gap(8.0)
            .center_y()
            .child(attach)
            .child(controls)
            .child(permission)
            .child(send)
    };
    let mut composer = t.shadow(
        t.paint(
            col()
                .key("composer")
                .w_full()
                .radius(18.0)
                .pt(14.0)
                .pr(10.0)
                .pb(10.0)
                .pl(14.0)
                .child(input)
                .child(footer),
            "composer",
        ),
        "composer-shadow",
    );
    if s.draft.focused {
        composer = composer.box_shadow(rune::Shadow {
            x: 0.0,
            y: 0.0,
            blur: 0.0,
            spread: 1.0,
            color: t.c("border-heavy"),
            inset: false,
        });
    }
    let workspace = row()
        .key("workspace-bar")
        .h(30.0)
        .mt(6.0)
        .px(14.0)
        .gap(6.0)
        .center_y()
        .child(icon(&i::FOLDER, 14.0).color(t.c("text-secondary")))
        .child(label(t, "Local", 12.5, 500.0, "text-secondary"))
        .child(icon(&i::DOWN, 14.0).color(t.c("text-tertiary")))
        .child(el().w(4.0))
        .child(icon(&i::BRANCH, 14.0).color(t.c("text-secondary")))
        .child(label(
            t,
            project
                .and_then(|p| s.snapshot.branches.get(&p.canonical))
                .map(String::as_str)
                .unwrap_or("Detached HEAD"),
            12.5,
            500.0,
            "text-tertiary",
        ));
    let area = col()
        .key("composer-area")
        .w(column)
        .px(24.0)
        .py(12.0)
        .child(composer)
        .child(workspace);
    // CSS .chat[data-empty]: center in toolbar's remaining space, reserving 14vh below.
    col()
        .key("home")
        .w_full()
        .h_full()
        .min_h(0.0)
        .center()
        .pb(height * 0.14)
        .child(hero)
        .child(area)
}
fn starters(s: &State, width: f32) -> El {
    let t = &s.theme;
    let mut cards = row().key("starters").w_full().mt(28.0).gap(12.0);
    for (glyph, name, prompt) in [
        (
            &i::BOOK,
            "Explain how this repo is put together",
            "Explain how this repo is put together: the main modules, how data flows between them, and where to start reading.",
        ),
        (
            &i::TEST,
            "Find and fix the failing test",
            "Run the tests, find the failing one, and fix the underlying bug.",
        ),
        (
            &i::CHANGES,
            "Review my uncommitted changes",
            "Review my uncommitted changes for bugs, missed edge cases, and anything that should be simpler.",
        ),
        (
            &i::PLAN,
            "Plan a refactor before touching code",
            "Plan a refactor before touching any code: what to change, in what order, and how to verify each step.",
        ),
    ] {
        let badge = t
            .shadow(
                t.paint(el().size(30.0, 30.0).radius(9.0).center(), "primary-glaze"),
                "primary-shadow",
            )
            .child(icon(glyph, 16.0).color(t.c("on-primary")));
        let card = col()
            .key(name)
            .w((width - 36.0) / 4.0)
            .min_h(104.0)
            .padding(14.0)
            .gap(12.0)
            .justify_between()
            .radius(14.0)
            .role("button")
            .label(name)
            .focusable(true)
            .hover(t.c("hover"))
            .child(badge)
            .child(
                label(t, name, 13.5, 500.0, "text")
                    .font(TextStyle::new(13.5, 500.0).lh(18.225))
                    .wrap(),
            )
            .on_press_tx(move |s: &mut State, tx| {
                s.draft.replace_text(prompt);
                tx.focus("message", false);
            });
        cards = cards.child(t.shadow(t.paint(card, "glaze"), "glaze-shadow"));
    }
    cards
}
