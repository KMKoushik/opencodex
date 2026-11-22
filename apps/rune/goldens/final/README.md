# Final integration review — not a 1:1 parity sign-off

**69 states, dark and light, 1280×800 logical pixels, scale 2.** There are 138
native captures and 69 paired PNGs. Each `pair-<state>.png` has dark above light,
web left and Rune right. Raw native captures retain full resolution. All pairs
were visually inspected through nine fresh-name overview sheets; Apps empty,
project copy feedback and General bottom were refreshed and inspected separately
at full pair resolution (`*-integration-v2.png`). This is a layout/content review,
not a pixel-equality measurement or an exhaustive native interaction sign-off.

**Counts: 0 identical · 6 minor rendering differences · 63 content differs.**
A content-diff classification includes differing sidebar/project data, not just
missing UI. Many geometries are close; no content mismatch is counted as identical.

## Fixture and provenance

Only `/tmp/ocr-final`, OpenCode 4976 and gateway 4506 were used. The V2 service
received explicitly authored transcripts from `tools/parity-fixture.ts` and a
native form, plus a gateway-created side fork/canvas. These are **not** successful
model replies or a replay of the historical oracle. No free-model calls were made.
The original `goldens/web` corpus was not changed. The fixture canvas was deleted
only after bundle verification, then Apps empty was recaptured against the real
empty list. Other pairs therefore retain its earlier sidebar link. Known missing
streaming/child states and native-child capture omissions are stated below rather
than fabricated. Regeneration uses `tools/final-capture.py`; `OCR_STATES` narrows a
refresh. The fixture must first be recreated; its ephemeral data is not retained.

## State table

