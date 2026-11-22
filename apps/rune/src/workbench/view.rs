use super::{Panel, documents, sessions};
use crate::chat::icons as ci;
use crate::{
    State, icons,
    sidebar::{icon_button, label},
};
use rune::{El, GrowthSpec, ScrollSpec, TextStyle, col, el, icon, row, text_input};
static EXPAND: rune::Icon = rune::Icon {
    name: "workspace-expand",
    view: 24.0,
    body: r#"<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>"#,
};
static BROWSER: rune::Icon = rune::Icon {
    name: "workspace-browser",
    view: 24.0,
    body: r#"<rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h18M6 6.5h.01M9 6.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>"#,
};

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
    k.c.danger.fg = t.c("error");
    k.c.hover = t.c("hover");
    k
}
pub fn layout(s: &State, main: El, cx: &mut rune::Cx<State>) -> El {
    let mut body = row().grow(1.0).h_full().min_w(0.0).min_h(0.0).child(main);
    if s.selected.is_some() {
        body = body.child(panel(s, cx)).child(rail(s));
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
        .fill(t.c("surface-under"))
        .border_sides([0.0, 0.0, 0.0, 1.0], t.c("border"))
        .border_layout()
        .child(
            el().size(36.0, 40.0)
                .center()
                .child(icon(&ci::OPEN, 18.0).color(t.c("text-tertiary")))
                .help("Open project in Finder")
                .on_press(|s: &mut State| {
                    let directory = s.workspace_directory();
                    std::thread::spawn(move || {
                        let _ = std::process::Command::new("open").arg(directory).spawn();
                    });
                }),
        );
    for panel in Panel::ALL {
        let glyph = match panel {
            Panel::Files => &ci::FILES,
            Panel::Changes => &ci::CHANGES,
            Panel::Subagents => &ci::SUBAGENTS,
            Panel::Side => &ci::CHAT,
            Panel::Canvas => &ci::CANVAS,
            Panel::Browser => &BROWSER,
            Panel::Terminal => &ci::TERMINAL,
        };
        let selected = if panel == Panel::Terminal {
            s.terminal.open
        } else {
            s.workbench.open && s.workbench.panel == panel
        };
        rail = rail.child(
            el().key(format!("panel-{}", panel.id()))
                .size(36.0, 36.0)
                .center()
                .radius(10.0)
                .fill(if selected {
                    t.c("selected")
                } else {
                    rune::Color::TRANSPARENT
                })
                .hover(t.c("hover"))
                .child(icon(glyph, 18.0).color(t.c(if selected {
                    "text"
                } else {
                    "text-tertiary"
                })))
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
    rail
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
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"));
    if files && !s.workbench.docs.is_empty() {
        header = header.child(documents::tabs(s).grow(1.0).min_w(0.0));
    } else if s.workbench.panel == Panel::Canvas {
        header = header.child(crate::native::canvas_tabs(s));
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
                &EXPAND,
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
            .child(tree(s)),
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
                            - 364.0)
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
    panel
}
fn tree(s: &State) -> El {
    let t = &s.theme;
    let changes = s.workbench.panel == Panel::Changes;
    let mut tree = col()
        .key("workspace-tree")
        .w(220.0)
        .h_full()
        .min_h(0.0)
        .fill(t.c("surface-under"))
        .border_sides([0.0, 0.0, 0.0, 1.0], t.c("border"))
        .border_layout();
    let mut controls = row()
        .h(39.0)
        .w_full()
        .px(8.0)
        .gap(4.0)
        .center_y()
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"));
    for (p, name) in [(Panel::Files, "All files"), (Panel::Changes, "Changes")] {
        controls = controls.child(
            documents::button(s, name)
                .fill(if s.workbench.panel == p {
                    t.c("selected")
                } else {
                    rune::Color::TRANSPARENT
                })
                .on_press(move |s: &mut State| {
                    s.workbench.panel = p;
                    s.load_panel(false);
                }),
        );
    }
    tree = tree.child(
        controls.child(
            documents::button(s, "↻")
                .label("Refresh workspace")
                .on_press(|s: &mut State| s.load_panel(true)),
        ),
    );
    if changes {
        tree = tree.child(
            row().h(36.0).px(8.0).center_y().child(
                documents::button(
                    s,
                    if s.workbench.mode == "working" {
                        "Working tree ▾"
                    } else {
                        "Branch changes ▾"
                    },
                )
                .on_press(|s: &mut State| {
                    s.workbench.mode = if s.workbench.mode == "working" {
                        "branch"
                    } else {
                        "working"
                    }
                    .into();
                    s.workbench.docs.retain(|d| !d.is_diff);
                    s.workbench.selected = None;
                    s.load_panel(true);
                }),
            ),
        );
    } else {
        tree = tree.child(
            text_input(&s.workbench.search, TextStyle::new(12.0, 400.0))
                .key("workspace-filter")
                .placeholder("Filter files…", t.c("text-tertiary"))
                .w(204.0)
                .h(28.0)
                .mx(8.0)
                .my(6.0)
                .px(9.0)
                .radius(8.0)
                .border(1.0, t.c("border-heavy"))
                .color(t.c("text"))
                .on_edit(|s: &mut State| &mut s.workbench.search)
                .on_input_change(|s: &mut State, tx| {
                    s.workbench.search_due = Some(tx.clock() + 0.18);
                    tx.wake_after(std::time::Duration::from_millis(180));
                })
                .on_submit(|s: &mut State, _| s.search_workspace()),
        );
    }
    let count = if changes {
        s.workbench.changes.len()
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
            .child(col().growth(GrowthSpec::default()).w_full().virtual_rows(
                count,
                24.0,
                move |s: &State, n| {
                    if changes {
                        s.workbench.changes[n]["path"]
                            .as_str()
                            .unwrap_or("")
                            .to_owned()
                            .into()
                    } else {
                        s.workbench.tree[n].0.clone().into()
                    }
                },
                move |s: &State, n| tree_row(s, n, changes),
            )),
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
    tree.child(
        label(
            t,
            if changes {
                "Working tree"
            } else {
                "Project files"
            },
            11.0,
            400.0,
            "text-tertiary",
        )
        .padding(10.0)
        .border_sides([1.0, 0.0, 0.0, 0.0], t.c("border")),
    )
}
fn tree_row(s: &State, n: usize, changes: bool) -> El {
    let t = &s.theme;
    let (path, dir, depth) = if changes {
        (
            s.workbench.changes[n]["path"]
                .as_str()
                .unwrap_or("")
                .to_owned(),
            false,
            0,
        )
    } else {
        s.workbench.tree[n].clone()
    };
    let open = s.workbench.folders.contains(&path);
    let selected = s
        .workbench
        .selected
        .and_then(|i| s.workbench.docs.get(i))
        .is_some_and(|d| d.path == path);
    let name = path.rsplit('/').next().unwrap_or(&path);
    let file = rune_kit::FileNode::<()> {
        name: name.into(),
        path: path.clone(),
        dir: false,
        data: None,
    };
    let glyph = if dir {
        if open { &icons::DOWN } else { &icons::RIGHT }
    } else {
        file.icon(false)
    };
    let mut r = row()
        .key(path.clone())
        .w_full()
        .h(24.0)
        .pl(12.0 + depth as f32 * 12.0)
        .pr(10.0)
        .gap(6.0)
        .center_y()
        .radius(7.0)
        .fill(if selected {
            t.c("selected")
        } else {
            rune::Color::TRANSPARENT
        })
        .hover(t.c("hover"))
        .child(icon(glyph, 14.0).color(t.c("text-secondary")))
        .child(
            label(t, name, 12.5, 400.0, "text-secondary")
                .truncate()
                .grow(1.0),
        );
    if changes {
        let v = &s.workbench.changes[n];
        let status = v["status"].as_str().unwrap_or("M");
        r = r.child(label(
            t,
            status,
            10.0,
            500.0,
            if status == "deleted" || status == "D" {
                "error"
            } else if status == "added" || status == "A" || status == "untracked" {
                "success"
            } else {
                "warning"
            },
        ));
    }
    r.role(if dir { "treeitem" } else { "button" })
        .focusable(true)
        .on_press(move |s: &mut State| {
            if dir {
                if !s.workbench.folders.remove(&path) {
                    s.workbench.folders.insert(path.clone());
                    s.load_folder(&path, false);
                }
                s.rebuild_workspace_tree();
            } else {
                s.open_workspace_file(path.clone(), changes);
            }
        })
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
        .gap(12.0)
        .child(icon(glyph, 24.0).color(s.theme.c("text-tertiary")).mb(4.0))
        .child(label(&s.theme, title, 14.0, 500.0, "text"))
        .child(
            label(&s.theme, message, 12.0, 400.0, "text-secondary")
                .wrap()
                .max_w(560.0),
        )
}
/// Mount `TerminalView::element("terminal-host", cx, accessor)` here; poll its
/// `poll_tx(clock, tx)` from the app poll and forward focused IME through `ime()`.
pub fn terminal_host(s: &State, cx: &mut rune::Cx<State>) -> El {
    crate::terminal::view(s, cx)
}
