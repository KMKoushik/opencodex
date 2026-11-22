# Same-data parity sweep

```sh
bun apps/rune/tools/sweep/run.ts
bun apps/rune/tools/sweep/run.ts --states home-empty,chat-tools-bottom --themes dark --sizes 1280x800
```

Run from this checkout with its pinned Electron dependency, Bun, Node, the macOS Rust/clang toolchain,
and Python Pillow installed. No model credentials or model calls are required.
The command installs pinned OpenCode 2.3.2 under `/tmp/ocr-sweep`, starts or
validates/reuses its service on 4977 and gateway on 4507, seeds authored data,
builds the shared renderer, real desktop main/preload and Rune (incrementally), captures both clients, computes metrics,
and writes `apps/rune/goldens/sweep/REPORT.md`. PNGs and machine-readable evidence
are ignored; the report and reviewed observations are committed.

The 69 names are explicit in `states.mjs`, not inferred from an old PNG corpus.
Every state starts in fresh Electron and Rune processes. `web.mjs`
uses real accessible controls, while `states.mjs` maps the same operation to
existing native capture flags. Failed locators fail the state rather than
capturing whatever happens to be visible. Snapshot digests invalidate data that
changes between the two sequential captures. They are **not atomic captures**.

`electron.mjs` launches the actual Electron binary in this checkout's `node_modules`
with `ELECTRON_RENDERER_URL=http://127.0.0.1:4507`, isolated HOME/XDG, a temporary
`--user-data-dir`, and an ephemeral loopback `--remote-debugging-port`. Playwright
connects over CDP, and `Page.captureScreenshot` captures the hidden renderer.
A unique fresh profile is used even when repeating a state under `--keep-env`,
so persisted workspace toggles cannot invert the setup actions on a rerun.
A finite temporary bootstrap imports the **actual built desktop main** and only
sets BrowserWindow content size, theme and hidden state. That main loads its own
sandboxed preload and registers the real IPC handlers. Preferences are seeded
through the real `window.desktop.setPreference` bridge before reloading; Browser
and Updates capabilities are never mocked. CDP sets scale 2 and verifies the
bridge, viewport and device scale on every scored capture. No redraw loop is added.

`clock.c` is a test-process-only macOS dyld interposer; only realtime clocks are
frozen. No app code, shared service, user HOME, or other worktree is changed.
Rune's own virtual clock controls animation phase. Native HTML children cannot
be exported through the current headless CLI: those captures remain unscored.
Streaming likewise cannot be honestly reproduced by importing completed text.

Apps/Tasks empty states temporarily remove the fixture tasks / app server before
the pair and restore them afterwards. The gateway must confirm the empty list;
the before/after digests cover that exact empty data on both clients. Other states
retain the populated fixture. There is no model-driven task start or app refresh.
Form, permission and child fixtures use OpenCode's native APIs,
as `parity-fixture.ts` already does; all client reads use the same gateway.

Full-resolution outputs: `<state>-<theme>.electron.png`, `.rune.png`, `.diff.png`,
`.pair.png`; explicit nondefault/multiple sizes add `-<width>x<height>`.
`results.json` contains all theme/size metrics and before/after digests.
It records `reference: "electron"` and runtime/bridge evidence. Old Chrome
`.web.png` files, if present locally, are never read by the corrected metrics.
DOM text and native capture logs accompany each pair. Classification uses the
worst theme/size; reviewed descriptions/overrides live in `review.json`.
Observations are pinned to the reference host and a hash of the shared renderer,
desktop main/preload, and native/backend source files; changed source
automatically falls back to explicitly provisional metric classifications.
`python3 apps/rune/tools/sweep/review.py` builds fresh-name, worst-first review sheets.
Before inspecting a pair, copy it to a fresh filename to avoid image-reader
path caching. Update observations after reviewing changed app revisions.

`--keep-env` retains services only for diagnosis. Default cleanup verifies each
process's actual isolated HOME before killing it and removes `/tmp/ocr-sweep`.
It never stops OpenCode by executable name or accesses port 49374.
`--report-only` regenerates Markdown from saved local results and observations.

## Markdown geometry

See [the Markdown follow-up](./MARKDOWN.md) for measured block heights, parity
results and the remaining virtual-list/viewport differences.

Every scored pair also saves `.blocks.json` (Chromium rectangles and computed
spacing/font styles) and `.tree.json` (Rune's inspector tree). For extra code-line
and nested-block probes, retain a seeded environment with `--keep-env`, then run
`node apps/rune/tools/sweep/markdown-measure.mjs [state]` with the **same**
`OCR_SWEEP_DIR`, `OCR_SWEEP_OC_PORT` and `OCR_SWEEP_GW_PORT`. It reuses that fixture
without reseeding or modifying transcript data and measures both themes/sizes.
The default state is `chat-markdown-top`. Do not run it concurrently with a sweep
that mutates side chats. Run the environment's `cleanup()` afterwards; `--keep-env`
is never an instruction to leave the isolated services running indefinitely.
