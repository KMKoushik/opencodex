# Alignment follow-up

This sweep measures text origins and baselines, icon centers, vector geometry,
font size/weight/family and color separately from whole-window image error.
The exhaustive screen-by-screen findings and unvalidated items are in
[`ALIGNMENT.md`](../../goldens/sweep/ALIGNMENT.md); image metrics remain in
[`REPORT.md`](../../goldens/sweep/REPORT.md).

## Final result

UI fixes are committed as `400e5d5` and `1b74290`; no push is performed.

- 69 states / 138 attempts; 136 scored dark/light pairs, all with stable gateway
  digests. Only the two explicitly unsupported streaming attempts are unscored.
- **7,996 matched items, zero alignment flags; 316 Electron / 1,018 Rune unmatched items**
  remain explicitly unvalidated. The first broad audit's 692 flagged occurrences
  are cleared; these include repeated controls and measurement corrections, not
  692 independent code defects. The original unfixed three-state sample had 27
  flagged occurrences and is retained separately.
  Matched coverage increases from 7,834 to 7,996 rather than dropping difficult
  pairs to make the flag count smaller.
- Historical checked-in image metrics improve on 134 of 136 pairs. Mean blurred
  error falls by 0.1359; worst blurred error falls from 0.6057 to 0.5562. This is
  a historical comparison, not a new same-binary controlled baseline.
- The two worse image scores are the dark/light existing-side-chat panel:
  0.3696 → 0.4631 and 0.3779 → 0.5562 blurred error. Its unmatched introduction
  still uses native `12:56 AM` versus Electron `00:56`, and Electron includes a
  live-context-plugin hint absent from Rune. Those content/locale differences
  remain, not a claim of pixel equivalence or a hidden alignment pass.
- Release workspace build, all 119 workspace unit tests, `bun check` and
  `bun format:check` pass. The measuring binary is replaced by a normal pinned
  dependency release build after capture.

## Original five issue groups

Offsets are Rune minus Electron, in logical points (dark reference crops below).
These measurements replace
the initial visual estimates; the title was 5.25 points high, not approximately
two points. The brand chevron's vertical center was already correct.

| Issue           | Before                                                                        | After                                                                                             |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Toolbar title   | Baseline −5.25                                                                | Baseline 0                                                                                        |
| Brand chevron   | x +9, y 0; secondary ink                                                      | x 0, y 0; tertiary ink                                                                            |
| Diff controls   | Selected label secondary instead of text; PencilEdit02 vector                 | Selected label text; exact PencilEdit01 vector; centers unchanged                                 |
| Open-in control | Generic folder before worker discovery; 18-point icon                         | Actual Finder image; 16-point icon; center x/y +0.5 (within thresholds)                           |
| Context ring    | 15-point outer diameter (border inset incorrectly treated as centered stroke) | 17.0833-point outer diameter; 7.5-point centerline radius; 2.0833-point stroke, matching Electron |

## Additional corrections

- Center fixed-height single-line inputs using their actual line box and layout
  border inset. This fixes project fields (−8.75), remote fields (−6.75), workspace
  filter (−6.5) and model search, without translating glyphs or changing hit targets.
  The project switcher also reserves its CSS bottom border in layout and gives
  the input its real 10-point vertical padding; its former +0.59 baseline offset
  came from centering inside the stroke instead of the content box.
- Match settings controls, shortcut key typography, project notices, modal action
  sizes and worktree empty-state typography.
- Match task header/column controls and real Add01 vectors; remove the empty
  project-select preview spacer and use its actual text inset.
- Use exact generated filter/back/edit vectors and the web's rotated-right turn
  disclosure, instead of approximated or differently shaped arrows.
- Use tabular system digits, not a monospaced font, for model counts, session
  values and range outputs.
- Match selected toolbar, Focus, Markdown preview/source and tree icon inks.
- Apply the reader's 16-point transcript inset to read-only subagents as well as
  editable side chats.

## Evidence and limits

The initial unfixed three-state evidence is preserved locally in
`goldens/sweep/alignment-before/`. The first broad measuring pass is preserved in
`alignment-pass1/`, and the broad intermediate validation in `alignment-pass2/`.
These are diagnostic captures, not alternate references; every scored reference
is fresh real Electron over the same isolated gateway data.

The first broad pass has 692 flagged screen-item occurrences under the current
comparator across 136 scored theme/screens. This is not a count of 692 independent
bugs: repeated controls recur across screens and themes. Some measurement fixes
(CSS Oklab parsing, full-range span ink, translucent 8-bit unpremultiplication)
remove false positives rather than changing paint.

Unmatched items are not passes. The DOM probe targets semantic controls and UI
regions; nonsemantic welcome/intro content outside those regions can appear only
in the native unmatched list and is not validated by this probe. Mixed rich-text spans, independently split DOM
text runs, raster images, native embedded content and clipped/virtualized rows
can lack one-to-one semantic matches. The report lists both sides explicitly;
zero matched-pair flags must not be described as complete pixel equivalence.
Raster icon identity is verified visually, not inferred from a matching rectangle.
Finder now uses the native application image rather than a folder vector; its
raster palette/antialiasing still differs slightly from Electron's image path.
The retained +0.5-point rail center offset is within the requested threshold.

Concrete coverage limitations include native radio/color primitives without
one-to-one DOM input nodes and syntax-highlighted text split differently between
renderers. Narrow composer model labels can have zero-width layouts in both
clients; DOM Range still exposes their unclipped glyph bounds, so those are not
evidence that the hidden label is actually painted. Fully clipped runs must be
excluded rather than counted as a rendering discrepancy.

`chat-streaming` is deliberately unscored in both themes: importing unfinished
history does not create an active run. There is no native headless event-feed
injection, and no completed-history substitute or model call was used.

Fresh paired zooms (Electron left, Rune right) are retained locally under
`goldens/sweep/`: `final-chat-v6-{title,brand-chevron,open-in,context}.png`,
`final-chat-light-v6-{title,brand-chevron,open-in,context}.png`, and
`final-diff-v6-{segment,edit}.png`. The original counterparts are in
`alignment-before/original-chat-v5-*.png`,
`alignment-before/original-chat-v4-context.png`, and
`alignment-before/original-diff-v2-*.png`.
The final input checks are `final-picker-v1-project-search.png` and
`final-directory-v1-project-directory.png`.

## Reproduce

The last broad validation recorded one transient Tasks-disabled HTTP 409 during
light project-picker setup. Its original result is retained locally as
`goldens/sweep/alignment-validation-broad-results.json`; the affected state is
recaptured over freshly verified fixture data, not replaced with an older image.
Late input/header fixes and the multiline/inline-span measurement corrections
are also validated with fresh targeted dark/light pairs. Each row retains its
actual source fingerprint; the report does not pretend that these are one
atomic capture or one uniform binary revision.

```sh
OCR_SWEEP_DIR=/tmp/ocr-fx-align OCR_SWEEP_OC_PORT=4990 OCR_SWEEP_GW_PORT=4520 bun apps/rune/tools/sweep/run.ts
```

The measurement build copies the exact pinned Rune revision into that isolated
directory; it never patches Cargo's checkout or the production dependency graph.
It exposes existing shaped baselines and paint geometry, without changing layout
or paint. No redraw loop, screenshot registration, masking or MAE-only sign-off
is used. `alignment-crops.py` exports paired zooms using fresh output prefixes.
