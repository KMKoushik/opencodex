//! The web's fzf-v1 window/scoring, including smart case and UTF-16 positions.
pub fn score(text: &str, query: &str) -> Option<i32> {
    if query.is_empty() {
        return Some(0);
    }
    let original: Vec<_> = text.encode_utf16().collect();
    let hay: Vec<_> = if query == query.to_lowercase() {
        text.to_lowercase().encode_utf16().collect()
    } else {
        original.clone()
    };
    let needle: Vec<_> = query.encode_utf16().collect();
    let mut found = 0;
    let end = hay.iter().position(|c| {
        if *c == needle[found] {
            found += 1;
        }
        found == needle.len()
    })?;
    let mut start = end;
    let mut at = needle.len();
    for i in (0..=end).rev() {
        if hay[i] == needle[at - 1] {
            start = i;
            at -= 1;
            if at == 0 {
                break;
            }
        }
    }
    let mut total = 0;
    let mut previous = None;
    for i in start..=end {
        if hay[i] != needle[at] {
            continue;
        }
        let prev = i.checked_sub(1).and_then(|p| original.get(p)).copied();
        let now = original.get(i).copied();
        let bonus = if kind(now) == 0 {
            0
        } else if kind(prev) == 0 {
            8
        } else if (kind(prev) == 3 && kind(now) == 2) || (kind(prev) != 1 && kind(now) == 1) {
            7
        } else {
            0
        };
        total += 16 + bonus * if at == 0 { 2 } else { 1 };
        if let Some(p) = previous {
            total += if i == p + 1 {
                4
            } else {
                -3 - (i - p - 2) as i32
            };
        }
        previous = Some(i);
        at += 1;
        if at == needle.len() {
            break;
        }
    }
    if hay == needle {
        total += 16 * needle.len() as i32;
    }
    Some(total)
}
fn kind(c: Option<u16>) -> u8 {
    let Some(c) = c.and_then(|v| char::from_u32(v as u32)) else {
        return 0;
    };
    if c.is_whitespace() || "/\\_-.:".contains(c) {
        0
    } else if c.is_ascii_digit() {
        1
    } else if c.is_uppercase() {
        2
    } else {
        3
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn web_scoring() {
        assert_eq!(score("open-codex", "oc"), Some(50));
        assert_eq!(score("rococo", "oc"), Some(36));
        assert_eq!(score("OpenCode", "OC"), Some(50));
        assert_eq!(score("opencode", "OC"), None);
        assert_eq!(score("abc", "abc"), Some(120));
        assert_eq!(score("anything", ""), Some(0));
    }
}
