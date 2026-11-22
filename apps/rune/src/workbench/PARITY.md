# Panels and composer chrome follow-up

Scope: `rune-fx-panels`, against real Electron/CDP and isolated gateway 4512 /
OpenCode 4982, with temporary state under `/tmp/ocr-fx-panels`.

## Whole-window blurred MAE

Worst dark/light measurement at 1280×800 (lower is better). Before is the
checked-in same-data sweep, not the intervening development captures. Each scored
after pair had an unchanged gateway snapshot digest. The full requested matrix
was rerun; the diff state was additionally rerun after correcting its Lab tints.

| State               |   Before |    After |
| ------------------- | -------: | -------: |
| panel-diff-open     |   2.5295 |   2.0766 |
| panel-file-open     |   2.3020 |   1.8533 |
| panel-changes       |   2.2252 |   1.7477 |
| panel-files         |   2.1996 |   1.7276 |
| panel-terminal      |   0.9478 |   0.8026 |
| panel-canvas        | unscored | unscored |
| panel-subagents     |   0.3646 |   0.3100 |
| side-chat-new       |   5.7179 |   5.3201 |
| panel-side-chat     |   5.7093 |   5.3138 |
| composer-focused    |   0.2478 |   0.2478 |
| composer-text       |   0.2586 |   0.2586 |
| composer-attachment |   0.5156 |   0.5156 |

## Measured geometry

Electron measurements include bounding rectangles and computed styles for the
workbench, both composers, and Pierre's shadow-DOM tree/diff controls. Native
measurements use the headless `--tree` output, not a live window. Composer resize
measurements cover panel widths 340, 420, 500, 600, and 660 px.

- At 1280×800, editor actions are exactly at x=804/834/868/900, y=45.5,
  size 28×28; File actions is 36×32 at (936, 43.5); panel expand/close
  controls are 28×28 at y=5.5. Native and Electron rectangles match.
- The tree collapse control differs by 0.17 px; comparison segments, document
  tabs, tree rows, and side composer controls are within 0.5 px.
- The side composer is 118 px tall, its input is 52 px tall, and the footer
  has the same 8 px top margin and 34 px action row as Electron. Its model
  control uses the same 18 px provider mark and context indicator.
- The main composer uses the **content-box** container width, not its outer
  width: permissions become icon-only at 524 px, and selectors get their own
  row at 480 px. At panel widths 340–600 px, measured control rectangles match
  within 0.5 px. At maximum panel width, Electron overlaps its thinking selector
  over the model. Rune intentionally retains distinct hit targets and truncates
  thinking text, as requested; it does not hide the model/provider controls.
- Narrow workbench trees overlay the document below the toolbar, matching
  Electron's 560 px container rule. Resizing no longer changes the panel's
  maximum-width rule midway through a drag.

## Glyphs and paint

Controls use Hugeicons `MaximizeScreenIcon` / `MinimizeScreenIcon`, `RefreshIcon`,
`File01Icon`, `FileEditIcon`, `PanelRightIcon`, `SourceCodeIcon`, `ViewIcon`,
`Menu01Icon`, and `LayoutTwoColumnIcon`, not approximate Unicode glyphs.
The diff header uses Pierre's `diffs-icon-symbol-*`; tree rows use Pierre's
chevron and Markdown/TypeScript/HTML symbols. Apache attribution accompanies the
ported Pierre paths.

Diff numbers include Pierre's 2 px gutter border in layout, use the measured
32.10 px one-digit gutter, and align the full-width context-expansion target.
Diff tints use CSS Lab D50 mixing and semantic addition/deletion colors, rather
than Rune Kit's unrelated green/red palette. The source editor uses CodeMirror's
12 px mono face, 20.3984 px line boxes, 41 px minimum gutter, and 6 px source inset.

## Remaining scope

Whole-window image errors still include the independently owned Markdown/list/
table/code-wrap and reader-scroll differences. These are not a claim of whole
screen parity. Terminal cursor painting is unchanged. Canvas remains honestly
unscored: the headless CLI cannot export the WKWebView child.

All screenshots are real Electron / native same-data pairs. No historical
screenshots, shared OpenCode state, model calls, live redraw loops, or masks.

## Side timeline viewport correction

The subsequent `rune-fx-scroll` measurement used real Electron/CDP on isolated
gateway 4515 / OpenCode 4985, in dark/light at 1280×800. The composer was not the
source of the remaining transcript shift: its vertical geometry already matched.
`tools/sweep/scroll-measure.mjs` records the surrounding live rectangles, including
the CSS override that an earlier footer measurement missed.

| Rectangle                | Electron y / height | Rune y / height after |
| ------------------------ | ------------------: | --------------------: |
| Panel header             |              0 / 40 |                0 / 40 |
| Side transcript viewport |            40 / 592 |              40 / 592 |
| Side timeline footer     |            580 / 52 |              580 / 52 |
| Side composer area       |           632 / 168 |             632 / 168 |
| Main-chat status         |            644 / 18 |              644 / 18 |
| Side composer card       |           670 / 118 |             670 / 118 |
| Side input               |            684 / 52 |              684 / 52 |
| Side action row          |            744 / 34 |              744 / 34 |

`.chat > .timeline .timeline-footer` has higher specificity than the row padding:
its 32px bottom padding plus 20px status strut is **52px**, not 40px. Correcting
that and using Rune's `whole_rows()` (LegendList rounds measured rows) places the
side Markdown root at y=-158 in both renderers instead of Rune's -145.7.
Internal Markdown remains fractional and unchanged. Reader row width now excludes
the panel's 1px border; rows no longer extend past the viewport. The shell's
existing half-pixel split remains: Electron content x=577.5, width=658.5, versus
Rune x=577, width=659. No artificial transcript offset compensates for it.

At 1600px, rows, the footer and composer area also honor the web's centered
768px maximum width instead of filling the entire panel. This gives a 736px
side Markdown/card content width, not the previous 787px, without changing the
full-width header or transcript viewport.

Worst dark/light blurred MAE improves from 4.0950 to 0.9583 for `side-chat-new`
and from 4.0887 to 0.9520 for `panel-side-chat`, with stable gateway snapshot
digests for every pair. Remaining checkbox painting, inline decoration and narrow
main-composer control differences are not a viewport/composer-height mismatch.
See `tools/sweep/SCROLL.md` for the companion long-history fix and performance.
