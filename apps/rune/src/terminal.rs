//! Project-scoped PTYs survive drawer dismissal; only closing a tab terminates a shell.
use crate::workbench::worker::{Operation, Request, Worker};
use crate::{
    State, icons,
    sidebar::{icon_button, label},
};
use oc_terminal::{Palette, Size, TerminalView};
use rune::{Cx, El, Tx, col, el, row};
use serde_json::Value;

pub struct Tab {
    pub id: String,
    pub directory: String,
    pub view: TerminalView,
    pub exited: bool,
    pub cwd: String,
    pub exit_code: Option<i64>,
}
pub struct Drawer {
    pub open: bool,
    pub height: f32,
    pub tabs: Vec<Tab>,
    pub selected: usize,
    worker: Option<Worker>,
    directory: String,
    loaded: bool,
    creating: bool,
    listing: bool,
    closing: std::collections::BTreeSet<String>,
    pub error: Option<String>,
    theme: std::collections::BTreeMap<String, String>,
    revision: u64,
}
impl Default for Drawer {
    fn default() -> Self {
        Self {
            open: false,
            height: 280.0,
            tabs: vec![],
            selected: 0,
            worker: None,
            directory: String::new(),
            loaded: false,
            creating: false,
            listing: false,
            closing: Default::default(),
            error: None,
            theme: Default::default(),
            revision: 0,
        }
    }
}
impl State {
    pub fn toggle_terminal(&mut self) {
        self.terminal.open = !self.terminal.open;
        if self.terminal.open {
            self.terminal.loaded = false;
            self.load_terminals();
        }
    }
    fn terminal_request(&mut self, tag: String, op: Operation) -> bool {
        if let Some(w) = &self.terminal.worker {
            if let Err(e) = w.request(Request { epoch: 0, tag, op }) {
                self.terminal.error = Some(e);
                return false;
            }
            return true;
        }
        false
    }
    fn load_terminals(&mut self) {
        if self.terminal.listing {
            return;
        }
        let directory = self.workspace_directory();
        if directory.is_empty() {
            return;
        }
        self.terminal.directory = directory.clone();
        self.terminal.listing = self.terminal_request(
            format!("list:{directory}"),
            Operation::Get {
                path: "terminals".into(),
                query: vec![("directory".into(), directory)],
            },
        );
        self.terminal.revision = self.snapshot.native_revisions[5];
    }
    fn create_terminal(&mut self) {
        if self.terminal.tabs.len() >= 32 {
            self.terminal.error = Some("Close a terminal tab before opening another.".into());
            return;
        }
        if self.terminal.creating {
            return;
        }
        let d = self.workspace_directory();
        self.terminal.creating =
            self.terminal_request(format!("create:{d}"), Operation::TerminalCreate(d));
    }
    fn attach_terminal(&mut self, value: &Value, directory: &str) {
        let Some(id) = value["id"].as_str() else {
            return;
        };
        if let Some(tab) = self.terminal.tabs.iter_mut().find(|t| t.id == id) {
            tab.exited = value["status"] == "exited";
            tab.cwd = value["cwd"].as_str().unwrap_or(directory).into();
            tab.exit_code = value["exitCode"].as_i64();
            return;
        }
        let mut view = TerminalView::new(Palette::from_tokens(|n| self.theme.c(n)));
        view.blink(false);
        self.terminal.tabs.push(Tab {
            id: id.into(),
            directory: directory.into(),
            view,
            exited: value["status"] == "exited",
            cwd: value["cwd"].as_str().unwrap_or(directory).into(),
            exit_code: value["exitCode"].as_i64(),
        });
        self.terminal.selected = self.terminal.tabs.len() - 1;
    }
    fn close_terminal_tab(&mut self, index: usize) {
        let t = &self.terminal.tabs[index];
        if self.terminal.closing.contains(&t.id) {
            return;
        }
        let id = t.id.clone();
        if self.terminal_request(
            format!("close:{}", t.id),
            Operation::TerminalClose {
                directory: t.directory.clone(),
                id: t.id.clone(),
            },
        ) {
            self.terminal.closing.insert(id);
        }
    }
}
pub fn start(s: &mut State, client: oc_gateway::Gateway, wake: rune::Waker) {
    s.terminal.worker = Some(Worker::start(client, wake));
    if s.terminal.open {
        s.load_terminals();
    }
}
pub fn poll(s: &mut State, clock: f64, tx: &mut Tx) -> bool {
    let mut changed = false;
    if s.terminal.open && s.terminal.revision != s.snapshot.native_revisions[5] {
        s.load_terminals();
    }
    if s.terminal.open && s.terminal.directory != s.workspace_directory() {
        s.terminal.loaded = false;
        s.load_terminals();
    }
    let replies = s
        .terminal
        .worker
        .as_ref()
        .map(Worker::take)
        .unwrap_or_default();
    for r in replies {
        changed = true;
        if r.tag.starts_with("list:") {
            s.terminal.listing = false;
        }
        if r.tag.starts_with("create:") {
            s.terminal.creating = false;
        }
        if let Some(id) = r.tag.strip_prefix("close:") {
            s.terminal.closing.remove(id);
        }
        match r.result {
            Err(e) => s.terminal.error = Some(e),
            Ok(p) => {
                s.terminal.error = None;
                if let Some(d) = r.tag.strip_prefix("list:") {
                    if d != s.terminal.directory {
                        continue;
                    }
                    let first_open = !s.terminal.loaded;
                    s.terminal.loaded = true;
                    let items = p.value.as_array().cloned().unwrap_or_default();
                    s.terminal
                        .tabs
                        .retain(|t| t.directory != d || items.iter().any(|v| v["id"] == t.id));
                    for item in items.iter().take(32) {
                        s.attach_terminal(item, d);
                    }
                    if items.is_empty() && first_open {
                        s.create_terminal();
                    }
                } else if let Some(d) = r.tag.strip_prefix("create:") {
                    s.attach_terminal(&p.value, d);
                } else if let Some(id) = r.tag.strip_prefix("close:") {
                    if let Some(index) = s.terminal.tabs.iter().position(|t| t.id == id) {
                        if index < s.terminal.selected {
                            s.terminal.selected -= 1;
                        }
                    }
                    s.terminal.tabs.retain(|t| t.id != id);
                    s.terminal.selected = s
                        .terminal
                        .selected
                        .min(s.terminal.tabs.len().saturating_sub(1));
                }
            }
        }
    }
    let recolor = s.terminal.theme != s.theme.tokens;
    if recolor {
        s.terminal.theme = s.theme.tokens.clone();
    }
    let active = if s.terminal.open && s.pages.route == crate::pages::Route::Chat {
        active(s)
    } else {
        None
    };
    let focused = tx.focused().is_some_and(|k| k == "terminal-host");
    for (i, t) in s.terminal.tabs.iter_mut().enumerate() {
        let visible =
            s.terminal.open && s.pages.route == crate::pages::Route::Chat && active == Some(i);
        if visible && !crate::OPTIONS.get().unwrap().headless && t.view.worker.is_none() {
            if let (Some(url), Some(wake)) = (crate::sidecar::url(), s.waker.clone()) {
                match oc_gateway::Gateway::new(url, None) {
                    Ok(client) => t.view.attach(oc_terminal::Worker::start(
                        client,
                        t.directory.clone(),
                        Some(t.id.clone()),
                        Size { cols: 80, rows: 24 },
                        move || wake(),
                    )),
                    Err(e) => s.terminal.error = Some(e),
                }
            }
        } else if !visible {
            t.view.worker = None;
        }
        if recolor {
            t.view.set_palette(Palette::from_tokens(|n| s.theme.c(n)));
        }
        t.view
            .set_focused(s.terminal.open && active == Some(i) && focused);
        let update = t.view.poll_tx(clock, tx);
        changed |= update && s.terminal.open && active == Some(i);
    }
    changed
}
fn active(s: &State) -> Option<usize> {
    let directory = s.workspace_directory();
    s.terminal
        .tabs
        .get(s.terminal.selected)
        .filter(|t| t.directory == directory)
        .map(|_| s.terminal.selected)
        .or_else(|| {
            s.terminal
                .tabs
                .iter()
                .position(|t| t.directory == directory)
        })
}
pub fn ime(s: &mut State, ime: &rune::Ime, tx: &mut Tx) -> bool {
    if !s.terminal.open || !tx.focused().is_some_and(|k| k == "terminal-host") {
        return false;
    }
    if let Some(i) = active(s) {
        return s.terminal.tabs[i].view.ime(ime);
    }
    false
}
pub fn view(s: &State, cx: &mut Cx<State>) -> El {
    let t = &s.theme;
    let directory = s.workspace_directory();
    let current = active(s);
    use crate::workbench::panel_tabs as tabs;
    let mut strip = tabs::strip("Terminals");
    for (number, (i, tab)) in s
        .terminal
        .tabs
        .iter()
        .enumerate()
        .filter(|(_, tab)| tab.directory == directory)
        .enumerate()
    {
        let mut button = tabs::button(
            s,
            &format!("Terminal {}", number + 1),
            &crate::chat::icons::TERMINAL,
            current == Some(i),
        )
        .key(format!("terminal-tab-{i}"))
        .on_press_tx(move |s: &mut State, tx| {
            s.terminal.selected = i;
            tx.focus("terminal-host", false);
        })
        .on_key(move |s: &mut State, key, tx| {
            let indices: Vec<_> = s
                .terminal
                .tabs
                .iter()
                .enumerate()
                .filter(|(_, t)| t.directory == s.workspace_directory())
                .map(|(i, _)| i)
                .collect();
            let Some(next) = tabs::next(&key.key, number, indices.len()) else {
                return false;
            };
            s.terminal.selected = indices[next];
            tx.focus(format!("terminal-tab-{}", indices[next]), false);
            true
        });
        if tab.exited {
            button = button.child(label(t, "Exited", 10.0, 400.0, "text-tertiary"));
        }
        strip = strip.child(tabs::pill(
            s,
            current == Some(i),
            button,
            tabs::close(s, &format!("Close Terminal {}", number + 1))
                .disabled(s.terminal.closing.contains(&tab.id))
                .help("Close terminal and end shell")
                .on_press(move |s: &mut State| s.close_terminal_tab(i)),
        ));
    }
    let header = row()
        .h(40.0)
        .w_full()
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
        .border_layout()
        .pr(8.0)
        .center_y()
        .gap(8.0)
        .child(tabs::viewport(strip))
        .child(
            icon_button(t, &icons::PLUS, "New terminal")
                .mx(6.0)
                .disabled(s.terminal.creating)
                .on_press(|s: &mut State| s.create_terminal()),
        )
        .child(
            icon_button(t, &icons::CLOSE, "Hide terminal")
                .on_press(|s: &mut State| s.terminal.open = false),
        );
    let mut body = col()
        .key("terminal-drawer")
        .w_full()
        .h(s.terminal.height.min(s.window_size.1 * 0.6))
        .min_h(120.0)
        .fill(t.c("surface"))
        .border_sides([1.0, 0.0, 0.0, 0.5], t.c("border"))
        .border_layout()
        .child(header);
    if let Some(e) = &s.terminal.error {
        body = body.child(label(t, e, 12.0, 400.0, "error").px(12.0));
    }
    if let Some(i) = active(s) {
        body = body
            .child(
                row()
                    .w_full()
                    .px(12.0)
                    .py(8.0)
                    .gap(12.0)
                    .center_y()
                    .child(
                        label(t, &s.terminal.tabs[i].cwd, 11.0, 400.0, "text-tertiary")
                            .truncate()
                            .grow(1.0),
                    )
                    .child(
                        label(
                            t,
                            if s.terminal.tabs[i].exited {
                                s.terminal.tabs[i]
                                    .exit_code
                                    .map_or("Exited".into(), |code| format!("Exited ({code})"))
                            } else {
                                s.terminal.tabs[i].view.frame.status.into()
                            },
                            11.0,
                            400.0,
                            "text-tertiary",
                        )
                        .role("status"),
                    ),
            )
            .child(
                col().grow(1.0).min_h(0.0).mx(10.0).mb(10.0).mt(4.0).child(
                    s.terminal.tabs[i]
                        .view
                        .element("terminal-host", cx, |s| {
                            let i = active(s).expect("mounted terminal");
                            &mut s.terminal.tabs[i].view
                        })
                        .autofocus()
                        .grow(1.0)
                        .min_h(0.0),
                ),
            );
    } else {
        body = body.child(
            crate::workbench::empty_state(
                s,
                &crate::chat::icons::TERMINAL,
                if s.terminal.loaded {
                    "Your project terminal"
                } else {
                    "Loading terminals…"
                },
                "Open a shell in this project. Add tabs to run commands side by side.",
            )
            .child(
                crate::pages::button(
                    s,
                    if s.terminal.creating {
                        "Opening…"
                    } else {
                        "New terminal"
                    },
                )
                .disabled(s.terminal.creating || !s.terminal.loaded)
                .on_press(|s: &mut State| s.create_terminal()),
            ),
        );
    }
    body.child(
        el().key("terminal-resize")
            .w_full()
            .h(8.0)
            .absolute(0.0, -4.0)
            .cursor(rune::Cursor::ResizeRow)
            .role("separator")
            .label("Resize terminal")
            .focusable(true)
            .on_drag(|s: &mut State, d, tx| match d.phase {
                rune::Phase::Down => d.data = s.terminal.height,
                rune::Phase::Move => {
                    s.terminal.height =
                        (d.data - d.dy).clamp(120.0, (s.window_size.1 * 0.6).max(120.0));
                    tx.instant();
                }
                rune::Phase::Up => {
                    if d.cancelled() {
                        s.terminal.height = d.data;
                    }
                }
            })
            .on_key(|s: &mut State, key, _| {
                let d = match key.key {
                    rune::Key::Up => 32.0,
                    rune::Key::Down => -32.0,
                    _ => return false,
                };
                s.terminal.height =
                    (s.terminal.height + d).clamp(120.0, (s.window_size.1 * 0.6).max(120.0));
                true
            }),
    )
}
/// Screenshot-only acquisition, completed before the headless layout clock starts.
pub fn capture(s: &mut State) -> Result<(), String> {
    let directory = s.workspace_directory();
    let d = directory.clone();
    let sidebar = if s.prefs.sidebar_closed {
        0.0
    } else {
        s.sidebar_width()
    };
    let size = Size {
        cols: ((s.window_size.0 - sidebar - 20.5 - oc_terminal::SCROLLBAR_RESERVE)
            / oc_terminal::CELL_WIDTH)
            .floor()
            .max(2.0) as u16,
        rows: ((s.terminal.height.min(s.window_size.1 * 0.6) - 1.0 - 40.0 - 32.5 - 14.0)
            / oc_terminal::CELL_HEIGHT)
            .floor()
            .max(1.0) as u16,
    };
    let url = crate::OPTIONS
        .get()
        .unwrap()
        .gateway
        .clone()
        .ok_or("Terminal capture needs gateway")?;
    let (id, frame) = std::thread::spawn(move || -> Result<_, String> {
        use std::{
            sync::{Arc, Condvar, Mutex},
            time::{Duration, Instant},
        };
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;
        let client = oc_gateway::Gateway::new(&url, None)?;
        let terminal = rt.block_on(async {
            let items = client.terminals(&d).await?;
            if let Some(t) = items.into_iter().next() {
                Ok(t)
            } else {
                client.create_terminal(&d).await
            }
        })?;
        let wake = Arc::new((Mutex::new(false), Condvar::new()));
        let notify = wake.clone();
        let w = oc_terminal::Worker::start(client, d, Some(terminal.id.clone()), size, move || {
            *notify.0.lock().unwrap() = true;
            notify.1.notify_one();
        });
        let end = Instant::now() + Duration::from_secs(20);
        let mut frame = None;
        let mut last = Instant::now();
        let mut sent = false;
        loop {
            let ready = wake.0.lock().unwrap();
            let _ = wake
                .1
                .wait_timeout(ready, Duration::from_millis(100))
                .unwrap();
            if let Some(f) = w.take() {
                if let Some(e) = &f.error {
                    return Err(e.clone());
                }
                frame = Some(f);
                last = Instant::now();
                if !sent {
                    if let Ok(cmd) = std::env::var("OPENCODEX_TERMINAL_CAPTURE_COMMAND") {
                        w.command(oc_terminal::Command::Input(format!("{cmd}\r")))?;
                    }
                    sent = true;
                }
            }
            if frame.is_some() && last.elapsed() > Duration::from_millis(800) {
                return Ok((terminal.id, frame.unwrap()));
            }
            if Instant::now() > end {
                return Err("Terminal capture timed out".into());
            }
        }
    })
    .join()
    .map_err(|_| "Terminal capture worker panicked")??;
    let mut view = TerminalView::new(Palette::from_tokens(|n| s.theme.c(n)));
    view.blink(false);
    view.frame = frame;
    view.set_focused(true);
    s.terminal.tabs.push(Tab {
        id,
        cwd: directory.clone(),
        directory,
        view,
        exited: false,
        exit_code: None,
    });
    s.terminal.selected = 0;
    s.terminal.open = true;
    s.terminal.loaded = true;
    Ok(())
}
