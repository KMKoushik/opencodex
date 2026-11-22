use super::{menus, state::Menu};
use crate::State;
use rune::{Key, KeyEvent, Tx};

pub fn global(s: &mut State, event: &KeyEvent, tx: &mut Tx) -> bool {
    if escape(s, event, tx) {
        return true;
    }
    if crate::docks::active(s) {
        return false;
    }
    if event.mods.shift && event.is_command('l') {
        tx.focus("message", false);
        return true;
    }
    if event.mods.shift && event.is_command('m') {
        menus::open(s, Menu::Models, tx);
        return true;
    }
    if event.mods.shift && event.is_command('e') {
        if s.model_info().is_some_and(|m| !m.variants.is_empty()) {
            menus::open(s, Menu::Thinking, tx);
        }
        return true;
    }
    if event.mods.ctrl && matches!(&event.key,Key::Text(t) if t=="t") {
        if let (Some(mut model), Some(info)) = (s.selected_model().cloned(), s.model_info()) {
            let index = model
                .variant
                .as_ref()
                .and_then(|v| info.variants.iter().position(|x| &x.id == v))
                .map(|i| i + 1)
                .unwrap_or(0);
            model.variant = info.variants.get(index).map(|v| v.id.clone());
            s.choose_model(model);
        }
        return true;
    }
    if tx.focused().is_none()
        && !event.mods.cmd
        && !event.mods.ctrl
        && !event.mods.alt
        && let Key::Text(text) = &event.key
    {
        s.draft_mut().edit.insert(text);
        menus::changed(s, tx);
        tx.focus("message", false);
        return true;
    }
    false
}
pub fn escape(s: &mut State, event: &KeyEvent, tx: &mut Tx) -> bool {
    if event.key != Key::Escape
        || !s
            .selected
            .as_ref()
            .is_some_and(|id| s.snapshot.active.contains(id))
    {
        return false;
    }
    if s.composer
        .escape_until
        .take()
        .is_some_and(|deadline| tx.clock() <= deadline)
    {
        s.stop();
    } else {
        s.composer.escape_until = Some(tx.clock() + 0.5);
        tx.live_only();
    }
    true
}