| State                       | Match quality               | Observed differences                                                                                                             |
| --------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `app-menu-open`             | content differs             | Sidebar fixture titles/projects differ; menu font/shadow rasterization differs.                                                  |
| `apps-empty`                | content differs             | Empty-state content/geometry close; sidebar has one fixture project instead of two. Refreshed after deleting the fixture canvas. |
| `chat-architecture-bottom`  | content differs             | Authored transcript/table/code content differs from historical model reply; native Markdown wrapping/spacing differs.            |
| `chat-checklist-bottom`     | content differs             | Authored transcript/table/code content differs from historical model reply; native Markdown wrapping/spacing differs.            |
| `chat-external-read-bottom` | content differs             | Authored transcript/table/code content differs from historical model reply; native Markdown wrapping/spacing differs.            |
| `chat-long-bottom`          | content differs             | Authored 40-turn test-tip history, not the original model history; turn headers and text rhythm differ.                          |
| `chat-long-middle`          | content differs             | Authored 40-turn test-tip history, not the original model history; turn headers and text rhythm differ.                          |
| `chat-long-top`             | content differs             | Authored 40-turn test-tip history, not the original model history; turn headers and text rhythm differ.                          |
| `chat-markdown-bottom`      | content differs             | Authored transcript/table/code content differs from historical model reply; native Markdown wrapping/spacing differs.            |
| `chat-markdown-middle`      | content differs             | Authored transcript/table/code content differs from historical model reply; native Markdown wrapping/spacing differs.            |
| `chat-markdown-top`         | content differs             | Authored transcript/table/code content differs from historical model reply; native Markdown wrapping/spacing differs.            |
| `chat-question-bottom`      | content differs             | Real V2-authored form; assistant acknowledgement/title and dock metrics differ.                                                  |
| `chat-streaming`            | content differs             | Completed authored transcript, not the oracle live stream. Streaming state is not verified by this capture.                      |
| `chat-subagent-bottom`      | content differs             | Authored transcript/table/code content differs from historical model reply; native Markdown wrapping/spacing differs.            |
| `chat-tools-bottom`         | content differs             | Authored transcript/table/code content differs from historical model reply; native Markdown wrapping/spacing differs.            |
| `composer-attachment`       | content differs             | Composer state present; fixture sidebar/catalog data, icon/text/shadow rasterization and menu metrics differ.                    |
| `composer-focused`          | content differs             | Composer state present; fixture sidebar/catalog data, icon/text/shadow rasterization and menu metrics differ.                    |
| `composer-mention`          | content differs             | Composer state present; fixture sidebar/catalog data, icon/text/shadow rasterization and menu metrics differ.                    |
| `composer-slash`            | content differs             | Composer state present; fixture sidebar/catalog data, icon/text/shadow rasterization and menu metrics differ.                    |
| `composer-text`             | content differs             | Composer state present; fixture sidebar/catalog data, icon/text/shadow rasterization and menu metrics differ.                    |
| `connection-offline`        | content differs             | Correct unreachable state; sidebar fixture contents and native text rasterization differ.                                        |
| `find-long-open`            | content differs             | Different authored history and seeded test query; occurrence highlights visible, not the oracle empty query.                     |
| `find-markdown-open`        | content differs             | Authored Markdown/table differs; seeded test query/highlights and paragraph geometry differ.                                     |
| `home-empty`                | content differs             | Home content/geometry close; sidebar fixture names, count and app link differ.                                                   |
| `home-no-project`           | content differs             | Correct folder setup; sidebar app link and Browse affordance/layout differ.                                                      |
| `model-picker-filtered`     | content differs             | Same big filter; catalog/provider contents and menu height differ.                                                               |
| `model-picker-open`         | content differs             | Provider/catalog contents and visible rows differ; menu geometry/rasterization differs.                                          |
| `panel-canvas`              | content differs             | Real canvas selected; headless Rune omits its WK child. Not an atomic native-content capture.                                    |
| `panel-changes`             | content differs             | Underlying authored chat differs; native empty-state icon and file/tree chrome differ.                                           |
| `panel-diff-open`           | content differs             | Real changed source; underlying chat, source bytes, gutters and toolbar differ.                                                  |
| `panel-file-open`           | content differs             | Real source editor; source bytes, file tab/tree controls and underlying chat differ.                                             |
| `panel-files`               | content differs             | Fixture file tree and inspector empty state differ; underlying authored chat differs.                                            |
| `panel-side-chat`           | content differs             | Real gateway-created side fork; inherited history, picker/context/dock controls differ.                                          |
| `panel-subagents`           | content differs             | Empty native list; underlying authored conversation differs.                                                                     |
| `panel-terminal`            | content differs             | Real PTY; underlying inspector absent in this capture, shell prompt/cwd and toolbar metrics differ.                              |
| `project-actions-open`      | content differs             | Fixture project list differs; native menu anchor is not the oracle right-hand anchor.                                            |
| `project-copy-feedback`     | content differs             | Exact inline copied text; two fixture projects rather than three. Refreshed on Projects route.                                   |
| `project-edit-open`         | content differs             | Editor content present; fixture project list, controls and native glyph/shadow edges differ.                                     |
| `project-open-dialog`       | content differs             | Correct folder setup; folder/sidebar fixture and Browse control geometry differ.                                                 |
| `project-picker-open`       | content differs             | Recent-folder data/count differ; search popup geometry and native text differ.                                                   |
| `question-review`           | content differs             | Real authored form review; assistant history, title and dock geometry differ.                                                    |
| `question-selected`         | content differs             | Real authored Local choice; assistant history, title and dock geometry differ.                                                   |
| `session-details-open`      | content differs             | Native session details open; oracle has different underlying panel/session resources and usage.                                  |
| `settings-appearance`       | minor rendering differences | Native spring/range geometry and glyph/border/shadow rasterization differ; matching visible control content.                     |
| `settings-general`          | content differs             | Native desktop Updates card is additional to historical browser oracle; fixture paths and geometry differ.                       |
| `settings-general-bottom`   | content differs             | Correct bottom scroll after refresh; plugin/project fixture paths and native control rasterization differ.                       |
| `settings-projects`         | content differs             | Two real fixture projects instead of three; ordering and icon rendering differ.                                                  |
| `settings-remote-access`    | minor rendering differences | Matching visible off-state content; field widths, native glyphs, radii and border rasterization differ.                          |
| `settings-shortcuts`        | minor rendering differences | Matching visible catalog rows; small row/glyph/border rasterization differences.                                                 |
| `settings-usage`            | minor rendering differences | Matching empty provider content; text, refresh glyph and native rasterization differ.                                            |
| `side-chat-new`             | content differs             | Existing real side fork listed; not the oracle New side chat interaction. Picker/context/dock controls still differ.             |
| `sidebar-focus-view`        | content differs             | Real global Focus query; fixture titles/order/attention and populated count differ.                                              |
| `sidebar-hidden`            | minor rendering differences | Matching home content without sidebar; native glyphs, shadows and composer details differ.                                       |
| `sidebar-project-collapsed` | content differs             | Disclosure collapsed; fixture count/app link and native glyphs differ.                                                           |
| `sidebar-row-hover`         | content differs             | Real fixture row hovered; different title/order and native focus/action painting.                                                |
| `subagent-conversation`     | content differs             | Fixture has no spawned native child; parent transcript shown, not an authentic child conversation.                               |
| `subagents-list`            | content differs             | Oracle completed child is absent from fixture; native list is empty.                                                             |
| `tasks-empty`               | content differs             | Matching plugin-setup page; fixture path/sidebar data and native icon/text metrics differ.                                       |
| `thoughts-expanded`         | content differs             | Authored tool transcript has different work/reasoning content; source thoughts state not reproduced exactly.                     |
| `thread-actions-open`       | content differs             | Different selected/underlying session and anchor; native menu text/shadow differs.                                               |
| `thread-context-menu`       | content differs             | Correct context menu; fixture titles/anchor and native menu text/shadow differ.                                                  |
| `thread-search-open`        | content differs             | Real gateway results from authored sessions differ; native modal geometry/text differs.                                          |
| `tool-detail-open`          | content differs             | Authored tool inputs/outputs differ from original model run; native disclosure/header/payload metrics differ.                    |
| `tool-rows-expanded`        | content differs             | Authored tool inputs/outputs differ from original model run; native disclosure/header/payload metrics differ.                    |
| `tools-expanded`            | content differs             | Authored tool inputs/outputs differ from original model run; native disclosure/header/payload metrics differ.                    |
| `usage-limits-open`         | minor rendering differences | Matching empty Usage/Limits state; native text, refresh glyph and rasterization differ.                                          |
| `worktree-new-selected`     | content differs             | Fixture main branch differs from oracle; workspace/branch chip metrics and sidebar data differ.                                  |
| `worktree-picker-open`      | content differs             | Matching choices; fixture branch/sidebar and menu geometry differ.                                                               |
| `worktrees-empty`           | content differs             | Correct empty worktree dialog; background project list/order and native text/shadow differ.                                      |

