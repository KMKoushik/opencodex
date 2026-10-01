# Architecture

![OpenCodex architecture](./architecture.png)

This is the project's single maintained architecture diagram. It shows implemented behavior, not a future feature plan.

## Reading the diagram

**Audience:** contributors working across the web, desktop, and backend boundaries.

**Main claim:** browser and Electron share the React UI and gateway API; Electron adds native capabilities, while OpenCode owns the agent runtime and durable sessions.

The common path runs downward: shared UI → local gateway → OpenCode. Upward arrows carry native events for live text and snapshot refresh. Ordinary HTTP responses return on their request connection and are omitted for clarity. The desktop-only side branch uses preload IPC for the native bridge and web-content events for link handling.

| Source                | Action                                                                      | Target                                              |
| --------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| Shared React UI       | Reads projects and messages; sends prompts and request replies; stops runs  | Local gateway                                       |
| Local gateway         | Discovers or connects with the official client; delegates native operations | OpenCode service                                    |
| OpenCode service      | Streams native session, project, permission, and form events                | Gateway, which forwards them to the UI              |
| Electron renderer     | Calls native capabilities through preload IPC                               | Electron main process                               |
| Electron web contents | Emits link-opening and context-menu events                                  | Main, which opens the OS browser or copies the link |
| Electron main process | Reads and writes project and theme preferences                              | App user-data directory                             |
| Browser UI            | Reads and writes project and theme preferences                              | Browser localStorage                                |

`packages/contracts` is shared source code, not another running service. It validates app-owned inputs and re-exports OpenCode's generated response/event types without loading the client runtime into React. Desktop and web use its native bridge types. In built desktop mode, the gateway runs inside Electron's main process. In web mode, Node hosts it. Development uses a separate gateway process for either UI surface.

OpenCode remains the same externally owned service across UI reconnects and app shutdown. A failed event stream reconnects and triggers a fresh snapshot; polling covers stream recovery. An explicit `OPENCODE_URL` replaces local discovery. Neither path moves service credentials into the renderer. Project paths resolve on the gateway machine.

## Ownership decisions

- **Projects and sessions:** use OpenCode's `project.list`, `session.list`, `session.create`, and `session.get`. Like the OpenCode Desktop reference, the sidebar uses a locally stored opened-folder list, not every project in the service catalog. The pinned V2 API has no opened-project preference; React owns this navigation preference through the existing browser/native preference storage. Opening adds a directory once, closing removes it without deleting server data, and upgrades seed the list from the previously selected folder. OpenCode's catalog only enriches opened folders with metadata, deduplicated by canonical directory so historical project identities share one navigation row. Distinct directories with the same name stay separate. OpenCodex has no project catalog or history database. Folder validation and Electron's folder picker are local presentation conveniences.
- **Sending and stopping:** delegate to `session.prompt` and `session.interrupt`. OpenCode selects the default model and agent, admits prompts, steers running sessions, queues pending inputs, and executes tools. The UI displays `session.inbox.list` and `session.active` rather than inferring activity from an unfinished message. Mutation retries are disabled; an uncertain prompt response is reconciled by reading the server, not by resending.
- **Conversation rendering:** use the native `message.list` pages and their cursors. A keyed presentation projection groups consecutive work across assistant steps without reordering text. LegendList (also used by the T3 Code reference) measures and virtualizes both the timeline and expanded activity lists; older pages load near the top with visible-row anchoring. Disclosure state survives row unmounting, and closed groups do not render their details. React renders Markdown through `react-markdown`/`remark-gfm`, with raw HTML disabled and external images represented as labels. This is presentation, not a second durable message model.
- **Live output:** forward native events through the existing SSE transport. The only projection is an in-memory text/reasoning overlay, keyed by session, assistant message, kind, and ordinal. It accepts deltas only after observing the corresponding start. Completed snapshots win. A new assistant step clears old overlay parts; unmount/reconnect discards the overlay. Other durable changes trigger coalesced snapshot reads. This avoids maintaining a replica of OpenCode's event log or execution state.
- **Permissions and questions:** list and reply through native permission and session form APIs. OpenCode validates answers and enforces permission decisions. OpenCodex renders the requested controls and never synthesizes permission rules.
- **External links:** the browser uses ordinary anchors and its native link menu. Electron main handles web-content link events, opens HTTP(S) links in the OS browser, and supplies native Open link / Copy link menu actions. Clipboard and shell access stay in main; this needs no additional preload API.
- **App state:** selection, opened folders, drafts, scroll position, theme, and settings navigation belong to React. Drafts are per-session and in-memory. Browser preferences use localStorage; desktop preferences use `electron-store` in main over the existing validated preload IPC. It reads the same `preferences.json` in Electron's user-data directory, preserving the `theme`, `project`, and `projects` string/null values from the previous custom writer. The library handles defaults, schema validation, and synchronous atomic writes, so shutdown needs no preference-write queue flush. Browser and Electron keep their own preferences; OpenCode Desktop's private UI preferences are not imported. No additional durable store, runner, queue, or service is introduced.

Before adding a capability, check the pinned V2 contract first. Add app-owned behavior only for a concrete presentation/native requirement or a documented missing upstream capability, and record that decision here. Reference implementations are read-only inspiration; they are not dependencies.

### UI layout and responsiveness

The shell follows the local Codex desktop reference: a 275px sidebar, 46px toolbar, project-grouped threads, and an aligned conversation/composer column. Navigation uses 30px desktop rows, 36px browser rows, and 44px touch targets. Only the selected project's sessions are queried. Composer edits stay local to the composer, with an in-memory draft map for navigation; typing does not render the shell or transcript. Message ordering and grouping run on snapshot changes. Token updates are coalesced per animation frame and selected by visible text rows, so they do not rerender the chat or reproject history. These are presentation decisions within the existing web package.

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
