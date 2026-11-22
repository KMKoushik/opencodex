use crate::{
    State, icons as i,
    sidebar::{icon_button_size, label},
};
use rune::{El, TextStyle, col, el, icon, row, text_input};
mod access;
pub(crate) mod attachment_preview;
pub mod capture;
mod commands;
pub(crate) mod context;
#[cfg(test)]
mod context_tests;
mod fork;
pub(crate) mod fuzzy;
mod icons;
pub mod keys;
pub mod menus;
mod providers;
pub(crate) mod running;
mod running_output;
pub mod state;
mod undo;
use state::Menu;

pub fn view(s: &State, width: f32, height: f32) -> El {
    if s.selected.is_some() {
        return row().w_full().h_full().min_h(0.0).child(
            col()
                .key("chat")
                .grow(1.0)
                .h_full()
                .min_w(0.0)
                .min_h(0.0)
                .items_center()
                .child(crate::chat::view(s, width))
                .child(area(s, width)),
        );
    }
    let t = &s.theme;
    let column = (width - if s.selected.is_some() { 44.0 } else { 0.0 }).min(768.0);
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
                label(t, title, 20.0, 400.0, "text-secondary")
                    .font(TextStyle::new(20.0, 400.0).lh(30.0).tracking(-0.4)),
            )
            .child(icon(&i::DOWN, 14.0).color(t.c("text-tertiary")))
            .role("button")
            .key("Switch project")
            .label("Switch project")
            .focusable(true)
            .disabled(!s.snapshot.live)
            .on_layout_tx(|s: &mut State, rect, tx| {
                s.pages.anchors.insert("Switch project".into(), rect);
                tx.live_only();
            })
            .on_key(|s: &mut State, event, tx| {
                if matches!(event.key, rune::Key::Down | rune::Key::Up) {
                    crate::menus::switch_projects(s, tx);
                    true
                } else {
                    false
                }
            })
            .on_press_tx(|s: &mut State, tx| {
                crate::menus::switch_projects(s, tx);
            }),
        )
        .child(starters(s, inner));
    col()
        .key("home")
        .w_full()
        .h_full()
        .min_h(0.0)
        .center()
        .pb(height * 0.14)
        .child(hero)
        .child(area(s, width))
}

