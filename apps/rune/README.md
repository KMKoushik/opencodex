# OpenCodex Rune — chat and composer

## macOS bundle and benchmarks

From the repository root, `bash apps/rune/tools/bundle.sh` builds the arm64 release and compiled
gateway, reuses the desktop icon/version/minimum macOS version, and ad-hoc signs
`apps/rune/dist/OpenCodex Rune.app` (`dev.opencodex.rune`). Optional:
`--identity 'Developer ID Application: …'`. The distinct name/id lets it coexist with Electron.
Finder launches resolve login-shell PATH on a bounded startup worker. Gateway stderr rotates
under `OPENCODEX_DATA_DIR` (two 1 MiB files). Quitting closes only the owned sidecar's stdin.

See [`../../bench/README.md`](../../bench/README.md) for the isolated fixture, both app drivers,
frame/typing metrics, and the locked-screen-safe subset. Fullscreen/locked-screen results are
not visible-startup measurements. `OPENCODEX_BENCH_LOG` mirrors markers to a worker-written file
for LaunchServices; `OPENCODEX_BENCH_FRAMES=1` enables frame diagnostics without forcing redraws.

Standalone Rust workspace, pinned to Rune **7286a3c5** with its six required crates.io patches.
The binary is a native client of the existing TypeScript gateway, not another OpenCode backend.

## Run

Start a gateway with a connected OpenCode service, then:

```sh
cd apps/rune
cargo run --release
# In the launching shell, set:
# export OPENCODEX_GATEWAY=http://127.0.0.1:4431
```

Or launch the built binary directly:

```sh
OPENCODEX_GATEWAY=http://127.0.0.1:4431 apps/rune/target/release/opencodex
```

Without `OPENCODEX_GATEWAY`, Rune starts its bundled gateway after the first frame, or uses
`packages/gateway/dist/opencodex-gateway` in a development checkout. The gateway owns service
discovery; Rune owns only the child and closes its stdin on quit. OpenCode is never stopped.
`OPENCODEX_DATA_DIR` selects its presentation-preference directory (default `~/.opencodex/rune`).
`OPENCODEX_BENCH_PROJECT` selects the initial project; `OPENCODEX_BENCH=1` enables the
`OPENCODEX_BENCH first_content <unix_ms>` marker **after a frame containing mounted gateway
thread rows is drawn**. A covered/offscreen window does not emit a fake marker. Session-open
signals and markers are described below.

## Screenshots and inspector

```sh
cd apps/rune
OPENCODEX_GATEWAY=http://127.0.0.1:4431 cargo run --release -- \
  --screenshot goldens/m1/rune-dark.png --size 1280x800 --scale 2 --theme dark
OPENCODEX_GATEWAY=http://127.0.0.1:4431 target/release/opencodex \
  --snap goldens/m1/rune-light.png --tree tree.json --size 1280x800 --scale 2 --theme light
target/release/opencodex --list-presets --theme dark
```

`--screenshot` aliases Rune's `--snap`. Rune also supplies `--tree`, `--script`, `--trace`,
`--chrome`, and `--first-pixels`. `--preset nord` (or any ID from `--list-presets`) selects a
palette; absent `--theme`, this M1 build uses dark. Screenshots fetch real gateway snapshots on
a worker before advancing Rune's virtual clock; failed requests fail capture rather than drawing
fabricated data. Native windows start network/preferences/images from `on_ready`, after the first frame.

## Implemented

- `crates/oc-gateway`: typed HTTP boundary, bounded incremental SSE framing, cancellable Tokio
  worker, latest-snapshot mailbox, incremental root-thread creation/rename/run/unread/pin/done
  reduction, project updates, and snapshot replacement on reconnect. Streaming token events do
  not publish sidebar state. Directory/project pages merge by ID; older pages load on demand.
- `src/theme`: web seed palettes and the exact rounded sRGB, contrast, gradient, alpha, and
  shadow derivation. **All 1,403 values across all 23 presets match the TypeScript source.**
  System SF Pro/SF Mono are discovered through Rune; no replacement UI font is bundled.
- `src/sidebar`: 300-point sidebar (200–480, reserving 360 for content), reset/keyboard resize,
  collapse, project disclosure, four-row expansion, pinned/Focus/Inactive grouping, native folder
  opening, selected/hover/unread/running states, and lazy Rune `virtual_rows`.
