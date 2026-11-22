# Pages parity audit — partial, not a parity sign-off

Scope: `rune-parity-pages`. No workbench/right-rail implementation changes.
Status units below are **individual audited issues**, not whole screens. A fixed
issue does not mean that its surrounding page matches. Summary: **2 matches,
27 fixed, 13 still differing/incompletely verified**.

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
- **fixed** Removed invented application-specific macOS menu items. Electron main installs no template, but Electron **44.4.5** supplies App/File/Edit/View/Window defaults. The native AppKit adapter now installs that complete hierarchy, including Substitutions/Speech, with the source key equivalents; a temporary native executable inspected the actual NSMenu tree. See `src/menus/native.md` for every item/shortcut and the unsupported responder/WebContents operations (not a behavioral parity claim).
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

- **fixed** Thread menus implement Select/multi-selection, Shift/Cmd range/toggle selection, bulk done with six-second undo, Cmd+Enter, arrow/Home/End/Tab and focus return. Pending/error state is independent per session/action rather than one menu-wide lock. Runtime regressions cover selection, menu navigation and pending independence; the authentic running/attention matrix remains in the sidebar issue below.
- **fixed** Export streams real gateway bytes into worker-owned temporary files before opening the native Save dialog, with React's sanitized default filename and default Downloads directory. Electron also uses a native Save dialog (no `will-download` override); it is not an automatic-download parity gap. Save/cancel/worker-shutdown cleanup and composer-draft preservation passed real-worker smoke checks.
- **still differs** General's Close project now shares the project-list reducer: closing another project preserves selection, closing the current project selects the first remaining project, and closing the last clears it. A regression covers all three. Notification enablement now waits for native macOS authorization, preserves the setting on denial, and shows the source denial message; Rune's notification crate does not expose that result, so `oc-native` supplies the permission-only callback without sending a test banner. Actual signed-app banner/denial delivery remains unverified. The updater is not implemented: this branch's `main.rs` still requires an external `OPENCODEX_GATEWAY` and explicitly leaves bundled gateway spawning to M5, contrary to the child-process premise. There is no existing sidecar IPC channel here. This is unfinished app lifecycle work, not an impossible Rune feature. Fresh General pairs: `pp-settings/pair-settings-general-*-v1.png`.
- **fixed, native motion exception** Appearance now uses a retained measured thumb with independently sprung leading/trailing edges (web omega/zeta 26/0.82 and 17/1), measured range/output widths, 16px thumb/6px track, keyboard arrows/Home/End/Page keys, border-box rows and source preview line height/spacing. Concrete exception: pinned Rune's `El::lead` analytically springs the layout edges; it does not expose the web's 120-Hz Euler samples coupled to volume-conserving width/vertical-scale/radius keyframes. The native spring is the implemented alternative, not a claim of frame-identical deformation. The web range is Chromium's user-agent control; Rune has no Chromium form-control painter, so its measured geometry is drawn natively. Terminal panel integration remains the other branch's work. Pairs: `pp-settings2/pair-appearance-*-v2.png`.
- **fixed, native raster exception** Projects now loads saved embedded/HTTP(S) icons through the existing worker with bounded decoding, visible-row/editor requests and a 128-entry disposable cache. Failures fall back to initials; color/override precedence follows the web. Folder suggestions have fuzzy highlight spans, score/UTF-16-length ranking, pointer-preserved input focus, accepted-path replacement, stale-parent protection and source geometry. Dialog initial focus, independent save/upload/URL errors, icon radii/hints, instructions resize/spelling and suffix-preserving UTF-16 limits are implemented. Runtime regressions cover pointer/Enter and independent errors. Rune's native image/text painter is not Chromium/Skia: filtering, antialiasing and line-box rounding remain visible rather than pixel-identical. The native Browse control corresponds to Electron's bridge; the browser screenshot has no native folder bridge. Pairs: `pp-settings2/pair-projects-*-v2.png` and `pp-settings2/pair-project-{edit,add,instructions,folders}-*-v2.png`.
- **fixed, native raster exception** Usage now draws the striped track, exact exported trade/reset SVG paths, source pace/reset help text, sRGB-mixed fills, corrected card columns/baselines/header spacing and retained stale data on refetch failure. Settings help uses public `Cx::help_look`: source colors/shadow, 12/16 font, 6px radius/gap, 280px outer width, 450ms delay/400ms warm period and no fade; a runtime hover regression verifies delayed reset help. Populated, limited, provider-error, empty and fetch-error states were captured using permitted screenshot-only responses through the isolated gateway proxy, not provider credentials or production stubs. Rune's tooltip painter rounds measured text widths/heights upward (`runtime/input/help.rs:503`); Chromium retains fractional CSS boxes. Native SVG/text antialiasing also differs. These are renderer-level pixel exceptions, not missing tooltip APIs. Pairs: `pp-settings2/pair-usage-*-v2.png`.
- **fixed, native raster exception** Remote's failure/busy matrix covers off/starting/listener failure/unserved/external/connected/connecting/missing/failed/devices/read failure/dirty/saving/save failure/revoking/revoke failure, plus pairing loading/code/expired/error/complete. Partial dirty fields and caret/focus survive polling; revoke has its own lifecycle; Token removal has no exit focus target. Port Up/Down, fractional stepping and rejected letters match a Chrome keyboard oracle; modal focus/Tab/Escape/return are runtime checked. QR byte segmentation and Nayuki mask scoring match three web uqr fingerprints exactly, rather than merely producing a scannable different mask. Done/New code use the source primary style. Native glyph rasterization, rounded layout metrics and shadow sampling are not Chromium/Skia pixel output; pinned Rune offers its own renderer, not a browser-compatible painter. No public tunnel was enabled. Pairs: `pp-settings2/pair-remote-*-v2.png` and `pp-settings2/pair-pair-*-v2.png`.
- **still differs** Tasks: the `rune-pp-tools` temporary headless runtime smoke drives actual controls through the real native worker and isolated gateway for create/edit/drag-to-another-column/complete/reopen/delete; all pass. Drag targets now use drawn (scrolled) card geometry. Start disables all other starts while pending; tooltips, stalled-plugin text, install errors/error banners, editor padding/action alignment, empty/new-entry styling and spelling opt-in were corrected. Board-background clicks save edits without refocusing, and editor-whitespace presses stay inside. Assignee/filter/editor/Markdown/day/link features remain implemented. Continuous drag autoscroll, the complete Tab/outside-click/window-blur matrix, independent mutation errors, local Markdown-link routing, linked-agent-chat live scenarios and exact pixels are **not signed off**. Fresh real-data pairs: `goldens/pp-tools/pair-tasks*-{dark,light}-{1280x800,1600x1000}-tools-final.png`.
- **still differs** Apps: model controls now filter enabled models, sort names, preserve remembered variants, expose Default/thinking choices, and use source-shaped chip/quiet controls. Model-dialog dismissal is independent of pending saves; Icon/Delete retain their busy guard. Settings includes project/created-chat rows, resolved model name/source/error text, function last-run/running/next-schedule details and connection/running disabling. Code Find seeds/selects the query, handles F3, and navigates beyond the 2,000-counter cap (one permanent regression); existing offscreen/cross-line-copy regression passes. Apps Code adds native selected-text lookup/Google/copy. Real gateway app/function history and fresh index/settings/model/code-find/runs pairs exist in `goldens/pp-tools/*-tools-final.png`. **Not complete**: provider-grouped searchable model picker, exact lexer/normalization/selection behavior, full pending/error/run-call matrix and pixels remain. `canvas_host` is still a loading frame: `oc-webview` exists, but this branch's app has no dependency/State/host hooks; wiring those is outside the allowed folders, not a Rune impossibility. The isolated model returned HTTP 429 with a roughly 19-hour retry delay, so no assistant/run-call evidence was fabricated.
- **still differs** Search now has modal focus/Escape, UTF-16 insertion and IME limits with suffix/undo preservation, stale-generation rejection, disconnect-retained results, reconnect polling, explicit Retry and staged multipage refresh/queued Show more. Runtime tests cover modal close and keyboard/IME limits including undo/redo. Fresh real-gateway pairs cover the populated dialog in both themes/sizes; full live pagination/error/reconnection interaction and pixel identity are not signed off.
- **still differs** Sidebar/⌘O Open project clears selection and shows folder setup. The anchored recent-folder popup includes current indicators, typed paths, no-results and Open project… dialog. Unknown home/composer folders are now presentation-only and do not call native registration; native metadata enriches opened folders without being persisted. Saved artwork loads through a bounded worker cache. Keyboard navigation/resolution protection passes runtime tests; real-worker smoke verified unregistered-folder resolution. Fresh four-configuration pairs cover all popup states, but complete errors/Tab/native-dialog interaction and exact glyph/shadow rasterization remain unverified. Settings-origin project registration remains outside this assignment.
- **still differs** Focus now uses global gateway search (four recent pages automatically), source ranking, request-preserving project exclusions/filter UI, inactive disclosure/pagination and coalesced refresh. Runtime coverage checks exclusions/ranking; fresh four-configuration pairs cover Focus/filter/selection. Complete real running/attention and pagination-boundary scenarios are not signed off.
- **still differs** Sidebar now owns opened/closed folders, keyboard targets/focus-within actions, shortcut hints, muted/fork indicators and local-vs-remote Show more. Remote disclosure advances only on success, has per-project pending/errors, and failed pages preserve cursors without restarting SSE. The live worker loads only expanded folder lists and releases unpinned closed-list caches; real-worker initial-load/close/reopen smoke passed. Fresh hidden/default/Focus pairs were reviewed in both themes/sizes. Authentic running/attention captures remain blocked by fixture provider quota/account errors; this is a verification blocker, not a Rune rendering impossibility. Pixel identity and the full interaction matrix remain open.
- **still differs** Find now indexes an all-open projection without opening turns up front, excludes reasoning/non-user messages, stores compact occurrence prefix counts (no per-occurrence row allocation or artificial total cap), preserves the target across live updates, opens a matched folded turn and scopes Markdown occurrence-anchor scrolling to its row. Selection seeds (single line, ≤200 UTF-16 units), query selection, focus restoration, conversation ownership and global Mod+G are implemented. Fresh real-user-text occurrence pair: `goldens/pp-tools/pair-find-chat-open-*-tools-final.png`. **Remaining**: active-occurrence coloring requires changing `src/chat/markdown.rs`/the user-message render call to pass row identity; those files are outside this worktree's allowed scope. Long user-message occurrence geometry, source-exact `timeline-find.tsx` Markdown/folding/count approximation and visible-top initial targeting are not complete. These are integration/port gaps, not claimed Rune impossibilities.
- **still differs** Runtime shortcuts: model/thinking commands now run through exact catalog chords instead of loose legacy modifier checks, non-mac backgrounding uses Ctrl+Shift+B, intervening keys observed by the global handler break double-Escape, and transcript Mod+G works outside the input. Composer-consumed typing still needs its own sequence reset hook outside these folders. Model dialog Escape may dismiss during a save, unlike Icon/Delete. Existing compact-menu arrows/Home/End and real blocking-work background endpoint remain. The complete dialog/input/sequence/Focus matrix is not verified, and numbered-thread ownership still needs the sidebar integration. Workspace/terminal and other owners' dialogs remain outside these allowed folders. No whole-shortcut parity claim is made.
- **still differs (documented Rune limits)** Electron 44.4.5's full default hierarchy/shortcuts are ported and its actual AppKit tree was inspected; `src/menus/native.md` lists every item and technical boundary. Rune has no Chromium WebContents/cache/DevTools/document zoom, so Reload/Force Reload/DevTools/Actual Size/Zoom In/Zoom Out keep source labels and are disabled rather than faked. Rune exposes only eight standard responder selectors, so its own editors cannot handle the additional plain-paste/Delete/substitution/speech roles. Its built-in native spelling menu omits Undo/Redo/macOS Select All and lacks an extension hook for Electron's lookup/search group. Task editors now enable native spelling; Code selection has Look Up (native definition popover), Google (URLSearchParams-equivalent encoding) and whitespace-preserving Copy. System popup pixels and all transcript/workbench/webview link/image/file menus are not fully verified/integrated. These owner boundaries are not marked fixed.
  Tools-pass evidence: **36 fresh pairs** (nine states × both themes × both sizes), scale 2, under `goldens/pp-tools/pair-*-tools-final.png`; fresh overview sheets `review-final-04-*.png` and individual `fresh-final-05-*.png` were read. The final source-only disabled app-control opacity correction (0.40 → web's 0.45) postdates these pairs; no pixel-parity claim follows. The Find pair deliberately exposes the remaining initial-target/color divergence rather than concealing it. `code-context-tree.json` verifies the headless native selected-text menu's lookup/Google/separator/Copy items and copy shortcut. Google still uses the system opener, not the unintegrated in-app browser host. Release workspace build, all **18 workspace tests**, root `bun check` and `bun format:check` pass. Only `/tmp/ocr-pp-tools` (service 4975, gateway 4505) was used; the temporary worker smoke and native menu probe were removed. Fixture processes were terminated only after checking their HOME/XDG environment; both ports were confirmed closed and the fixture directory deleted. No redraw loops were added.
- **still differs** Home without a project, checking, disconnected and unreachable screens now use source headings/actions/toolbar and distinguish HTTP connection status from SSE liveness. Retry/check use GET; Connect alone uses POST. Polling is bounded and independently invalidates connection data. Real no-project/checking/unreachable/disconnected pairs were reviewed in both themes/sizes. Exact glyph/shadow rasterization and the complete Connect/error/native-folder-dialog interaction matrix remain unverified. Browser pairs do not expose Electron's native folder-picker bridge, so the native browse affordance is not visually comparable in those pairs.
- **still differs** Composer model/thinking/access/slash/mention/workspace/branch menus retain previous gaps (ordering, dimensions, counts, exact permission confirmation and live file search). This pass read them but did not complete their 1:1 audit.
- **still differs** Pixel parity is not achieved: typography/rasterization, border inclusion, disabled styling and shadows remain; transcript/workbench differences are visible behind menus and were deliberately not changed. Not all original golden states received fresh pairs.

## Continuation evidence (in progress)

### Sidebar assignment (`rune-pp-sidebar`)

The isolated fixture used OpenCode **4973** and gateway **4504**. Port 4503 belonged
to another worktree and was not touched. Final same-gateway output is under
`apps/rune/goldens/pp-sidebar/`: **44 pairs** named
`pair-*-{dark,light}-{1280x800,1600x1000}-sidebar-verified.png` for home,
search, thread menu, recent-folder popup/path/empty, project setup, Focus,
hidden sidebar, Focus filter and selection menu; **16 additional pairs** named
`pair-{home-no-project,connection-checking,connection-offline,connection-disconnected}-*-sidebar-final.png`.
All four theme/size configurations were reviewed. Checking delays a real request;
unreachable uses a closed port; disconnected follows termination of the verified
fixture-owned OpenCode process. No screenshot API responses are mocked.

Required workspace tests pass **23 tests**, including UTF-16 IME composition with
suffix-preserving undo/redo and failure-safe pagination. Release build, root
`bun check`, `bun format:check` and `bun architecture:check` pass. The updated
canonical PNG and connector directions were inspected. A release CPU-frame check
with **20,000 threads mounted 30 rows in 12.41 ms**; this is a cold CPU frame,
not a GPU or end-to-end input-latency claim. Sidebar shell and root mailbox polling
were split out so the assigned files stay below roughly 800 lines.

Temporary real-worker smoke sources (removed) exercised export save/cancel/stop
cleanup, unregistered folder resolution and scoped session-load/close/cache-release/
reopen. These checks do **not** establish complete 1:1 parity: remaining interaction
matrices, authentic running/attention captures and rendering differences are
explicitly retained in the assigned rows above. Native text/shadow rendering is
the implemented alternative to Chromium rasterization, not evidence of pixel
identity or an excuse for unimplemented behavior.

Cleanup: fixture process environments were reverified before terminating OpenCode
on 4973, gateway on 4504 and its esbuild child. Both fixture ports are closed.
`/tmp/ocr-pp-sidebar` was removed after validation; ignored pair PNGs remain in
the worktree. No shared user service or other worktree's process was stopped.

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

Fixture cleanup after this continuation: the gateway on 4491, isolated OpenCode
service on 4961 and its esbuild child were reverified against their fixture HOME
and OPENCODEX_FIXTURE environment before termination. Both listening ports were
confirmed closed, then `/tmp/ocr-parity` was deleted. Temporary review sheets are
therefore no longer present; the ignored final pair PNGs remain in
`apps/rune/goldens/parity-pages/`. No user service was stopped. The fixture must be
recreated before further live captures. This cleanup does not imply parity completion.

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
