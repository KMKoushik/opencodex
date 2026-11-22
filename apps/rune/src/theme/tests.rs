use super::*;

#[test]
fn derived_tokens_match_bun_theme_ts() {
    // Expected values obtained with bun -e importing deriveTokens from the web source.
    for (dark, expected) in [(true, ["#242427", "#b0b0b3", "#828285", "rgb(237 237 240 / 0.100)", "#a9a9ac"]),
                             (false, ["#fafaf9", "#48484a", "#666667", "rgb(24 24 26 / 0.083)", "#606061"])] {
        let t = Theme::new(dark, "");
        for (name, expected) in ["elevated", "text-secondary", "text-tertiary", "selected", "syntax-string"].into_iter().zip(expected) {
            assert_eq!(t.tokens[name], expected, "{dark}/{name}");
        }
        // Every published preset must resolve every token and effect on either appearance.
        for p in presets(dark) {
            let t = Theme::new(dark, &p.id);
            assert_eq!(t.tokens.len(), 61);
            assert_eq!(t.shadows["composer-shadow"].len(), 4);
        }
    }
}
