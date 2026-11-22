# OpenCodex Rune — chat and composer

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

No default port, service discovery, bundled gateway, or service shutdown is hidden in the Rust app.
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
directory. Closing Rune never stops the gateway or OpenCode.

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
rail entries remain visual shell slots, not implemented panels; thread actions, full session
details and file-link workbench routing are not complete. Rune's built-in Markdown has different
paragraph/list spacing and numbered-marker baselines from the web, so these captures are not
pixel-identical. A structured standalone diff editor is still a workspace feature; transcript
diff fences and tool outputs are readable here.

- M4 owns Tasks, Apps, Settings, search/history menus, and embedded HTML surfaces; those
  navigation rows are visual shell entries only in M1.
- `/side` opens the native side session as a regular chat;
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

- `src/apps/mod.rs::canvas_host` is the WKWebView embedding hook (currently a loading placeholder).
- `src/shortcuts/mod.rs::execute` leaves workspace/terminal commands to their owning integration.
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
