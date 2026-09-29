# Architecture

![OpenCodex architecture](./architecture.png)

This is the project's single maintained architecture diagram. It shows the implemented foundation, not a future feature plan.

## Reading the diagram

**Audience:** contributors working across the web, desktop, and backend boundaries.

**Main claim:** browser and Electron share the React UI and gateway API; Electron adds native capabilities, while OpenCode owns the agent runtime and durable sessions.

The common path runs downward: shared UI → local gateway → OpenCode. Upward arrows carry live events that trigger snapshot refetches. Ordinary HTTP responses return on their request connection and are omitted for clarity. The desktop-only side branch uses the preload IPC bridge.

| Source                | Action                                                                | Target                                          |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Shared React UI       | Requests connection status, project resolution, and session snapshots | Local gateway                                   |
| Local gateway         | Discovers or connects with the official client; reads session data    | OpenCode service                                |
| OpenCode service      | Streams events                                                        | Gateway, which forwards invalidations to the UI |
| Electron renderer     | Calls native capabilities through preload IPC                         | Electron main process                           |
| Electron main process | Reads and writes project and theme preferences                        | App user-data directory                         |
| Browser UI            | Reads and writes project and theme preferences                        | Browser localStorage                            |

`packages/contracts` is shared source code, not another running service. The UI and gateway use its API schemas; desktop and web use its native bridge types. In built desktop mode, the gateway runs inside Electron's main process. In web mode, Node hosts it. Development uses a separate gateway process for either UI surface.

OpenCode remains the same externally owned service across UI reconnects and app shutdown. A failed event stream reconnects and triggers a fresh snapshot; polling covers stream recovery. An explicit `OPENCODE_URL` replaces local discovery. Neither path moves service credentials into the renderer. Project paths resolve on the gateway machine.

## Update this diagram

- Edit **[architecture.json](./architecture.json)**, the canonical layout and content specification.
- Generate **[architecture.png](./architecture.png)** and **[architecture.txt](./architecture.txt)** from that specification. Never edit the generated text by hand.
- Keep [TABLER-ICONS-LICENSE.txt](./TABLER-ICONS-LICENSE.txt) with the image.

From the repository root:

```sh
bun architecture
bun architecture:check
```

These commands use the installed `ascii-diagram-png` skill's bundled renderer, JetBrains Mono font, and Tabler icons. They look for the skill under `~/.agents/skills` or `~/.config/opencode/skills`. Set `ASCII_DIAGRAM_SKILL_DIR` if it lives elsewhere. The renderer also requires ImageMagick and `rsvg-convert` on PATH; see the skill's setup if either is missing. The render command fetches selected icons into the skill's external cache; the check command is offline.

Update this same diagram when package ownership, runtime hosting, transport, persistence, or lifecycle changes. Verify relationships against code, render, inspect the PNG and arrows, then run the freshness check. Commit the JSON, generated artifacts, and any changed explanation together. Feature-only changes need no diagram update unless they change these boundaries.
