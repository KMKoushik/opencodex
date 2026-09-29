# Project

Build a Codex-like GUI on top of OpenCode.

Use the repositories in `.reference/` for inspiration when designing and implementing the app.

## Architecture

- `apps/web` owns the React UI shared by browser and Electron.
- `apps/desktop` owns native windows, lifecycle, and the narrow preload bridge.
- `packages/gateway` owns OpenCode connections, authentication, HTTP routes, and event forwarding.
- `packages/contracts` owns app-facing API schemas and native bridge types.
- Agent data uses the same relative `/api` transport on both surfaces. Keep Node and Electron imports out of the UI.
- Use the official OpenCode V2 client inside the gateway. OpenCode owns agent execution and durable session state.
- Treat the shared OpenCode service as externally owned; closing the app must not stop it.
- Reference repositories are read-only inspiration. Do not import or depend on them.

## Architecture diagram

- Maintain one canonical diagram in `docs/architecture/architecture.json`. The PNG and plain-text versions are generated from it.
- Update that diagram in the same change whenever package ownership, runtime hosting, data flow, persistence, or lifecycle changes. Show implemented behavior, not unbuilt plans.
- Run `bun architecture`, inspect the PNG and connector directions, then run `bun architecture:check`. Commit the JSON, PNG, text, and icon license together.
- See `docs/architecture/README.md` for the diagram's meaning and renderer setup. Do not edit generated diagram text by hand or create competing architecture diagrams.

## Development

- `bun dev` runs the browser app; `bun dev:desktop` runs Electron. Both use the same development ports, so run one at a time.
- `bun check` runs types, lint, gateway tests, and both builds. `bun format:check` checks formatting.
- Keep feature-specific UI in `apps/web/src/features`, reusable primitives in `components/ui`, and colors in `styles/tokens.css`.
- Keep server state in TanStack Query and transient UI state in React. Refresh authoritative snapshots after event reconnection.
- Add tests for meaningful gateway behavior and runtime boundaries. Do not add placeholder tests or hide errors as empty data. this is really important, you can temproray smoke test how much ever you want but tests should be really really minimal, i'm fine with no test. only important stuff needs test

## Reference repositories

- `.reference/codex/` — OpenAI Codex CLI and app-server (the desktop GUI source is not included).
- `.reference/t3code/` — T3 Code.
- `.reference/opencode/` — OpenCode, including its desktop app.
- `.reference/openchamber/` — OpenChamber.
