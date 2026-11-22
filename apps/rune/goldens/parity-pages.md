# Pages parity audit — partial, not a parity sign-off

Scope: `rune-parity-pages`. No workbench/right-rail implementation changes.
Status units below are **individual audited issues**, not whole screens. A fixed
issue does not mean that its surrounding page matches. Summary: **2 matches,
21 fixed, 19 still differing/incompletely verified**.

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
- **fixed** Worktree management is now the `Worktrees · {name}` dialog, with Git/canonical filtering, source description/empty state, Remove… confirmation, busy/error states, query-encoded DELETE, and worktree/session refresh. Real native-worker smoke verified dirty-tree refusal, successful clean removal, and retained chat history. Populated/confirmation pairs are captured in all four configurations; general rasterization differences remain covered below.

## Matching content checked

- **matches** Apps empty-state icon identity, `No apps yet` heading and explanatory paragraph match `apps/apps-page.tsx` exactly. Geometry still belongs to the pixel issues below.
- **matches** Home's heading, subtitle and four starter strings/icons match `chat/new-chat-view.tsx` / `chat/starters.tsx` in the seeded open-project state. This does not sign off the no-project state or composer menus.

## Still differs / not fully verified

- **still differs** Thread menus lack React's optional Select/multi-selection, Cmd+Enter done affordance and full arrow/Home/End/Tab/focus-return behavior. Mutation disabling is broader than the independent React mutation states; connection-vs-live handling outside General remains incomplete.
- **still differs** Export uses a native Save dialog instead of browser automatic download and does not supply the React-sanitized default filename.
- **still differs** General omits desktop updater integration. Notification toggles persist, but permission-denial messages and actual banner semantics are not validated. Project-close selection behavior needs a complete scenario pass.
- **still differs** Appearance now implements Mode/System following, Typography reset/range/preview, terminal-placement preference, separate Light/Dark selectors with seed previews, hex/native color fields, Contrast and conditional resets. Variant preference serialization and real runtime keyboard switching/select dismissal pass a regression test. Remaining differences include the web segmented thumb's independently simulated leading/trailing spring motion, native range rendering, and final spacing. Terminal placement is presentation-only here; panel integration belongs to the other branch.
- **still differs** Projects has the source header/add/search/list/actions and separate Open/Add/Edit/Instructions/Worktree dialogs. Upload preparation/crop and URL validation run off the UI; edits and Unicode instructions passed a real native-worker read/write/restore smoke. Name/URL and task key/paste limits use UTF-16 insertion limits, and editor Enter submits. Folder suggestions now overlay the form, preserve stale parent results without allowing selection, cache eight parents for 30 seconds, separate listing/opening errors, hide dotfolders until requested, and fix Up from no choice. Late listing replies cannot reopen a dismissed list. Saved-icon previews, exact fuzzy highlighting, all folder-cache/blur/keyboard edge cases and independent mutation/error states remain incomplete; dialog styling is not pixel-identical.
- **still differs** Usage lacks the Usage / Limits breadcrumb/icon refresh, source card layout/provider logos, limited/pace/legend/reset states, minute updates and refresh cadence. The empty paragraph matches, but the page does not.
- **still differs** Remote pairing remains inline, not the real PairDialog; expiration/device completion, dates/last-active, polling cadence, status tones, all error/busy states and real tunnel configuration were not validated. No live tunnel was enabled during this audit.
- **still differs** Tasks is populated through the real plugin/gateway and has assignee persistence, project filtering, per-column entry, inline editors, project/assignee fields, order/drag handling, day labels, banners and linked chats. Real-worker create/complete/delete passes. Escape and UTF-16 suffix-preserving insertion limits have regression coverage. Markdown notes, wrapping semantic-tone chips, done-title strike, measured note growth and wrapping editor fields are implemented; all Markdown/link interactions, drag/autoscroll, Tab/outside-save/window-blur scenarios, per-mutation pending/error independence and remaining geometry still need verification/completion.
- **still differs** Apps has a gateway-created app and real run, index/detail, App/Settings/Code tabs, trigger-derived buttons/multi-trigger menu, icon/model/delete dialogs, runs and model-call metadata, plus bounded sidebar app links and live invalidation. Canvas implementation remains explicitly excluded: only frame/loading is drawn for the embedding agent. Model variants/provider controls, code highlighting/find/cross-line selection and full settings/error/schedule/keyboard behavior still need completion; multi-trigger/run-call states need their complete real-data matrix.
- **still differs** Search dialog still needs full keyboard/focus/length-limit/reconnection behavior and detailed pixel comparison. Normal gateway search is verified, not every paginated UI interaction.
- **still differs** Sidebar/⌘O Open project correctly clears the selection and shows full-page folder setup. The composer now has the anchored 360px recent-folder popup, active/current indicators, typed-path row, no-results state, and Open project… footer dialog. Native project active/updated metadata drives recent ordering. Clamped arrows, initial search focus, Escape and dismissed/reopened resolution protection pass a runtime test. Unknown resolved folders are still eagerly registered via the existing gateway project operation because Rune requires native metadata; React supports presentation-only folders. Saved icon rendering, merged presentation-only folders, errors/pending/focus/Tab and complete placement verification remain open. That ownership/timing difference is documented, not signed off.
- **still differs** Focus ranking, per-project exclusions/filter UI, inactive pagination and boundary cases have not been fully ported from `threads/focus.ts`, `threads-view.tsx`, and `project-filter.tsx`.
- **still differs** Sidebar hidden/hover/selected/unread/running states and Show more need a complete behavioral/pixel matrix. Keyboard focus navigation, shortcut numbers and closed/opened-project ownership are not fully equivalent.
- **still differs** Find now floats and has the source labels, counter, icon buttons, zero-result disabling, Escape and Mod+G. It still navigates rows rather than individual occurrences, lacks distinct active occurrence highlighting/folded-turn reveal/selection seed/focus restoration, and does not search the exact React projected text.
- **still differs** Runtime shortcut behavior is incomplete: backgrounding now targets the real session background endpoint only for blocking shell/subagent calls, rather than navigating to a new chat. Compact-menu arrows/Home/End and several dialog Escape boundaries are implemented. Complete menu/input boundaries, sequences and all Focus shortcuts still need the full scripted matrix. Workbench/terminal handlers remain the other branch's responsibility.
- **still differs** Native standard menu defaults are not proven identical to Electron's version-specific defaults. Text/spelling, selected-text Look Up/Search with Google, file/link and other native context menus are not all implemented/audited.
- **still differs** Home without an open project and the full checking/disconnected/connection-error screens are not fully equivalent. Only the unreachable retry's GET behavior was corrected.
- **still differs** Composer model/thinking/access/slash/mention/workspace/branch menus retain previous gaps (ordering, dimensions, counts, exact permission confirmation and live file search). This pass read them but did not complete their 1:1 audit.
- **still differs** Pixel parity is not achieved: typography/rasterization, border inclusion, disabled styling and shadows remain; transcript/workbench differences are visible behind menus and were deliberately not changed. Not all original golden states received fresh pairs.

