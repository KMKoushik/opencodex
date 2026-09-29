# OpenCodex

A web and Electron workspace powered by OpenCode 2.x. Both surfaces run the same React UI and use the same local gateway.

## Architecture

![OpenCodex architecture](docs/architecture/architecture.png)

[Diagram guide and editable source](docs/architecture/README.md). Update the JSON, then run `bun architecture` and `bun architecture:check` to regenerate and verify this single maintained diagram.

## Develop

Install **Node.js 22.12+**, **Bun 1.3.13+**, and [OpenCode 2.x](https://opencode.ai/v2/docs/). The `opencode` executable must be on the gateway process's `PATH`.

```sh
bun install
bun dev             # Browser: http://127.0.0.1:5173
bun dev:desktop     # Electron, with the same UI and hot reload
```

Run one development command at a time. Both use port **4310** for the gateway and **5173** for the UI. The shell renders without OpenCode; **Connect** discovers or starts the shared service. Closing OpenCodex leaves that shared service running.

Open a project using an absolute directory path (or `~/…`). Electron also provides a native folder picker. Browser paths refer to the machine running the gateway. The selected project and theme are saved in browser storage on web and in the app's user-data directory on desktop, so desktop preferences survive gateway port changes.

The foundation includes service status, project selection, paginated real session lists, session metadata, and live list refresh. Chat, prompting, permission handling, terminals, and diffs are the next product layer.

## Build and run

```sh
bun build:web
bun start            # Built web app: http://127.0.0.1:4310

bun build            # Web + Electron bundles
bun package:desktop  # Installer for the current operating system
```

The desktop bundle starts its gateway on an available loopback port and serves the built UI from it. OpenCode is an installed prerequisite; its executable is not bundled yet. Distribution signing, updates, and branded installer assets are not configured.

## Backend configuration

By default the gateway discovers OpenCode using the official `Service` API, including its authentication headers. To connect to a separately managed OpenCode 2.x server, set environment variables on the **gateway process**:

```sh
OPENCODE_URL=http://127.0.0.1:4096 bun dev
```

Optional `OPENCODE_USERNAME` (default `opencode`) and `OPENCODE_PASSWORD` support Basic authentication. Keep credentials out of `VITE_*` variables: those are exposed to the browser. Environment variables are read from the process, not automatically from `.env` files.

`PORT` changes the production web gateway port. Development proxies use the fixed port above. The gateway binds to loopback and accepts same-origin requests. Network hosting, remote folder browsing, and user authentication are outside this initial local-first scaffold; an external OpenCode endpoint should operate on the same project filesystem.

## Layout

```text
apps/web/             Shared React UI, features, components, design tokens
apps/desktop/         Electron lifecycle and native-only preload bridge
packages/gateway/     Local HTTP API, OpenCode adapter, event forwarding
packages/contracts/   Runtime-validated app API shapes and native bridge types
```

OpenCode owns sessions, tools, provider credentials, and agent execution. The gateway adapts its API and retains service credentials. React uses relative `/api` URLs through TanStack Query. Electron adds native capabilities; it does not create a second agent-data transport.

The browser reconnects its event stream automatically and refetches session snapshots after reconnection. Temporary stream failures also enable polling. Request failures stay errors rather than becoming empty session lists.

## Checks

```sh
bun check             # Types, lint, focused gateway tests, both builds
bun format:check
bun test:smoke        # Built browser + Electron integration tests (requires Chrome)
```

Smoke tests use an isolated OpenCode protocol fixture, exercise the real client and gateway, and launch Electron with a temporary profile. They do not start or stop your shared OpenCode service.

Reference repositories live in `.reference/`; they are inspiration, not runtime dependencies.