- `src/composer`: multiline Rune `TextEdit` with native IME, undo/redo, text/image/file paste,
  revision-safe session drafts, attachment chips/thumbnails, send/create/navigation and stop.
  Searchable virtualized model picker with provider icons, persisted thinking choices, permissions,
  slash commands, bounded fuzzy file mentions, and local/new-worktree/branch selection.
- `src/docks`: permission once/always/reject, question choices, custom/multiple answers,
  review/back/edit/dismiss and submission through existing gateway routes.
- `oc-gateway::prompt`: independent bounded worker for admission, worktree creation, mutations,
  attachment preparation and file indexing; HTTP/encoding never runs on the typing path.
- `src/profile`: worker-only preference reads/writes. No gateway/session snapshots are persisted.
- Canonical architecture JSON/PNG/text updated in `docs/architecture`.

## Validation

From `apps/rune`: `cargo test --workspace`, `cargo test --workspace --profile perf -- --nocapture`,
`cargo fmt --all -- --check`. From the root: `bun check`, `bun architecture:check`, and:

```sh
bun apps/rune/tools/theme-check.ts apps/rune/target/perf/opencodex
```

Four small tests cover token parity, event reduction, fragmented SSE, and the runtime boundary:
20,000 expanded threads mount only viewport/overscan rows, not 20,000 views.
Final validation passed root `bun check`, architecture freshness, both release/perf builds,
all four Rust tests and the isolated native worker create/rename smoke. The final paired
captures differ by 1.13/255 dark and 1.27/255 light mean RGB; warmed headless rendering
reported 57.0 ms median, **not native visible startup**. See `goldens/m1/README.md` for
sample counts, interval definitions and the presentation limitation.
`tools/assets.ts` regenerates the shared SVG icon bodies and wordmark; run `cargo fmt` afterwards.
`tools/theme-check.ts --write-seeds` refreshes preset data from the web source.

## Isolated reproduction

Never point these tests at the user's real OpenCode service or home directory. From the root:

```sh
bash apps/rune/tools/isolated.sh install
# Separate terminals, both launched from the repository root:
bash apps/rune/tools/isolated.sh opencode   # isolated HOME, service 4901
bash apps/rune/tools/isolated.sh gateway    # isolated HOME, gateway 4431
```

After `bun run build:web`, initialize a Git repository at `/tmp/ocr-m1/proj` with an initial
commit. `node apps/rune/tools/compare.mjs --seed` opens that folder through the real web UI,
creates three free-model replies through the gateway, and captures both themes. Rerun without
`--seed` for comparison captures. `tools/native-smoke.py` exercises the native process and live
create/rename updates; it distinguishes worker receipt from actual presented content. It needs
that fixture, the perf binary, and an unobstructed logged-in Mac for presentation numbers.

The larger web reference corpus and measured oracle are documented in `goldens/README.md` and
`goldens/SPEC.md`; the M1 paired comparison is in `goldens/m1/README.md`. PNGs remain local/ignored.
Stop only recorded fixture PIDs whose environment contains `/tmp/ocr-m1`, then delete that temp
directory. Closing Rune stops only its bundled gateway, never an explicit gateway or OpenCode.

## Composer validation and integration

`State::open_session(id: Option<String>)` is the shared bounded navigation path for sidebar,
home sends, parent links and history. It loads chat history and resets request docks without
discarding per-session drafts. `composer::area(s, width)` sits beneath the transcript viewport
inside the chat's workbench rail and replaces the input with pending question/permission docks.
Native subagent readers cannot send; side chats remain editable.

The merged app was verified with scripted headless Rune input against isolated OpenCode 4921 /
gateway 4451 in `/tmp/ocr-merge`, using `opencode/big-pickle`: home typing/send/navigation,
visible streamed text, completed reply, existing-chat follow-up, Stop during text generation,
thread/history navigation with a retained draft, and question option → review → submission →
resumed assistant reply. The temporary smoke harness was removed after validation. No redraw
loop was added. Eight reviewed 1280×800 (scale 2) captures are in the ignored
`goldens/merge/final-{home,mid-stream,after-reply,question}-{dark,light}-1280x800.png`.
Streaming captures render the live worker's actual reduced message state, not a fresh HTTP
snapshot, because OpenCode may not expose unfinished text through history until completion.
The composer and question dock occupy the web reference's centered bottom column inside its
44-point workbench rail; Stop is separate from Send while running. The question wait status
replaces the streaming caret. Comparison with `goldens/web` still shows native glyph/shadow,
Markdown spacing, and question radio/footer styling differences, not pixel-identical parity.

