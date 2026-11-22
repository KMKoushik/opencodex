# Pinned Markdown adapter

The `src/markdown*` and `src/budget.rs` sources are copied from Rune-kit at
`7286a3c5fe525bcbdb5a1188a4046ff4eff5f0de`, under its included MIT license.
The source checkout and Cargo cache are never modified.

Why: that version's public Markdown API supports icons before HTTP links, but not
icons before local file links as OpenCodex React renders them. Reimplementing or
rewriting Markdown strings would break reference links, nested markup, copy text,
streaming prefix stability or bounded parsing. This adapter keeps the exact pinned
incremental parser, byte-budgeted caches, block memoization and selection mapping.
`MarkdownStyle::file_link_icon`, included in the style hash, inserts a Rune inline
vector icon without changing the text or href. Opt-in `web_layout` applies the
React source's paragraph/list margins, link weight, heading colors, one-point table
rules and exact table line metrics; the upstream layout remains the default.
Other Rune-kit primitives/types are re-exported from the pinned dependency.

The upstream glyph-stability test takes the same Inter/Plex bytes from the pinned
theme crate's public font constants instead of a source-checkout-relative path.

On a Rune upgrade, prefer its upstream hook if available and remove this adapter.
Vendored files retain their upstream organization and test coverage.
