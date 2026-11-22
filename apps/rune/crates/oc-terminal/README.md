# oc-terminal

A standalone Rune terminal viewport. The application still owns its drawer, tabs,
toolbar and terminal list. No application `main.rs` changes are needed to build the demo.

## Embedding

Add `oc-terminal = { path = "crates/oc-terminal" }` to the host, then:

```rust,ignore
// State construction. Pass the host's already-derived semantic tokens.
let terminal = TerminalView::new(Palette::from_tokens(|name| theme.c(name)));

// From on_ready, after the first frame; `wake` is Rune's Waker.
terminal.attach(Worker::start(
    gateway.clone(), directory, Some(terminal_id),
    Size { cols: 80, rows: 24 }, move || wake(),
));

// View: give each mounted terminal a distinct stable key.
terminal.element("workbench-terminal", cx, |state| &mut state.terminal)

// AppSpec::poll: return true only if this or another visible feature changed.
let changed = state.terminal.poll_tx(clock, tx);
if changed { tx.instant(); }

// App::on_ime: route only while this terminal owns keyboard focus.
state.terminal.ime(ime)
```

Use `set_focused` for host focus changes between panes. Window focus is handled by
the element. `set_palette` updates both rendering and OSC colour-query responses.
Configure the host's mono family as `Menlo, Consolas, monospace`; cells use Menlo's
13-point advance (7.826172 points), and a 16-point line height. Give the viewport a
bounded height. The web's surrounding margin is 4px 10px 10px; its toolbar padding
is 8px 12px and its header is 40px. Those belong to the host, not this element.

`Gateway::{terminals,create_terminal,resize_terminal,close_terminal}` are async and
belong on the host's existing background runtime. `None` as Worker terminal ID
creates a terminal; using an explicit ID lets the tab owner retain its identity.
Dropping Worker detaches and cancels its thread task; only `close_terminal` ends
the shell. Title, selection, bell count and status/error are in `terminal.frame`.
User-input queue errors are in `terminal.error`. The viewport also shows errors.

The viewport handles keyboard input, primary/middle selection or TUI mouse input,
right-click reports, wheel/trackpad momentum, word/line selection on double/triple
click, copy, bracketed paste and committed IME. Copy is explicit; selecting never
writes the clipboard. Cmd-click opens OSC 8 or detected HTTP(S) links through Rune.
The default cursor is steady, matching the current Ghostty web client. Optional
`terminal.blink(true)` blinks during activity, settles after two seconds, and stops
when unfocused. Bell is a short visual outline, with no idle timer.

## Ownership and performance

Alacritty 0.26 was chosen over vt100 for its production terminal model: native
scrollback/reflow, selection semantics, synchronized updates, OSC 8 and mouse modes.
This is a correctness choice, not a claimed benchmark win against vt100.

One background thread owns the emulator and a single-thread Tokio runtime. HTTP,
WebSocket, UTF-8 parsing, grid snapshots and reflow run there. It reads only the
gateway `/api`; no OpenCode endpoint, credential or ticket reaches the client.
The WebSocket has the gateway Origin, binary NUL-prefixed replay metadata and a
UTF-16 cursor. Replies to replayed queries are suppressed. Text input is chunked
at UTF-8 boundaries below 16 KiB, with a 1 MiB pending-input bound. Socket messages
are bounded at 4 MiB. Scrollback is 5,000 lines. Resize requests coalesce for 100ms.

Output is published at most once per 8ms to a capacity-one latest-frame mailbox;
only an empty-to-full transition wakes Rune. An idle worker has no recurring timer.
Snapshots reuse unchanged rows, and `rune::memo` retains each clean row's elements
and shaping. Only visible cells are mounted. Empty default-background cells emit
no elements. Text uses Rune's normal glyph atlas; no bitmap terminal texture or
browser surface is involved. Wide characters occupy two cells, with zero-width
marks shaped with the base character.

## Demo and checks

```sh
cd apps/rune
OPENCODEX_GATEWAY=http://127.0.0.1:4461 OPENCODEX_DIRECTORY=/project \
  cargo run --release -p oc-terminal --example term

# A real gateway capture, completed before Rune starts its headless clock:
OPENCODEX_GATEWAY=http://127.0.0.1:4461 OPENCODEX_DIRECTORY=/project \
  OPENCODEX_TERMINAL_CAPTURE_COMMAND='ls --color=always' \
  target/release/examples/term --snap terminal.png --size 800x384 --scale 2

cargo build --profile perf -p oc-terminal --examples
target/perf/examples/term --bench
OPENCODEX_GATEWAY=http://127.0.0.1:4461 OPENCODEX_DIRECTORY=/project \
  target/perf/examples/probe
cargo test -p oc-terminal --lib
```

`OPENCODEX_TERMINAL_ID` attaches the demo to an existing terminal;
`OPENCODEX_THEME=light` chooses light token derivation. Screenshot captures create
real persistent PTYs unless an ID is provided; close those through the gateway.
Use PLAN.md's isolated environment recipe for all service tests.

Measured on Apple silicon with `--profile perf`: 100k lines (688,895 bytes), median
91.46 MB/s parser + snapshots over five runs (87.36–99.28 MB/s), 43 snapshots per
run. The live isolated PTY processed 689,111 bytes in 0.3398s (2.03 MB/s), publishing
33 snapshots. Ten seconds idle consumed 0.000077s process CPU (~0.0008%) and
published zero frames. These numbers exclude GPU presentation. Headless GPU first
frames ranged from 1.79ms (seq) to 12.39ms (cold font-rich colour sample); they are
not sustained native-window FPS measurements.

## Remaining limitations

- Fixed Menlo cell metrics; another host mono font needs measured cell metrics.
- Native trackpad momentum is forwarded; no synthetic wheel-fling animation.
- No selection auto-scroll beyond the viewport, right-button drag reporting,
  wrapped-line URL discovery, terminal search, or screen-reader terminal model.
- Double/curly/dotted underlines render as a single underline; a wide block cursor
  currently paints one cell. OSC 52 clipboard requests are not executed.
- No Kitty graphics/keyboard or sixel protocol. ANSI 256 colours, truecolor,
  alternate screens, cursor modes and ordinary xterm input are supported.
- The requested web terminal PNG goldens were absent from the worktree; visual
  review used real PTY screenshots, without claiming a pixel-diff parity score.

The app-side architecture and canonical app diagram are unchanged: this crate is
not yet mounted by the application. Integration should add it to that diagram.
