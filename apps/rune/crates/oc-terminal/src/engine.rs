use alacritty_terminal::{
    event::{Event, EventListener, WindowSize},
    grid::{Dimensions, Scroll},
    index::{Column, Line, Point, Side},
    selection::{Selection, SelectionType},
    term::{Config, Term, TermMode, cell::Cell},
    vte::ansi::{Color as Ansi, CursorShape, Processor, Rgb},
};
use std::sync::{Arc, Mutex};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Size {
    pub cols: u16,
    pub rows: u16,
}
impl Dimensions for Size {
    fn total_lines(&self) -> usize {
        self.rows as usize
    }
    fn screen_lines(&self) -> usize {
        self.rows as usize
    }
    fn columns(&self) -> usize {
        self.cols as usize
    }
}
#[derive(Clone, Default)]
pub struct Listener(Arc<Mutex<Vec<Event>>>);
impl EventListener for Listener {
    fn send_event(&self, event: Event) {
        self.0.lock().unwrap().push(event);
    }
}
#[derive(Clone, Debug, PartialEq)]
pub struct PaintCell {
    pub cell: Cell,
    pub selected: bool,
}
#[derive(Clone)]
pub struct PaintLine {
    pub revision: u64,
    pub cells: Vec<PaintCell>,
}
#[derive(Clone)]
pub struct Frame {
    pub status: &'static str,
    pub lines: Vec<Arc<PaintLine>>,
    pub cursor: (usize, usize, CursorShape),
    pub mode: TermMode,
    pub selection: String,
    pub title: String,
    pub error: Option<String>,
    pub bell: u64,
    pub bytes: u64,
}
impl Frame {
    /// OSC 8 first, then a whitespace-delimited HTTP(S) URL on the visible row.
    pub fn link_at(&self, col: usize, row: usize) -> Option<String> {
        let line = &self.lines.get(row)?.cells;
        if let Some(link) = line.get(col)?.cell.hyperlink() {
            return Some(link.uri().to_owned());
        }
        let mut start = col;
        let mut end = col;
        while start > 0 && !line[start - 1].cell.c.is_whitespace() {
            start -= 1;
        }
        while end < line.len() && !line[end].cell.c.is_whitespace() {
            end += 1;
        }
        let text: String = line[start..end].iter().map(|c| c.cell.c).collect();
        let text = text.trim_matches(|c: char| "()[]{}<>,;\"'".contains(c));
        (text.starts_with("https://") || text.starts_with("http://")).then(|| text.to_owned())
    }
}
pub struct Engine {
    pub term: Term<Listener>,
    parser: Processor,
    listener: Listener,
    frame: Frame,
    revision: u64,
    pub palette: Option<crate::Palette>,
}
impl Engine {
    pub fn new(size: Size) -> Self {
        let listener = Listener::default();
        Self {
            term: Term::new(
                Config {
                    scrolling_history: 5000,
                    ..Default::default()
                },
                &size,
                listener.clone(),
            ),
            parser: Processor::new(),
            listener,
            revision: 0,
            palette: None,
            frame: Frame {
                status: "Connecting…",
                lines: vec![],
                cursor: (0, 0, CursorShape::Block),
                mode: TermMode::empty(),
                selection: String::new(),
                title: String::new(),
                error: None,
                bell: 0,
                bytes: 0,
            },
        }
    }
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<String> {
        self.parser.advance(&mut self.term, bytes);
        self.frame.bytes += bytes.len() as u64;
        let mut replies = vec![];
        for event in self.listener.0.lock().unwrap().drain(..) {
            match event {
                Event::PtyWrite(text) => replies.push(text),
                Event::Title(title) => self.frame.title = title,
                Event::Bell => self.frame.bell += 1,
                Event::TextAreaSizeRequest(format) => replies.push(format(WindowSize {
                    num_lines: self.term.screen_lines() as u16,
                    num_cols: self.term.columns() as u16,
                    cell_width: crate::view::CELL_WIDTH.round() as u16,
                    cell_height: crate::view::CELL_HEIGHT as u16,
                })),
                Event::ColorRequest(index, format) => {
                    let rgb = self.term.colors()[index].unwrap_or_else(|| {
                        let color = self.palette.as_ref().map(|p| match index {
                            0..=255 => p.indexed[index],
                            257 => p.background,
                            _ => p.foreground,
                        });
                        let color = color.unwrap_or(if index == 257 {
                            rune::Color::BLACK
                        } else {
                            rune::Color::WHITE
                        });
                        let encode = |v: f32| {
                            ((if v <= 0.0031308 {
                                12.92 * v
                            } else {
                                1.055 * v.powf(1. / 2.4) - 0.055
                            })
                            .clamp(0., 1.)
                                * 255.)
                                .round() as u8
                        };
                        Rgb {
                            r: encode(color.r),
                            g: encode(color.g),
                            b: encode(color.b),
                        }
                    });
                    replies.push(format(rgb));
                }
                _ => {}
            }
        }
        replies
    }
    pub fn connection_status(&mut self, status: &'static str) {
        self.frame.status = status;
    }
    pub fn resize(&mut self, size: Size) {
        self.term.resize(size);
    }
    pub fn prepare_input(&mut self) {
        self.term.selection = None;
        self.term.scroll_display(Scroll::Bottom);
    }
    pub fn sync_deadline(&self) -> Option<std::time::Instant> {
        self.parser.sync_timeout().sync_timeout()
    }
    pub fn stop_sync(&mut self) {
        self.parser.stop_sync(&mut self.term);
    }
    pub fn scroll(&mut self, lines: i32) {
        self.term.scroll_display(Scroll::Delta(lines));
    }
    pub fn select(&mut self, col: usize, row: usize, start: Option<usize>) {
        let point = Point::new(
            Line(
                row.min(self.term.screen_lines() - 1) as i32
                    - self.term.grid().display_offset() as i32,
            ),
            Column(col.min(self.term.columns() - 1)),
        );
        if let Some(clicks) = start {
            let kind = match clicks {
                2 => SelectionType::Semantic,
                3.. => SelectionType::Lines,
                _ => SelectionType::Simple,
            };
            self.term.selection = Some(Selection::new(kind, point, Side::Left));
        } else if let Some(selection) = &mut self.term.selection {
            selection.update(point, Side::Right);
        }
    }
    pub fn snapshot(&mut self) -> Frame {
        self.revision += 1;
        let content = self.term.renderable_content();
        let mut lines: Vec<Vec<PaintCell>> = (0..self.term.screen_lines())
            .map(|_| Vec::with_capacity(self.term.columns()))
            .collect();
        for indexed in content.display_iter {
            let row = (indexed.point.line.0 + content.display_offset as i32) as usize;
            let selected = content.selection.is_some_and(|s| s.contains(indexed.point));
            if let Some(line) = lines.get_mut(row) {
                let mut cell = indexed.cell.clone();
                for color in [&mut cell.fg, &mut cell.bg] {
                    let index = match *color {
                        Ansi::Indexed(i) => Some(i as usize),
                        Ansi::Named(i) => Some(i as usize),
                        _ => None,
                    };
                    if let Some(rgb) = index.and_then(|i| self.term.colors()[i]) {
                        *color = Ansi::Spec(rgb);
                    }
                }
                line.push(PaintCell { cell, selected });
            }
        }
        self.frame.lines = lines
            .into_iter()
            .enumerate()
            .map(|(i, cells)| {
                if let Some(old) = self.frame.lines.get(i).filter(|l| l.cells == cells) {
                    old.clone()
                } else {
                    Arc::new(PaintLine {
                        revision: self.revision,
                        cells,
                    })
                }
            })
            .collect();
        self.frame.cursor = (
            content.cursor.point.column.0,
            (content.cursor.point.line.0 + content.display_offset as i32).max(0) as usize,
            content.cursor.shape,
        );
        self.frame.mode = content.mode;
        self.frame.selection = self.term.selection_to_string().unwrap_or_default();
        self.frame.clone()
    }
}
