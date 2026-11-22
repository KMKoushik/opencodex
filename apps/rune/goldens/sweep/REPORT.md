# Same-data web / Rune parity sweep

Revision: `fe7ad58a5df48f23a25e8096cddc3c670c85b7ae`. Clock: 2026-11-22T12:00:00.000Z.
UI/backend source fingerprint: `e474b017e6f06fdffb3fed01eaa662b323908c399aafd3b546376791b09b456f`. Reviewed observations are used only for matching fingerprints.

**69 states; 138 state/theme/size attempts.** 39 missing/extra UI · 21 small layout differences · 7 equivalent (only rasterization) · 2 not capturable.
**33 of the missing/extra classifications are driven by the additional native Browser rail button**, not different transcript data. See the per-state layout observations below.

Both clients use gateway **4507**, isolated OpenCode **4977**, and the same authored fixture. No model calls or historical screenshots. Web is LEFT in every pair. Fixtures include Markdown, 40-turn history, completed tools/reasoning, a real native form and permission, source diff/files, native child, side fork, tasks, and an app/canvas. Tasks/Apps empty states temporarily remove their data before the pair and restore it afterwards; both captures and their digests use the same empty lists. New side chat creates a real gateway fork before capturing that selected conversation (including inherited context) in both clients; this compares the rendered result, not native mutation behavior.

## Method and limits

All 67 scored states were visually reviewed on fresh-name, worst-first sheets; refreshed Side chat/tool/terminal pairs were checked separately. Classification is strict about component presence: the native Browser rail button is additional UI in every conversation state because the gateway-served web page has no Electron browser bridge. Those host-only additions are counted, not mislabeled as rasterization or different fixture data. They are not evidence of missing transcript support. Primary surfaces are generally close; large Side chat and middle-history errors are geometry/scroll-layout differences over identical text. A fresh-fixture Home rerun produced byte-identical PNGs for web and Rune in both themes (four SHA-256 equality checks). This is visual parity evidence, not interaction or atomic presentation sign-off.

- Logical size 1280×800 (unless requested otherwise), device scale 2. Chrome channel, gateway `/`, macOS titlebar CSS inset. Native release `--screenshot --at 0.7` with identical size/theme.
- Fixed browser Date and verified native realtime-clock interposer; monotonic/network time remains real. Web CSS animations paused at their initial phase and input caret hidden; native animation/caret phase uses the fixed virtual capture clock. Pointer parked except explicit hover. Transcript scroll fraction explicit. No redraw loops.
- Each pair brackets capture with a SHA-256 digest of the same gateway projects, session info/history, forms, permissions, children, side forks, tasks, apps and canvas data. A changing digest invalidates the pair (no score). Captures are sequential over an unchanged snapshot, **not atomic simultaneous GPU presentation**.
- RGB MAE is 0–255; over16 is the percentage of pixels whose maximum channel error exceeds 16. Structural metric is grayscale MAE after a 2-physical-pixel Gaussian blur and 2× downsampling (lower is better). No alignment correction, masks or cropping. Heatmap magnifies errors 4×.
- Classification is manually reviewed where noted in the driver review file; otherwise thresholds are provisional: equivalent requires RGB <1.5 and blurred MAE <0.7; small layout <5; larger errors missing/extra. State classification uses the worst theme/size. Metrics alone never prove semantic equivalence.
- WKWebView content and unsupported interaction/run states are unscored with explicit reasons; no blank-child or parent/completed-state substitutes.

## States, worst first (worst theme/size shown)