The temporary scripted Rune runtime smoke used `opencode/big-pickle` against isolated OpenCode
4912 / gateway 4442 in `/tmp/ocr-composer`. It verified home send/navigation, question option →
review → actual reply, existing-session send, model keyboard filtering, image paste/thumbnail,
text-attachment send into a new worktree, interrupt, and session draft preservation. The temporary
test was removed after passing; only draft-revision and fuzzy-parity tests were added permanently.
200 headless key-to-CPU-frame samples: p50 **0.137 ms**, p95 **0.153 ms**, max **0.207 ms**.
These exclude GPU presentation, OS keyboard delivery and IME candidate-window latency.

`tools/composer-compare.mjs` reproduces web/Rune PNGs at 1280×800 and 1600×1000 in both themes.
It requires the isolated seeded fixture (`sessions.json`, with its third session awaiting a question),
a built release binary, and a built web UI served by the gateway. Set `OCR_BASE`, `OCR_FIXTURE`,
`OCR_CAPTURE_VERSION` and optionally comma-separated `OCR_STATES`. Captures live in the ignored
`goldens/composer` folder. The original web PNG corpus was absent, so these are newly captured
real-gateway web counterparts. `python3 apps/rune/tools/composer-pairs.py` (Pillow required)
assembles side-by-side evidence as `pair-<state>-<theme>-<size>-v7.png`.
States: text, attachment, model, filtered, slash, mention, worktree, new-worktree,
question-selected, question-review. Web is left, Rune right.

Visual differences remain: Rune glyph antialiasing/shadows, attachment and mention icons,
slash/mention ordering and visible row count, filtered-menu height, question radio styling and
header/row spacing, and the new-worktree branch label. Those older branch captures predate the
integrated transcript/workbench rail and have a different dock center from the merged captures.
The web fixture collapses the second project while Rune expands it. These captures establish
close composer geometry, not pixel-identical whole-window parity.

## Remaining gaps / framework notes

### Chat transcript

Sidebar threads now open native transcripts; Back/Forward retains a bounded 64-entry route
history, not server snapshots. The shared gateway worker loads the latest 50 messages, pages
older history on demand, reduces native text/reasoning/tool events, and refreshes authoritative
history after reconnect. Immutable message identities and memoized, lazy virtual rows keep
finished turns out of streaming view work. Rune-kit's incremental Markdown parser reparses only
the unfinished tail; code fences intentionally stay monochrome to match the current web UI.
Work/answer grouping, interrupted turns, blank finished reasoning, independent thoughts/tool
disclosures, and the greater-than-30-step nested virtualization rule follow `timeline-model.ts`.
Images use gateway-checked local image routes or explicit image HTTP URLs, with decoding and
mips off-thread, a 16-image/64 MiB decoded session budget and a native preview modal.

```sh
OPENCODEX_GATEWAY=http://127.0.0.1:4441 target/release/opencodex \
  --session SESSION_ID --scroll top --at 1 --screenshot top.png --size 1280x800 --scale 2
# --scroll bottom (default), top, or middle; history captures page to the beginning.
# --work open, details, or thoughts expands work for deterministic inspection.
OPENCODEX_GATEWAY=http://127.0.0.1:4441 target/perf/opencodex \
  --profile-chat SESSION_ID --probe-ms 1500
```

`--profile-chat` profiles real HTTP/SSE and a headless CPU runtime, explicitly excluding GPU
upload and presentation. With `OPENCODEX_BENCH=1`, SIGUSR1 opens `OPENCODEX_BENCH_SESSION`.
After a presented frame with visible transcript rows, the app prints both `session_first_row`
and the older harness's `session_loaded`; `session_settled` follows a 500 ms quiet history,
row-count, and scroll-geometry interval. `reply_rendered` requires visible new assistant text
containing `BENCH-END`, never the user's prompt or old history. Covered windows do not emit
fabricated presentation markers.

