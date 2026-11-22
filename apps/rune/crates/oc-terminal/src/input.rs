use alacritty_terminal::term::TermMode;
use rune::{Key, KeyEvent, Mods};

pub fn key(event: &KeyEvent, mode: TermMode) -> Option<String> {
    let m = event.mods;
    if m.logo || (cfg!(target_os = "macos") && m.cmd) {
        return None;
    }
    let param = 1 + m.shift as u8 + 2 * m.alt as u8 + 4 * m.ctrl as u8;
    let cursor = |c: char, app: bool| {
        if param > 1 {
            format!("\x1b[1;{param}{c}")
        } else if app {
            format!("\x1bO{c}")
        } else {
            format!("\x1b[{c}")
        }
    };
    let tilde = |n| {
        if param > 1 {
            format!("\x1b[{n};{param}~")
        } else {
            format!("\x1b[{n}~")
        }
    };
    let app = mode.contains(TermMode::APP_CURSOR);
    let s = match &event.key {
        Key::Up => return Some(cursor('A', app)),
        Key::Down => return Some(cursor('B', app)),
        Key::Right => return Some(cursor('C', app)),
        Key::Left => return Some(cursor('D', app)),
        Key::Home => return Some(cursor('H', app)),
        Key::End => return Some(cursor('F', app)),
        Key::Insert => return Some(tilde(2)),
        Key::Delete => return Some(tilde(3)),
        Key::PageUp => return Some(tilde(5)),
        Key::PageDown => return Some(tilde(6)),
        Key::Function(n @ 1..=4) => return Some(cursor((b'P' + n - 1) as char, true)),
        Key::Function(n @ 5..=12) => {
            return Some(tilde([15, 17, 18, 19, 20, 21, 23, 24][(*n - 5) as usize]));
        }
        Key::Enter => "\r".into(),
        Key::Backspace => "\x7f".into(),
        Key::Escape => "\x1b".into(),
        Key::Tab if m.shift => return Some("\x1b[Z".into()),
        Key::Tab => "\t".into(),
        Key::Text(s) if m.ctrl => control(s.chars().next()?)?.to_string(),
        Key::Command(c) if m.ctrl => control(*c)?.to_string(),
        Key::Text(s) => s.clone(),
        _ => return None,
    };
    Some(if m.alt { format!("\x1b{s}") } else { s })
}
fn control(c: char) -> Option<char> {
    Some(match c.to_ascii_lowercase() {
        c @ 'a'..='z' => (c as u8 - b'a' + 1) as char,
        ' ' | '@' | '2' => '\0',
        '[' | '3' => '\x1b',
        '\\' | '4' => '\x1c',
        ']' | '5' => '\x1d',
        '^' | '6' => '\x1e',
        '_' | '-' | '7' | '/' => '\x1f',
        '8' | '?' => '\x7f',
        _ => return None,
    })
}
pub fn paste(text: &str, mode: TermMode) -> String {
    let text = text.replace("\r\n", "\r").replace('\n', "\r");
    if mode.contains(TermMode::BRACKETED_PASTE) {
        format!("\x1b[200~{}\x1b[201~", text.replace('\x1b', ""))
    } else {
        text
    }
}
pub fn mouse(
    button: u8,
    release: bool,
    motion: bool,
    col: usize,
    row: usize,
    m: Mods,
    mode: TermMode,
) -> Option<String> {
    if m.shift || !mode.intersects(TermMode::MOUSE_MODE) {
        return None;
    }
    if motion
        && !mode.contains(TermMode::MOUSE_MOTION)
        && !(button < 3 && mode.contains(TermMode::MOUSE_DRAG))
    {
        return None;
    }
    let code = button + if motion { 32 } else { 0 } + 8 * m.alt as u8 + 16 * m.ctrl as u8;
    if mode.contains(TermMode::SGR_MOUSE) {
        Some(format!(
            "\x1b[<{code};{};{}{}",
            col + 1,
            row + 1,
            if release { 'm' } else { 'M' }
        ))
    } else if col < 223 && row < 223 {
        Some(format!(
            "\x1b[M{}{}{}",
            char::from(32 + if release { (code & !3) | 3 } else { code }),
            char::from(33 + col as u8),
            char::from(33 + row as u8)
        ))
    } else {
        None
    }
}
