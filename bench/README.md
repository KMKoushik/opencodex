# OpenCodex Rune / Electron performance bench

**Run only against an isolated fixture.** The harness refuses the user's normal HOME and any
explicit gateway/OpenCode URL. Both builds use their own gateway: Rune's compiled sidecar;
Electron's gateway bundled inside its main process. The bench only discovers an already-running
isolated OpenCode service, forks its source session, and deletes that fork after the run.

```sh
# From the repository root. Run service setup in a separate terminal.
OPENCODEX_FIXTURE=/tmp/ocr-pkg bash apps/rune/tools/isolated.sh install
OPENCODEX_FIXTURE=/tmp/ocr-pkg OPENCODEX_FIXTURE_SERVICE_PORT=4981 \
  bash apps/rune/tools/isolated.sh opencode

# In the benchmark terminal; create/seed a long session in this isolated project first.
export HOME=/tmp/ocr-pkg/home
export XDG_CONFIG_HOME=$HOME/.config XDG_DATA_HOME=$HOME/.local/share
export XDG_STATE_HOME=$HOME/.local/state XDG_CACHE_HOME=$HOME/.cache
export PATH=/tmp/ocr-pkg/pkg/node_modules/.bin:$PATH
unset OPENCODEX_GATEWAY OPENCODE_URL
bun bench/bench.ts --app 'apps/rune/dist/OpenCodex Rune.app' --driver marker \
  --name rune --project /tmp/ocr-pkg/proj
bun bench/bench.ts --app apps/desktop/release/mac-arm64/OpenCodex.app --driver cdp \
  --name electron --project /tmp/ocr-pkg/proj
# Locked-screen-safe subset: no session required, no prompt or window/frame measurements.
bun bench/bench.ts --app 'apps/rune/dist/OpenCodex Rune.app' --driver marker \
  --headless-safe --runs 1 --idle-ms 5000 --name rune-headless-safe
```

Build outside the isolated shell (so Cargo/Bun retain their normal build caches):
`bash apps/rune/tools/bundle.sh`, optionally `--identity 'Developer ID Application: …'`.
Electron build commands below package this checkout. Record `git rev-parse HEAD` with results;
alternate the two apps on the same commit and fixture. Never start a separate benchmark gateway.
Afterward terminate only recorded fixture processes whose environment contains `/tmp/ocr-pkg`,
then remove that fixture directory. The harness never stops OpenCode itself.

Measures one OpenCodex build end to end on macOS: startup, memory, idle CPU, opening a long session, and streaming a real reply. It's meant for comparing the Electron app with the native rewrite.

```sh
# Electron: build, package (unsigned), ad-hoc sign, then bench the .app
bun install && bun run build
(cd apps/desktop && CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --config electron-builder.yml --dir)
codesign --force --deep --sign - --timestamp=none apps/desktop/release/mac-arm64/OpenCodex.app
bun bench/bench.ts --app apps/desktop/release/mac-arm64/OpenCodex.app --name electron-baseline \
  --project /path/to/project-with-long-sessions

# Native: single binary (dev fallback requires bun run gateway:compile)
bun bench/bench.ts --app apps/rune/target/release/opencodex --name native --driver marker \
  --project /path/to/project-with-long-sessions
```

Options: `--runs N` (default 3), `--idle-ms` (default 30000), `--source-session <id>` (instead of picking the longest session in `--project`), `--model provider/id` (default `opencode/big-pickle`, which is free), `--skip-stream`, `--out file`.

Requirements:

- A running OpenCode 2.x service. The bench finds it with the official client's `Service.discover`, the same way the app does. It never starts or stops that service.
- `swiftc`, which compiles `lib/winwatch.swift` into `bench/.build/`.

Memory/CPU/window observation needs no Screen Recording or Accessibility permission.
Native scroll/typing injection requires Accessibility permission for the benchmark terminal;
the Swift driver fails explicitly if permission is absent. Electron uses CDP input events.
The screen must be unlocked and the app unobstructed on the current Space. The harness checks
the console lock and refuses if no app window becomes visible. `--headless-safe` omits all
presentation-dependent measurements and clearly labels its output. A full-screen Space can
hide a window even on an unlocked console; move the app to the visible Space and rerun.

## Frame pacing and typing

After opening the transcript, the harness injects 240 wheel events, then focuses the composer
and types 30 `a` keys without submitting. Each phase reports sample count, p50/p95/p99/max frame
intervals and key-to-next-frame latency; streaming collects a separate frame series. Native
`OPENCODEX_BENCH_FRAMES=1` reports Rune update+encode CPU time and display-link target/start
intervals. Chromium reports rAF deltas and keydown-to-rAF callback time. Neither API provides
hardware scanout timestamps: these are **software presentation proxies**, not photon latency.
Idle gaps are included within each measured phase; no redraw loop is added to Rune. Covered
Rune windows emit no fake frames. Missing scroll/input samples fail the run.

Native markers go to `OPENCODEX_BENCH_LOG` through a bounded background queue as well as stderr;
LaunchServices stdout is kept separately. `gateway_ready`, `gateway_connected`, `sidebar_loaded`
are non-presentation milestones; `first_content`, `session_loaded`, `session_settled`, and
`reply_rendered` remain frame-dependent. Diagnostic queue saturation can drop samples, so retain
sample counts and do not treat them as a continuous hardware trace.

## What one invocation does