`tools/isolated.sh` accepts `OPENCODEX_FIXTURE`, `OPENCODEX_FIXTURE_SERVICE_PORT`, and
`OPENCODEX_FIXTURE_GATEWAY_PORT` without changing its M1 defaults. `goldens/seed.ts` accepts
the fixture directory and gateway URL. `tools/chat-compare.mjs` captures both renderers from
the same real fixture (Markdown/long, top/middle/bottom, both appearances and sizes).

The transcript occupies the remaining bounded height above the composer or request dock.
`State::open_session` and
`State::chat.data` expose the selected session, native info, running state and errors;
`State::chat.read_only()` distinguishes native subagent readers from side chats. Workspace
rail entries now open native workbench panels; thread actions, full session
details and file-link workbench routing are not complete. Rune's built-in Markdown has different
paragraph/list spacing and numbered-marker baselines from the web, so these captures are not
pixel-identical. The structured diff reader lives in the native workbench; transcript
diff fences and tool outputs remain readable here.

- M4 owns Tasks, Apps, Settings, search/history menus, and embedded HTML surfaces; those
  navigation rows are visual shell entries only in M1.
- `/side` opens the native Side chat workspace panel;
  conversation `/undo` restores text but not the original attachment context.
- Mention search uses a prefetched bounded index instead of the web's debounced live search.
  It excludes `.git`, `node_modules`, and `target`, and can be stale until the project is reloaded.
- Project chooser uses a searchable native overlay. Custom
  project image URLs, per-project Focus exclusions, and full cross-project Focus pagination remain.
  First launch shows gateway projects; closing one is stored in this client's own profile.
- CLI and saved theme/preset/accent selection work; automatic OS-appearance switching
  is not wired yet. Model provider SVGs are decoded asynchronously and cached in memory.
- Glyph antialiasing and analytic shadow edges are close, not pixel-identical to Chromium; see
  paired metrics. Headless output has no OS traffic lights unless Rune's chrome diagnostics are
  requested. The paired web screenshots enable Electron's macOS titlebar CSS inset, without
  installing a fake preload or mocking API data.
- Rune's `dim` applies to existing descendants; it must follow `.child`. Borders affect layout
  only with `.border_layout()`. These were accounted for in matching the browser geometry.
- In this automation host, WindowServer did not expose an on-screen native window (also checked
  with CGWindowList), and Rune reported skipped frames once initial creation finished, on both
  Metal and wgpu. Headless GPU output works. Native visible-content startup/idle measurements
  therefore remain unverified here; no early bench marker or forced redraw loop masks this.

## Native pages handoff (rune-pages)

Implemented settings navigation, general/plugin controls, persisted appearance/font/notification
preferences, project instructions, usage limits, remote configuration/devices/pairing QR, and an
explicitly unavailable updater. Tasks support plugin setup, create/delete, complete/reopen and
agent start. Apps support list/detail, function invocation with empty arguments, run logs and
session links. Searchable project/thread overlays, thread/project action menus, native menu-bar
commands, shortcut routing, loaded-transcript find/highlights, copy toasts and offline retry are
wired. The page cache is disposable and bounded; gateway writes use the existing prompt worker.

Integration points:

- `src/apps/mod.rs::canvas_host` mounts the native canvas host described below.
- `src/shortcuts/mod.rs::execute` routes workspace/terminal commands to their owning integration.
- `src/notifications/mod.rs` uses `rune-notify`; macOS delivery requires an application bundle.
  Foreground, ancestry, mute and app-session exclusions are wired; actual banners were not verified.

This is not complete web parity. Remaining work includes task editing/filtering/reordering;
app settings/model/icon/code controls and argument forms; worktree removal/dialogs; global message
search; additional archive/export/menu actions; OS appearance and precise theme transitions;
spelling menus and full notification semantics. Find searches loaded transcript rows and navigates
rows rather than each occurrence. Thread search filters loaded titles. Some settings icons,
service-version/plugin-path text, button styling and page geometry still differ from the goldens.
The fixture's project/session names differ from the original web fixture.

Validation: release build and all nine existing workspace tests pass. Scripted theme switching,
shortcut navigation and typed thread filtering were captured. Headless captures fetch page data,
but do not exercise the normal mutation worker; end-to-end page mutations remain unverified.