## Continuation evidence (in progress)

`goldens/seed-pages.ts` adds five real tasks and creates a canvas through the isolated
gateway, then installs its fixture-only `server.ts`. Its function was executed
through the gateway to seed real run history. Worktree creation also used the real
gateway's new-chat/worktree operation; no screenshot API data is mocked.

The settled continuation pass contains **108 pairs** (27 states × 4 configurations)
at scale 2, with native virtual time `--at 0.3`. Pairs use
`pair-*-{dark,light}-{1280x800,1600x1000}-continuation-final.png`
pattern for populated Tasks/Apps, app detail/settings/code/runs/icon/model/delete,
Projects add/edit/instructions/actions/open, and populated Worktree/confirmation.
The fixture remains running during this continuation. The historical cleanup
statement below refers only to the preceding pass.

Real native-worker smoke (temporary examples, removed) covered project name
edit/restore, Unicode instructions/restore, invalid icon URL rejection, 128px crop,
task create/complete/delete, app icon persistence, dirty-worktree refusal, clean
worktree deletion and surviving chat history. The source-only native color-panel
boundary is committed as `0d310ed`. Native live SSE task/app invalidation also
passed. Release workspace tests pass **14 tests**; the task control regression
caught and fixed text-input Escape consumption. A 2,000-task runtime check mounted
16 cards and measured 7.95 ms for its CPU frame. Root `bun check`, release build,
formatting and architecture checks passed during this continuation. The settled
Open project/icon-picker/Appearance/Tasks pairs were inspected in the fresh
`/tmp/ocr-parity/settled-review-07.png`; all initial-pass overview sheets were
also inspected. The last eager-registration change postdates these screenshots
and only changes unknown-folder selection behavior, not these captured states.