/// The shared bottom dock. The transcript mounts this below its scroll viewport.
pub fn area(s: &State, width: f32) -> El {
    let t = &s.theme;
    let column = width.min(768.0);
    if s.chat.read_only() {
        return col()
            .key("composer-area")
            .w(column)
            .px(24.0)
            .py(12.0)
            .child(label(
                t,
                "Subagent conversation · Read only",
                12.0,
                400.0,
                "text-tertiary",
            ));
    }
    if crate::docks::has_question(s) {
        return col()
            .key("composer-area")
            .w(column)
            .px(24.0)
            .py(12.0)
            .child(running::view(s))
            .child(crate::docks::view(s));
    }
    // Container queries use the composer's content box, excluding its padding.
    let inner = (column - 72.0).max(0.0);
    let project = s.project();
    let input = text_input(&s.draft().edit, TextStyle::new(14.0, 400.0).lh(21.0))
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
        .on_edit(|s: &mut State| &mut s.draft_mut().edit)
        .on_input_change(|s: &mut State, tx| {
            s.composer.escape_until = None;
            menus::changed(s, tx);
        })
        .on_input_key(|s: &mut State, ev, tx| {
            crate::shortcuts::observe(s, ev);
            crate::bench::input();
            if menus::keys(s, ev, tx) {
                return true;
            }
            if keys::escape(s, ev, tx) {
                return true;
            }
            if ev.key == rune::Key::Enter && !ev.mods.shift {
                commands::submit(s, tx);
                return true;
            }
            false
        })
        .on_submit(commands::submit)
        .on_input_paste(|s: &mut State, content, _| {
            s.composer.escape_until = None;
            let Some(image) = content.image() else {
                return false;
            };
            let item = oc_gateway::prompt::Attachment {
                name: "Pasted image.png".into(),
                mime: "image/png".into(),
                bytes: std::sync::Arc::new(image.png().to_vec()),
                thumbnail: None,
            };
            s.prompt_request(oc_gateway::prompt::Request::PrepareAttachment {
                key: s.draft_key().to_owned(),
                item,
            });
            true
        });
    let input = rune::auto_grow(input, 2, 12).min_h(52.0).max_h(240.0);
    let mut controls = row().grow(1.0).min_w(0.0).center_y().justify_end().gap(4.0);
    if s.selected.is_some() {
        controls = controls.child(context::view(s));
    }
    let model = t
        .shadow(
            t.paint(
                row()
                    .shrink()
                    .min_w(if inner <= 480.0 { 18.0 } else { 96.0 })
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
        .child(providers::view(
            s,
            s.selected_model()
                .map(|m| m.provider_id.as_str())
                .unwrap_or("opencode"),
        ))
        .child(
            label(t, s.model_name(), 12.5, 500.0, "text")
                .min_w(0.0)
                .shrink()
                .truncate(),
        )
        .child(icon(&i::DOWN, 14.0).color(t.c("text-tertiary")))
        .key("model-picker")
        .role("button")
        .label("Choose model")
        .focusable(true)
        .on_press_tx(|s: &mut State, tx| menus::open(s, Menu::Models, tx));
    // CSS shrinks the .select wrapper independently of its trigger's padding
    // box. At very narrow widths that 18px box and its fixed icon overflow the
    // wrapper; thinking retains its intrinsic width rather than being ellipsized.
    controls = controls.child(if inner <= 480.0 {
        row().shrink().min_w(0.0).child(model)
    } else {
        model
    });
    controls = controls.child(
        row()
            .h(30.0)
            .max_w(if inner <= 480.0 { inner } else { 240.0 })
            .px(8.0)
            .gap(8.0)
            .center_y()
            .border(1.0, rune::Color::TRANSPARENT)
            .border_layout()
            .child(
                label(
                    t,
                    &if s.model_info().is_some_and(|m| !m.variants.is_empty()) {
                        variant_label(
                            s.selected_model()
                                .and_then(|m| m.variant.as_deref())
                                .unwrap_or("default"),
                        )
                    } else {
                        "No thinking options".into()
                    },
                    12.5,
                    500.0,
                    "text-tertiary",
                )
                .min_w(0.0)
                .shrink()
                .truncate(),
            )
            .child(icon(&i::DOWN, 14.0).color(t.c("text-tertiary")))
            .dim(if s.model_info().is_some_and(|m| !m.variants.is_empty()) {
                1.0
            } else {
                0.45
            })
            .key("thinking-picker")
            .role("button")
            .label("Thinking level")
            .focusable(true)
            .on_press_tx(|s: &mut State, tx| {
                if s.model_info().is_some_and(|m| !m.variants.is_empty()) {
                    menus::open(s, Menu::Thinking, tx);
                }
            }),
    );
    let mut permission = row()
        .h(30.0)
        .px(8.0)
        .gap(6.0)
        .center_y()
        .radius(8.0)
        .hover(t.c("hover"))
        .child(
            icon(
                if s.draft().full_access {
                    &icons::SHIELD_ENERGY
                } else {
                    &i::SHIELD
                },
                16.0,
            )
            .color(t.c(if s.draft().full_access {
                "accent"
            } else {
                "text-secondary"
            })),
        );
    if inner > 524.0 {
        permission = permission.child(label(
            t,
            if s.draft().full_access {
                "Full access"
            } else {
                "Permissions"
            },
            12.5,
            500.0,
            if s.draft().full_access {
                "accent"
            } else {
                "text-secondary"
            },
        ));
    } else {
        permission = permission.w(30.0).px(0.0).center();
    }
    let permission = permission
        .key("permission-picker")
        .role("button")
        .label(if s.draft().full_access {
            "Full access: restore OpenCode permissions"
        } else {
            "Permissions: enable full access"
        })
        .disabled(s.composer.access_pending)
        .opacity(if s.composer.access_pending { 0.45 } else { 1.0 })
        .focusable(true)
        .on_press_tx(|s: &mut State, tx| {
            if s.composer.access_pending {
                return;
            }
            if s.draft().full_access {
                access::change(s, false);
            } else {
                menus::open(s, Menu::ConfirmAccess, tx);
            }
        });
    let running = s.chat.data.running
        || s.selected
            .as_ref()
            .is_some_and(|id| s.snapshot.active.contains(id));
    let send = t
        .shadow(
            t.paint(
                el().size(34.0, 34.0)
                    .radius(12.0)
                    .center()
                    .border(1.0, t.c("chip-border")),
                if s.can_send() {
                    "primary-glaze"
                } else {
                    "chip"
                },
            ),
            if s.can_send() {
                "primary-shadow"
            } else {
                "chip-shadow"
            },
        )
        .child(icon(&i::UP, 16.0).color(t.c(if s.can_send() {
            "on-primary"
        } else {
            "text-tertiary"
        })))
        .key("send-message")
        .role("button")
        .focusable(true)
        .label("Send message")
        .disabled(!s.can_send())
        .on_press_tx(commands::submit);
    let mut actions = row().gap(8.0).center_y();
    if running {
        actions = actions.child(
            t.shadow(
                t.paint(
                    el().size(34.0, 34.0)
                        .radius(12.0)
                        .center()
                        .border(1.0, t.c("chip-border")),
                    "chip",
                ),
                "chip-shadow",
            )
            .child(
                el().size(11.0, 11.0)
                    .radius(2.0)
                    .border(1.5, t.c("text-secondary")),
            )
            .key("stop-message")
            .role("button")
            .label("Stop")
            .focusable(true)
            .on_press(|s: &mut State| s.stop()),
        );
    }
    let send = actions.child(send);
    let attach = icon_button_size(t, &i::PLUS, "Attach files", 18.0)
        .size(30.0, 30.0)
        .radius(9.0)
        .on_press_tx(|s: &mut State, tx| {
            let key = s.draft_key().to_owned();
            tx.open_file(
                rune::FileDialogOptions {
                    title: "Attach file".into(),
                    ..Default::default()
                },
                move |s: &mut State, result, _| match result {
                    Ok(Some(path)) => {
                        s.prompt_request(oc_gateway::prompt::Request::ReadAttachment {
                            key: key.clone(),
                            path: path.to_string_lossy().into_owned(),
                        });
                    }
                    Err(error) => s.error = Some(error.to_string()),
                    _ => {}
                },
            );
        });
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
                .on_drop_files(|s: &mut State, paths, tx| {
                    let key = s.draft_key().to_owned();
                    for path in paths.iter().take(100) {
                        if !s.prompt_request(oc_gateway::prompt::Request::ReadAttachment {
                            key: key.clone(),
                            path: path.to_string_lossy().into_owned(),
                        }) {
                            break;
                        }
                    }
                    tx.focus("message", false);
                })
                .child(crate::chat::comments::chips(s))
                .child(attachments(s))
                .child(input)
                .child(footer),
            "composer",
        ),
        "composer-shadow",
    );
    if s.draft().edit.focused {
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
        .key("workspace-choice")
        .h(28.0)
        .px(8.0)
        .gap(6.0)
        .center_y()
        .child(
            icon(
                if s.draft().worktree {
                    &crate::icons::WORKTREE
                } else {
                    &i::FOLDER
                },
                14.0,
            )
            .color(t.c("text-secondary")),
        )
        .child(label(
            t,
            if s.draft().worktree {
                "New worktree"
            } else {
                "Local"
            },
            12.5,
            500.0,
            "text-secondary",
        ))
        .child(icon(&i::DOWN, 14.0).color(t.c("text-tertiary")))
        .role("button")
        .label("Where this chat works")
        .focusable(true)
        .on_press_tx(|s: &mut State, tx| {
            if s.selected.is_none() {
                menus::open(s, Menu::Workspace, tx);
            }
        });
    let branch = s
        .draft()
        .branch
        .as_deref()
        .or_else(|| {
            project
                .and_then(|p| s.snapshot.branches.get(&p.canonical))
                .map(String::as_str)
        })
        .unwrap_or("Detached HEAD");
    let from = s.selected.is_none() && s.draft().worktree;
    let mut branch_control = row()
        .h(28.0)
        .px(8.0)
        .gap(6.0)
        .center_y()
        .child(icon(&i::BRANCH, 14.0).color(t.c("text-secondary")))
        .child(label(
            t,
            if from {
                format!("From {branch}")
            } else {
                branch.into()
            },
            12.5,
            500.0,
            if from {
                "text-secondary"
            } else {
                "text-tertiary"
            },
        ));
    if from {
        branch_control = branch_control.child(icon(&i::DOWN, 12.0).color(t.c("text-tertiary")));
    }
    let branch_control = branch_control
        .role("button")
        .label("Start from branch")
        .focusable(true)
        .on_press_tx(|s: &mut State, tx| {
            if s.selected.is_none() && s.draft().worktree {
                menus::open(s, Menu::Branch, tx);
            }
        });
    let workspace = row()
        .key("workspace-bar")
        .h(30.0)
        .mt(6.0)
        .px(6.0)
        .gap(2.0)
        .center_y()
        .child(workspace)
        .child(branch_control);
    let mut area = col()
        .key("composer-area")
        .w(column)
        .px(24.0)
        .py(12.0)
        .child(running::view(s))
        .child(crate::docks::view(s))
        .child(composer);
    if s.selected.is_none() {
        area = area.child(workspace);
    }
    area
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
                s.draft_mut().edit.replace_text(prompt);
                s.touch_draft();
                tx.focus("message", false);
            });
        cards = cards.child(t.shadow(t.paint(card, "glaze"), "glaze-shadow"));
    }
    cards
}

