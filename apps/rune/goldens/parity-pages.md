# Pages parity audit — partial, not a parity sign-off

Scope: `rune-parity-pages`. No workbench/right-rail implementation changes.
Status units below are **individual audited issues**, not whole screens. A fixed
issue does not mean that its surrounding page matches. Summary: **2 matches,
20 fixed, 20 still differing/incompletely verified**.

## Fixed issues

- **fixed** Thread menu's six baseline labels/order and state-sensitive pin/done/mute wording, from `sessions/session-actions-menu.tsx`. Removed invented Rename, Fork, Copy link, and slash-separated toggles. Focus/done → `POST sessions/:id/focus`; unread → `POST sessions/:id/unread`; mute → `POST sessions/:id/mute`. Done is disabled while running.
- **fixed** Thread mutations now keep the menu until success and show the source's action-specific errors. Replies route through the normal prompt-worker mailbox rather than disappearing into composer data handling.
- **fixed** Markdown/JSON menu exports reach `GET sessions/:id/export?format=…` on the worker and write real bytes. They no longer acknowledge or clear a composer draft. Both formats and draft preservation passed a temporary real-gateway smoke.
- **fixed** General service status uses `GET connection`, including `Connected · v2.3.2`, rather than treating the SSE connection as the service version/status.
- **fixed** General Check performs a GET; Connect alone performs `POST connection`. Live updates displays Connected / Reconnecting… / Unavailable separately.
- **fixed** Plugin state descriptions, messages and monospace paths match the React descriptions, including active/outdated/loading/failed/unavailable states. Capture loads real plugin status rather than assuming missing.
- **fixed** Plugin Install / Update / Remove use PUT / DELETE on the existing endpoints. Pending writes are tracked; failed writes preserve authoritative data. Loading follows bounded, visible-page-only checks (30 × 2 seconds), not a redraw loop.
- **fixed** Settings navigation exports the actual Hugeicons Settings02 / PaintBoard / Keyboard / Folder01 / DashboardSpeed01 / Globe02 glyphs from `settings/sections.ts`.
- **fixed** Shortcuts content has App, Chat, Message input groups, one New chat row with both bindings, Esc dismissal, Stop response, Enter and Shift+Enter. No invented duplicate New chat row.
- **fixed** App dropdown now contains Projects, Appearance, Shortcuts, Usage, with the source width, placement and shadow; removed invented Settings-only content.
- **fixed** Removed invented application-specific macOS menu items. `apps/desktop/src/main/index.ts` installs no such menu template; Rune retains native standard responder menus.
- **fixed** Sidebar initially expands only the current project; other projects collapse as `ProjectList` initializes them. Collapsing a project no longer selects it. Project row top margins/header dimensions follow CSS.
- **fixed** Removed invented project-row right-click menu (React's `ProjectList` has none). New-chat and close controls use the actual project-specific accessible labels.
- **fixed** Global search uses `GET session-search` with `search` / `cursor`, excerpts, directory metadata, search notices, errors/retry and Show more. One in-flight read coalesces newer input; stale query results are rejected. Results use native virtual rows. A real message-text query passed the temporary worker smoke.
- **fixed** Remote access basic form labels, descriptions/order, Token / My own choices, token visibility/placeholders, local port field and No devices copy now follow `remote-settings.tsx` / `remote.css` rather than invented controls.
- **fixed** Remote edits remain dirty until Save/Cancel, survive status reads, and Save preserves the enabled state instead of always enabling. Turn on/off uses the inverse current state. Add device is disabled unless the listener/hostname/served conditions hold.
- **fixed** Tasks plugin setup now has the actual centered icon, Tasks heading, combined introduction, Turn on Tasks, loading/error/path states instead of a board header and invented Install tasks plugin button. Capture reads `tasks/plugin` first.
- **fixed** Screenshot preflight initializes the actual requested viewport, not the previous hard-coded 1240×840 layout. Modal/percentage placement therefore uses the same dimensions as the web capture. Added missing capture aliases for find, remote, usage and collapsed-project states.
- **fixed** Offline Try again refetches connection rather than starting/reconnecting the OpenCode service via POST.
- **fixed** Project path copy feedback is the exact inline `Project path copied.` status, not an invented floating toast. Project menu wording/order includes Open project, Instructions, conditional Manage worktrees and conditional Close project.

## Matching content checked

- **matches** Apps empty-state icon identity, `No apps yet` heading and explanatory paragraph match `apps/apps-page.tsx` exactly. Geometry still belongs to the pixel issues below.
- **matches** Home's heading, subtitle and four starter strings/icons match `chat/new-chat-view.tsx` / `chat/starters.tsx` in the seeded open-project state. This does not sign off the no-project state or composer menus.

## Still differs / not fully verified

- **still differs** Thread menus lack React's optional Select/multi-selection, Cmd+Enter done affordance and full arrow/Home/End/Tab/focus-return behavior. Mutation disabling is broader than the independent React mutation states; connection-vs-live handling outside General remains incomplete.
- **still differs** Export uses a native Save dialog instead of browser automatic download and does not supply the React-sanitized default filename.
- **still differs** General omits desktop updater integration. Notification toggles persist, but permission-denial messages and actual banner semantics are not validated. Project-close selection behavior needs a complete scenario pass.
- **still differs** Appearance still has the previous invented preset-card/limited accent UI. React instead has Mode (Light/Dark/System), Typography reset/range/preview, Terminal placement, separate Light/Dark preset selectors, editable Accent/Background/Foreground, Contrast, conditional resets. OS-following, variant persistence and these effects are not ported.
- **still differs** Projects settings still lacks the exact header/Add project/search/list/actions layout. Edit project has only a name input: icon upload/crop, URL/favicon validation, colors, preview, limits, pending/errors and dialog behavior remain missing. Instructions is inline rather than its source dialog.
- **still differs** Usage lacks the Usage / Limits breadcrumb/icon refresh, source card layout/provider logos, limited/pace/legend/reset states, minute updates and refresh cadence. The empty paragraph matches, but the page does not.
- **still differs** Remote pairing remains inline, not the real PairDialog; expiration/device completion, dates/last-active, polling cadence, status tones, all error/busy states and real tunnel configuration were not validated. No live tunnel was enabled during this audit.
- **still differs** Populated Tasks lacks the actual board filters/persistence, per-column add, inline editors, project/assignee fields, task ordering/drag-drop, delayed labels, banners, linked sessions and source card behavior. Existing board buttons/strings are not a faithful replacement.
- **still differs** Populated Apps lacks index/detail parity, native embedded page integration, App/Settings/Code tabs, model/icon dialogs, schedule/settings/code/argument controls, correct trigger-derived run controls, delete confirmation, and full runs/session metadata. Empty Apps does not establish these.
- **still differs** Search dialog still needs full keyboard/focus/length-limit/reconnection behavior and detailed pixel comparison. Normal gateway search is verified, not every paginated UI interaction.
- **still differs** Open project dialog and Switch project picker remain conflated. React has distinct folder form/native selection, path resolution, ordered recent options, current checkmark, keyboard navigation and error/disabled states.
- **still differs** Worktree manager remains a page rather than `Worktrees · {name}` dialog; git/canonical filtering, explanatory/empty copy, Remove… confirmation, removal API and history refresh behavior are incomplete.
- **still differs** Focus ranking, per-project exclusions/filter UI, inactive pagination and boundary cases have not been fully ported from `threads/focus.ts`, `threads-view.tsx`, and `project-filter.tsx`.
- **still differs** Sidebar hidden/hover/selected/unread/running states and Show more need a complete behavioral/pixel matrix. Keyboard focus navigation, shortcut numbers and closed/opened-project ownership are not fully equivalent.
- **still differs** Find now floats and has the source labels, counter, icon buttons, zero-result disabling, Escape and Mod+G. It still navigates rows rather than individual occurrences, lacks distinct active occurrence highlighting/folded-turn reveal/selection seed/focus restoration, and does not search the exact React projected text.
- **still differs** Runtime shortcut behavior is incomplete: backgrounding is not the source activity-tray operation; menu/input boundaries, sequences and all Focus shortcuts need a full scripted pass. Workbench/terminal handlers remain the other branch's responsibility.
- **still differs** Native standard menu defaults are not proven identical to Electron's version-specific defaults. Text/spelling, selected-text Look Up/Search with Google, file/link and other native context menus are not all implemented/audited.
- **still differs** Home without an open project and the full checking/disconnected/connection-error screens are not fully equivalent. Only the unreachable retry's GET behavior was corrected.
- **still differs** Composer model/thinking/access/slash/mention/workspace/branch menus retain previous gaps (ordering, dimensions, counts, exact permission confirmation and live file search). This pass read them but did not complete their 1:1 audit.
- **still differs** Pixel parity is not achieved: typography/rasterization, border inclusion, disabled styling and shadows remain; transcript/workbench differences are visible behind menus and were deliberately not changed. Not all original golden states received fresh pairs.

## Evidence and validation

`tools/parity-pages.mjs` captures real web and Rune output against the same fresh
`/tmp/ocr-parity` fixture (OpenCode 4961, gateway 4491), using `goldens/seed.ts`.
It does not mock API data. Source corpus remains `goldens/web` (unchanged).

Fresh pairs: `goldens/parity-pages/pair-*-{dark,light}-{1280x800,1600x1000}-final.png`
(13 states × 4 configurations = 52 pairs). Web is left; Rune is right. The paired
project list intentionally includes the same service-discovered home project in
both clients. These are a **new same-fixture comparison**, not a claim that model-
generated titles match the historical fixture's titles. PNG evidence is ignored.

Inspected individual pairs for General, Tasks setup, app menu, thread menu, Remote,
Search and Find, plus all 16 overview sheets covering the 52 pairs. Failed search
capture (query embedded in API path, then missing virtual-list growth/scroll host)
was caught in render/image checks and corrected. Final Search pairs contain real
results. Find captures explicitly wait for the mounted transcript and Find input,
so the web half actually shows its Find bar. All four Find pairs were refreshed.

Validation run: release workspace build; workspace tests (12 existing tests);
root `bun check`; root formatting check (generated JSON newline corrected).
A removed temporary real-worker smoke verified ranked message search, pin/unpin,
done/undone, mute/unmute, mark unread, both export formats, success dismissal and
unsent-draft preservation. It did not stand in for native UI input verification.

No permanent placeholder tests or redraw loops were added. The temporary service
processes were stopped only after verifying their isolated HOME environment, and
`/tmp/ocr-parity` was removed after the final capture pass. The real user service
and data were never accessed.
