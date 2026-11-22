# Tier-two parity follow-up

Worktree/branch: `opencodex-rune-fx-tier2` / `rune-fx-tier2`.
Reference: real Electron main/preload, CDP, isolated OpenCode **4986** and gateway
**4516**, `/tmp/ocr-fx-tier2`, fixed sweep clock, 1280×800 at scale 2, both themes.
No model calls or user-service access. The original shared `REPORT.md` is retained.

## Measured fixes

- CDP `CSS.getPlatformFontsForNode` resolves the web's monospace stack to
  **Menlo-Regular**, including code inside medium-weight links. Rune's
  `ui-monospace` instead resolved to **SF NS Mono**. The app and auxiliary
  shapers now use the resolved web face. No character-width compensation.
- Inline code's measured box is 103.921875×17px for `src/index.ts`. Code
  backgrounds and file icons use the half-point CSS baseline; links paint the
  stylesheet's 3px underline offset, without adding a second underline on hover.
  Disabled Markdown checkboxes use Blink's native-control palette, not app text
  colors. Existing linked-code line-box coverage is retained.
- The shell separator is 0.5px, not 1px. Toolbar project spacing, title insets,
  action gaps, 17px controls and active Session control match measured CSS.
  Disabled Find navigation uses the web's 0.45 opacity.
- Question headers are 44px, not 48px. The outer border and footer divider take
  layout space. Review rows have 8px insets, a divider and a 6px answer gap;
  primary action weight and option-number line boxes match the web.
- Settings code descriptions preserve the sans strut and gain half a point only
  on lines containing monospace text. Line measurements are cached in a bounded
  64-entry cache, and width reports rebuild only when the width changes. Project
  paths are monospace. Color fields are 32px border boxes with the chip gradient,
  border, shadow and 8px gap. Headless Updates acquisition uses the real native
  installed-package check instead of capturing an unresolved loading message.
- Pierre's context separator has the source background under its text, with the
  tint confined to the gutter. Measured dark pixels: source 26/26/29, gutter
  37/37/40; light: source 249/249/248, gutter 238/238/237.
- Ghostty's canvas measures Menlo 13px `M` at width 7.82666015625, ascent
  9.4453125 and descent 0. Its actual grid is **8×15px**, baseline **11px**,
  with a 15px FitAddon gutter reserve. Native uses that same grid rather than
  fractional 7.826172×16 cells. At 1280×800 the viewport starts at
  (310.5,597.5), and cursor and prompt columns now match. Border-box layout and a
  margin-owning wrapper prevent the viewport from overflowing the window.
  The capture script explicitly focuses the terminal, matching Electron's open
  action, rather than letting the main composer's autofocus win.
- Subagent chrome includes its 1px header border in layout and has the measured
  20px status strut plus 20px footer padding, without an empty permission gap.

The sweep now records settings/question/chrome styles, terminal canvas geometry,
and `.fonts.json` with actual CDP platform faces, alongside existing block and
native element trees. Generated evidence and screenshots remain local/ignored.

## Protected areas / integration

No transcript virtualization, scrolling, or side-chat panel geometry was edited.
The only changes in `chat/mod.rs` are the toolbar controls.

- `chat/reader.rs` omits the 44px history header for read-only subagent readers.
  Electron places that header at y=108, then the user row at y=152. Fixing the
  protected reader path is still needed; adding an unrelated static spacer
  outside its scroll content would be incorrect.
- The native Markdown top/middle captures still have an extra Jump to latest
  pill and lack the web timeline's constant 32px bottom paint mask. The web
  fixture does not mount the pill in those states. These are not text-AA errors.
- Long-history bottom positions still differ by LegendList's row rounding:
  Electron answer tops 65/217/369/521 versus native 66.75/218.25/369.75/521.25.
  Row heights themselves match. Find-long inherits the same discrepancy.

These differences must not be hidden by post-capture image masks, artificial
offsets, eager history mounting, or classification overrides. The missing CSS
bottom fade is legitimate UI paint, not such an image mask. Integrate with the
other reader/scroll workstream, then rerun the same states.

Below-threshold scores are not claims of pixel equivalence: narrow workbench
captures still show different composer-control compression, and shared chrome
retains small icon/text paint differences. Inspect RGB and heatmaps as well as
blurred MAE.

