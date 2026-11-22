use crate::{Engine, Size};
use alacritty_terminal::{
    term::cell::Flags,
    vte::ansi::{Color, Rgb},
};
#[test]
fn fragmented_utf8_wide_cells_and_alternate_screen_restore() {
    let mut engine = Engine::new(Size { cols: 20, rows: 4 });
    for byte in "a界🙂\x1b[38;2;1;2;3mZ".as_bytes() {
        engine.feed(&[*byte]);
    }
    let base = engine.snapshot();
    assert_eq!(base.lines[0].cells[1].cell.c, '界');
    assert!(
        base.lines[0].cells[2]
            .cell
            .flags
            .contains(Flags::WIDE_CHAR_SPACER)
    );
    assert_eq!(
        base.lines[0].cells[5].cell.fg,
        Color::Spec(Rgb { r: 1, g: 2, b: 3 })
    );
    engine.feed(b"\x1b[?1049h\x1b[2J\x1b[Halternate\x1b[?1000h\x1b[?1006h");
    assert_eq!(engine.snapshot().lines[0].cells[0].cell.c, 'a');
    engine.feed(b"\x1b[?1049l");
    assert_eq!(engine.snapshot().lines[0].cells, base.lines[0].cells);
}
#[test]
fn snapshots_reuse_clean_rows_and_selection_survives_reflow() {
    let mut engine = Engine::new(Size { cols: 10, rows: 4 });
    engine.feed(b"hello world");
    let a = engine.snapshot();
    let b = engine.snapshot();
    assert!(std::sync::Arc::ptr_eq(&a.lines[0], &b.lines[0]));
    engine.resize(Size { cols: 20, rows: 4 });
    engine.select(0, 0, Some(2));
    assert_eq!(engine.snapshot().selection, "hello");
    assert_eq!(engine.feed(b"\x1b[6n"), vec!["\x1b[1;12R"]);
}
