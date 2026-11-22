//! HTML input constraints. Evaluated on navigation/submission, never while typing.
use serde_json::Value;

pub fn validate(field: &Value, text: &str) -> Option<String> {
    // Option fields render radios/textareas, which do not have HTML format/pattern constraints.
    if field["options"].as_array().is_some_and(|v| !v.is_empty()) || text.is_empty() {
        return None;
    }
    let format = field["format"].as_str().unwrap_or("");
    match format {
        "email" => {
            let email = text.trim_matches(|c: char| c.is_ascii_whitespace());
            let valid = regress::Regex::new(r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$")
                .expect("HTML email expression").find(email).is_some();
            if !valid {
                return Some(if !email.contains('@') {
                    format!(
                        "Please include an '@' in the email address. '{email}' is missing an '@'."
                    )
                } else {
                    "Please enter an email address.".into()
                });
            }
        }
        "uri" if url::Url::parse(text.trim()).is_err() => {
            return Some("Please enter a URL.".into());
        }
        "date" if date(text).is_none() => return Some("Please enter a valid value.".into()),
        "date-time" if !datetime(text) => return Some("Please enter a valid value.".into()),
        _ => {}
    }
    // The HTML pattern attribute is ignored for date and datetime-local inputs. Invalid
    // expressions are ignored too. HTML uses ECMAScript Unicode Sets, with a whole-value match.
    if !matches!(format, "date" | "date-time")
        && let Some(pattern) = field["pattern"].as_str()
        && let Ok(regex) = regress::Regex::with_flags(&format!("^(?:{pattern})$"), "v")
        && !regex.find(text).is_some_and(|m| m.range.end == text.len())
    {
        return Some("Please match the requested format.".into());
    }
    None
}

pub fn days(year: u32, month: u32) -> u32 {
    match month {
        4 | 6 | 9 | 11 => 30,
        2 => {
            if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) {
                29
            } else {
                28
            }
        }
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    }
}
pub fn date(text: &str) -> Option<(u32, u32, u32)> {
    let parts: Vec<_> = text.split('-').collect();
    if parts.len() != 3
        || parts[0].len() < 4
        || parts[1].len() != 2
        || parts[2].len() != 2
        || !parts.iter().all(|s| s.bytes().all(|c| c.is_ascii_digit()))
    {
        return None;
    }
    let (year, month, day) = (
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    );
    (year > 0 && day > 0 && day <= days(year, month)).then_some((year, month, day))
}
fn datetime(text: &str) -> bool {
    let Some((d, time)) = text.split_once('T').or_else(|| text.split_once(' ')) else {
        return false;
    };
    if date(d).is_none() {
        return false;
    }
    let parts: Vec<_> = time.split(':').collect();
    if !(2..=3).contains(&parts.len()) {
        return false;
    }
    for (part, limit) in parts[..2].iter().zip([24, 60]) {
        if part.len() != 2
            || !part.bytes().all(|c| c.is_ascii_digit())
            || !part.parse::<u32>().is_ok_and(|n| n < limit)
        {
            return false;
        }
    }
    if let Some(seconds) = parts.get(2) {
        let (whole, fraction) = seconds.split_once('.').unwrap_or((seconds, ""));
        if whole.len() != 2
            || !whole.bytes().all(|c| c.is_ascii_digit())
            || !whole.parse::<u32>().is_ok_and(|n| n < 60)
            || (seconds.contains('.') && (fraction.is_empty() || fraction.len() > 3))
            || !fraction.bytes().all(|c| c.is_ascii_digit())
        {
            return false;
        }
    }
    true
}
