use crate::State;
use rune::{Key, KeyEvent, Tx};
use serde_json::{Value, json};

pub fn handle(s: &mut State, event: &KeyEvent, tx: &mut Tx) -> bool {
    if s.docks.sending {
        return false;
    }
    if event.key == Key::Enter && (event.mods.cmd || event.mods.ctrl || s.docks.reviewing) {
        super::advance(s);
        if s.docks.reviewing {
            tx.focus("question-next", true);
        }
        return true;
    }
    if event.mods.cmd
        || event.mods.ctrl
        || event.mods.alt
        || tx.key_repeat()
        || s.docks.reviewing
        || s.docks.collapsed
        || tx.focused() == Some("question-custom")
    {
        return false;
    }
    let Some(field) = super::fields(&s.docks)
        .get(super::current_index(&s.docks))
        .cloned()
        .cloned()
    else {
        return false;
    };
    let boolean = field["type"] == "boolean";
    let multi = field["type"] == "multiselect";
    let options = if boolean {
        vec![json!(true), json!(false)]
    } else {
        field["options"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|o| o["value"].clone())
            .collect::<Vec<_>>()
    };
    let count = options.len() + usize::from(field["custom"] == true);
    if count == 0 {
        return false;
    }
    let index = tx
        .focused()
        .and_then(|key| key.strip_prefix("question-option-"))
        .and_then(|n| n.parse::<usize>().ok())
        .unwrap_or(0);
    let next = match &event.key {
        Key::Text(t) if t.len() == 1 && ("1"..="9").contains(&t.as_str()) => {
            t.parse::<usize>().ok().map(|i| i - 1)
        }
        Key::Down | Key::Right if !multi => Some((index + 1) % count),
        Key::Up | Key::Left if !multi => Some((index + count - 1) % count),
        _ => None,
    };
    let Some(next) = next.filter(|i| *i < count) else {
        return false;
    };
    let key = field["key"].as_str().unwrap_or("").to_owned();
    if let Some(value) = options.get(next) {
        if multi {
            let mut values = s
                .docks
                .answers
                .get(&key)
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if values.contains(value) {
                values.retain(|v| v != value);
            } else {
                values.push(value.clone());
            }
            s.docks.answers.insert(key.clone(), json!(values));
        } else {
            s.docks.answers.insert(key.clone(), value.clone());
            s.docks.custom_on.remove(&key);
        }
        tx.focus(format!("question-option-{next}"), true);
    } else {
        s.docks.custom_on.insert(key.clone());
        if !multi {
            s.docks.answers.insert(key, json!(s.docks.custom.text));
        }
        tx.focus("question-custom", true);
    }
    s.docks.error = None;
    true
}
