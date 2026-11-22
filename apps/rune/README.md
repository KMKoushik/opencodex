# OpenCodex Rune — milestone 2 composer

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
signals and markers belong to M2.

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

`State::open_session(id: String)` is the shared navigation hook for the transcript integration.
Mount `composer::area(s, width)` beneath the transcript scroll viewport; it replaces the input
with a pending question/permission dock. The existing `composer::view` provides the home screen
and a temporary empty transcript area for this independent branch.

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
header/row spacing, and the new-worktree branch label. The question captures also show the
web transcript/workbench rail, which is outside this branch; this shifts its centered dock.
The web fixture collapses the second project while Rune expands it. These captures establish
close composer geometry, not pixel-identical whole-window parity.

## Remaining gaps / framework notes

- The transcript is developed separately. Tasks, Apps, Settings, search/history menus and embedded
  HTML surfaces remain shell entries. `/side` opens the native side session as a regular chat;
  conversation `/undo` restores text but not the original attachment context.
- Mention search uses a prefetched bounded index instead of the web's debounced live search.
  It excludes `.git`, `node_modules`, and `target`, and can be stale until the project is reloaded.
- Project chooser currently uses Rune's native popup, not the web's searchable popover. Custom
  project image URLs, per-project Focus exclusions, and full cross-project Focus pagination remain.
  First launch shows gateway projects; closing one is stored in this client's own profile.
- CLI theme/preset selection works; saved theme selection and automatic OS-appearance switching
  are not wired yet. Model provider SVGs are decoded asynchronously and cached in memory.
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