| State                     | Theme / size     | RGB MAE |  >16 % | Blur MAE | Classification                  | Observed difference                                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------- | ------: | -----: | -------: | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| side-chat-new             | light / 1280x800 |   6.966 | 5.6803 |   5.7627 | missing/extra UI                | Same newly created real fork selected in both; native side Markdown/table rhythm and composer height differ; only the temporary fork is removed after the pair. Extra native Browser rail button (host-only).                                                                        |
| panel-side-chat           | light / 1280x800 |  6.9212 | 5.6357 |   5.7468 | missing/extra UI                | Same first side fork explicitly selected and same inherited Markdown; native transcript starts higher in its scroll extent, has different table/list spacing and a shorter composer; narrow main composer controls reflow differently. Extra native Browser rail button (host-only). |
| chat-long-middle          | light / 1280x800 |  4.7301 | 7.5979 |   4.3033 | missing/extra UI                | Both load all 40 turns and scroll to 50%; different total row heights put web near turn 19 and native near turn 20. Extra native Browser rail button (host-only).                                                                                                                    |
| settings-general          | light / 1280x800 |  3.9945 | 4.3998 |   3.5056 | missing/extra UI                | Native adds an OpenCodex Updates card (showing Reading update status in headless mode), shifting the same service/plugin/notification sections down. This is a native-host versus browser-host difference.                                                                           |
| thread-actions-open       | dark / 1280x800  |  4.2564 | 3.7612 |   2.7703 | missing/extra UI                | Same six thread actions; native popup is anchored farther right rather than right-aligning to the trigger; Markdown rhythm also differs. Extra native Browser rail button (host-only).                                                                                               |
| panel-diff-open           | light / 1280x800 |  3.7359 | 3.6671 |   2.6268 | missing/extra UI                | Same actual one-line addition in src/index.ts; native path/header icon, diff gutter and toolbar spacing differ; narrow main-chat code wraps differently. Extra native Browser rail button (host-only).                                                                               |
| panel-file-open           | light / 1280x800 |  3.3237 | 3.4746 |   2.4002 | missing/extra UI                | Same README bytes and source view; native tree/file markers, editor toolbar spacing and narrow main-chat wrapping differ. Extra native Browser rail button (host-only).                                                                                                              |
| composer-mention          | light / 1280x800 |  3.1717 | 3.7195 |   2.3801 | small layout differences        | Same skill/thread suggestions; native popup top/height, row inset and icons differ, not the underlying catalog.                                                                                                                                                                      |
| panel-changes             | light / 1280x800 |  3.2422 | 3.1351 |   2.3371 | missing/extra UI                | Same one-file change tree; native review-empty icon differs and tree/header controls shift slightly; narrow main-chat code wraps instead of horizontally clipping. Extra native Browser rail button (host-only).                                                                     |
| panel-files               | light / 1280x800 |  3.1568 |  3.084 |   2.3015 | missing/extra UI                | Same .git/src/README/report tree; native empty-state glyph differs, controls shift slightly and narrow main-chat code wraps differently. Extra native Browser rail button (host-only).                                                                                               |
| composer-slash            | light / 1280x800 |  2.9746 | 3.5374 |   2.1122 | small layout differences        | Same command rows and descriptions; native menu is slightly lower and leaves more hero subtitle visible.                                                                                                                                                                             |
| find-markdown-open        | light / 1280x800 |  3.4286 |  3.501 |   1.8557 | missing/extra UI                | Same empty Find field and underlying Markdown; native Find lacks the web raised shadow and has a different outline; transcript spacing differs. Extra native Browser rail button (host-only).                                                                                        |
| session-details-open      | light / 1280x800 |  3.6405 | 3.8622 |   1.8132 | missing/extra UI                | Same context, checkout, one changed file, canvas/MCP/skills data; native popover row spacing/height and background Markdown differ. Extra native Browser rail button (host-only).                                                                                                    |
| thread-context-menu       | light / 1280x800 |  3.4971 | 3.4409 |   1.7992 | missing/extra UI                | Same Caching row and six actions at the measured right-click point; row height/shadow and underlying Markdown spacing differ. Extra native Browser rail button (host-only).                                                                                                          |
| chat-architecture-bottom  | light / 1280x800 |  3.2451 | 3.2648 |   1.6983 | missing/extra UI                | Same authored architecture Markdown; list/table row rhythm, checkbox/icon shape and code baseline differ. Extra native Browser rail button (host-only).                                                                                                                              |
| chat-external-read-bottom | light / 1280x800 |  3.2333 | 3.2518 |   1.6954 | missing/extra UI                | Same caching Markdown and native permission record; rendered history matches, with table/list/code spacing differences. This is not pending-permission-dock coverage. Extra native Browser rail button (host-only).                                                                  |
| chat-markdown-bottom      | light / 1280x800 |  3.2371 | 3.2589 |   1.6945 | missing/extra UI                | Same numbered list/table/code/end paragraph; native row/list spacing shifts the code block and final line. Extra native Browser rail button (host-only).                                                                                                                             |
| model-picker-filtered     | light / 1280x800 |  2.1175 | 2.5826 |   1.3838 | small layout differences        | Same big query and Big Pickle result; native popup is shorter and its top edge/search field sit lower.                                                                                                                                                                               |
| project-open-dialog       | light / 1280x800 |   1.762 | 1.7727 |    1.337 | missing/extra UI                | Native adds an inline folder-browse button; path field is wider and setup hero/button geometry differs.                                                                                                                                                                              |
| chat-markdown-middle      | light / 1280x800 |  2.8529 | 2.6461 |   1.3363 | missing/extra UI                | Same full history at 50% scroll; native table/paragraph rhythm displaces the lower code/list and jump control. Extra native Browser rail button (host-only).                                                                                                                         |
| home-no-project           | light / 1280x800 |  1.5371 | 1.5592 |   1.2532 | missing/extra UI                | Native adds a folder-browse icon inside the path field; input/button width and hero vertical alignment differ.                                                                                                                                                                       |
| subagent-conversation     | light / 1280x800 |  1.9109 | 2.7159 |   1.2376 | missing/extra UI                | Same real child prompt/answer, not a parent substitute; native reader omits/moves the web beginning label and places Idle at the bottom; narrow composer reflows differently. Extra native Browser rail button (host-only).                                                          |
| find-long-open            | light / 1280x800 |  2.2782 | 2.1368 |    1.171 | missing/extra UI                | Same empty Find field and final long-history turns; native overlay border/shadow and transcript vertical rhythm differ. Extra native Browser rail button (host-only).                                                                                                                |
| worktree-picker-open      | light / 1280x800 |  1.9724 | 2.2625 |    1.155 | missing/extra UI                | Same Local/New worktree choices; native omits the web leading folder icons and selected checkmark; popup is wider.                                                                                                                                                                   |
| chat-markdown-top         | light / 1280x800 |  2.6007 | 2.8366 |   1.1541 | missing/extra UI                | Same opening prompt/headings/list/table; paragraph/list rhythm, bottom fade and Jump to latest visibility differ. Extra native Browser rail button (host-only).                                                                                                                      |
| panel-terminal            | light / 1280x800 |  2.3261 | 2.5305 |   1.1326 | missing/extra UI                | Same real PTY/prompt and bottom drawer; terminal glyph/cursor outline and tab icons differ; underlying Markdown spacing differs. Extra native Browser rail button (host-only).                                                                                                       |
| model-picker-open         | light / 1280x800 |  2.2499 | 2.2711 |   1.1113 | small layout differences        | Same current model and provider catalog; native row density, visible bottom cutoff and popup shadow differ.                                                                                                                                                                          |
| question-review           | light / 1280x800 |  1.6277 | 1.6917 |   1.1036 | missing/extra UI                | Same Local answer in review; native review card begins slightly lower and its answer/footer rows are tighter. Extra native Browser rail button (host-only).                                                                                                                          |
| chat-long-bottom          | light / 1280x800 |  2.0867 | 1.8947 |   1.0098 | missing/extra UI                | Same final turns 37–40; repeated bubble/answer spacing and line baselines differ slightly. Extra native Browser rail button (host-only).                                                                                                                                             |
| project-picker-open       | light / 1280x800 |  1.9242 | 2.0587 |   0.9643 | small layout differences        | Same atlas-api/home recent-project rows and paths; search popup inset, height and shadow differ slightly.                                                                                                                                                                            |
| composer-attachment       | dark / 1280x800  |  1.6639 | 1.7013 |   0.9218 | small layout differences        | Same notes.txt bytes, 30 B chip and draft; chip padding/icon, hero vertical position and native caret differ.                                                                                                                                                                        |
| tool-detail-open          | light / 1280x800 |  1.9145 |  1.884 |    0.884 | missing/extra UI                | Only the same Read output is expanded, with bottom scroll normalized; native code/input padding and row disclosure icons differ. Extra native Browser rail button (host-only).                                                                                                       |
| question-selected         | light / 1280x800 |  1.7237 | 2.0368 |   0.8773 | missing/extra UI                | Same Local choice selected; radio inset, choice height, footer/button geometry differ slightly. Extra native Browser rail button (host-only).                                                                                                                                        |
| project-actions-open      | light / 1280x800 |  1.1265 | 1.2901 |   0.8616 | small layout differences        | Same six actions at the measured anchor; native menu rows are more compact, shortening the popup.                                                                                                                                                                                    |
| sidebar-row-hover         | light / 1280x800 |  1.6079 | 1.7599 |   0.8289 | missing/extra UI                | Same Caching row hovered; web shows the title/relative-time tooltip, while native shows only the row highlight.                                                                                                                                                                      |
| settings-appearance       | dark / 1280x800  |   1.459 | 2.5603 |    0.828 | small layout differences        | Same visible mode, font size, terminal placement and theme controls; range-track/knob geometry, segmented controls and row metrics differ.                                                                                                                                           |
| chat-question-bottom      | light / 1280x800 |   1.665 | 1.7505 |   0.8139 | missing/extra UI                | Same real form and unselected choices; native title/choice/footer spacing and radio/button rendering differ. Extra native Browser rail button (host-only).                                                                                                                           |
| sidebar-focus-view        | light / 1280x800 |  1.6132 | 1.8147 |   0.7354 | small layout differences        | Same eight Focus titles/order; small row/icon metrics, heading controls and home shadows differ.                                                                                                                                                                                     |
| project-edit-open         | light / 1280x800 |  1.1196 |  1.381 |   0.7335 | small layout differences        | Same fields, path and colors; native Upload icon spans the row and URL action/button sizing differs.                                                                                                                                                                                 |
| app-menu-open             | light / 1280x800 |  1.5766 | 1.6756 |   0.7317 | small layout differences        | Same four menu entries; popup height, row rhythm, border and shadow differ slightly.                                                                                                                                                                                                 |
| worktree-new-selected     | light / 1280x800 |  1.4737 | 1.6087 |   0.6925 | small layout differences        | Same new-worktree selection and master branch; native label lacks the web From prefix and chip sizing differs.                                                                                                                                                                       |
| composer-text             | light / 1280x800 |  1.4988 | 1.6269 |   0.6889 | small layout differences        | Exact same draft and send state; native caret remains visible at its fixed capture phase; glyph/shadow edges differ.                                                                                                                                                                 |
| composer-focused          | light / 1280x800 |  1.4343 | 1.5759 |   0.6613 | small layout differences        | Matching focused composer; native caret/focus painting and shadow differ from the caret-suppressed web capture.                                                                                                                                                                      |
| home-empty                | light / 1280x800 |  1.4294 | 1.5709 |   0.6588 | equivalent (only rasterization) | Matching hero, starters, composer and four-row sidebar; glyph and analytic shadow rasterization differs.                                                                                                                                                                             |
| tool-rows-expanded        | light / 1280x800 |  1.3827 | 1.5622 |   0.6533 | missing/extra UI                | Same reasoning and five collapsed tool rows; native adds leading disclosure chevrons and uses slightly different row/icon metrics. Extra native Browser rail button (host-only).                                                                                                     |
| thoughts-expanded         | light / 1280x800 |  1.3827 | 1.5622 |   0.6533 | missing/extra UI                | Same reasoning text and tool rows; short authored reasoning fits without truncation in both; row chevrons and spacing differ. Extra native Browser rail button (host-only).                                                                                                          |
| settings-remote-access    | light / 1280x800 |  1.2224 | 1.8255 |   0.6216 | small layout differences        | Same off-state fields and no devices; native input/segmented-control insets and card/row dimensions differ slightly.                                                                                                                                                                 |
| settings-general-bottom   | light / 1280x800 |  1.4061 | 2.1365 |   0.5954 | small layout differences        | Both explicitly scrolled to the same bottom sections and paths; native group heights, button insets and wrapped plugin-path text differ slightly.                                                                                                                                    |
| sidebar-hidden            | light / 1280x800 |  1.0993 | 1.1783 |   0.5899 | missing/extra UI                | Native hidden-sidebar toolbar omits web Back/Forward controls; matching centered home content otherwise.                                                                                                                                                                             |
| chat-long-top             | light / 1280x800 |  1.4162 | 1.5753 |   0.5842 | missing/extra UI                | Both fully page to the beginning and show turns 1–4; small repeated bubble/text baseline offsets accumulate. Extra native Browser rail button (host-only).                                                                                                                           |
| sidebar-project-collapsed | light / 1280x800 |  1.2014 | 1.3377 |    0.577 | small layout differences        | Matching collapsed folder and home; disclosure/focus affordance and glyph/shadow edges differ.                                                                                                                                                                                       |
| tasks-empty               | light / 1280x800 |  1.1104 | 1.3247 |   0.5764 | small layout differences        | Both real task lists are empty; native assignee/project filter row sits slightly higher and column/header/control spacing differs.                                                                                                                                                   |
| panel-subagents           | light / 1280x800 |  1.3232 | 1.5538 |   0.5467 | missing/extra UI                | Same real Explore source child, All 1 / Running 0; native header/icon spacing and narrow main composer reflow differ. Extra native Browser rail button (host-only).                                                                                                                  |
| subagents-list            | light / 1280x800 |  1.3232 | 1.5538 |   0.5467 | missing/extra UI                | Same completed Explore source child and counts; native row/header glyphs and narrow main composer layout differ. Extra native Browser rail button (host-only).                                                                                                                       |
| thread-search-open        | light / 1280x800 |  1.1871 | 1.5509 |   0.4983 | small layout differences        | Same gateway-ranked titles and paths; dialog/input outline, result spacing and shadow differ slightly.                                                                                                                                                                               |
| tools-expanded            | light / 1280x800 |  1.0885 | 1.2136 |   0.4758 | missing/extra UI                | Same expanded work turn with collapsed activity summary; disclosure marker and summary/answer baselines differ. Extra native Browser rail button (host-only).                                                                                                                        |
| project-copy-feedback     | light / 1280x800 |  0.6637 | 1.0063 |   0.4243 | small layout differences        | Same Project path copied notice; native project card is slightly shorter and notice/row spacing differs.                                                                                                                                                                             |
| worktrees-empty           | light / 1280x800 |  0.7363 | 0.9989 |   0.4228 | small layout differences        | Same empty worktree dialog and explanatory text; tiny dialog height, border and shadow differences.                                                                                                                                                                                  |
| chat-tools-bottom         | light / 1280x800 |  0.9534 | 1.0553 |   0.3907 | missing/extra UI                | Same collapsed 5s work turn and linked answer; disclosure glyph, link icon and text baselines differ. Extra native Browser rail button (host-only).                                                                                                                                  |
| connection-offline        | light / 1280x800 |   0.561 | 0.6062 |   0.3901 | equivalent (only rasterization) | Matching unreachable-gateway page, retry button and disabled shell; minor glyph/shadow rasterization differences.                                                                                                                                                                    |
| chat-subagent-bottom      | light / 1280x800 |  0.8949 | 0.9547 |   0.3721 | missing/extra UI                | Same parent prompt and answer; near-matching transcript geometry with small bubble/text metrics differences. Extra native Browser rail button (host-only).                                                                                                                           |
| chat-checklist-bottom     | light / 1280x800 |  0.8502 |  0.914 |   0.3688 | missing/extra UI                | Same checked Tests and unchecked Release items; native checkbox shapes and list/text baselines differ. Extra native Browser rail button (host-only).                                                                                                                                 |
| settings-shortcuts        | light / 1280x800 |  0.7704 | 1.2543 |   0.3269 | equivalent (only rasterization) | Matching visible shortcut catalog, row positions and keycaps; glyph/border rasterization differs.                                                                                                                                                                                    |
| settings-projects         | light / 1280x800 |  0.5027 | 0.8383 |   0.3008 | equivalent (only rasterization) | Matching two actual service projects, order, controls and geometry; glyph and border rasterization differs.                                                                                                                                                                          |
| settings-usage            | dark / 1280x800  |   0.342 | 0.5266 |   0.1877 | equivalent (only rasterization) | Matching empty Usage/Limits content and geometry; glyph/refresh-icon rasterization differs.                                                                                                                                                                                          |
| usage-limits-open         | dark / 1280x800  |   0.342 | 0.5266 |   0.1877 | equivalent (only rasterization) | Matching empty Usage/Limits page; only text/refresh-icon rasterization differs.                                                                                                                                                                                                      |
| apps-empty                | light / 1280x800 |  0.5114 | 0.6699 |   0.1876 | equivalent (only rasterization) | Both real app lists are empty; matching empty-state copy, icon and placement with glyph/shadow rasterization differences.                                                                                                                                                            |
| chat-streaming            | dark / 1280x800  |       — |      — |        — | not capturable                  | No model calls: imported unfinished history does not create an active run; no native headless event-feed injection exists. Refusing a completed-transcript substitute.                                                                                                               |
| panel-canvas              | dark / 1280x800  |       — |      — |        — | not capturable                  | WKWebView snapshot API exists but no headless CLI snapshot/export bridge mounts the native child; refusing a blank native-child pixel score.                                                                                                                                         |

