# Native menu / popover parity

The reference is **real Electron**, not an older web screenshot. This focused sweep uses
`OCR_SWEEP_DIR=/tmp/ocr-fx-menus`, OpenCode **4983**, gateway **4513**, both themes,
1280×800 logical points at scale 2. No model calls, user service, or user data directories.

## Measured rules

The current React UI does **not** use Radix/Floating UI for these controls. Its source of
truth is custom DOM positioning and CSS anchor positioning:

- Thread actions: `session-actions-menu.tsx`, bottom/end, gap 4; pointer context menus
  use the actual click point. Both shift inside an 8 px viewport margin; they do not flip.
  Width 180, padding 4, border 1, radius 8, six 32 px rows with 10 px horizontal insets.
- Project actions: `project-actions.tsx`, bottom/end, gap 4; above when the trigger has
  less than 200 px below and more than 200 px above. Width 176, padding 4, radius 9,
  six 35.5 px rows (19.5 px line height + 16 px vertical padding).
- App menu: CSS-anchored bottom/start, gap 6, width 180, padding 4, radius 9,
  four 31.5 px rows (19.5 px line height + 12 px vertical padding).
- Slash/mention: absolute above the composer, gap 8, width 720 at this viewport;
  padding 6 + border 1, radius 12; 37 px rows, 10 px horizontal padding/gap,
  14 px labels, 12 px descriptions, and 16 px mention icons. Height caps at min(320, 40dvh).
- Model picker: selects the roomier side; gap 8, width 400, radius 12, border 1;
  44 px search, min(item count × 44, 342) list viewport, 36 px actual rows,
  and 30 px footer. Filtered two-row popup height is 164, unfiltered is 418.
- Worktree select: top/start, gap 4, width 300, padding 5 + border 1, radius 12;
  two 50.75 px rows with folder/worktree icons and selected checkmark.
- Project picker: chooses the roomier side, centered under the trigger, gap 4,
  width 360, padding 5 + border 1, radius 12; 54 px project rows.
- Session details: toolbar-relative top 8/right 12, width 288, horizontal padding 12,
  radius 12, border 1, **no drop shadow**. Section padding is 8 with 1 px dividers.
- Find: top 10/right 12 within the transcript, 340×38, radius 10, border 1,
  padding 12/4, 26 px navigation buttons; uses the standard raised shadow.
- Search/edit dialogs: centered, width 440, padding 20 + border 1, radius 14,
  standard raised shadow and scrim. Open project is an inline setup view, not a modal.
- Usage limits is a settings page, not a popover; its existing equivalent layout is retained.

Standard dark shadow: `0 12px 32px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.25)`.
Light uses the same geometry with alpha `.10` and `.05` respectively.
`menus/overlay.rs` reuses the derived theme shadows via Rune `box_shadow`; blur is the
CSS blur value, not sigma. It shares border-box surface construction, raised styling,
native keyed anchoring, viewport shifts, and roomier-side placement.

Each capture now emits `.geometry.json` (Electron root/row/trigger rects, padding,
radius, border, shadow, font/line metrics) and `.rune-tree.json` (native geometry).
They stay ignored with the PNG pairs and full per-theme `results.json`.

## Validation

Before values are the supplied checked-in full sweep (revision `8466d854`), not a fresh
pre-change capture of this worktree. After values are the focused isolated sweep;
numbers are full-frame blurred MAE, not overlay-only scores. Differences from that older
baseline cannot all be attributed to these commits.
Underlying transcript/composer/toolbar differences remain in these measurements and
belong to the parallel Markdown/chrome work; these scores do not claim exact pixel parity.

**18 states × 2 themes; all 36 scored pairs have unchanged snapshot digests.** The full
focused pass was followed by refreshing Session details and both model-picker states
after their final containing-block/search/footer refinements.

| State                 | Before (worst) | After dark | After light | After (worst) |
| --------------------- | -------------: | ---------: | ----------: | ------------: |
| thread-actions-open   |         2.5182 |     0.8812 |      0.9296 |        0.9296 |
| thread-context-menu   |         1.4219 |     0.8776 |      0.9263 |        0.9263 |
| composer-mention      |         2.1220 |     0.1915 |      0.2124 |        0.2124 |
| composer-slash        |         1.7256 |     0.2017 |      0.2237 |        0.2237 |
| session-details-open  |         1.5264 |     0.9301 |      0.9729 |        0.9729 |
| find-markdown-open    |         1.5615 |     0.8753 |      0.9274 |        0.9274 |
| find-long-open        |         0.9040 |     0.7132 |      0.7600 |        0.7600 |
| model-picker-open     |         0.7327 |     0.3260 |      0.3693 |        0.3693 |
| model-picker-filtered |         1.0181 |     0.2702 |      0.2894 |        0.2894 |
| project-actions-open  |         0.8257 |     0.2876 |      0.3033 |        0.3033 |
| project-picker-open   |         0.6703 |     0.3062 |      0.3550 |        0.3550 |
| project-open-dialog   |         1.3020 |     0.1568 |      0.2468 |        0.2468 |
| project-edit-open     |         0.5588 |     0.3220 |      0.4432 |        0.4432 |
| app-menu-open         |         0.3111 |     0.2181 |      0.2384 |        0.2384 |
| usage-limits-open     |         0.1323 |     0.1323 |      0.1216 |        0.1323 |
| worktree-picker-open  |         0.7570 |     0.2338 |      0.2461 |        0.2461 |
| thread-search-open    |         0.1842 |     0.1220 |      0.1852 |        0.1852 |
| worktrees-empty       |         0.4113 |     0.2760 |      0.4136 |        0.4136 |

Verified: `cargo build --release --workspace`, `cargo test --workspace`, `bun check`,
and `bun format:check`. The sweep's `finally` cleanup removes `/tmp/ocr-fx-menus`.

### Remaining differences / integration

- Native home/composer origins remain about 0.25 px to the right of Electron; popup
  offsets, dimensions and row insets now agree relative to their triggers. The workspace
  trigger's padded border box was fixed without shifting its label.
- The native toolbar's Thread actions trigger itself is 12 px right of Electron's
  (`1124` versus `1112` at this viewport). The menu now right-aligns to its actual trigger;
  the sweep passes the same measured Electron anchor for the paired capture. Preserve
  the trigger-rect registration when integrating the toolbar/chrome agent's changes.
- Transcript list/table/code rhythm remains visible behind thread, Find and Session
  overlays. Font, caret and analytic-shadow rasterization also contribute to full-frame
  error. No pixel masks, cropping or alignment corrections were used for scores.
- Collision rules were derived from React/CSS and the shared placement test covers
  viewport shifts and roomier-side placement. Only the requested 1280×800 viewport was
  visually swept; exhaustive resize/collision-edge visual parity is not claimed.
- The original 69-state `goldens/sweep/REPORT.md` is deliberately retained, rather than
  replacing the other agents' baseline with this focused report.
