# Gateway executable

Build on macOS with Bun 1.3.13 or newer:

```sh
bun run gateway:compile
# Optional Intel build:
bun run gateway:compile --target bun-darwin-x64
```

Output: `packages/gateway/dist/opencodex-gateway`. The executable includes Bun,
the gateway, TypeScript, the canvas frame/runtime, server SDK/types, and all three
OpenCode plugins. No checkout, Node, Bun installation, or `node_modules` is needed
at runtime. The build applies an ad-hoc macOS signature; release packaging must
sign the executable with the app's signing identity before signing the outer app.

## Native parent launch contract

Spawn an absolute executable path, with a **piped stdin retained by the parent**:

```sh
/absolute/path/opencodex-gateway --port 0 --parent-stdin
```

- `--port <0..65535>` overrides `PORT` (default `4310`). Zero selects a free port.
  The listener always binds `127.0.0.1`; it never binds all interfaces.
- Once listening, stdout emits exactly one readiness record, terminated by LF:
  `OPENCODEX_GATEWAY_READY {"url":"http://127.0.0.1:53211"}`.
  Parse this prefix and JSON, rather than assuming a port or startup duration.
  Readiness means the gateway is listening, not that OpenCode is connected. Use
  `POST /api/connection` to start/reuse the local service, then `/api/events` for SSE.
- `--parent-stdin` exits gracefully on stdin EOF, close, or error. Keep the write
  end open for the parent's lifetime; closing it, including on parent crash,
  terminates the sidecar. Do not pass `/dev/null` with this flag. It is opt-in so
  existing standalone/dev invocations can run with detached stdin.
- SIGTERM and SIGINT also shut down gracefully. Exit is zero on success, one on
  shutdown failure or the 10-second shutdown deadline. Startup errors exit nonzero
  without a READY record. Drain stdout and stderr to avoid blocking the child.
- Shutdown aborts event streams, closes gateway sockets, stops canvas child
  processes and the owned tunnel connector, and unregisters the gateway. It
  **never stops the shared OpenCode service** or deletes its sessions/terminals.
- `--assets /absolute/web/dist` optionally serves a separately shipped web build,
  including to remote browsers. Native API clients do not need web assets.
  Source-mode `--production` still selects `apps/web/dist`; the compiled binary
  has no implicit web-assets location (use `--assets`).
- `--canvas-host` is an internal IPC child mode, not a public launch option.

### Environment and persistence

Set environment variables before spawning (paths are resolved when modules load):

- `HOME`: canvas folders, gateway discovery registrations, remote/push settings,
  app runs, and project instructions live under `$HOME/.opencodex`.
- `XDG_CONFIG_HOME`: OpenCode configuration and installed plugins, default
  `$HOME/.config`; plugins live in `opencode/plugins` below it.
- `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`: OpenCode's existing service
  discovery, databases, state, and caches; preserve these for the user's service.
  To isolate a test, set HOME **and all four XDG variables** to temporary paths.
- `PATH`: include the user's OpenCode 2.x CLI and tools used by canvas `sh` calls.
  Finder-launched native hosts must supply their resolved login-shell environment.
- `OPENCODE_URL`: explicit HTTP(S) endpoint instead of local service discovery;
  optional `OPENCODE_USERNAME` (default `opencode`) and `OPENCODE_PASSWORD` provide
  Basic authentication. Explicit endpoints retain the existing remote-backend
  restrictions on local plugins, files, message search, and usage credentials.

No new data directory or duplicate backend state is introduced. In particular,
the Rune UI's `OPENCODEX_DATA_DIR` is not a gateway setting.

## Runtime boundaries

- Canvas `server.ts` functions re-execute this executable in IPC child mode; no
  external JS runtime is used. Each child uses the existing SDK/module loader.
- Message search stays off the main thread. Bun uses its built-in SQLite with
  read-only databases and busy timeouts; Node/Electron retain `node:sqlite`.
- Terminals are OpenCode-owned PTYs, forwarded over HTTP/WebSocket. The gateway
  has no native PTY addon to ship.
- Remote access and push retain their existing configuration and dependencies:
  `cloudflared` must be installed on PATH (or in `/opt/homebrew/bin` or
  `/usr/local/bin`) for managed tunnels; externally managed tunnels also work.
  APNs requires the user's configured signing key and credentials. The executable
  does not contain tunnel credentials, APNs keys, Chrome, or OpenCode itself.
- Canvas screenshot checks use the same optional Playwright/installed-Chrome
  fallback as a standalone gateway. A bare binary has no Playwright package, so
  screenshots are unavailable and checks report that limitation; canvas pages,
  SDK type checking, and app execution still work. Electron keeps its injected
  renderer. Native host updates likewise need a host integration; the CLI does
  not provide Electron's in-process updater.

## Verification (macOS arm64, Bun 1.3.13)

The signed binary is **75,294,672 bytes (71.8 MiB)**. A fresh relocated process
reached READY in **628 ms** (592–816 ms across local runs; filesystem caches were
not purged). Tested from `/tmp/ocr-gw/bin`, with isolated HOME/XDG directories and
OpenCode 2.3.2 on port 4903: connection/session creation, a successful free
`opencode/big-pickle` reply and SSE deltas, terminal creation/removal, installation
of all three embedded plugins, canvas creation/type checking and a child function
using `data.update` plus `sh`, and local SQLite message search. Stdin EOF and
SIGTERM both exited zero while the shared service remained alive. Screenshot
checks reported the expected missing-renderer notice. Live Cloudflare/APNs delivery
requires user credentials and was not exercised.

# Native parent updates

Rune starts the compiled CLI with `--parent-stdin --host-updates`. Its private
stdin receives newline-delimited `{"update":DesktopUpdateState}` records (64 KiB
maximum buffered record); stdout emits `OPENCODEX_HOST_UPDATE {"action":"check"}`
or `download` / `install`. Gateway `/api/host/update` and its three existing POST
actions use that state/command adapter, including through authenticated Remote
access. No new unauthenticated listener or filesystem mailbox is introduced.
EOF still closes only the gateway, never OpenCode. Ordinary standalone gateways
have no host updater; Electron's existing in-process updater injection is unchanged.
