# OpenCodex desktop in Rune

Goal: the OpenCodex desktop app rebuilt with [Rune](https://github.com/anomalyco/rune) (Rust, GPU-rendered,
120 Hz), matching the Electron app (`apps/web` + `apps/desktop`) 1:1 in look and behaviour, and measurably faster.

## Architecture

- `apps/rune` is a standalone Cargo workspace (own `Cargo.lock`, `target/` gitignored). It pins one `dev` rev
  of Rune (`rune`, `rune-kit`, and `themes/opencode` only if useful), the way `anomalyco/clip` does.
- **The TypeScript gateway stays the only backend.** The Rune app is a native client of the gateway's
  relative `/api` (HTTP + the `/api/events` stream), exactly like `apps/ios` and `apps/web`. It never talks to
  OpenCode directly and never reimplements gateway behaviour (canvases, apps, tasks, side chats, remote access,
  push, plugins all keep working because the gateway owns them).
  - Development: `OPENCODEX_GATEWAY=http://127.0.0.1:<port>` points the app at a running gateway.
  - Packaged: the app bundles the gateway (compiled with `bun build --compile`) and spawns it on a free
    loopback port, then closes it on quit. Closing the app never stops OpenCode.
- Native host features that Electron main provides through preload (open in app, reveal file, updates,
  notifications, browser panel, canvas pages, window capture) are implemented in Rust. HTML surfaces (canvas
  pages, browser panel, previews) use a WKWebView embedded as a native child view positioned by Rune layout.
- Reference sources (read only):
  - Rune: `~/git/personal/rune-src/rune` (read `AGENTS.md`, `README.md`, `crates/rune/README.md`,
    `crates/rune-kit/README.md`, `examples/hello`, `examples/settings`, `examples/kit-gallery`,
    `themes/opencode`). `rune-kit` already has OpenCode Desktop's markdown, syntax highlighting, diffs, tab
    strips, tree, spinner, scroll bars, tooltips, focus rings.
  - Earlier GPUI port (older `main`, own Rust gateway, do not copy its architecture):
    `~/git/personal/opencodex-gpui/native`. Its `oc-client/src/types.rs`, `sse.rs` and the
    `bench/` harness are reusable.
  - iPhone client: `apps/ios/OpenCodex/Core/GatewayClient.swift`, `Events.swift`, `Messages.swift`,
    `Models.swift` are the clearest spec of the `/api` surface a native client uses.

## Matching the Electron app 1:1

- The source of truth for every screen is the web UI in `apps/web/src` (components, `styles/tokens.css`,
  `features/theme/presets.ts` + `theme.ts` for colours). Port sizes, spacing, radii, font sizes/weights,
  colours (derive tokens the same way `theme.ts` does, for every preset, dark and light), icons, hover/press
  states, animations and keyboard shortcuts.
- Goldens: `apps/rune/goldens/web/*.png` are Playwright screenshots of the web UI at fixed window sizes
  against a seeded isolated gateway. Rune renders the same screens headlessly to
  `apps/rune/goldens/rune/*.png`; compare side by side and fix differences.
- Fonts: the web UI uses the system font stack (SF Pro on macOS) and its mono stack; use the same faces.

## Rules

- Never touch the user's OpenCode service (`127.0.0.1:49374`, `~/.local/share/opencode`). Test against an
  isolated OpenCode + gateway with temporary HOME/XDG directories (recipe below).
- Performance is a requirement: follow Rune's "Launching fast" and Performance rules (`on_ready` for slow
  work, `poll` true only on visible change, `virtual_rows` for long lists, no file I/O on the UI thread,
  idle window draws nothing). Keep network and decoding off the UI thread.
- Keep Rust files under ~800 lines, folders shaped by capability (`chat/`, `sidebar/`, `composer/`,
  `settings/`, `workbench/`, `gateway/`, `theme/`).
- Minimal tests: only for meaningful logic (event reduction, token derivation). No placeholder tests.
- Commit small, focused commits on branch `rune-port` in `~/git/personal/opencodex-rune`. Stage only your
  own files (never `git add -A`). Never commit in `~/git/personal/opencodex` (the main checkout).

## Isolated test environment

```sh
T=/tmp/ocr-<name>; mkdir -p $T/home $T/pkg $T/proj
cat > $T/env.sh <<EOF
export HOME=$T/home XDG_CONFIG_HOME=$T/home/.config XDG_DATA_HOME=$T/home/.local/share \
  XDG_STATE_HOME=$T/home/.local/state XDG_CACHE_HOME=$T/home/.cache
export PATH=$T/pkg/node_modules/.bin:\$PATH
[ "\$HOME" = "$T/home" ] || exit 1
EOF
(cd $T/pkg && npm i --silent @opencode/cli@latest)
. $T/env.sh && opencode service set port <oc-port> && opencode serve --service &   # OpenCode
. $T/env.sh && cd packages/gateway && PORT=<gw-port> node --import tsx src/cli.ts --production &  # gateway
curl -X POST http://127.0.0.1:<gw-port>/api/connection
```

The free model `{"providerID":"opencode","id":"big-pickle"}` works with no account and emits reasoning.
Kill only processes whose environment contains your temp path. Delete the temp directory afterwards.

## State of the port

- M1 is done: `apps/rune` (binary `opencodex`, crate `crates/oc-gateway`), theme tokens exact (1,403 values),
  sidebar + home + composer shell matching `goldens/web` within ~1.2/255 mean RGB. See `apps/rune/README.md`
  for running, `--screenshot`, `tools/isolated.sh` and `tools/compare.mjs`.
- Goldens: `apps/rune/goldens/web/*.png` (69 states x dark/light x 1280x800/1600x1000, scale 2),
  `goldens/SPEC.md` + `computed.json` (measured CSS), `goldens/seed.ts` + `capture.ts` to recreate data.
- Packaged gateway: `bun run gateway:compile` -> `packages/gateway/dist/opencodex-gateway`; launch with
  `--port 0 --parent-stdin`, read `OPENCODEX_GATEWAY_READY {"url":...}` from stdout (see
  `packages/gateway/README.md`).
- The user's Mac may be locked or showing a full-screen app, so native windows can be off screen and Rune
  skips drawing them. Verify with headless screenshots; do not add redraw loops to work around it.

## Milestones

1. Scaffold, gateway client + events, theme tokens, app shell (titlebar, sidebar with real projects and
   threads, home screen), headless screenshot tool, bench markers.
2. Chat: transcript (markdown, code, tool rows, activity/thoughts, diffs, images), streaming, composer
   (attachments, model/agent pickers, stop), questions and permissions.
3. Side panel and workbench (changes/diff, files, terminal), find, shortcuts, command palette.
4. Settings, tasks, apps, canvases (WKWebView), browser panel, side chats, subagents, worktrees, notifications,
   updates, remote access.
5. Packaging (bundled gateway, .app, signing), benchmark vs Electron, video.
