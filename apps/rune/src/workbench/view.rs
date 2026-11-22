use super::{Panel, documents, sessions};
use crate::chat::icons as ci;
use crate::{
    State, icons,
    sidebar::{icon_button, label},
};
use rune::{El, GrowthSpec, ScrollSpec, TextStyle, col, el, icon, row, text_input};

pub fn kit(s: &State) -> rune_kit::Kit {
    let t = &s.theme;
    let mut k = rune_kit::Kit::from_palette(rune_kit::PaletteSeed {
        bg: t.c("surface"),
        fg: t.c("text"),
        accent: t.c("accent-text"),
    });
    k.c.bg_base = t.c("surface");
    k.c.layer_01 = t.c("secondary");
    k.c.bg_deep = t.c("surface-under");
    k.c.text_base = t.c("text");
    k.c.text_muted = t.c("text-secondary");
    k.c.text_faint = t.c("text-tertiary");
    k.c.border_base = t.c("border");
    k.c.border_muted = t.c("border");
    k.c.border_strong = t.c("border-heavy");
    k.c.success.fg = t.c("success");
    k.c.success.icon = t.c("success");
    k.c.danger.fg = t.c("error");
    k.c.danger.icon = t.c("error");
    k.c.warning.fg = t.c("warning");
    k.c.hover = t.c("hover");
    k
}
pub fn layout(s: &State, main: El, cx: &mut rune::Cx<State>) -> El {
    let mut body = row().grow(1.0).h_full().min_w(0.0).min_h(0.0).child(main);
    if s.selected.is_some() {
        body = body.child(panel(s, cx)).child(rail(s));
        if s.workbench.open && !s.workbench.expanded {
            let sidebar = if s.prefs.sidebar_closed {
                0.0
            } else {
                s.sidebar_width()
            };
            let drawer = if s.terminal.open {
                s.terminal.height.min(s.window_size.1 * 0.6)
            } else {
                0.0
            };
            body = body.child(
                s.theme
                    .shadow(
                        s.theme.paint(el().size(10.0, 56.0).radius(5.0), "glaze"),
                        "glaze-shadow",
                    )
                    .absolute(
                        s.window_size.0 - sidebar - 44.0 - s.panel_width() - 5.0,
                        (s.window_size.1 - drawer - 56.0) / 2.0,
                    )
                    .a11y_hidden(),
            );
        }
    }
    let mut stacked = col().grow(1.0).h_full().min_w(0.0).min_h(0.0).child(body);
    if s.terminal.open {
        stacked = stacked.child(terminal_host(s, cx));
    }
    stacked
}
pub fn rail(s: &State) -> El {
    let t = &s.theme;
    let mut rail = col()
        .key("workspace-rail")
        .role("navigation")
        .label("Workspace views")
        .w(44.0)
        .h_full()
        .px(4.0)
        .gap(4.0)
        .fill(t.c("surface"))
        .border_sides([0.0, 0.0, 0.0, 1.0], t.c("border"))
        .border_layout()
        .child(super::open_apps::trigger(s));
    for panel in Panel::ALL {
        let glyph = match panel {
            Panel::Files => &ci::FILES,
            Panel::Changes => &ci::CHANGES,
            Panel::Subagents => &ci::SUBAGENTS,
            Panel::Side => &ci::CHAT,
            Panel::Canvas => &ci::CANVAS,
            Panel::Browser => &ci::BROWSER,
            Panel::Terminal => &ci::TERMINAL,
        };
        let selected = if panel == Panel::Terminal {
            s.terminal.open
        } else {
            s.workbench.open && s.workbench.panel == panel
        };
        let button = el()
            .key(format!("panel-{}", panel.id()))
            .size(36.0, 36.0)
            .center()
            .radius(10.0)
            .hover(t.c("hover"))
            .child(icon(glyph, 18.0).color(t.c(if selected { "text" } else { "text-tertiary" })));
        let button = if selected {
            t.shadow(t.paint(button, "glaze"), "glaze-shadow")
        } else {
            button
        };
        rail = rail.child(
            button
                .role("button")
                .label(panel.label())
                .focusable(true)
                .help(panel.label())
                .on_hover_change(|s: &mut State, inside, _| {
                    s.native.tooltip = inside;
                    crate::native::coverage(s);
                })
                .on_press(move |s: &mut State| s.select_panel(panel)),
        );
    }
    rail.child(super::open_apps::overlay(s))
}
fn panel(s: &State, cx: &mut rune::Cx<State>) -> El {
    let t = &s.theme;
    let width = s.panel_width();
    let mut panel = col()
        .key("workspace-panel")
        .role("region")
        .label("Workspace panel")
        .w(width)
        .h_full()
        .min_h(0.0)
        .min_w(0.0)
        .motion(rune::Spring::new(0.2, 0.0))
        .clip_rounded(0.0)
        .fill(t.c("surface"))
        .border_sides(
            [0.0, 0.0, 0.0, if width > 0.0 { 1.0 } else { 0.0 }],
            t.c("border"),
        )
        .border_layout();
    if !s.workbench.open {
        return panel;
    }
    let files = matches!(s.workbench.panel, Panel::Files | Panel::Changes);
    let mut header = row()
        .h(40.0)
        .w_full()
        .pr(8.0)
        .gap(8.0)
        .center_y()
        .window_drag()
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
        .border_layout();
    if files && !s.workbench.docs.is_empty() {
        header = header.child(super::tabs::documents(s).grow(1.0).min_w(0.0));
    } else if s.workbench.panel == Panel::Canvas {
        header = header.child(crate::native::canvas_tabs(s));
    } else if s.workbench.panel == Panel::Browser {
        header = header.child(crate::native::browser_tabs(s));
    } else if s.workbench.panel == Panel::Side {
        header = header.child(sessions::tabs(s));
    } else {
        header = header.child(
            label(t, s.workbench.panel.label(), 12.0, 400.0, "text")
                .pl(12.0)
                .grow(1.0),
        );
    }
    header = header
        .child(
            icon_button(
                t,
                if s.workbench.expanded {
                    &super::icons::RESTORE
                } else {
                    &super::icons::EXPAND
                },
                if s.workbench.expanded {
                    "Restore workspace panel"
                } else {
                    "Expand workspace panel"
                },
            )
            .on_press(|s: &mut State| s.workbench.expanded = !s.workbench.expanded),
        )
        .child(
            icon_button(t, &icons::CLOSE, "Close workspace panel")
                .on_press(|s: &mut State| s.workbench.open = false),
        );
    panel = panel.child(header);
    if let Some(error) = &s.workbench.error {
        panel = panel.child(
            row()
                .w_full()
                .padding(10.0)
                .gap(8.0)
                .child(label(t, error, 11.0, 400.0, "error").wrap().grow(1.0))
                .child(documents::button(s, "Retry").on_press(|s: &mut State| {
                    s.workbench.error = None;
                    s.load_panel(true);
                })),
        );
    }
    let content = match s.workbench.panel {
        Panel::Files | Panel::Changes => row()
            .grow(1.0)
            .min_h(0.0)
            .min_w(0.0)
            .child(documents::view(s))
            .child(if s.workbench.tree_visible {
                if width <= 560.0 {
                    let tree_width = 250.0_f32.min((width - 1.0) * 0.75);
                    let drawer = if s.terminal.open {
                        s.terminal.height.min(s.window_size.1 * 0.6)
                    } else {
                        0.0
                    };
                    t.shadow(
                        tree(s)
                            .w(tree_width)
                            .h((s.window_size.1 - drawer - 80.0).max(0.0))
                            .fill(t.c("surface"))
                            .absolute(width - 1.0 - tree_width, 40.0),
                        "shadow",
                    )
                } else {
                    tree(s)
                }
            } else {
                el()
            }),
        Panel::Subagents => sessions::view(s, false),
        Panel::Side => sessions::view(s, true),
        Panel::Canvas => canvas_host(s, cx),
        Panel::Browser => crate::native::browser_panel(s),
        Panel::Terminal => terminal_host(s, cx),
    };
    panel = panel.child(content);
    if !s.workbench.expanded {
        panel = panel.child(
            el().key("workspace-resize")
                .role("separator")
                .label("Resize workspace panel")
                .focusable(true)
                .size(8.0, s.window_size.1)
                .absolute(0.0, 0.0)
                .cursor(rune::Cursor::ResizeColumn)
                .on_double_press(|s: &mut State| {
                    s.prefs.workbench_width = Some(820.0);
                    s.save();
                })
                .on_key(|s: &mut State, key, tx| {
                    let delta = match key.key {
                        rune::Key::Left => 32.0,
                        rune::Key::Right => -32.0,
                        _ => return false,
                    };
                    s.prefs.workbench_width = Some((s.panel_width() + delta).max(340.0));
                    s.save();
                    tx.instant();
                    true
                })
                .on_drag(|s: &mut State, d, tx| match d.phase {
                    rune::Phase::Down => d.data = s.panel_width(),
                    rune::Phase::Move => {
                        let max = (s.window_size.0
                            - if s.prefs.sidebar_closed {
                                0.0
                            } else {
                                s.sidebar_width()
                            }
                            - 320.0)
                            .max(340.0);
                        s.prefs.workbench_width = Some((d.data - d.dx).clamp(340.0, max));
                        tx.instant();
                    }
                    rune::Phase::Up => {
                        if d.cancelled() {
                            s.prefs.workbench_width = Some(d.data);
                        }
                        s.save();
                    }
                }),
        );
    }
    panel.child(super::actions::overlay(s))
}
fn tree(s: &State) -> El {
    let t = &s.theme;
    let changes = s.workbench.panel == Panel::Changes;
    let mut tree = col()
        .key("workspace-tree")
        .w(s.workbench.tree_width)
        .h_full()
        .min_h(0.0)
        .fill(t.c("surface-under"))
        .border_sides([0.0, 0.0, 0.0, 1.0], t.c("border"))
        .border_layout();
    let mut controls = row()
        .h(36.0)
        .w_full()
        .pl(12.0)
        .pr(8.0)
        .center_y()
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
        .border_layout();
    let mut segments = row()
        .grow(1.0)
        .min_w(0.0)
        .gap(2.0)
        .padding(2.0)
        .radius(9.0)
        .fill(t.c("well"));
    for (p, name) in [(Panel::Files, "All files"), (Panel::Changes, "Changes")] {
        let name = if p == Panel::Changes {
            format!("Changes {}", s.workbench.changes.len())
        } else {
            name.into()
        };
        let mut choice = row()
            .grow(1.0)
            .h(24.0)
            .px(8.0)
            .gap(6.0)
            .center()
            .radius(7.0)
            .child(label(
                t,
                if p == Panel::Changes {
                    "Changes"
                } else {
                    "All files"
                },
                12.0,
                500.0,
                if s.workbench.panel == p {
                    "text"
                } else {
                    "text-secondary"
                },
            ));
        if p == Panel::Changes {
            choice = choice.child(
                label(
                    t,
                    s.workbench.changes.len().to_string(),
                    10.5,
                    500.0,
                    "text-secondary",
                )
                .font(TextStyle::new(10.5, 500.0).mono().lh(15.75))
                .px(5.0)
                .radius(4.0)
                .fill(t.c("secondary")),
            );
        }
        let choice = if s.workbench.panel == p {
            t.shadow(t.paint(choice, "glaze"), "glaze-shadow")
        } else {
            choice
        };
        segments = segments.child(choice.role("button").label(name).on_press(
            move |s: &mut State| {
                s.workbench.panel = p;
                s.load_panel(false);
            },
        ));
    }
    controls = controls.child(t.shadow(segments, "well-shadow"));
    tree = tree.child(
        controls.child(
            crate::sidebar::icon_button_size(t, &super::icons::REFRESH, "Refresh workspace", 14.0)
                .on_press(|s: &mut State| s.load_panel(true)),
        ),
    );
    tree = tree.child(
        row()
            .w_full()
            .padding(8.0)
            .gap(4.0)
            .center_y()
            .child(
                text_input(&s.workbench.search, TextStyle::new(12.0, 400.0))
                    .key("workspace-filter")
                    .label(if changes {
                        "Filter changed files"
                    } else {
                        "Find files"
                    })
                    .placeholder("Filter files…", t.c("text-tertiary"))
                    .grow(1.0)
                    .min_w(0.0)
                    .h(28.0)
                    .px(9.0)
                    .radius(8.0)
                    .border(1.0, t.c("border-heavy"))
                    .color(t.c("text"))
                    .on_edit(|s: &mut State| &mut s.workbench.search)
                    .on_input_change(|s: &mut State, tx| {
                        if s.workbench.panel == Panel::Changes {
                            super::tree::rebuild(s);
                            return;
                        }
                        s.workbench.search_due = Some(tx.clock() + 0.18);
                        tx.wake_after(std::time::Duration::from_millis(180));
                    })
                    .on_submit(|s: &mut State, _| s.search_workspace()),
            )
            .child(
                documents::button(s, "−")
                    .font(TextStyle::new(12.0, 400.0).lh(18.0))
                    .px(10.0)
                    .py(0.0)
                    .h(28.0)
                    .center()
                    .label("Collapse folders")
                    .help("Collapse folders")
                    .on_press(super::tree::collapse),
            ),
    );
    let count = if changes {
        s.workbench.change_tree.len()
    } else {
        s.workbench.tree.len()
    };
    tree = tree.child(
        col()
            .grow(1.0)
            .min_h(0.0)
            .scroll(ScrollSpec {
                stick_bottom: false,
            })
            .child(
                col()
                    .growth(GrowthSpec::default())
                    .w_full()
                    .px(15.9921875)
                    .virtual_rows(
                        count,
                        24.0,
                        move |s: &State, n| {
                            if changes {
                                s.workbench.change_tree[n].0.clone().into()
                            } else {
                                s.workbench.tree[n].0.clone().into()
                            }
                        },
                        move |s: &State, n| tree_row(s, n, changes),
                    ),
            ),
    );
    if count == 0 {
        tree = tree.child(
            label(
                t,
                if s.workbench.pending.is_empty() {
                    if changes { "No changes" } else { "No files" }
                } else {
                    "Loading…"
                },
                12.0,
                400.0,
                "text-tertiary",
            )
            .padding(12.0),
        );
    }
    if !changes && !s.workbench.query.is_empty() && count == 200 {
        tree = tree.child(
            label(
                t,
                "First 200 results. Narrow your search.",
                12.0,
                400.0,
                "text-secondary",
            )
            .padding(10.0),
        );
    }
    let additions: u64 = s
        .workbench
        .changes
        .iter()
        .filter_map(|v| v["additions"].as_u64())
        .sum();
    let deletions: u64 = s
        .workbench
        .changes
        .iter()
        .filter_map(|v| v["deletions"].as_u64())
        .sum();
    tree.child(
        row()
            .w_full()
            .py(8.0)
            .px(10.0)
            .gap(8.0)
            .border_sides([1.0, 0.0, 0.0, 0.0], t.c("border"))
            .child(
                label(
                    t,
                    if changes {
                        format!("{} changed", s.workbench.changes.len())
                    } else {
                        "Project files".into()
                    },
                    11.0,
                    400.0,
                    "text-tertiary",
                )
                .font(TextStyle::new(11.0, 400.0).mono().lh(16.5))
                .grow(1.0),
            )
            .child(
                label(t, format!("+{additions}"), 11.0, 400.0, "success")
                    .font(TextStyle::new(11.0, 400.0).mono().lh(16.5)),
            )
            .child(
                label(t, format!("−{deletions}"), 11.0, 400.0, "error")
                    .font(TextStyle::new(11.0, 400.0).mono().lh(16.5)),
            ),
    )
    .child(
        el().key("file-tree-resize")
            .size(6.0, s.window_size.1)
            .absolute(0.0, 0.0)
            .role("separator")
            .label("Resize file tree")
            .focusable(true)
            .cursor(rune::Cursor::ResizeColumn)
            .on_key(|s: &mut State, key, tx| {
                let delta = match key.key {
                    rune::Key::Left => 16.0,
                    rune::Key::Right => -16.0,
                    _ => return false,
                };
                s.workbench.tree_width = (s.workbench.tree_width + delta).clamp(150.0, 360.0);
                tx.instant();
                true
            })
            .on_drag(|s: &mut State, d, tx| match d.phase {
                rune::Phase::Down => d.data = s.workbench.tree_width,
                rune::Phase::Move => {
                    s.workbench.tree_width = (d.data - d.dx).clamp(150.0, 360.0);
                    tx.instant();
                }
                rune::Phase::Up => {
                    if d.cancelled() {
                        s.workbench.tree_width = d.data;
                    }
                }
            }),
    )
}
fn tree_row(s: &State, n: usize, changes: bool) -> El {
    let t = &s.theme;
    let (path, dir, depth) = if changes {
        s.workbench.change_tree[n].clone()
    } else {
        s.workbench.tree[n].clone()
    };
    let open = if changes {
        !s.workbench.collapsed_changes.contains(&path)
    } else {
        s.workbench.folders.contains(&path)
    };
    let selected = s
        .workbench
        .selected
        .and_then(|i| s.workbench.docs.get(i))
        .is_some_and(|d| {
            d.path == path && d.directory == s.workspace_directory() && d.is_diff == changes
        });
    let name = path.rsplit('/').next().unwrap_or(&path);
    let glyph = if dir {
        &super::icons::TREE_CHEVRON
    } else {
        match path.rsplit('.').next().unwrap_or("") {
            "md" | "markdown" => &super::icons::MARKDOWN,
            "ts" | "tsx" => &super::icons::TYPESCRIPT,
            "html" | "htm" => &super::icons::HTML,
            _ => rune_theme_opencode::tree_icons::file(&path).icon(),
        }
    };
    let mut r = row()
        .key(path.clone())
        .w_full()
        .h(24.0)
        .pl(6.4 + depth as f32 * 18.6953125)
        .pr(6.4)
        .gap(4.8)
        .center_y()
        .radius(7.0)
        .fill(if selected {
            t.c("selected")
        } else {
            rune::Color::TRANSPARENT
        })
        .hover(t.c("hover"))
        .child(
            icon(glyph, 16.0)
                .rotate(if dir && !open {
                    -std::f32::consts::FRAC_PI_2
                } else {
                    0.0
                })
                .color(t.c("text-secondary")),
        )
        .child(
            label(t, name, 12.5, 400.0, "text-secondary")
                .truncate()
                .grow(1.0),
        );
    for ancestor in 0..depth {
        r = r.child(
            el().size(1.0, 24.0)
                .fill(t.c("border"))
                .absolute(13.65 + ancestor as f32 * 18.6953125, 0.0)
                .a11y_hidden()
                .inert(),
        );
    }
    if let Some(index) = s.workbench.change_lookup.get(&path) {
        let v = &s.workbench.changes[*index];
        let status = v["status"].as_str().unwrap_or("M");
        let short = match status {
            "modified" => "M",
            "added" => "A",
            "deleted" => "D",
            "renamed" => "R",
            "untracked" => "U",
            _ => status,
        };
        r = r.child(
            label(
                t,
                short,
                12.5,
                500.0,
                if status == "deleted" || status == "D" {
                    "error"
                } else if status == "added" || status == "A" || status == "untracked" {
                    "success"
                } else {
                    "warning"
                },
            )
            .w(12.0)
            .align(rune::Align::Center),
        );
    } else {
        let prefix = format!("{path}/");
        let changed = dir
            && s.workbench
                .change_lookup
                .range(prefix.clone()..)
                .next()
                .is_some_and(|(p, _)| p.starts_with(&prefix));
        r = r.child(
            el().w(12.0)
                .h(24.0)
                .center()
                .children(changed.then(|| el().size(6.0, 6.0).radius(3.0).fill(t.c("warning")))),
        );
    }
    let keyboard_path = path.clone();
    let pin_path = path.clone();
    r.role("treeitem")
        .checked(selected)
        .expanded(dir && open)
        .label(path.clone())
        .focusable(true)
        .on_double_press(move |s: &mut State| {
            if !dir {
                let directory = s.workspace_directory();
                s.workbench.pin_target = Some((directory.clone(), pin_path.clone(), changes));
                if let Some(doc) = s.workbench.docs.iter_mut().find(|d| {
                    d.path == pin_path && d.directory == directory && d.is_diff == changes
                }) {
                    doc.pinned = true;
                    s.workbench.pin_target = None;
                }
            }
        })
        .on_key(move |s: &mut State, key, tx| tree_key(s, &keyboard_path, changes, key, tx))
        .on_press(move |s: &mut State| {
            s.workbench.tree_focus = Some(path.clone());
            if dir {
                super::tree::toggle(s, &path, changes);
            } else {
                s.open_workspace_file(path.clone(), changes);
            }
        })
}
fn tree_key(
    s: &mut State,
    path: &str,
    changes: bool,
    key: &rune::KeyEvent,
    tx: &mut rune::Tx,
) -> bool {
    let rows: Vec<(String, bool)> = if changes {
        s.workbench
            .change_tree
            .iter()
            .map(|(p, d, _)| (p.clone(), *d))
            .collect()
    } else {
        s.workbench
            .tree
            .iter()
            .map(|(p, d, _)| (p.clone(), *d))
            .collect()
    };
    let Some(index) = rows.iter().position(|(p, _)| p == path) else {
        return false;
    };
    let next = match key.key {
        rune::Key::Down => Some((index + 1).min(rows.len() - 1)),
        rune::Key::Up => Some(index.saturating_sub(1)),
        rune::Key::Home => Some(0),
        rune::Key::End => Some(rows.len() - 1),
        rune::Key::Right if rows[index].1 => {
            let open = if changes {
                !s.workbench.collapsed_changes.contains(path)
            } else {
                s.workbench.folders.contains(path)
            };
            if !open {
                super::tree::toggle(s, path, changes);
            }
            None
        }
        rune::Key::Left => {
            let open = rows[index].1
                && if changes {
                    !s.workbench.collapsed_changes.contains(path)
                } else {
                    s.workbench.folders.contains(path)
                };
            if open {
                super::tree::toggle(s, path, changes);
                None
            } else {
                std::path::Path::new(path)
                    .parent()
                    .and_then(|p| rows.iter().position(|(r, _)| p == std::path::Path::new(r)))
            }
        }
        _ => return false,
    };
    if let Some(next) = next {
        let (path, dir) = &rows[next];
        s.workbench.tree_focus = Some(path.clone());
        tx.focus(path.clone(), true);
        tx.scroll_into_view(path.clone());
        if !dir {
            s.open_workspace_file(path.clone(), changes);
        }
    }
    true
}
pub fn empty(s: &State, message: &str) -> El {
    col()
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .center()
        .padding(24.0)
        .child(label(&s.theme, message, 12.0, 400.0, "text-secondary").wrap())
}
/// Mount `oc_webview`'s element here. The host is a keyed, bounded layout slot.
pub fn canvas_host(s: &State, _cx: &mut rune::Cx<State>) -> El {
    crate::native::canvas_panel(s)
}
pub fn empty_state(s: &State, glyph: &'static rune::Icon, title: &str, message: &str) -> El {
    col()
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .center()
        .padding(24.0)
        .child(icon(glyph, 24.0).color(s.theme.c("text-tertiary")).mb(
            if matches!(s.workbench.panel, Panel::Side | Panel::Subagents) {
                8.0
            } else {
                16.0
            },
        ))
        .child(label(&s.theme, title, 14.0, 500.0, "text").mb(8.0))
        .child(
            label(&s.theme, message, 12.0, 400.0, "text-secondary")
                .wrap()
                .align(rune::Align::Center),
        )
}
/// Mount `TerminalView::element("terminal-host", cx, accessor)` here; poll its
/// `poll_tx(clock, tx)` from the app poll and forward focused IME through `ime()`.
pub fn terminal_host(s: &State, cx: &mut rune::Cx<State>) -> El {
    crate::terminal::view(s, cx)
}
