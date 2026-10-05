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

The sidebar shows only folders you've opened in OpenCodex. Use **Open project** to add one, or the close button beside a project to remove it from the sidebar without deleting its sessions. Your previously selected folder is retained when upgrading. Select a project, then **New chat** to start a conversation. You can send messages, read existing conversations, see streamed responses and tool output, stop a run, and answer OpenCode's permission requests and questions. Chats use the Build agent. The composer offers a searchable model picker with collapsible provider groups, provider logos, and context-window sizes, alongside the selected model's supported thinking levels (OpenCode variants). Model and thinking choices stay local until you send, when only the final choice is applied to OpenCode. Unsent choices survive navigation but not reload. Switching models resets thinking to Default. Configure providers and default models in OpenCode.

Messages sent during a run use OpenCode's native steering behavior. Drafts stay in memory while switching sessions; message history and pending inputs live in OpenCode. Failed sends keep the draft and are never automatically retried. Older messages load automatically as you scroll up. Agent activity is grouped into expandable summaries, with tool details inside.

Use the paperclip, paste from the clipboard, or drop files onto the composer to attach images, PDFs, and text/code files. Images show thumbnails; each attachment can be removed before sending. You can send attachments with or without text, up to 100 files per message: 10 MiB per image, 80 MiB total images, and 50 MiB per other file, matching T3 Code's limits. Files stay local until you send, survive switching chats, and remain available after a failed send. Reloading discards unsent drafts and attachments.

Themes live in **Settings → Appearance**. Choose Light, Dark, or System mode, then pick a separate light and dark theme, such as OpenCodex, Catppuccin (Latte, Mocha, Macchiato, Frappé), GitHub, Nord, Gruvbox, Solarized, Rosé Pine, Tokyo Night, Dracula, Everforest, or One. As in Codex, each theme is three seed colors — accent, background, and foreground — plus a contrast level; you can adjust any of them, and every other color is derived from them, including the glazed ceramic controls. The OpenCodex and Catppuccin themes keep code on ink: the workspace panel and terminal use the theme's own dark palette even in light mode (Catppuccin Latte borrows Mocha's), with matching syntax colors in diffs and the editor. Choices persist across launches.

### Review and edit your workspace

Use the **Files** and **Changes** icons on the far-right rail to open the workspace panel. Click the active icon again to close it. **Changes** shows uncommitted files (including staged and untracked files), or changes from the base branch. Select a file to review its diff; use the gutter **+** on a line or selected range to add feedback to your chat draft. Nothing is sent automatically.

**Files** keeps an expandable tree beside the editor. Single-click a text file to edit immediately; double-click the file or its tab to keep it open. Markdown starts in editable source, with an optional preview icon. Tabs and folder expansion survive switching views and closing/reopening the panel. **Changes** uses the same tree navigation, with unified and split diff icons; its pencil icon opens the file directly in **Files**. Save with the disk icon or Cmd/Ctrl+S. The toolbar's tree icon toggles the explorer, and the folder dropdown offers Copy Path plus Show in Finder/File Explorer/Files on desktop. Up to eight unsaved files survive panel and chat navigation in memory; save them before reloading. Saves reject detected disk changes and preserve your edits. Text editing and image previews support files up to 2 MiB; larger files are left untouched.

The first control at the top of the right rail is **Open in…**, followed by Files, Changes, and Terminal underneath. Its menu copies the project path or opens it in an installed desktop app. On macOS it shows native app icons for Finder, Terminal, Ghostty, Cursor, Zed, VS Code, and iTerm when installed, and remembers the selected app. Windows/Linux desktop offers the system file manager; the browser offers Copy Path.

### Project terminals

Choose **Terminal** on the right rail, then **New terminal** or **+** to open a shell in the project's directory. Each tab is a separate shell; tabs are shared across chats in that directory. Drag the panel's left edge to resize it. Hiding the panel, switching tabs, or closing OpenCodex keeps shells running in OpenCode; reopening restores recent output. A tab's **×** ends that shell. Terminals last until explicitly closed or the OpenCode service stops.

### Keyboard shortcuts

Use **Settings → Shortcuts** (Cmd/Ctrl+/) for the full list. Shortcuts work throughout the focused browser or desktop app. Cmd on macOS becomes Ctrl on Windows/Linux.

| Action         | Shortcut                     |
| -------------- | ---------------------------- |
| Toggle sidebar | Cmd/Ctrl+B                   |
| New chat       | Cmd/Ctrl+N or Cmd/Ctrl+Alt+N |
| Open project   | Cmd/Ctrl+O                   |
| Settings       | Cmd/Ctrl+,                   |
| Focus message  | Cmd/Ctrl+Shift+L             |
| Choose model   | Cmd/Ctrl+Shift+M             |
| Thinking level | Cmd/Ctrl+Shift+E             |
| Cycle thinking | Ctrl+T                       |
| Stop response  | Esc Esc                      |

New chat requires an open project. Chat shortcuts use the active conversation. Press Escape twice within half a second to stop a running response, including while typing. Escape closes the focused menu first, or leaves settings/closes the mobile sidebar when outside an input; those dismissals do not count toward stopping. Both new-chat shortcuts work in Electron; use Cmd/Ctrl+Alt+N in browsers that reserve Cmd/Ctrl+N for a new window.

Ctrl+T uses the Control key on every platform and cycles through the current model's supported thinking levels, wrapping back to Default.

## Build and run

```sh
bun build:web
bun start            # Built web app: http://127.0.0.1:4310

bun run build        # Web + Electron bundles
bun package:desktop  # Installer for the current operating system
```

The desktop bundle starts its gateway on an available loopback port and serves the built UI from it. OpenCode is an installed prerequisite; its executable is not bundled yet. App icons live in `apps/desktop/build/`. Downloadable macOS DMGs are published from tags; see [docs/release.md](docs/release.md). Auto-updates are not configured.

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

Before opening a pull request, run the checks and formatting validation below from the repository root.

```sh
bun check             # Types, lint, focused tests, both builds
bun format:check
bun test:smoke        # Built browser + Electron integration tests (requires Chrome)
```

Smoke tests use an isolated OpenCode protocol fixture, exercise the real client and gateway, and launch Electron with a temporary profile. They do not start or stop your shared OpenCode service.

Reference repositories live in `.reference/`; they are inspiration, not runtime dependencies.
