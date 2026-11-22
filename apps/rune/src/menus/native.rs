use crate::State;
use rune::App;

/// Electron main installs no template, so Electron 44.4.5 supplies its default.
/// Install after Rune creates its native responder and standard menus.
pub fn install(app: App<State>) -> App<State> {
    app.standard_menus()
        .on_window(|_| oc_native::menu::install())
}

/// Electron's noneditable selected-text group. Native NSMenu owns tracking and
/// dismissal; text is captured when opening, so live updates cannot change it.
pub fn selected_text(_: &mut State, press: rune::PointerPress, tx: &mut rune::Tx) {
    let Some(original) = tx
        .text_selection()
        .map(|s| s.text())
        .filter(|s| !s.trim().is_empty())
    else {
        return;
    };
    let original = original.to_owned();
    let selection = original.trim().to_owned();
    let mut menu = rune::PopupMenu::new();
    if cfg!(target_os = "macos") {
        let short = if selection.encode_utf16().count() > 60 {
            format!(
                "{}…",
                String::from_utf16_lossy(&selection.encode_utf16().take(60).collect::<Vec<_>>())
            )
        } else {
            selection.clone()
        };
        menu = menu.item(rune::PopupItem::new("lookup", format!("Look Up “{short}”")));
    }
    menu = menu
        .item(rune::PopupItem::new("google", "Search with Google"))
        .separator()
        .item(rune::PopupItem::new("copy", "Copy").key_equivalent("mod+c".parse().unwrap()));
    tx.popup_menu(menu, press, move |_: &mut State, picked, tx| match picked {
        Some("lookup") => oc_native::menu::look_up(&selection, (press.x, press.y)),
        Some("google") => {
            let _ = tx.open_url(&format!(
                "https://www.google.com/search?q={}",
                form_component(&selection)
            ));
        }
        Some("copy") => oc_native::clipboard::copy(tx, original.clone()),
        _ => {}
    });
}

fn form_component(text: &str) -> String {
    let mut encoded = String::new();
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'*' | b'-' | b'.' | b'_' => {
                encoded.push(byte as char)
            }
            b' ' => encoded.push('+'),
            byte => {
                use std::fmt::Write;
                let _ = write!(encoded, "%{byte:02X}");
            }
        }
    }
    encoded
}