Run `OCR_PAGES_VERSION=reviewed python3 tools/pages-compare.py` from `apps/rune` after a release
build with the isolated gateway on port 4481. It captures 68 states across dark/light and
1280×800/1600×1000, pairing available web goldens on the left with native output on the right.
Images are intentionally ignored and remain under `goldens/pages/`. Representative pairs:

- `pair-settings-general-dark-1280x800-reviewed.png`
- `pair-settings-shortcuts-light-1280x800-reviewed.png`
- `pair-apps-empty-light-1600x1000-reviewed.png`

Testing used only `/tmp/ocr-pages`, service port 4951 and gateway port 4481.

## Native workbench

`src/workbench` owns the 44-point rail, spring-sized inspector (340-point minimum,
820-point preferred width), keyboard/drag splitter, expanded mode, document tabs, lazy
directory listings and debounced gateway file search. The document surface supports
virtualized text, images, and revision-safe editing/saving through the gateway's existing
version-preconditioned PUT. Dirty buffers survive navigation and failed/conflicting saves.
The Changes surface uses Rune-kit's virtualized unified/split diff, word changes, syntax,
selection/copy, and a full-context request. Diff parsing, pairing, highlighting and image
decoding are worker tasks. File/diff GET responses are capped at 16 MiB; twelve documents
and 64 MiB retained data, 128 folders and 50,000 cached directory entries bound memory.
Filesystem/branch events invalidate workspace data; reconnect refreshes authoritative data.
Token events do not refetch files.

Subagents and Side chat panels list native sessions and read live projected conversations.
The compact side composer sends through the existing prompt route; `/side [question]`
creates a side fork and sends the optional question. Native side history excludes messages
predating the fork. Main-chat messages marked with `opencodexFromSideChat` link back to
the panel. The session popover reads context, checkout, changes, cost, MCP and skills.

Embedding hooks in `src/workbench/view.rs` are:

```rust,ignore
fn canvas_host(s: &State, cx: &mut rune::Cx<State>) -> rune::El
fn terminal_host(s: &State, cx: &mut rune::Cx<State>) -> rune::El
```

Their keyed, bounded slots now mount `oc-webview` and `oc-terminal`. The terminal hook
lives in the bottom drawer rather than consuming the side panel; both can be open together.

Headless capture accepts `--panel files|changes|subagents|side-chat|canvas|terminal` and
`--file PATH` to open a document (or a child session ID for a conversation reader).
`tools/workbench-compare.mjs` captures both renderers against the same isolated fixture,
both themes and sizes; use `OPENCODEX_FIXTURE`, `OPENCODEX_GATEWAY` and optional
`OCR_CAPTURE_VERSION`. Captures live in ignored `goldens/workbench`.

Two permanent tests cover captured-save acknowledgement/navigation retention and bounded
virtual scene sizes. A removed real-gateway scripted runtime smoke also verified rail/file
opening, safe writes, 409 conflict draft retention, side creation/send and diff opening.
Seven alternating `--profile perf` samples measured 5,000-file first CPU frames at
**2.523 ms median** (2.456–15.073), 2,000 changed source-line diff first CPU frames at
**44.942 ms** (41.932–54.971), and worker parsing/word pairing/highlighting at
**1.287 ms** (1.225–2.485). These synthetic headless CPU numbers exclude network,
GPU upload/presentation and OS input; the diff expands to 4,000 added/removed rows.

This is functional workbench coverage, not 1:1 completion: editing above 128 KiB remains
read-only; image zoom, rich media/Markdown previews, review comments, pinned/preview tab
semantics, per-session panel layouts, application discovery menus, full session-cost
aggregation, subagent tool-detail disclosures, side attachments/request docks/deletion,
and exact typography/controls/empty-state parity remain. The first diff frame still has
roughly 40 ms fixed overhead in Rune's layout/text path even for a tiny diff (view building
itself was measured below 0.1 ms); native presentation and its precise cause remain
unverified. No redraw loop, loading delay or optimistic performance marker hides this.

## Integrated native surfaces

- `src/terminal.rs`: the 280-point bottom drawer spans chat, inspector and rail. Cmd+J
  and the rail toggle it independently of the inspector. Gateway PTYs are listed per
  project, auto-created on an empty first opening, and explicitly closed by tab controls.
  The splitter supports drag and keyboard resize. Only the visible tab attaches a worker;
  hiding or switching tabs cancels the attachment, not the shell. Reopening replays the
  same PTY. Native keyboard, committed IME and token-derived colours reach `oc-terminal`.