## Final measurements

Each value is the worst of dark/light at 1280×800, scale 2; lower is better.
Before is the fresh isolated `tier2-before.json` baseline, not the older shared
report. RGB is the final worst-theme mean RGB error. The two maxima need not
come from the same theme.

| State                    | Before blur | After blur | After RGB |
| ------------------------ | ----------: | ---------: | --------: |
| settings-general-bottom  |      1.4190 |     0.4009 |    0.8319 |
| subagent-conversation    |      1.0212 |     0.9989 |    1.2996 |
| question-review          |      1.0170 |     0.4224 |    0.6597 |
| panel-diff-open          |      0.9755 |     0.5701 |    1.4251 |
| settings-general         |      0.9272 |     0.3077 |    0.7093 |
| chat-markdown-middle     |      0.9286 |     0.7145 |    1.5268 |
| chat-markdown-top        |      0.7844 |     0.7227 |    1.4753 |
| session-details-open     |      0.7793 |     0.5850 |    1.2661 |
| question-selected        |      0.7707 |     0.4144 |    0.6439 |
| find-long-open           |      0.7600 |     0.7619 |    1.5626 |
| panel-terminal           |      0.7566 |     0.3722 |    0.7796 |
| panel-file-open          |      0.7522 |     0.5304 |    1.2409 |
| tool-detail-open         |      0.7516 |     0.4538 |    0.9134 |
| chat-long-bottom         |      0.7462 |     0.7498 |    1.5484 |
| thread-actions-open      |      0.7186 |     0.5269 |    1.1880 |
| settings-appearance      |      0.7118 |     0.2892 |    0.5001 |
| settings-remote-access   |      0.7100 |     0.3873 |    0.6733 |
| find-markdown-open       |      0.7097 |     0.5155 |    1.1608 |
| thread-context-menu      |      0.7086 |     0.5031 |    1.1680 |
| chat-question-bottom     |      0.7064 |     0.3977 |    0.6264 |
| chat-architecture-bottom |      0.7009 |     0.5098 |    1.1535 |

**16/21 states meet both provisional numeric thresholds** (blur <0.7 and RGB
<1.5 in both themes); five remain in the protected-area handoff above. Long
bottom and Find-long slightly regressed and are explicitly unfinished. Diff now
meets both thresholds, not merely the blur threshold. No review overrides used.

- Baseline source fingerprint:
  `cabe47f5a41b50bc37387556f4272d1c233c97730c467d62ff8a7e33fed9d2de`.
- Final source fingerprint, all 42 targeted pairs:
  `a78c9c8fd423dd26dc2ea7c4ad7fcceae5fcde6a1f14ac7992e53531852b261b`.
- The complete 69-state/two-theme sweep was followed by the final focused
  21-state refresh. The focused refresh had a transient Tasks plugin 409 while
  bracketing file-open/light; a subsequent file-open rerun scored both themes
  successfully. All final 42 targeted pairs have unchanged before/after gateway
  digests and no capture errors. Final local results contain 134 scored pairs;
  streaming and native WKWebView canvas remain honestly unscored in both themes.
  Untargeted rows retain the preceding complete sweep's fingerprint.
- Inspected fresh-name final pairs/heatmaps for diff, subagent, settings bottom,
  compact toolbar, session details, Markdown top, terminal, and Find-long.
  CDP/native geometry and actual font faces informed the fixes; remaining
  structural differences are not attributed to rasterization.

## Validation and cleanup

- `cargo build --release --workspace`: passed (existing unused/dead-code warnings).
- `cargo test --workspace`: passed, 117 tests; six existing doctests ignored.
- `bun check`: passed after the final focused sweep.
- `bun format:check`: passed; rerun after formatting this evidence.
- Original tracked `goldens/sweep/REPORT.md` restored; evidence is recorded here
  rather than overwriting another workstream's baseline report.
- Ownership-checked isolated cleanup completed. Verified no remaining process
  argv or isolated HOME/OCR_FIXTURE environment belongs to `/tmp/ocr-fx-tier2`,
  including Electron/helpers; ports 4986/4516 have no listeners and the temporary
  directory no longer exists. No user-service port or other worktree was touched.
- Commits remain local; nothing pushed.