## All theme / size measurements

| State                     | Theme | Size     | RGB MAE |  >16 % | Blur MAE | Snapshot stable |
| ------------------------- | ----- | -------- | ------: | -----: | -------: | --------------- |
| side-chat-new             | light | 1280x800 |   6.966 | 5.6803 |   5.7627 | 95fd73e8be7b    |
| panel-side-chat           | light | 1280x800 |  6.9212 | 5.6357 |   5.7468 | bf542ae43bdc    |
| side-chat-new             | dark  | 1280x800 |   6.369 | 5.3765 |   5.2214 | 4d90a9664f27    |
| panel-side-chat           | dark  | 1280x800 |  6.3371 | 5.3335 |     5.21 | 9649f5ce1255    |
| chat-long-middle          | light | 1280x800 |  4.7301 | 7.5979 |   4.3033 | b87e24622ae6    |
| chat-long-middle          | dark  | 1280x800 |   4.244 |  7.555 |   3.8581 | 04d31828faf2    |
| settings-general          | light | 1280x800 |  3.9945 | 4.3998 |   3.5056 | c31990bd2d70    |
| settings-general          | dark  | 1280x800 |  3.7196 | 4.6896 |   3.2545 | 1fb8ca167704    |
| thread-actions-open       | dark  | 1280x800 |  4.2564 | 3.7612 |   2.7703 | 04d31828faf2    |
| thread-actions-open       | light | 1280x800 |  4.2024 | 4.0767 |   2.6336 | b87e24622ae6    |
| panel-diff-open           | light | 1280x800 |  3.7359 | 3.6671 |   2.6268 | b87e24622ae6    |
| panel-diff-open           | dark  | 1280x800 |  3.4886 | 3.6668 |   2.5001 | 04d31828faf2    |
| panel-file-open           | light | 1280x800 |  3.3237 | 3.4746 |   2.4002 | b87e24622ae6    |
| composer-mention          | light | 1280x800 |  3.1717 | 3.7195 |   2.3801 | b87e24622ae6    |
| panel-changes             | light | 1280x800 |  3.2422 | 3.1351 |   2.3371 | b87e24622ae6    |
| panel-files               | light | 1280x800 |  3.1568 |  3.084 |   2.3015 | b87e24622ae6    |
| panel-file-open           | dark  | 1280x800 |  3.0471 | 3.2728 |   2.2067 | 04d31828faf2    |
| panel-changes             | dark  | 1280x800 |  2.9815 | 3.1845 |   2.1774 | 04d31828faf2    |
| composer-slash            | light | 1280x800 |  2.9746 | 3.5374 |   2.1122 | b87e24622ae6    |
| panel-files               | dark  | 1280x800 |  2.8576 |  2.872 |   2.0928 | 04d31828faf2    |
| composer-mention          | dark  | 1280x800 |  2.5834 | 3.8172 |    1.898 | 04d31828faf2    |
| find-markdown-open        | light | 1280x800 |  3.4286 |  3.501 |   1.8557 | b87e24622ae6    |
| session-details-open      | light | 1280x800 |  3.6405 | 3.8622 |   1.8132 | b87e24622ae6    |
| thread-context-menu       | light | 1280x800 |  3.4971 | 3.4409 |   1.7992 | b87e24622ae6    |
| chat-architecture-bottom  | light | 1280x800 |  3.2451 | 3.2648 |   1.6983 | b87e24622ae6    |
| chat-external-read-bottom | light | 1280x800 |  3.2333 | 3.2518 |   1.6954 | b87e24622ae6    |
| chat-markdown-bottom      | light | 1280x800 |  3.2371 | 3.2589 |   1.6945 | b87e24622ae6    |
| session-details-open      | dark  | 1280x800 |   3.369 | 3.6827 |   1.6944 | 04d31828faf2    |
| thread-context-menu       | dark  | 1280x800 |  3.2443 | 3.2516 |   1.6732 | 04d31828faf2    |
| find-markdown-open        | dark  | 1280x800 |  3.1155 | 3.1133 |   1.6599 | 04d31828faf2    |
| chat-architecture-bottom  | dark  | 1280x800 |  3.0237 | 3.0776 |   1.5866 | 04d31828faf2    |
| chat-external-read-bottom | dark  | 1280x800 |  3.0158 | 3.0654 |   1.5851 | 04d31828faf2    |
| chat-markdown-bottom      | dark  | 1280x800 |  3.0162 | 3.0718 |   1.5831 | 04d31828faf2    |
| composer-slash            | dark  | 1280x800 |  2.3103 | 3.4849 |   1.5807 | 04d31828faf2    |
| model-picker-filtered     | light | 1280x800 |  2.1175 | 2.5826 |   1.3838 | b87e24622ae6    |
| project-open-dialog       | light | 1280x800 |   1.762 | 1.7727 |    1.337 | b87e24622ae6    |
| chat-markdown-middle      | light | 1280x800 |  2.8529 | 2.6461 |   1.3363 | b87e24622ae6    |
| chat-markdown-middle      | dark  | 1280x800 |  2.6775 | 2.6473 |   1.2769 | 04d31828faf2    |
| project-open-dialog       | dark  | 1280x800 |   1.682 | 1.8397 |   1.2649 | 04d31828faf2    |
| home-no-project           | light | 1280x800 |  1.5371 | 1.5592 |   1.2532 | b87e24622ae6    |
| subagent-conversation     | light | 1280x800 |  1.9109 | 2.7159 |   1.2376 | c31990bd2d70    |
| model-picker-filtered     | dark  | 1280x800 |  1.8809 | 2.4322 |   1.2352 | 04d31828faf2    |
| home-no-project           | dark  | 1280x800 |   1.472 | 1.6269 |   1.1879 | 04d31828faf2    |
| find-long-open            | light | 1280x800 |  2.2782 | 2.1368 |    1.171 | b87e24622ae6    |
| worktree-picker-open      | light | 1280x800 |  1.9724 | 2.2625 |    1.155 | b87e24622ae6    |
| chat-markdown-top         | light | 1280x800 |  2.6007 | 2.8366 |   1.1541 | b87e24622ae6    |
| panel-terminal            | light | 1280x800 |  2.3261 | 2.5305 |   1.1326 | fe3118d58fae    |
| model-picker-open         | light | 1280x800 |  2.2499 | 2.2711 |   1.1113 | b87e24622ae6    |
| chat-markdown-top         | dark  | 1280x800 |  2.4484 | 2.8066 |   1.1043 | 04d31828faf2    |
| question-review           | light | 1280x800 |  1.6277 | 1.6917 |   1.1036 | b87e24622ae6    |
| subagent-conversation     | dark  | 1280x800 |  1.7001 | 2.6526 |    1.096 | 1fb8ca167704    |
| question-review           | dark  | 1280x800 |  1.5247 | 1.6697 |    1.043 | 04d31828faf2    |
| panel-terminal            | dark  | 1280x800 |  2.1149 | 2.2918 |    1.043 | fe3118d58fae    |
| find-long-open            | dark  | 1280x800 |  2.0366 | 1.8855 |    1.019 | 04d31828faf2    |
| chat-long-bottom          | light | 1280x800 |  2.0867 | 1.8947 |   1.0098 | b87e24622ae6    |
| worktree-picker-open      | dark  | 1280x800 |  1.7417 | 2.2608 |   1.0091 | 04d31828faf2    |
| model-picker-open         | dark  | 1280x800 |  1.9595 | 2.1504 |   0.9875 | 04d31828faf2    |
| project-picker-open       | light | 1280x800 |  1.9242 | 2.0587 |   0.9643 | b87e24622ae6    |
| chat-long-bottom          | dark  | 1280x800 |  1.9372 | 1.8439 |   0.9422 | 04d31828faf2    |
| composer-attachment       | dark  | 1280x800 |  1.6639 | 1.7013 |   0.9218 | 04d31828faf2    |
| tool-detail-open          | light | 1280x800 |  1.9145 |  1.884 |    0.884 | fe3118d58fae    |
| question-selected         | light | 1280x800 |  1.7237 | 2.0368 |   0.8773 | b87e24622ae6    |
| composer-attachment       | light | 1280x800 |  1.7259 | 1.7894 |   0.8752 | b87e24622ae6    |
| project-actions-open      | light | 1280x800 |  1.1265 | 1.2901 |   0.8616 | b87e24622ae6    |
| sidebar-row-hover         | light | 1280x800 |  1.6079 | 1.7599 |   0.8289 | b87e24622ae6    |
| settings-appearance       | dark  | 1280x800 |   1.459 | 2.5603 |    0.828 | 1fb8ca167704    |
| project-picker-open       | dark  | 1280x800 |  1.6594 |  2.003 |    0.827 | 04d31828faf2    |
| question-selected         | dark  | 1280x800 |  1.5933 | 2.0372 |   0.8263 | 04d31828faf2    |
| settings-appearance       | light | 1280x800 |  1.5034 |  2.505 |   0.8229 | c31990bd2d70    |
| chat-question-bottom      | light | 1280x800 |   1.665 | 1.7505 |   0.8139 | b87e24622ae6    |
| sidebar-row-hover         | dark  | 1280x800 |  1.4883 |  1.526 |    0.806 | 04d31828faf2    |
| project-actions-open      | dark  | 1280x800 |  1.0431 | 1.4358 |   0.7927 | 04d31828faf2    |
| tool-detail-open          | dark  | 1280x800 |  1.6785 | 1.8177 |   0.7818 | fe3118d58fae    |
| chat-question-bottom      | dark  | 1280x800 |  1.5326 | 1.7624 |   0.7615 | 04d31828faf2    |
| sidebar-focus-view        | light | 1280x800 |  1.6132 | 1.8147 |   0.7354 | b87e24622ae6    |
| project-edit-open         | light | 1280x800 |  1.1196 |  1.381 |   0.7335 | b87e24622ae6    |
| app-menu-open             | light | 1280x800 |  1.5766 | 1.6756 |   0.7317 | b87e24622ae6    |
| worktree-new-selected     | light | 1280x800 |  1.4737 | 1.6087 |   0.6925 | b87e24622ae6    |
| composer-text             | light | 1280x800 |  1.4988 | 1.6269 |   0.6889 | b87e24622ae6    |
| sidebar-focus-view        | dark  | 1280x800 |  1.4601 | 1.6472 |   0.6874 | 04d31828faf2    |
| app-menu-open             | dark  | 1280x800 |  1.4056 | 1.5254 |   0.6699 | 04d31828faf2    |
| composer-focused          | light | 1280x800 |  1.4343 | 1.5759 |   0.6613 | b87e24622ae6    |
| home-empty                | light | 1280x800 |  1.4294 | 1.5709 |   0.6588 | b19d9d2a94d7    |
| tool-rows-expanded        | light | 1280x800 |  1.3827 | 1.5622 |   0.6533 | fe3118d58fae    |
| thoughts-expanded         | light | 1280x800 |  1.3827 | 1.5622 |   0.6533 | fe3118d58fae    |
| composer-text             | dark  | 1280x800 |  1.3579 | 1.4662 |   0.6441 | 04d31828faf2    |
| worktree-new-selected     | dark  | 1280x800 |  1.3236 | 1.4433 |   0.6419 | 04d31828faf2    |
| settings-remote-access    | light | 1280x800 |  1.2224 | 1.8255 |   0.6216 | c31990bd2d70    |
| composer-focused          | dark  | 1280x800 |  1.2918 | 1.4264 |   0.6183 | 04d31828faf2    |
| home-empty                | dark  | 1280x800 |  1.2806 |  1.405 |   0.6107 | bf542ae43bdc    |
| tool-rows-expanded        | dark  | 1280x800 |  1.2315 | 1.5069 |    0.609 | fe3118d58fae    |
| thoughts-expanded         | dark  | 1280x800 |  1.2315 | 1.5069 |    0.609 | fe3118d58fae    |
| settings-general-bottom   | light | 1280x800 |  1.4061 | 2.1365 |   0.5954 | c31990bd2d70    |
| sidebar-hidden            | light | 1280x800 |  1.0993 | 1.1783 |   0.5899 | b87e24622ae6    |
| chat-long-top             | light | 1280x800 |  1.4162 | 1.5753 |   0.5842 | b87e24622ae6    |
| sidebar-project-collapsed | light | 1280x800 |  1.2014 | 1.3377 |    0.577 | b87e24622ae6    |
| tasks-empty               | light | 1280x800 |  1.1104 | 1.3247 |   0.5764 | af3f328f989f    |
| sidebar-hidden            | dark  | 1280x800 |  0.9775 | 1.0196 |   0.5503 | 04d31828faf2    |
| panel-subagents           | light | 1280x800 |  1.3232 | 1.5538 |   0.5467 | c31990bd2d70    |
| subagents-list            | light | 1280x800 |  1.3232 | 1.5538 |   0.5467 | c31990bd2d70    |
| chat-long-top             | dark  | 1280x800 |  1.3038 | 1.5305 |   0.5461 | 04d31828faf2    |
| project-edit-open         | dark  | 1280x800 |  0.8343 | 1.2476 |   0.5397 | 04d31828faf2    |
| tasks-empty               | dark  | 1280x800 |  1.0219 | 1.1697 |   0.5391 | 6d8b59552c4f    |
| sidebar-project-collapsed | dark  | 1280x800 |  1.0717 | 1.1744 |   0.5368 | 04d31828faf2    |
| settings-remote-access    | dark  | 1280x800 |  1.0358 | 1.7749 |   0.5261 | 1fb8ca167704    |
| thread-search-open        | light | 1280x800 |  1.1871 | 1.5509 |   0.4983 | b87e24622ae6    |
| settings-general-bottom   | dark  | 1280x800 |   1.151 |  2.056 |   0.4973 | 1fb8ca167704    |
| panel-subagents           | dark  | 1280x800 |  1.1854 |  1.495 |   0.4906 | 1fb8ca167704    |
| subagents-list            | dark  | 1280x800 |  1.1854 |  1.495 |   0.4906 | 1fb8ca167704    |
| tools-expanded            | light | 1280x800 |  1.0885 | 1.2136 |   0.4758 | fe3118d58fae    |
| tools-expanded            | dark  | 1280x800 |  1.0154 | 1.1746 |   0.4727 | fe3118d58fae    |
| project-copy-feedback     | light | 1280x800 |  0.6637 | 1.0063 |   0.4243 | b87e24622ae6    |
| worktrees-empty           | light | 1280x800 |  0.7363 | 0.9989 |   0.4228 | b87e24622ae6    |
| project-copy-feedback     | dark  | 1280x800 |  0.6184 | 1.0992 |   0.4003 | 04d31828faf2    |
| chat-tools-bottom         | light | 1280x800 |  0.9534 | 1.0553 |   0.3907 | b87e24622ae6    |
| connection-offline        | light | 1280x800 |   0.561 | 0.6062 |   0.3901 | 552a387f6658    |
| chat-subagent-bottom      | light | 1280x800 |  0.8949 | 0.9547 |   0.3721 | b87e24622ae6    |
| connection-offline        | dark  | 1280x800 |    0.54 | 0.5969 |   0.3711 | b87e24622ae6    |
| chat-checklist-bottom     | light | 1280x800 |  0.8502 |  0.914 |   0.3688 | b87e24622ae6    |
| chat-tools-bottom         | dark  | 1280x800 |  0.8629 | 1.0036 |   0.3617 | 04d31828faf2    |
| chat-subagent-bottom      | dark  | 1280x800 |  0.8146 | 0.9068 |   0.3467 | 04d31828faf2    |
| chat-checklist-bottom     | dark  | 1280x800 |  0.7629 | 0.8661 |   0.3339 | 04d31828faf2    |
| settings-shortcuts        | light | 1280x800 |  0.7704 | 1.2543 |   0.3269 | c31990bd2d70    |
| settings-shortcuts        | dark  | 1280x800 |  0.7014 | 1.2357 |   0.3141 | 1fb8ca167704    |
| thread-search-open        | dark  | 1280x800 |  0.7616 | 1.3397 |   0.3118 | 04d31828faf2    |
| settings-projects         | light | 1280x800 |  0.5027 | 0.8383 |   0.3008 | c31990bd2d70    |
| settings-projects         | dark  | 1280x800 |  0.4742 | 0.8493 |    0.288 | 1fb8ca167704    |
| worktrees-empty           | dark  | 1280x800 |  0.5005 | 0.8499 |    0.274 | 04d31828faf2    |
| settings-usage            | dark  | 1280x800 |   0.342 | 0.5266 |   0.1877 | 1fb8ca167704    |
| usage-limits-open         | dark  | 1280x800 |   0.342 | 0.5266 |   0.1877 | 1fb8ca167704    |
| apps-empty                | light | 1280x800 |  0.5114 | 0.6699 |   0.1876 | 349f3b30fc63    |
| settings-usage            | light | 1280x800 |   0.366 |  0.534 |    0.186 | c31990bd2d70    |
| usage-limits-open         | light | 1280x800 |  0.3659 |  0.534 |    0.186 | c31990bd2d70    |
| apps-empty                | dark  | 1280x800 |  0.4382 | 0.6331 |   0.1611 | a0ee9c1422b8    |
| chat-streaming            | dark  | 1280x800 |       — |      — |        — | unscored        |
| panel-canvas              | dark  | 1280x800 |       — |      — |        — | unscored        |
| chat-streaming            | light | 1280x800 |       — |      — |        — | unscored        |
| panel-canvas              | light | 1280x800 |       — |      — |        — | unscored        |

## Reproduce

```sh
bun apps/rune/tools/sweep/run.ts
# Optional: --states home-empty,chat-markdown-top --themes dark,light --sizes 1280x800
```

Requires Bun, Node, Chrome, Rust/macOS toolchain and Python Pillow. Builds web and Rune incrementally; isolated CLI pinned to 2.3.2. Only processes whose actual environment contains `HOME=/tmp/ocr-sweep/home` are terminated. The temporary environment is removed in finally; `--keep-env` is for diagnosis only. PNGs, logs, DOM observations, fixture manifest and full per-theme metrics stay local/ignored. `--report-only` regenerates this report from local results and checked-in review descriptions.
