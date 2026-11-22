# File workbench continuation

This is not a pixel-identical whole-window sign-off. The native chat/sidebar/composer are
outside this change; the paired fixture deliberately contains empty threads, not fabricated
model replies. This follow-up uses only `/tmp/ocr-pc-files2`, OpenCode 4968 and gateway 4498.

## Closed behavior

- File breadcrumbs, case-insensitive explorer ordering, a separate hierarchical changes tree,
  immediate changed-file filtering, 180 ms gateway file search, collapse, keyboard navigation,
  ancestor disclosure, double-click pinning and file-tree resize (150–360, 16-point keys).
  Clean preview tabs replace the previous preview even when a pinned tab is selected; closing
  a background tab preserves the active document. Editing pins a tab.
- Open-in uses the Electron catalogue and discovery locations, declared bundle icons,
  Spotlight fallback, five-minute cache, bounded subprocesses, persistent selected app,
  pending/error state and keyboard menu navigation. File reveal uses the gateway's checked
  file-location route before `open -R`. Discovery/open operations have separate bounded native
  worker admission, so Spotlight cannot block the file/diff/save queue.
- Native `rune-edit` source input: 12.5/20 mono text, virtual no-wrap source rows/gutter, active
  line, range selection, two-space Tab/outdent, normal Return, CRLF preservation, undo,
  revision-safe save, source review targets including version, and scoped worker highlighting.
  Lexer work is never on the key handler; idle syntax refresh coalesces behind a 120 ms deadline.
- Images use measured viewport dimensions, exact fit bounds/zoom steps, center/pointer anchored
  wheel/pinch/button/double-click zoom, drag-pan, keyboard zoom, download, and the source's
  **point** annotations. React does not offer rectangular region annotations here. SVG intrinsic
  dimensions are separate from Rune's 2× raster dimensions. A runtime test checks measured
  geometry, anchor-preserving scroll offsets, and actual click-to-comment coordinates.
- PDF/video use unprivileged, origin-restricted WK guests and the existing byte-range media
  route. DOCX uses the same pinned Mammoth options/image bounds, disposable worker, 15-second
  deadline, output bounds, DOMPurify allowlist, source CSS and scoped DOM-find matcher as the web.
  Real Chrome and nonpersistent WK smoke checks rendered the fixture; Chrome checked sanitization
  and four-match find/next. HTML files remain source files, as `FilePreview` specifies; local-HTML
  browser routing belongs to the Browser panel. Markdown links resolve relative to the source
  document's parent, including cross-directory targets; oversized rendered previews show the
  source's explicit notice and View source control.
- Diff comparison/layout/edit controls are in the document toolbar. Review comments are
  version/mode/path scoped, stale quotes are not restored into unrelated diffs, pending text
  cannot be replaced by another gutter comment, and separators use `FoldRow::LineInfo`.

## App-owned diff and inline source layout

The two former framework blockers are removed rather than accepted:

- `diff/` vendors Rune-kit's MIT renderer from revision
  `7286a3c5fe525bcbdb5a1188a4046ff4eff5f0de`, with its license and provenance retained.
  Shared configurable metrics drive layout/navigation: 40-point header, 12.5/20 source,
  32-point separator, 11.5-point separator labels, one unified number column, overlaid
  4-point bars and CSS-equivalent gutter/code padding. The SF Mono advance was checked
  against computed Chromium geometry (7.525635 points at 12.5).
- Expansion controls now cover leading/inter-hunk **and unknown trailing context**. Missing
  sources load through the existing `workspace/diff?...&full=1` transport. The exact queued
  gesture replays on receipt: 20 lines per arrow, both ends for the label, all with Shift.
  Sources attach without resetting hunks, selections, annotations or virtual row keys.
  Parse/pair/fold/highlight/maximum-width work stays on the bounded worker; immutable source
  storage crosses its mailbox using `Arc`, with no UI-thread reparse.
- Source lines are actual virtual growth rows, not a full-document field beside virtual
  numbers. Native **single-line, no-wrap** input mounts at the edited line; other visible
  lines use syntax-decorated no-wrap text. Review cards and pending editors are row children
  immediately after the selected **end line**, matching CodeMirror's `line.to, side:1`.
  Card width comes from the measured viewport minus the gutter, not the longest source line.
  The old below-editor dock is gone. Visible row rectangles account for cards during gutter
  range selection, without adding document bytes or triggering scroll redraw loops.
- The document remains the save/undo identity. Native selection/IME work within the active
  field; app-owned cross-line navigation/selection, clipboard, multiline paste, newline joins,
  Return/CRLF, Tab/outdent, undo/redo and save bridge back to that document. Unchanged review
  targets map across preceding edits/undo; stale quotes remain excluded. This is not a claim
  that every optional CodeMirror extension/default command has been reimplemented.

Rune-kit's lexer still caps colouring at 128 KiB and has no resumable lexical-state API;
visible syntax decorations shift around local edits while the idle worker catches up.
WK PDF/media controls remain WebKit's rather than Chromium's internal controls. Headless
PNGs omit WK children; the older WK smoke is a separate snapshot, not an atomic native frame.

## Performance and evidence

Release runtime test, 2,097,152-byte source, 20 actual native replacement key events:
**p50 3.935 ms, p95/max 6.465 ms** from key dispatch through CPU frame completion, with real
TypeScript syntax decorations enabled (previous whole-field result: 10.882/12.834 ms). This includes
native input handling/view/layout and excludes OS delivery, GPU upload/presentation and IME UI.
Only viewport/overscan source rows and syntax decorations mount. Each key asserts the actual
replacement byte and unchanged 2 MiB size; focus and selection use the real row input. This is inside a 60 Hz CPU
budget, not a 120 Hz presentation guarantee. No production timer or forced redraw loop was added.

Pairs (web left, Rune right), both appearances, 1280×800 and 1600×1000, scale 2:
`apps/rune/goldens/pc-files/pair-{files,inline,changes,diff-inline,expanded,image}-*-rows.png`.
Source and diff inline pairs are produced by actual native gutter-click/paste/Cmd-Enter script events and
the equivalent CodeMirror actions. The expanded web pair waits for a real full-context
response; Rune's capture-only response replay uses the same worker preparation, source attach
and queued 20-line expansion path. It is not represented as an asynchronous headless-network test.
Native layout callbacks settle with finite `--at 0.1` capture time, not an application redraw loop.
The separate converter checks are `docx-worker-find-review.png` and `docx-real-wk-review.png`.

`capture.mjs` reproduces the pairs against the dedicated fixture. Regenerate the embedded,
read-only preview assets with `node apps/rune/src/workbench/build-preview.mjs` after changing
the pinned web Mammoth/DOMPurify dependencies or preview client. Third-party licenses are adjacent.

Final checks passed: `cargo build --release --workspace`, `cargo test --workspace` (72 unit
tests), `bun check`, `bun format:check`, and `git diff --check`. New runtime checks cover
end-line card placement, mapped targets, native multiline paste/IME/undo/click-to-edit, and
full-source attachment with selection retention and 20/all expansion. The vendored upstream
regressions are retained too. The previous preview/tab/image/save tests still pass.
The small input fixture and capture scripts/logs are retained in the ignored
`goldens/pc-files/fixture-rows-evidence.tar.gz`; the older converter inputs remain in
`fixture-evidence.tar.gz`. Fixture services are stopped after verification; the user's
OpenCode service and storage are never used.