## Build and native bundle verification

`bash apps/rune/tools/bundle.sh` passed for the arm64 ad-hoc app. Two normal native
bundle launches (Terminal and Canvas) used isolated HOME/XDG and no gateway URL.
Both started their packaged child on a free loopback port, connected to isolated
OpenCode, delivered real sidebar snapshots and loaded chat history through that
child. Terminal opening created/loaded a real PTY. The canvas existed and was
requested through the native launch option; visible WK mounting/content was **not
verified** on this covered/offscreen WindowServer. Both launches reported skipped
GPU frames, so there is no visible-startup or native frame/presentation claim.

The private parent pipe served a real `/api/host/update` state with the correct
ad-hoc-signature disable reason. A runtime check caught codesign's `# designated`
output format; parsing and an identity regression were corrected. Explicit parent
termination closed only the owned gateway; it exited and isolated OpenCode stayed
connected. This verifies EOF/parent-exit cleanup, **not** native menu-driven Quit.
Signed release-to-release download/install/relaunch remains unverified.

## Remaining integration work

Native HTML allowlist rendering, inline-code/link line-box/icon geometry, and the
remaining subagent/side-chat/canvas/browser interaction gaps are still open in
`../parity-chat.md`. The 1:1 acceptance criterion is not met. No redraw loop was
added to bypass the covered-window limitation.

## Final checks and cleanup

- `cargo build --release --workspace`: passed.
- `cargo test --workspace`: 111 unit tests passed; six upstream example doctests ignored.
- `bun check`: passed (72 gateway tests, types, lint, plugin/canvas checks and builds).
- `bun format:check`: passed.
- `bun architecture:check`: passed; generated PNG and connector directions inspected.

The native bundles and both sidecars were stopped. OpenCode, the fixture gateway
and its esbuild child were terminated only after verifying their actual isolated
HOME environment. Ports 4976/4506 were confirmed closed and `/tmp/ocr-final` was
removed. The user's shared OpenCode service/storage were not accessed.