fn attachments(s: &State) -> El {
    let mut out = row()
        .w_full()
        .scroll_x()
        .gap(8.0)
        .mb(if s.draft().attachments.is_empty() {
            0.0
        } else {
            12.0
        });
    for (i, item) in s.draft().attachments.iter().enumerate() {
        let thumbnail = item.clone();
        let details = item.clone();
        out = out.child(
            row()
                .key(format!("attachment-{i}"))
                .h(58.0)
                .w(220.0)
                .padding(6.0)
                .gap(8.0)
                .radius(12.0)
                .border(1.0, s.theme.c("border"))
                .border_layout()
                .fill(s.theme.c("secondary"))
                .center_y()
                .child(
                    (if let Some(Some(image)) = s.draft().images.get(i) {
                        el().size(44.0, 44.0).radius(6.0).pixels(image.pixels())
                    } else {
                        el().size(44.0, 44.0)
                            .radius(6.0)
                            .fill(s.theme.c("control"))
                            .center()
                            .child(
                                icon(&crate::chat::icons::ATTACHMENT, 20.0)
                                    .color(s.theme.c("text-secondary")),
                            )
                    })
                    .role("button")
                    .label(format!(
                        "{} {}",
                        if item.mime.starts_with("image/")
                            || item.name.to_ascii_lowercase().ends_with(".docx")
                        {
                            "Preview"
                        } else {
                            "Download"
                        },
                        item.name
                    ))
                    .focusable(true)
                    .on_press(move |s: &mut State| attachment_preview::open(s, thumbnail.clone())),
                )
                .child(
                    col()
                        .grow(1.0)
                        .min_w(0.0)
                        .gap(2.0)
                        .child(label(&s.theme, &item.name, 12.0, 400.0, "text").truncate())
                        .child(label(
                            &s.theme,
                            &attachment_size(item.bytes.len()),
                            12.0,
                            400.0,
                            "text-tertiary",
                        ))
                        .on_press(move |s: &mut State| {
                            if !details.mime.starts_with("image/") {
                                attachment_preview::open(s, details.clone());
                            }
                        }),
                )
                .child(
                    label(&s.theme, "×", 14.0, 500.0, "text-tertiary")
                        .role("button")
                        .label(format!("Remove {}", item.name))
                        .focusable(true)
                        .on_press(move |s: &mut State| {
                            if i < s.draft().attachments.len() {
                                s.draft_mut().attachments.remove(i);
                                if i < s.draft().images.len() {
                                    s.draft_mut().images.remove(i);
                                }
                                s.touch_draft();
                            }
                        }),
                ),
        );
    }
    out
}
fn attachment_size(bytes: usize) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{} KB", bytes.div_ceil(1024))
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}
fn variant_label(value: &str) -> String {
    let mut chars = value.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
}