Switcher follow-up: **16 additional pairs** (four states × four configurations),
`goldens/parity-pages/pair-project-*-{dark,light}-{1280x800,1600x1000}-switcher-final.png`.
States: picker open, typed path, no matching projects, and footer Open project
dialog. Fresh review: `/tmp/ocr-parity/switcher-review-09.png` (light 1600×1000),
plus the initial dark 1280×800 review. Release workspace tests now pass **15 tests**.
These captures do not establish complete switcher or project parity.

Folder follow-up: **eight additional pairs** (suggestions/no matches × four
configurations), `goldens/parity-pages/pair-project-folder-*-folders-final.png`.
They use a real folder listing from the isolated gateway. Fresh reviews:
`/tmp/ocr-parity/folders-review-10.png` and `folders-review-11.png`. Folder overlays
use Rune's native anchored-fit placement rather than moving form content.
Release workspace tests pass **16 tests**, including Up-from-no-choice, hidden
folders, separate listing/open errors and late-reply dismissal. Focus observation
is scoped to folder forms, not the chat streaming path.

Tasks control follow-up: **12 additional pairs** (board/editor/new entry × four
configurations), `goldens/parity-pages/pair-tasks*-tasks-controls-final.png`.
The browser pointer is parked away from controls before capture to avoid transient
hover tooltips absent from native captures. Fresh reviews: `tasks-review-12.png`
and `tasks-editor-review-13.png` beneath `/tmp/ocr-parity`. The source semantic
purple/warning mixes are derived in sRGB, card metadata wraps, and editor notes
grow within bounds. Native tests remain **16 passing**, now also checking UTF-16
insertion without splitting an emoji or discarding the untouched suffix. Latest
2,000-task check: 16 mounted cards, 10.86 ms CPU frame. This does not sign off
the remaining drag/focus/link/geometry matrix.

Apps Code follow-up: source indexing/highlighting runs on an on-demand coalescing
native worker with latest-only mailboxes and generation rejection. Typed source
replaces the raw files response, and only viewport lines mount. Release workspace
tests pass **17 tests**, including cross-line clipboard copying across a blank
line with a memory clipboard. The focused 20,000-line benchmark mounted 57 lines
in 10.90 ms CPU before the final gutter-spacing adjustment. This is not a GPU or
interaction-latency measurement. The canonical architecture includes the worker;
its generated PNG was inspected and `bun architecture:check` passes.

Pinned Rune limits coloring to the first 128 KiB/32,768 token ranges and virtual
selection collection to 10,000 unbuilt rows/4 MiB. These are constraints, not a
demonstrated whole-feature blocker or parity sign-off. Native lexer classifications
still differ from React's Lezer styles. Find, full keyboard/navigation behavior,
large/offscreen selection, error/loading refresh scenarios and gutter geometry
remain open. Initial same-fixture review: `/tmp/ocr-parity/code-review-14.png`.
The final Code pass adds **eight pairs** (server/index tabs × four configurations)
at scale 2: `goldens/parity-pages/pair-app-code*-code-final.png`. Fresh final review:
`/tmp/ocr-parity/code-review-15.png`. Tab typography, source inset, gutter width and
20.4px line spacing were corrected against the initial pairs. Full release tests,
release build, root `bun check`, formatting and architecture check pass. Checklist
counts remain **2 matches, 21 fixed, 19 still differing**.

## Prior-pass evidence and validation

Source Find continuation: ⌘F on Apps Code now opens **Find in file**, not transcript
Find. A lazy coalescing worker scans immutable full source, rejects old query/file
generations and bounds retained matches at 2,000. Highlights and next/previous,
Enter/Shift+Enter, ⌘G and Escape are implemented. Reopening retains the query.
The existing Code regression now searches line 20,001 outside the initial viewport
and checks transcript Find stays closed. All **17 release tests** pass. The focused
frame mounted 57 lines in 11.40 ms CPU. Matching uses an escaped Unicode-insensitive
Rust regex; CodeMirror normalization, cursor-relative initial match/selection,
F3, complete focus/Tab behavior, navigation after 2,000 matches and exact arrow/
overlay/gutter visuals remain unresolved. No whole-feature status is promoted.
Four same-fixture pairs: `goldens/parity-pages/pair-app-code-find-*-source-find-final.png`,
dark/light at both sizes and scale 2. Fresh reviews: `/tmp/ocr-parity/source-find-review-16.png`
and `source-find-review-17.png`. The canonical architecture now records both source
workers; generated output was inspected and checked. Root checks, formatting and
the final release workspace build pass, including accessibility metadata.

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