- `src/native`: canvas lists/tabs and `apps::canvas_host` mount a WKWebView shell with the
  same `/api/canvas-runtime/frame.html` inside `sandbox="allow-scripts"`. Agent HTML is
  never loaded as a privileged gateway-origin page. Native message handling implements
  init/theme/data/reload/scroll, coalesced per-key CAS writes and conflict adoption,
  server function calls/results, task watch/mutations, running-function updates, errors,
  external URLs and session navigation. Canvas/source/data/app/task/PTY invalidations
  are separate counters on the existing SSE snapshot, not token-triggered blanket reads.
- The Browser rail entry has native tabs, address/search input, Back/Forward/Reload,
  popup-to-tab routing and Cmd+L focus handoff. Guests never receive `ocHost`. Chat links
  to local HTTP servers open beside the chat; other HTTP(S) links and Cmd/Ctrl-clicks
  open the system browser. `canvas:` links open the Canvas tab. Known native menus,
  composer menus, session popovers, image previews and icon tooltips cover web surfaces
  with `set_covered(true)` until dismissed.

`--panel` now applies to normal launches too. `OPENCODEX_CANVAS=<id>` opens a canvas;
`OPENCODEX_BROWSER_URL=<http(s) URL>` opens a browser tab. For headless captures,
`OPENCODEX_TERMINAL_OPEN=1 --panel files --file README.md` shows the drawer and inspector
together. `OPENCODEX_TERMINAL_CAPTURE_COMMAND` optionally sends a real shell command
before the screenshot clock starts. Capture failures exit nonzero.

### Integration verification

Used only `/tmp/ocr-int`, OpenCode 4971 and gateway 4501, seeded with `goldens/seed.ts`.
A gateway-created canvas called a real `server.ts` function through the native bridge,
rendered `BRIDGE-OK: Rune`, and saved its result through the gateway CAS route in both
themes. Offscreen WK snapshots and explicit coverage assertions passed. A temporary
source edit also reloaded the live frame through scoped SSE invalidation and saved its
new result; the Apps page's own host passed the same bridge/CAS check independently.
All required checks pass: release workspace build, all 14 Rust tests, `bun check`,
`bun format:check`, and `bun architecture:check`.
A temporary real-gateway Rune runtime smoke verified terminal list/create/close, committed IME,
hide/reopen retention and detachment of hidden/background tabs. Browser checks verified
HTTP loading, no privileged bridge, Back/Forward/Reload and new-window tab routing.
The finite smoke drivers were removed; no production timer or forced redraw was added.
Only processes with the fixture path in their actual environment were stopped; the
temporary fixture directory was deleted after verification.

Reviewed 1280×800 (scale 2) screenshots live in ignored `goldens/integration/`:

- `terminal-{dark,light}-1280x800-final.png`
- `canvas-{dark,light}-1280x800-composite.png`
- `browser-{dark,light}-1280x800-composite.png`
- `review-pair-{terminal,canvas}-{dark,light}-final.png` (web oracle left)

Headless Rune cannot capture native children. The composites place real WK `takeSnapshot`
PNGs at their measured native rects (canvas 576,40,660,760; browser 576,112,660,688).
They prove content and geometry, not atomic native/GPU presentation. Browser headless
chrome shows an initial tab label, not the native page's asynchronously fetched title.
The seeded conversation/sidebar differs from the old oracle; these are visual reviews,
not valid pixel-identical scores. Terminal drawer geometry matches the oracle's bottom
layout; tab buttons, icons, typography and existing inspector/chat styling still differ.

### Remaining integration gaps

Browser/canvas annotation overlays are not implemented. Browser local-HTML file routing,
persistent/shared browser profiles, downloads and browser-specific context menus remain;
WK stores are deliberately per-surface and nonpersistent. Browser/canvas tab layouts are
not persisted per chat, and canvas-list deletion controls are absent. App canvases use
the existing page's fixed-height host rather than the web's full app-page layout. Task
bridge operations compile but were not exercised end to end; task Start currently uses
the gateway default model rather than the web client's project-model preference. Canvas
function execution limits remain server-owned, as in the web host. Native visible GPU
presentation/IME candidate windows were not verified on this locked/offscreen host.
The crate's documented native-slot transaction and hidden-JavaScript limitations remain.
