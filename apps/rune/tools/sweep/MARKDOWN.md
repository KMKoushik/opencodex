# Markdown geometry follow-up

Measured in real Electron (the built desktop main/preload, CDP), against an isolated
gateway on 4511 and OpenCode on 4981, using `/tmp/ocr-fx-md`. Both themes and
1280×800 / 1600×1000, scale 2. No model calls or user-service access.

## Changes

- Preformatted blocks and tables scroll horizontally instead of wrapping code.
- A pre's inherited 14px monospace strut and its 13px code child both contribute to
  its line box: 23.25px per line, not 22.75px. The calculation uses font metrics,
  respects the chat font preference, and caches a bounded set of baseline metrics.
- Collapsed table borders occupy half a pixel in each adjacent row. The final
  exterior half-border belongs to the table, not the final row.
- Only direct Markdown children receive the 16px sibling margin. Nested paragraphs
  and lists retain zero margins; h1–h4 introduce 24px and h5/h6 inherit body metrics.
  The parser retains all six heading levels. Horizontal rules are 1px tall.
- Side-chat rows have 16px horizontal insets and full-width user bubbles. Workbench
  checkbox inputs have a 28px replaced-element box: the two checklist rows together
  are 23px taller than the main-column checklist, matching Chromium's actual CSS.
- The side timeline includes its 44px history header and 40px status/footer strut.
  The footer is scroll content, not composer chrome; omitting it shifts all content
  at the bottom by 40px even when every Markdown block has the correct height.

## Geometry evidence

The sweep now saves `<stem>.blocks.json` (every Markdown descendant's rectangle and
computed spacing/font styles) and `<stem>.tree.json` (Rune's actual inspector tree).
`markdown-measure.mjs` reuses a seeded `--keep-env` environment and additionally
measures multiline code at 14/16/18px and nested blocks. These generated JSON files
remain local alongside the existing ignored PNG evidence.

Repeated `--keep-env` sweeps previously reused each state's Electron profile.
Workbench state persists in `sessionWorkbench`, so the next setup click could
close the already-open Side chat panel and time out waiting for its tab. Captures
now use unique fresh profiles. Failed states save body-text evidence, and the
new-side-chat response wait is attached to the click with `Promise.all`, so a
timeout is recorded and cleaned up rather than aborting with an unhandled promise.

Chromium's main fixture Markdown height is 652.6953125px; native is 652.7px. The
maximum difference in its nine block heights or tops relative to the Markdown
root is 0.00469px in both themes and both sizes (`markdown-geometry-diff.json`).
The same bound holds for both columns of the side-panel fixture
(`markdown-side-geometry-diff.json`): narrow main heights 902.9453125 / 698.1953125px
match native 902.95 / 698.2px, and side height 675.6953125px matches native 675.7px.
Absolute placement still depends on the surrounding timeline's scroll position.
The three-item list is 80.25px and the four-row table is 175px. Code line probes at
14px produce pre heights 53.25 / 76.5 / 99.75px for one / two / three lines.
Nested quote paragraphs and a nested tight list each occupy 45.5px; h5/h6 occupy
22.75px and hr occupies 1px. One focused runtime regression covers those heights,
the workbench checkbox baseline, and collapsed table row boxes.

## Sweep metrics

Before is a fresh same-environment baseline at the starting revision, not the
older checked-in 69-state report. Values below are worst blurred MAE across both
themes and both sizes; lower is better. Full per-pair data is retained locally in
`markdown-before.json` and `results.json`. Snapshot digests bracket each pair.

| State                    | Before |  After |
| ------------------------ | -----: | -----: |
| chat-long-middle         | 4.2332 | 4.2332 |
| chat-architecture-bottom | 0.9186 | 0.7009 |
| chat-markdown-bottom     | 0.9136 | 0.6959 |
| chat-markdown-top        | 0.7853 | 0.7844 |
| chat-markdown-middle     | 0.9213 | 0.9286 |
| chat-long-top            | 0.6129 | 0.6129 |
| chat-long-bottom         | 0.7462 | 0.7462 |
| side-chat-new            | 7.0375 | 4.5522 |
| panel-side-chat          | 7.0335 | 4.5436 |
| find-markdown-open       | 1.0714 | 0.8537 |
| session-details-open     | 1.0807 | 0.8872 |

The additional thread-context-menu capture scores 0.7086 after (no fresh baseline
was collected for it). The final run scored all 48 pairs, with one source
fingerprint and unchanged before/after snapshot digests for every pair. All eight
side-chat pairs passed once profiles were fresh. The slight middle-Markdown MAE
increase is retained, not omitted: whole-window scroll/raster metrics are not
monotonic with a half-pixel correction to a block's geometry.

## Remaining limits

The later [scroll follow-up](./SCROLL.md) resolves the long-history midpoint and
side-transcript placement described below. Its live CSS measurement also corrects
the earlier 40px side-footer assumption to 52px: the more-specific timeline rule
supplies 32px bottom padding. The measurements below remain the historical result
of this Markdown-only change.

This does not claim whole-window pixel parity. The side composer/panel chrome,
Find and session popovers are separate workstreams. The 40-turn middle-scroll
mismatch is not paragraph-height accumulation: fresh DOM/native dumps show the
same 66.75px user rows and 84.75px answer rows. Chromium's LegendList rounds row
positions, while Rune retains unvisited 100px estimates. The remaining mismatch
is virtual-list positioning/estimation or capture scroll priming: the two 50%
scroll operations select different content despite matching measured row heights.
No eager transcript mounting, artificial scroll offset, or redraw loop was added
to hide that issue.
The existing native Jump to latest pill also differs from Chromium's follow state
after the sweep's programmatic scrolling. Images are absent from this fixture;
image layout is not newly certified by these measurements.

At 1280×800, the side Markdown root remains approximately 20.3px below Chromium's
root despite matching internal block geometry; its surrounding viewport/composer
still differs. Checkbox painting, inline decoration and glyph rasterization also
remain visibly different. These are not a claim of complete Markdown pixel parity.

## Validation and cleanup

`cargo build --release --workspace`, `cargo test --workspace`, `bun check` and
`bun format:check` pass. The single added runtime test checks real geometry rather
than snapshots or placeholder behavior. Virtual rows, bounded Markdown caches and
off-thread parsing are retained. The final sweep performed its ownership-checked
cleanup and removed `/tmp/ocr-fx-md`. The shared 69-state `REPORT.md` is left
unchanged to avoid replacing the other parity workstreams' report with this subset.
