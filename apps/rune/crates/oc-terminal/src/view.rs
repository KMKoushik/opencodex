use crate::{Command, Frame, Palette, Size, Worker, input};
use alacritty_terminal::{
    term::{TermMode, cell::Flags},
    vte::ansi::CursorShape,
};
use rune::{Cx, El, Family, KeyEvent, Phase, TextStyle, Tx, el, text};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_INSTANCE: AtomicU64 = AtomicU64::new(1);

pub const CELL_WIDTH: f32 = 7.826_172; // Menlo 13 pt, matching the browser font.
pub const CELL_HEIGHT: f32 = 16.;

enum Bell {
    Idle,
    Flash(f64),
}

/// A viewport, independent of tab/header ownership. All parsing and network work is off-thread.
pub struct TerminalView {
    pub frame: Frame,
    pub worker: Option<Worker>,
    pub error: Option<String>,
    palette: Palette,
    theme_revision: u64,
    instance: u64,
    size: Size,
    wheel: f32,
    pub preedit: String,
    focused: bool,
    blink: crate::cursor::Blink,
    bell: Bell,
}
impl TerminalView {
    pub fn new(palette: Palette) -> Self {
        let size = Size { cols: 80, rows: 24 };
        Self {
            frame: crate::Engine::new(size).snapshot(),
            worker: None,
            error: None,
            palette,
            theme_revision: 0,
            instance: NEXT_INSTANCE.fetch_add(1, Ordering::Relaxed),
            size,
            wheel: 0.,
            preedit: String::new(),
            focused: true,
            blink: Default::default(),
            bell: Bell::Idle,
        }
    }
    pub fn set_palette(&mut self, palette: Palette) {
        self.send(Command::Theme(palette.clone()));
        self.palette = palette;
        self.theme_revision += 1;
    }
    pub fn attach(&mut self, worker: Worker) {
        self.theme_revision += 1;
        self.worker = Some(worker);
        self.send(Command::Theme(self.palette.clone()));
        self.send(Command::Resize(self.size));
    }
    pub fn poll(&mut self) -> bool {
        if let Some(frame) = self.worker.as_ref().and_then(Worker::take) {
            self.frame = frame;
            true
        } else {
            false
        }
    }
    pub fn blink(&mut self, enabled: bool) {
        self.blink.step(crate::cursor::Event::Enable(enabled));
    }
    pub fn set_focused(&mut self, focused: bool) {
        if self.focused == focused {
            return;
        }
        self.focused = focused;
        if !focused {
            self.blink.step(crate::cursor::Event::Blur);
        }
        if self.frame.mode.contains(TermMode::FOCUS_IN_OUT) {
            self.send(Command::Input(
                if focused { "\x1b[I" } else { "\x1b[O" }.into(),
            ));
        }
    }
    pub fn poll_tx(&mut self, clock: f64, tx: &mut Tx) -> bool {
        let before = self.blink.visible();
        let old_bell = self.frame.bell;
        let mut changed = self.poll();
        if self.frame.bell != old_bell {
            self.bell = Bell::Flash(clock + 0.15);
        }
        if let Bell::Flash(until) = self.bell {
            if clock >= until {
                self.bell = Bell::Idle;
                changed = true;
            } else {
                tx.wake_after(std::time::Duration::from_secs_f64(until - clock));
            }
        }
        if changed && self.focused {
            self.blink.step(crate::cursor::Event::Activity(clock));
        }
        if let Some(next) = self.blink.step(crate::cursor::Event::Tick(clock)) {
            tx.wake_after(std::time::Duration::from_secs_f64((next - clock).max(0.)));
        }
        changed || before != self.blink.visible()
    }
    pub fn send(&mut self, command: Command) {
        if let Some(worker) = &self.worker {
            if let Err(e) = worker.command(command) {
                self.error = Some(e);
            }
        }
    }
    pub fn key(&mut self, ev: &KeyEvent, tx: &mut Tx) -> bool {
        if ev.is_command('c')
            && (cfg!(target_os = "macos") || ev.mods.shift)
            && !self.frame.selection.is_empty()
        {
            oc_native::clipboard::copy(tx, self.frame.selection.clone());
            return true;
        }
        if ev.is_command('v') && (cfg!(target_os = "macos") || ev.mods.shift) {
            tx.request_paste();
            return true;
        }
        if let Some(text) = input::key(ev, self.frame.mode) {
            self.send(Command::Input(text));
            return true;
        }
        false
    }
    pub fn paste(&mut self, text: &str) {
        self.send(Command::Paste(text.to_owned()));
    }
    pub fn ime(&mut self, ime: &rune::Ime) -> bool {
        match ime {
            rune::Ime::Commit(text) => {
                self.preedit.clear();
                self.send(Command::Input(text.clone()));
            }
            rune::Ime::Preedit(text, _, _) => self.preedit = text.clone(),
            rune::Ime::Disabled => self.preedit.clear(),
            _ => {}
        }
        true
    }
    /// Supply a stable, unique key and a narrow host-state accessor. Route App::on_ime to ime().
    pub fn element<S: 'static>(
        &self,
        key: &'static str,
        _cx: &mut Cx<S>,
        get: fn(&mut S) -> &mut Self,
    ) -> El {
        let mut root = el()
            .key(key)
            .w_full()
            .h_full()
            .min_h(0.)
            .min_w(0.)
            .fill(self.palette.background)
            .clip_rounded(0.)
            .instant_changes()
            .focusable(true)
            .on_key(move |s, ev, tx| get(s).key(ev, tx))
            .on_window_focus(move |s, focused, _| get(s).set_focused(focused))
            .pointer_buttons([rune::PointerButton::Middle])
            .on_paste(move |s, value, _| get(s).paste(value))
            .on_layout(move |s, rect| {
                let view = get(s);
                let size = Size {
                    cols: (rect[2] / CELL_WIDTH).floor().clamp(2., 1000.) as u16,
                    rows: (rect[3] / CELL_HEIGHT).floor().clamp(1., 500.) as u16,
                };
                if size != view.size {
                    view.size = size;
                    view.send(Command::Resize(size));
                }
            })
            .on_drag(move |s, drag, tx| {
                let view = get(s);
                let (col, row) = cell(drag.x, drag.y);
                let release = drag.phase == Phase::Up;
                let motion = drag.phase == Phase::Move;
                if release && tx.mods().cmd {
                    if let Some(url) = view.frame.link_at(col, row) {
                        let _ = tx.open_url(&url);
                        return;
                    }
                }
                let button = if tx.button() == rune::PointerButton::Middle {
                    1
                } else {
                    0
                };
                if let Some(report) = input::mouse(
                    button,
                    release,
                    motion,
                    col,
                    row,
                    tx.mods(),
                    view.frame.mode,
                ) {
                    view.send(Command::Input(report));
                } else {
                    view.send(Command::Select {
                        col,
                        row,
                        start: (drag.phase == Phase::Down).then_some(drag.clicks as usize),
                    });
                }
                tx.focus(key, false);
                tx.instant();
            })
            .on_pointer_move_local(move |s, event, tx| {
                let view = get(s);
                let (col, row) = cell(event.x, event.y);
                if let Some(report) =
                    input::mouse(3, false, true, col, row, tx.mods(), view.frame.mode)
                {
                    view.send(Command::Input(report));
                }
                tx.live_only();
            })
            .on_secondary_press_local(move |s, event, tx| {
                let view = get(s);
                let (col, row) = cell(event.x, event.y);
                for release in [false, true] {
                    if let Some(report) =
                        input::mouse(2, release, false, col, row, tx.mods(), view.frame.mode)
                    {
                        view.send(Command::Input(report));
                    }
                }
            })
            .on_wheel(move |s, event, _| {
                let view = get(s);
                let (col, row) = cell(event.x, event.y);
                if let Some(report) = input::mouse(
                    if event.dy > 0. { 64 } else { 65 },
                    false,
                    false,
                    col,
                    row,
                    event.mods,
                    view.frame.mode,
                ) {
                    view.send(Command::Input(report));
                } else {
                    view.wheel += event.dy;
                    let lines = (view.wheel / CELL_HEIGHT) as i32;
                    if lines != 0 {
                        view.wheel -= lines as f32 * CELL_HEIGHT;
                        view.send(Command::Scroll(lines));
                    }
                }
                true // Native trackpad momentum is included in these events.
            });
        for (row, line) in self.frame.lines.iter().enumerate() {
            root = root.child(rune::memo(
                format!("{key}-line-{row}"),
                (line.revision, self.theme_revision, self.instance),
                || {
                    let mut line_el = el()
                        .absolute(0., row as f32 * CELL_HEIGHT)
                        .w_full()
                        .h(CELL_HEIGHT)
                        .inert();
                    for (col, paint) in line.cells.iter().enumerate() {
                        let c = &paint.cell;
                        if c.flags
                            .intersects(Flags::WIDE_CHAR_SPACER | Flags::LEADING_WIDE_CHAR_SPACER)
                        {
                            continue;
                        }
                        let (mut fg, mut bg) = (self.palette.color(c.fg), self.palette.color(c.bg));
                        if c.flags.contains(Flags::INVERSE) {
                            std::mem::swap(&mut fg, &mut bg);
                        }
                        if c.flags.contains(Flags::DIM) {
                            fg = fg.mix(bg, 0.5);
                        }
                        if paint.selected {
                            bg = self.palette.selection;
                        }
                        if c.c == ' '
                            && bg == self.palette.background
                            && !c.flags.intersects(Flags::ALL_UNDERLINES | Flags::STRIKEOUT)
                        {
                            continue;
                        }
                        let width = CELL_WIDTH
                            * if c.flags.contains(Flags::WIDE_CHAR) {
                                2.
                            } else {
                                1.
                            };
                        let mut glyph = el()
                            .absolute(col as f32 * CELL_WIDTH, 0.)
                            .w(width)
                            .h(CELL_HEIGHT)
                            .fill(bg);
                        if c.c != ' ' && !c.flags.contains(Flags::HIDDEN) {
                            let mut value = c.c.to_string();
                            if let Some(extra) = c.zerowidth() {
                                value.extend(extra);
                            }
                            let mut style = TextStyle::new(
                                13.,
                                if c.flags.contains(Flags::BOLD) {
                                    700.
                                } else {
                                    400.
                                },
                            );
                            style.family = Family::Named("Menlo, Consolas, monospace");
                            style.line_height = CELL_HEIGHT;
                            style.italic = c.flags.contains(Flags::ITALIC);
                            glyph = glyph.child(text(value).font(style).color(fg));
                        }
                        if c.flags.intersects(Flags::ALL_UNDERLINES) {
                            glyph = glyph.child(el().absolute(0., 14.).w(width).h(1.).fill(fg));
                        }
                        if c.flags.contains(Flags::STRIKEOUT) {
                            glyph = glyph.child(el().absolute(0., 8.).w(width).h(1.).fill(fg));
                        }
                        line_el = line_el.child(glyph);
                    }
                    line_el
                },
            ));
        }
        let (col, row, shape) = self.frame.cursor;
        if self.blink.visible()
            && self.frame.mode.contains(TermMode::SHOW_CURSOR)
            && row < self.frame.lines.len()
            && shape != CursorShape::Hidden
        {
            let (w, h, y) = match shape {
                CursorShape::Beam => (1., CELL_HEIGHT, 0.),
                CursorShape::Underline => (CELL_WIDTH, 2., 14.),
                _ => (CELL_WIDTH, CELL_HEIGHT, 0.),
            };
            let mut cursor = el()
                .absolute(col as f32 * CELL_WIDTH, row as f32 * CELL_HEIGHT + y)
                .w(w)
                .h(h)
                .inert();
            cursor = if self.focused {
                cursor.fill(self.palette.foreground).ime_cursor()
            } else {
                cursor.border(1., self.palette.foreground)
            };
            if shape == CursorShape::Block && self.focused {
                if let Some(paint) = self.frame.lines[row].cells.get(col) {
                    cursor = cursor.child(
                        text(paint.cell.c.to_string())
                            .font(TextStyle {
                                family: Family::Named("Menlo, Consolas, monospace"),
                                line_height: CELL_HEIGHT,
                                ..TextStyle::new(13., 400.)
                            })
                            .color(self.palette.background),
                    );
                }
            }
            root = root.child(cursor);
        }
        if !self.preedit.is_empty() {
            root = root.child(
                text(&self.preedit)
                    .absolute(col as f32 * CELL_WIDTH, row as f32 * CELL_HEIGHT)
                    .font(TextStyle {
                        family: Family::Named("Menlo, Consolas, monospace"),
                        ..TextStyle::new(13., 400.)
                    })
                    .color(self.palette.foreground)
                    .fill(self.palette.background),
            );
        }
        if matches!(self.bell, Bell::Flash(_)) {
            root = root.border(1., self.palette.foreground);
        }
        if let Some(error) = self.error.as_ref().or(self.frame.error.as_ref()) {
            root = root.child(
                text(error)
                    .absolute(0., 0.)
                    .font(TextStyle::new(12., 400.))
                    .color(self.palette.foreground)
                    .fill(self.palette.background),
            );
        }
        root
    }
}
fn cell(x: f32, y: f32) -> (usize, usize) {
    (
        (x.max(0.) / CELL_WIDTH) as usize,
        (y.max(0.) / CELL_HEIGHT) as usize,
    )
}
