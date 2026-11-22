# File workbench continuation

This is not a pixel-identical whole-window sign-off. The native chat/sidebar/composer are
outside this change; the paired fixture deliberately contains empty threads, not fabricated
model replies. Only `/tmp/ocr-pc-files`, OpenCode 4968 and gateway 4498 were used.

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
- Native `rune-edit` source input: 12.5/20 mono text, virtual number/comment gutter, active
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

## Pinned framework boundaries, not falsely certified matches

`rune` is pinned to `7286a3c5`. Its `rune-edit::TextEdit` has `pub text: String`; neither that
checkout nor `~/git/personal/rune-src/rune` contains the requested rope/sum_tree editor API.
Native editing/IME/undo are retained rather than replaced with a WebView editor.

1. Native input exposes inline decorations, **not block widgets or a line-layout provider**.
   Source review cards therefore occupy a bounded dock below the source rather than CodeMirror's
   inline block widgets. There is also no multiline no-wrap setting: the source field is sized
   from its longest mono line inside an outer horizontal scroller. Exact CodeMirror selection,
   inline-widget geometry and every default editing command are not claimed. Rune-kit's lexer
   also privately caps source colouring at 128 KiB and exposes no resumable lexical state;
   syntax decorations are limited to visible/overscan lines and shifted around local edits.
2. Rune-kit's `diff/state.rs` privately fixes `HEADER_H = 44`, `LINE_H = 20`, `GAP_H = 32`;
   `diff/view/look.rs` privately fixes source font size 13 and number widths from `0.6 * size`.
   React uses a 40-point header and 12.5-point source. `DiffView` exposes no metric overrides or
   lazy-full-context loader, and prepared source-bearing diff construction is not public.
   The native virtualized diff, selection, annotations and worker parser are retained; these
   exact metric/full-context differences require upstream APIs or a separately maintained diff
   renderer. This change does not conceal them with scaling, negative margins or fake controls.
3. WK PDF/media controls are WebKit's, not Chromium's internal PDF player/media controls.
   Rune headless PNGs omit native children. The WK smoke PNG is a separate real WK snapshot,
   **not an atomic Rune/native frame**. The existing native-slot presentation limitation remains.

## Performance and evidence

Release runtime test, 2,097,152-byte source, 20 actual native replacement key events:
**p50 10.882 ms, p95/max 12.834 ms** from key dispatch through CPU frame completion, with real
TypeScript syntax decorations enabled (the earlier unstyled run was 5.586/6.735 ms). This includes
native input handling/view/layout and excludes OS delivery, GPU upload/presentation and IME UI.
Only viewport/overscan number rows and syntax decorations mount. This is inside a 60 Hz CPU
budget, not a 120 Hz presentation guarantee. No production timer or forced redraw loop was added.

Pairs (web left, Rune right), both appearances, 1280×800 and 1600×1000, scale 2:
`apps/rune/goldens/pc-files/pair-{files,changes,image}-*-review4.png`.
Native layout callbacks settle with finite `--at 0.1` capture time, not an application redraw loop.
The separate converter checks are `docx-worker-find-review.png` and `docx-real-wk-review.png`.

`capture.mjs` reproduces the pairs against the dedicated fixture. Regenerate the embedded,
read-only preview assets with `node apps/rune/src/workbench/build-preview.mjs` after changing
the pinned web Mammoth/DOMPurify dependencies or preview client. Third-party licenses are adjacent.

Final checks passed: `cargo build --release --workspace`, `cargo test --workspace` (50 unit
tests), `bun check`, `bun format:check`, and `git diff --check`. The three added tests cover
preview-tab selection, 2 MiB native editing, and measured image/annotation coordinates.
Both fixture listeners were stopped only after checking their actual isolated environment;
ports 4498/4968 have no listeners and `/tmp/ocr-pc-files` was deleted. The small input fixture
and converter smoke inputs are retained in the ignored `goldens/pc-files/fixture-evidence.tar.gz`.
