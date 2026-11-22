use serde_json::Value;

pub(super) fn restore_input(d: &mut super::Docks) {
    let Some(field) = super::fields(d).get(d.index).cloned().cloned() else {
        return;
    };
    let key = field["key"].as_str().unwrap_or("");
    d.active_key = Some(key.into());
    let value = d.answers.get(key);
    let options = field["options"].as_array();
    let custom =
        |v: &&Value| !options.is_some_and(|options| options.iter().any(|o| o["value"] == **v));
    let text = match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter(custom)
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join("\n"),
        Some(v) if custom(&v) => v
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| v.to_string()),
        _ => String::new(),
    };
    if !text.is_empty() && options.is_some_and(|o| !o.is_empty()) {
        d.custom_on.insert(key.into());
    }
    d.custom.replace_text(text);
}

pub fn applies(field: &Value, answers: &std::collections::BTreeMap<String, Value>) -> bool {
    field["when"].as_array().is_none_or(|conditions| {
        conditions.iter().all(|c| {
            let equal = answers.get(c["key"].as_str().unwrap_or("")) == Some(&c["value"]);
            if c["op"] == "eq" { equal } else { !equal }
        })
    })
}

pub fn validate(field: &Value, value: Option<&Value>) -> Option<String> {
    if field["type"] == "external" || field["hidden"] == true {
        return None;
    }
    if value.is_none_or(|v| v == "" || v.as_array().is_some_and(Vec::is_empty)) {
        return (field["required"] == true)
            .then(|| "Choose or enter an answer to continue.".into());
    }
    let value = value.unwrap();
    if field["type"] == "multiselect" {
        let Some(items) = value.as_array() else {
            return Some("Choose one or more answers.".into());
        };
        if let Some(n) = field["minItems"]
            .as_u64()
            .filter(|n| items.len() < *n as usize)
        {
            return Some(format!("Choose at least {n} answers."));
        }
        if let Some(n) = field["maxItems"]
            .as_u64()
            .filter(|n| items.len() > *n as usize)
        {
            return Some(format!("Choose no more than {n} answers."));
        }
    }
    if field["type"] == "string"
        && let Some(text) = value.as_str()
    {
        if field["required"] == true && text.trim().is_empty() {
            return Some("Enter an answer to continue.".into());
        }
        let length = text.encode_utf16().count();
        if let Some(n) = field["minLength"].as_u64().filter(|n| length < *n as usize) {
            return Some(format!("Use at least {n} characters."));
        }
        if let Some(n) = field["maxLength"].as_u64().filter(|n| length > *n as usize) {
            return Some(format!("Use no more than {n} characters."));
        }
        if let Some(error) = super::format::validate(field, text) {
            return Some(error);
        }
    }
    if field["type"] == "number" || field["type"] == "integer" {
        let Some(n) = value.as_f64().filter(|n| n.is_finite()) else {
            return Some("Enter a number.".into());
        };
        if field["type"] == "integer" && n.fract() != 0.0 {
            return Some("Enter a whole number.".into());
        }
        if let Some(min) = field["minimum"].as_f64().filter(|min| n < *min) {
            return Some(format!("Enter {min} or more."));
        }
        if let Some(max) = field["maximum"].as_f64().filter(|max| n > *max) {
            return Some(format!("Enter {max} or less."));
        }
    }
    None
}

pub fn review(field: &Value, value: Option<&Value>) -> String {
    let entries: Vec<&Value> = match value {
        Some(Value::Array(items)) => items.iter().collect(),
        Some(v) if v != "" => vec![v],
        _ => vec![],
    };
    if entries.is_empty() {
        return if field["type"] == "external" {
            "External step"
        } else {
            "Not answered"
        }
        .into();
    }
    entries
        .into_iter()
        .map(|v| {
            if let Some(b) = v.as_bool() {
                return if b { "Yes" } else { "No" }.into();
            }
            field["options"]
                .as_array()
                .and_then(|o| o.iter().find(|o| &o["value"] == v))
                .and_then(|o| o["label"].as_str())
                .or_else(|| v.as_str())
                .map(str::to_owned)
                .unwrap_or_else(|| v.to_string())
        })
        .collect::<Vec<_>>()
        .join("\n")
}