1. **Pick a session.** Finds the top-level session in `--project` with the most stored message data. Forks it with `session.fork` as `opencodex-bench <timestamp>` so the original is never touched. The fork is deleted at the end, even when a run fails.
2. **Isolate the profile.** Creates a temporary profile directory. Electron gets it as `--user-data-dir` (plus `--remote-debugging-port`); other builds get it as `OPENCODEX_DATA_DIR`. For Electron, it is seeded with `preferences.json` selecting the session's project.
3. **Warm up.** Launch 0 primes the fresh profile and the OS file cache. It is recorded as `warmup` and excluded from medians. Then N measured runs follow, each as a fresh process.
4. **Wait for a quiet machine.** Before each launch, waits up to 3 minutes until no `rustc`/`cargo`/`clang`/`swift-frontend` processes are running and the 1-minute load average is below cores/3. Each run records `background` (load, compiler count, wait time).
5. **Measure each run:**
   - **Startup:**
     - `t0` is taken immediately before `open -n -a App.app` (the LaunchServices path a Dock launch takes), or before exec for a bare binary.
     - `windowVisibleMs`: a normal-layer, on-screen window of at least 200x200 appears for the exact executable path. Detected by `winwatch`, which polls `CGWindowListCopyWindowInfo` every 5 ms.
     - `firstMeaningfulContentMs`: the sidebar's session rows (data fetched from OpenCode) are in the DOM and two animation frames have passed.
     - `firstMeaningfulContentVisibleMs`: max(window visible, content painted). Electron paints while hidden and shows the window on `ready-to-show`.
     - `firstContentfulPaintMs`: Chromium's FCP. Electron only.
   - **Idle:** at `t0`+10 s, takes RSS and phys_footprint for every process in the app's tree. Then measures average CPU over `--idle-ms`.
   - **Long session:**
     - `openMs`: time from clicking the session row to the first painted timeline row.
     - `settledMs`: when the timeline row count and the scroll container height stopped changing for 500 ms.
     - Then waits 10 s, takes memory, and measures 10 s of CPU.
   - **Streaming:**
     - Switches the fork to `--model` and sends a fixed prompt through the OpenCode API: about 900 words of markdown with headings, a list, a table, and Rust code, ending with `BENCH-END`.
     - The app receives it through its own event stream, as in normal use.
     - Samples every 1 s (footprint every 3 s) until `session.wait` resolves.
     - Reports duration, output tokens, average and peak CPU, peak RSS and footprint, and the OpenCode server's CPU (reported separately; not part of the app).
     - `uiRenderedReply` confirms the reply text was actually rendered.
   - **After streaming:** memory again 5 s after the reply ends.
6. **Quit.** Sends SIGTERM to the app's main process. If anything from this launch is still alive after 10 s, sends SIGKILL to those PIDs only. `quitModes` records which happened.
7. **Size.** Records on-disk size of the `.app` (or binary), with a Frameworks / `app.asar` / executable breakdown and file count.

## Accounting rules

- **Process membership:**
  - The root PID of this launch, plus its descendants.
  - For bundles, any process whose command starts with this exact bundle path (catches reparented helpers).
  - Never by process name. A dev build running elsewhere with identical helper names is not counted.
- **Memory:**
  - RSS is from `ps`; it double-counts shared pages across processes.
  - `footprintMB` is the `footprint(1)` total for the same PIDs (phys_footprint, Activity Monitor's "Memory" column). Prefer footprint for comparisons.
- **CPU:** cumulative CPU-time deltas from `ps` over wall time. 100% = one core. Processes that start and exit inside a window are missed.
- **OpenCode server:** external and shared, so it is not included in app totals. The production Electron gateway runs inside the Electron main process, so it is included there.

## Contract for the native binary (`--driver marker`)

The bench launches a bundle through `open -n -a` or a binary directly, with these variables:

| Variable                   | Meaning                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `OPENCODEX_BENCH=1`        | Bench mode is on.                                              |
| `OPENCODEX_DATA_DIR`       | Use this directory for preferences and caches.                 |
| `OPENCODEX_BENCH_PROJECT`  | Select this project directory at startup.                      |
| `OPENCODEX_BENCH_SESSION`  | The session to open on SIGUSR1.                                |
| `OPENCODEX_BENCH_LOG`      | Marker and frame log file (also works through LaunchServices). |
| `OPENCODEX_BENCH_FRAMES=1` | Record drawn-frame CPU time and intervals.                     |

When `OPENCODEX_BENCH=1`, the app should print these lines to stdout or stderr, with `unix_ms` being wall-clock milliseconds after the frame is presented:

- `OPENCODEX_BENCH first_content <unix_ms>` when the sidebar session rows from OpenCode are first presented.
- On SIGUSR1, open `OPENCODEX_BENCH_SESSION`, then print:
  - `OPENCODEX_BENCH session_loaded <unix_ms>` when the first messages are presented.
  - `OPENCODEX_BENCH session_settled <unix_ms>` (optional) when the initial history has finished loading and laying out.

Window visibility, memory, CPU, streaming, and size need nothing from the app. `--driver none` measures only those.

## Caveats

- **Cold start is warm-cache.** `sudo purge` is not run. Launch 0 is the closest to a first launch.
- **Content milestones aren't measured the same way.** Electron's come from DevTools polling, which adds a few ms of latency. Native's come from self-reported markers. Electron runs with `--remote-debugging-port`, which adds a small DevTools server.
- **Streaming numbers depend on the free model.** Duration and token pacing vary between runs. Normalise by `outputTokens` when comparing.
- **The shared OpenCode service and other clients can add background events.**
- **Occluded windows are throttled.** The app must stay unobstructed. Electron retains the old
  harness's background-throttling flags; Rune deliberately does not force hidden redraws.
  Covered-window results are not comparable, regardless of those Chromium flags.
- **Only part of the history is rendered.** The Electron UI loads the latest 50 messages of a long session (the gateway page size). The full history stays in OpenCode.
