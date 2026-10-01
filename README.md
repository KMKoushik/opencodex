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

Open a project using an absolute directory path (or `~/…`). Electron also provides a native folder picker. Browser paths refer to the machine running the gateway. The opened-project list, selected project, and theme are saved in browser storage on web and in the app's user-data directory on desktop, so desktop preferences survive gateway port changes.

Theme preferences use `opencodex:theme` in browser localStorage. On desktop, `electron-store` saves them under `theme` in `<app.getPath('userData')>/preferences.json`, alongside `project` and `projects`. Existing preference files are read in place.

The sidebar shows only folders you've opened in OpenCodex. Use **Open project** to add one, or the close button beside a project to remove it from the sidebar without deleting its sessions. Your previously selected folder is retained when upgrading. Select a project, then **New chat** to start a conversation. You can send messages, read existing conversations, see streamed responses and tool output, stop a run, and answer OpenCode's permission requests and questions. Chats use the Build agent. The composer offers a searchable model picker with collapsible provider groups, provider logos, and context-window sizes, alongside the selected model's supported thinking levels (OpenCode variants). Choices are saved in the OpenCode session; switching models resets thinking to that model's default. Configure providers and default models in OpenCode.

Messages sent during a run use OpenCode's native steering behavior. Drafts stay in memory while switching sessions; message history and pending inputs live in OpenCode. Failed sends keep the draft and are never automatically retried. Older messages load automatically as you scroll up. Agent activity is grouped into expandable summaries, with tool details inside. Terminals, diffs, and file uploads are not included yet.

Themes live in **Settings → Appearance**. Choose Light, Dark, or System mode, then pick a separate light and dark theme, such as OpenCodex, Catppuccin (Latte, Mocha, Macchiato, Frappé), GitHub, Nord, Gruvbox, Solarized, Rosé Pine, Tokyo Night, Dracula, Everforest, or One. As in Codex, each theme is three seed colors — accent, background, and foreground — plus a contrast level; you can adjust any of them, and every other color is derived from them. Choices persist across launches.

## Build and run

```sh
bun build:web
bun start            # Built web app: http://127.0.0.1:4310

bun run build        # Web + Electron bundles
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
packages/contracts/   App input schemas, native OpenCode types, bridge types
```

OpenCode owns sessions, tools, provider credentials, and agent execution. The gateway adapts its API and retains service credentials. React uses relative `/api` URLs through TanStack Query. Electron adds native capabilities; it does not create a second agent-data transport.

The gateway forwards native OpenCode events. The UI overlays live text on server snapshots, then refreshes those snapshots at durable changes and on reconnection. A stream joined mid-response waits for saved text instead of displaying a partial suffix as the full response. Temporary stream failures also enable polling. Request failures stay errors rather than becoming empty session lists. See the [ownership decisions](docs/architecture/README.md#ownership-decisions) before adding app-owned behavior.

## Checks

```sh
bun check             # Types, lint, focused gateway tests, both builds
bun format:check
bun test:smoke        # Built browser + Electron integration tests (requires Chrome)
```

Smoke tests use an isolated OpenCode protocol fixture, exercise the real client and gateway, and launch Electron with a temporary profile. They do not start or stop your shared OpenCode service.

Reference repositories live in `.reference/`; they are inspiration, not runtime dependencies.
