# Same-data Electron / Rune parity sweep

Revision: `8466d854239b62ec1a0ea1150a01a8425f7595dc`. Clock: 2026-11-22T12:00:00.000Z.
UI/backend source fingerprint: `5f483eeecd98e3c280089e74ebb46a7389e618a842f9ca6c768987807e71a89b`. Reviewed observations are used only for matching fingerprints.

**69 states; 138 state/theme/size attempts.** 57 small layout differences · 3 missing/extra UI · 7 equivalent (only rasterization) · 2 not capturable.

Both clients use gateway **4507**, isolated OpenCode **4977**, and the same authored fixture. No model calls or historical screenshots. **Real Electron is LEFT**, Rune RIGHT. Electron runs this checkout’s built main and sandboxed preload with `ELECTRON_RENDERER_URL=http://127.0.0.1:4507`, isolated HOME/XDG and a per-capture temporary user-data directory. Its genuine desktop bridge supplies Browser and Updates capabilities; no preload substitute or host-capability mock is installed. Fixtures include Markdown, 40-turn history, completed tools/reasoning, a real native form and permission, source diff/files, native child, side fork, tasks, and an app/canvas. Tasks/Apps empty states temporarily remove their data before the pair and restore it afterwards; both captures and their digests use the same empty lists. New side chat creates a real gateway fork before capturing that selected conversation (including inherited context) in both clients; this compares the rendered result, not native mutation behavior.

## Method and limits

All 69 states completed in both themes: 134 scored pairs and four explicitly unsupported attempts. All 67 scored states were visually reviewed on fresh-name, worst-first Electron/Rune sheets, including the worst 25 below. Both clients show the Browser rail and Updates card; the previous Chrome-host absence classifications are withdrawn. Electron's Updates card is NOT hidden in this development launch: it says Updates are available in installed builds, not development, and disables Check for updates. Rune's headless card instead reads Reading update status with Check enabled. This is an updater-state/headless limitation, not an extra card. The layout category includes substantial scroll/reflow mismatches in Side chat and middle history; it does not imply a small pixel error. Streaming and WKWebView canvas remain unscored. All 134 scored snapshot digests stayed unchanged. This is visual parity evidence, not interaction or atomic presentation sign-off; no fresh-fixture byte-repeatability claim is made for this Electron corpus.

- Logical size 1280×800 (unless requested otherwise), device scale 2. Installed Electron binary runs this checkout’s actual built desktop main, preload and IPC handlers; Playwright connects through its ephemeral remote-debugging port/CDP. A finite temporary bootstrap imports that real main and only sets window content size, theme and hidden state. CDP device metrics match the content size. `Page.captureScreenshot` captures the hidden renderer surface, excluding OS titlebar traffic lights. The genuine preload enables the macOS titlebar inset. Native release `--screenshot --at 0.7` uses the same size/theme. Each scored record verifies the real bridge, viewport and scale and records Electron/Chromium versions.
- Fixed browser Date and verified native realtime-clock interposer; monotonic/network time remains real. Web CSS animations paused at their initial phase and input caret hidden; native animation/caret phase uses the fixed virtual capture clock. Pointer parked except explicit hover. Transcript scroll fraction explicit. No redraw loops.
- Each pair brackets capture with a SHA-256 digest of the same gateway projects, session info/history, forms, permissions, children, side forks, tasks, apps and canvas data. A changing digest invalidates the pair (no score). Captures are sequential over an unchanged snapshot, **not atomic simultaneous GPU presentation**.
- RGB MAE is 0–255; over16 is the percentage of pixels whose maximum channel error exceeds 16. Structural metric is grayscale MAE after a 2-physical-pixel Gaussian blur and 2× downsampling (lower is better). No alignment correction, masks or cropping. Heatmap magnifies errors 4×.
- Classification is manually reviewed where noted in the driver review file; otherwise thresholds are provisional: equivalent requires RGB <1.5 and blurred MAE <0.7; small layout <5; larger errors missing/extra. State classification uses the worst theme/size. Metrics alone never prove semantic equivalence.
- WKWebView content and unsupported interaction/run states are unscored with explicit reasons; no blank-child or parent/completed-state substitutes.

## States, worst first (worst theme/size shown)

| State                     | Theme / size     | RGB MAE |  >16 % | Blur MAE | Classification                  | Observed difference                                                                                                                                                                                                                                                            |
| ------------------------- | ---------------- | ------: | -----: | -------: | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| side-chat-new             | light / 1280x800 |  6.7066 |  5.481 |   5.7179 | small layout differences        | Same newly created second fork selected in both; Rune's side transcript shows the Modules heading and lower table/code at a different scroll extent, with a shorter composer; only this temporary fork is removed after capture.                                               |
| panel-side-chat           | light / 1280x800 |  6.6777 | 5.4462 |   5.7093 | small layout differences        | Same first side fork selected and inherited Markdown; Rune shows Modules near the top while Electron starts within its list, moving the table/code down; side composer is shorter and narrow main controls reflow.                                                             |
| chat-long-middle          | light / 1280x800 |  4.4547 | 7.4181 |   4.2332 | small layout differences        | Both load all 40 turns at 50% scroll; accumulated row-height differences show Electron turns 19–22 versus Rune 20–23, with Rune's Jump to latest also visible.                                                                                                                 |
| panel-diff-open           | light / 1280x800 |  3.4588 | 3.4932 |   2.5295 | small layout differences        | Same src/index.ts addition and diff lines; Rune's file icon, gutter and toolbar metrics differ, while narrow main-chat code wraps and composer controls reflow.                                                                                                                |
| thread-actions-open       | dark / 1280x800  |  3.9354 |  3.518 |   2.5182 | small layout differences        | Same six thread actions; Rune anchors the popup's left edge at the trigger instead of Electron's right alignment, moving it into the rail; table/list rhythm also differs.                                                                                                     |
| panel-file-open           | light / 1280x800 |  3.0711 | 3.3166 |    2.302 | small layout differences        | Same README bytes, source lines and file tree; Rune's tree/file markers and editor toolbar spacing differ, alongside wrapped narrow-chat code and reflowed composer.                                                                                                           |
| panel-changes             | light / 1280x800 |  2.9811 | 2.9466 |   2.2252 | small layout differences        | Same one-file change tree and Review your changes placeholder; Rune's empty-state glyph/toolbar differ, and narrow main-chat code wraps rather than clipping horizontally.                                                                                                     |
| panel-files               | light / 1280x800 |  2.8976 | 2.8957 |   2.1996 | small layout differences        | Same .git/src/README/report tree and workspace placeholder; Rune uses a different empty-state glyph and toolbar metrics, with wrapped narrow-chat code and reflowed composer.                                                                                                  |
| composer-mention          | light / 1280x800 |  2.6893 | 3.3161 |    2.122 | small layout differences        | Same three skill and five thread suggestions; Rune's popup starts lower, has tighter row insets and different glyphs, not a different catalog.                                                                                                                                 |
| composer-slash            | light / 1280x800 |  2.4074 | 3.0789 |   1.7256 | small layout differences        | Same six command rows and descriptions; Rune's popup starts lower and is shorter, exposing the hero subtitle that Electron's popup overlaps.                                                                                                                                   |
| find-markdown-open        | light / 1280x800 |  3.0678 | 3.2678 |   1.5615 | small layout differences        | Same empty Find field and Markdown; Rune's Find box lacks Electron's raised shadow, while table/list/code baselines shift down.                                                                                                                                                |
| session-details-open      | light / 1280x800 |  3.2509 | 3.6219 |   1.5264 | small layout differences        | Same context, checkout, one changed file, canvas/MCP/skills values; Rune's Session popover is slightly tighter and underlying table/code baselines differ.                                                                                                                     |
| thread-context-menu       | light / 1280x800 |  2.9102 |  3.075 |   1.4219 | small layout differences        | Same Caching row and six actions at the measured right-click point; popup row height/shadow differ slightly while Rune's underlying table/code baselines sit lower.                                                                                                            |
| chat-architecture-bottom  | light / 1280x800 |  2.8951 | 3.0414 |   1.4141 | small layout differences        | Same authored architecture Markdown and three-row table; Rune's list/table rhythm displaces the checklist/code/final paragraph and checkbox glyphs differ.                                                                                                                     |
| chat-markdown-bottom      | light / 1280x800 |  2.8861 | 3.0355 |   1.4092 | small layout differences        | Same numbered list, three-row table, checklist, code and final paragraph; Rune's table/list spacing moves the code block and final line down.                                                                                                                                  |
| chat-external-read-bottom | light / 1280x800 |  2.8752 | 3.0282 |   1.4085 | small layout differences        | Same caching Markdown and permission record; Rune's table/list spacing moves the checklist/code/final line down. This is rendered history, not pending-permission-dock coverage.                                                                                               |
| settings-general-bottom   | light / 1280x800 |  2.5315 | 3.7104 |      1.4 | small layout differences        | Both scrolled to the same service/plugin, notification and project sections; Rune's group heights/button insets differ and plugin-path wrapping shifts section boundaries.                                                                                                     |
| project-open-dialog       | light / 1280x800 |    1.56 | 1.6619 |    1.302 | small layout differences        | Both show the same setup page with an inline folder-browse button; Rune's path field is wider and hero/button group sits slightly higher.                                                                                                                                      |
| home-no-project           | light / 1280x800 |  1.5079 |  1.565 |   1.2854 | small layout differences        | Both show the inline folder-browse control and identical setup copy; Rune's hero/input group sits slightly higher and its input is wider.                                                                                                                                      |
| chat-markdown-top         | light / 1280x800 |  2.6891 | 2.8246 |   1.2463 | small layout differences        | Same beginning label, prompt, headings, list and table; Rune's paragraph/list rhythm shifts lower content and shows Jump to latest where Electron has no floating control.                                                                                                     |
| subagent-conversation     | light / 1280x800 |   1.435 |  2.366 |   1.0758 | small layout differences        | Same real child prompt/answer; Rune omits Electron's beginning label in the child reader, shifts the prompt/answer upward and puts Idle at the bottom; narrow main composer controls reflow.                                                                                   |
| model-picker-filtered     | light / 1280x800 |  1.3494 | 1.9094 |   1.0181 | small layout differences        | Same big query and Big Pickle result; Rune's filtered popup is shorter and its search field/top edge sit lower above the composer.                                                                                                                                             |
| question-review           | light / 1280x800 |  1.3589 | 1.5221 |    1.017 | small layout differences        | Same Local answer and Review answers state; Rune's card begins lower, with tighter answer/footer rows and different button height.                                                                                                                                             |
| chat-markdown-middle      | light / 1280x800 |  2.0128 | 2.1938 |   0.9699 | small layout differences        | Same Markdown history at 50% scroll; Rune's table/list rhythm and code-block position differ, and its Jump to latest control overlays the lower transcript.                                                                                                                    |
| panel-terminal            | light / 1280x800 |  1.9874 | 2.2576 |   0.9478 | small layout differences        | Same real PTY prompt and bottom drawer; Rune has an outlined cursor versus Electron's solid cursor, different tab glyphs and shifted Markdown/code baselines.                                                                                                                  |
| settings-general          | light / 1280x800 |  1.7872 | 2.5334 |   0.9202 | small layout differences        | Both show the Updates card: Electron says Updates are available in installed builds, not development and disables Check for updates; headless Rune says Reading update status with Check enabled. Updater-state limitation plus small group/button metrics, not an extra card. |
| find-long-open            | light / 1280x800 |  1.7997 | 1.8673 |    0.904 | small layout differences        | Same empty Find field and final long-history turns; native overlay border/shadow and transcript vertical rhythm differ.                                                                                                                                                        |
| project-actions-open      | light / 1280x800 |  1.0263 | 1.2276 |   0.8257 | small layout differences        | Same six actions at the measured anchor; native menu rows are more compact, shortening the popup.                                                                                                                                                                              |
| question-selected         | light / 1280x800 |  1.4101 | 1.8177 |   0.7707 | small layout differences        | Same Local choice selected; radio inset, choice height, footer/button geometry differ slightly.                                                                                                                                                                                |
| worktree-picker-open      | light / 1280x800 |  1.1457 | 1.5186 |    0.757 | missing/extra UI                | Same Local/New worktree choices; native omits Electron's leading folder icons and selected checkmark; popup is wider.                                                                                                                                                          |
| chat-long-bottom          | light / 1280x800 |  1.6139 | 1.6295 |   0.7462 | small layout differences        | Same final turns 37–40; repeated bubble/answer spacing and line baselines differ slightly.                                                                                                                                                                                     |
| model-picker-open         | light / 1280x800 |   1.501 | 1.7241 |   0.7327 | small layout differences        | Same current model and provider catalog; native row density, visible bottom cutoff and popup shadow differ.                                                                                                                                                                    |
| tool-detail-open          | light / 1280x800 |  1.3817 | 1.8158 |   0.7327 | small layout differences        | Only the same Read output is expanded, with bottom scroll normalized; native code/input padding and row disclosure icons differ.                                                                                                                                               |
| settings-appearance       | dark / 1280x800  |  1.0955 | 1.8858 |   0.7118 | small layout differences        | Same visible mode, font size, terminal placement and theme controls; range-track/knob geometry, segmented controls and row metrics differ.                                                                                                                                     |
| settings-remote-access    | light / 1280x800 |  1.2999 | 2.0713 |     0.71 | small layout differences        | Same off-state fields and no devices; native input/segmented-control insets and card/row dimensions differ slightly.                                                                                                                                                           |
| chat-question-bottom      | light / 1280x800 |  1.3506 | 1.5318 |   0.7064 | small layout differences        | Same real form and unselected choices; native title/choice/footer spacing and radio/button rendering differ.                                                                                                                                                                   |
| project-picker-open       | light / 1280x800 |  1.2036 | 1.4069 |   0.6703 | small layout differences        | Same atlas-api/home recent-project rows and paths; search popup inset, height and shadow differ slightly.                                                                                                                                                                      |
| chat-long-top             | light / 1280x800 |  1.3456 | 1.5012 |   0.6129 | small layout differences        | Both fully page to the beginning and show turns 1–4; small repeated bubble/text baseline offsets accumulate.                                                                                                                                                                   |
| project-edit-open         | light / 1280x800 |   0.733 | 0.9785 |   0.5588 | small layout differences        | Same fields, path and colors; native Upload icon spans the row and URL action/button sizing differs.                                                                                                                                                                           |
| composer-attachment       | dark / 1280x800  |  0.8172 | 0.9707 |   0.5156 | small layout differences        | Same notes.txt bytes, 30 B chip and draft; chip padding/icon, hero vertical position and native caret differ.                                                                                                                                                                  |
| tool-rows-expanded        | light / 1280x800 |  0.9655 |  1.236 |   0.4692 | small layout differences        | Same reasoning and five collapsed tool rows; native adds leading disclosure chevrons and uses slightly different row/icon metrics.                                                                                                                                             |
| thoughts-expanded         | light / 1280x800 |  0.9655 |  1.236 |   0.4692 | small layout differences        | Same reasoning text and tool rows; short authored reasoning fits without truncation in both; row chevrons and spacing differ.                                                                                                                                                  |
| tasks-empty               | light / 1280x800 |  0.8102 | 1.1187 |   0.4513 | small layout differences        | Both real task lists are empty; native assignee/project filter row sits slightly higher and column/header/control spacing differs.                                                                                                                                             |
| sidebar-row-hover         | dark / 1280x800  |  0.7051 | 0.8577 |   0.4333 | missing/extra UI                | Same Caching row hovered; Electron shows the title/relative-time tooltip, while native shows only the row highlight.                                                                                                                                                           |
| worktrees-empty           | light / 1280x800 |  0.7684 | 1.0375 |   0.4113 | small layout differences        | Same empty worktree dialog and explanatory text; tiny dialog height, border and shadow differences.                                                                                                                                                                            |
| project-copy-feedback     | light / 1280x800 |  0.5556 |  0.936 |   0.3713 | small layout differences        | Same Project path copied notice; native project card is slightly shorter and notice/row spacing differs.                                                                                                                                                                       |
| panel-subagents           | light / 1280x800 |  0.8009 | 1.1826 |   0.3646 | small layout differences        | Same real Explore source child, All 1 / Running 0; native header/icon spacing and narrow main composer reflow differ.                                                                                                                                                          |
| subagents-list            | light / 1280x800 |  0.8009 | 1.1826 |   0.3646 | small layout differences        | Same completed Explore source child and counts; native row/header glyphs and narrow main composer layout differ.                                                                                                                                                               |
| settings-shortcuts        | light / 1280x800 |  0.8606 | 1.2119 |   0.3521 | equivalent (only rasterization) | Matching visible shortcut catalog, row positions and keycaps; glyph/border rasterization differs.                                                                                                                                                                              |
| app-menu-open             | light / 1280x800 |  0.6785 | 0.8659 |   0.3111 | small layout differences        | Same four menu entries; popup height, row rhythm, border and shadow differ slightly.                                                                                                                                                                                           |
| worktree-new-selected     | light / 1280x800 |  0.5703 | 0.7975 |   0.2705 | small layout differences        | Same new-worktree selection and master branch; native label lacks Electron's From prefix and chip sizing differs.                                                                                                                                                              |
| sidebar-focus-view        | light / 1280x800 |  0.5931 | 0.9075 |   0.2696 | small layout differences        | Same eight Focus titles/order; small row/icon metrics, heading controls and home shadows differ.                                                                                                                                                                               |
| sidebar-hidden            | light / 1280x800 |   0.473 | 0.5524 |   0.2683 | missing/extra UI                | Native hidden-sidebar toolbar omits Electron's brand mark and shifts the sidebar toggle/breadcrumb left; centered home content otherwise matches.                                                                                                                              |
| tools-expanded            | light / 1280x800 |  0.6088 | 0.8629 |   0.2679 | small layout differences        | Same expanded work turn with collapsed activity summary; disclosure marker and summary/answer baselines differ.                                                                                                                                                                |
| composer-text             | light / 1280x800 |  0.5673 | 0.8072 |   0.2586 | small layout differences        | Exact same draft and send state; native caret remains visible at its fixed capture phase; glyph/shadow edges differ.                                                                                                                                                           |
| chat-checklist-bottom     | light / 1280x800 |  0.5317 | 0.7141 |   0.2535 | small layout differences        | Same checked Tests and unchecked Release items; native checkbox shapes and list/text baselines differ.                                                                                                                                                                         |
| settings-projects         | light / 1280x800 |  0.3959 | 0.7673 |   0.2489 | equivalent (only rasterization) | Matching two actual service projects, order, controls and geometry; glyph and border rasterization differs.                                                                                                                                                                    |
| composer-focused          | light / 1280x800 |   0.545 |  0.773 |   0.2478 | small layout differences        | Matching focused composer; native caret/focus painting and shadow differ from the caret-suppressed Electron capture.                                                                                                                                                           |
| home-empty                | light / 1280x800 |  0.5451 | 0.7729 |   0.2472 | equivalent (only rasterization) | Matching hero, starters, composer and four-row sidebar; glyph and analytic shadow rasterization differs.                                                                                                                                                                       |
| chat-tools-bottom         | light / 1280x800 |  0.5377 | 0.7745 |   0.2442 | small layout differences        | Same collapsed 5s work turn and linked answer; disclosure glyph, link icon and text baselines differ.                                                                                                                                                                          |
| chat-subagent-bottom      | light / 1280x800 |  0.5182 | 0.7109 |   0.2399 | small layout differences        | Same parent prompt and answer; near-matching transcript geometry with small bubble/text metrics differences.                                                                                                                                                                   |
| sidebar-project-collapsed | light / 1280x800 |  0.4943 | 0.6733 |   0.2334 | small layout differences        | Matching collapsed folder and home; disclosure/focus affordance and glyph/shadow edges differ.                                                                                                                                                                                 |
| thread-search-open        | light / 1280x800 |  0.4336 | 0.7162 |   0.1842 | small layout differences        | Same gateway-ranked titles and paths; dialog/input outline, result spacing and shadow differ slightly.                                                                                                                                                                         |
| connection-offline        | light / 1280x800 |  0.2936 | 0.3719 |   0.1832 | equivalent (only rasterization) | Matching unreachable-gateway page, retry button and disabled shell; minor glyph/shadow rasterization differences.                                                                                                                                                              |
| settings-usage            | dark / 1280x800  |  0.1981 | 0.4109 |   0.1323 | equivalent (only rasterization) | Matching empty Usage/Limits content and geometry; glyph/refresh-icon rasterization differs.                                                                                                                                                                                    |
| usage-limits-open         | dark / 1280x800  |  0.1981 | 0.4109 |   0.1323 | equivalent (only rasterization) | Matching empty Usage/Limits page; only text/refresh-icon rasterization differs.                                                                                                                                                                                                |
| apps-empty                | light / 1280x800 |  0.2142 | 0.4506 |   0.0819 | equivalent (only rasterization) | Both real app lists are empty; matching empty-state copy, icon and placement with glyph/shadow rasterization differences.                                                                                                                                                      |
| chat-streaming            | dark / 1280x800  |       — |      — |        — | not capturable                  | No model calls: imported unfinished history does not create an active run; no native headless event-feed injection exists. Refusing a completed-transcript substitute.                                                                                                         |
| panel-canvas              | dark / 1280x800  |       — |      — |        — | not capturable                  | WKWebView snapshot API exists but no headless CLI snapshot/export bridge mounts the native child; refusing a blank native-child pixel score.                                                                                                                                   |

## All theme / size measurements

| State                     | Theme | Size     | RGB MAE |  >16 % | Blur MAE | Snapshot stable |
| ------------------------- | ----- | -------- | ------: | -----: | -------: | --------------- |
| side-chat-new             | light | 1280x800 |  6.7066 |  5.481 |   5.7179 | a4629936d0d4    |
| panel-side-chat           | light | 1280x800 |  6.6777 | 5.4462 |   5.7093 | a7d20b7edd2b    |
| side-chat-new             | dark  | 1280x800 |  6.1708 | 5.1715 |   5.2016 | 707854141b03    |
| panel-side-chat           | dark  | 1280x800 |  6.1502 | 5.1387 |   5.1953 | 6ad15104e3fd    |
| chat-long-middle          | light | 1280x800 |  4.4547 | 7.4181 |   4.2332 | a7d20b7edd2b    |
| chat-long-middle          | dark  | 1280x800 |  4.0327 | 7.3912 |   3.8296 | 6ad15104e3fd    |
| panel-diff-open           | light | 1280x800 |  3.4588 | 3.4932 |   2.5295 | a7d20b7edd2b    |
| thread-actions-open       | dark  | 1280x800 |  3.9354 |  3.518 |   2.5182 | 6ad15104e3fd    |
| panel-diff-open           | dark  | 1280x800 |   3.287 | 3.4792 |   2.4401 | 6ad15104e3fd    |
| thread-actions-open       | light | 1280x800 |  3.8317 | 3.8255 |   2.3486 | a7d20b7edd2b    |
| panel-file-open           | light | 1280x800 |  3.0711 | 3.3166 |    2.302 | a7d20b7edd2b    |
| panel-changes             | light | 1280x800 |  2.9811 | 2.9466 |   2.2252 | a7d20b7edd2b    |
| panel-files               | light | 1280x800 |  2.8976 | 2.8957 |   2.1996 | a7d20b7edd2b    |
| panel-file-open           | dark  | 1280x800 |  2.8448 | 3.0924 |   2.1359 | 6ad15104e3fd    |
| composer-mention          | light | 1280x800 |  2.6893 | 3.3161 |    2.122 | a7d20b7edd2b    |
| panel-changes             | dark  | 1280x800 |  2.7769 | 2.9925 |   2.0955 | 6ad15104e3fd    |
| panel-files               | dark  | 1280x800 |  2.6544 | 2.6776 |   2.0202 | 6ad15104e3fd    |
| composer-slash            | light | 1280x800 |  2.4074 | 3.0789 |   1.7256 | a7d20b7edd2b    |
| composer-mention          | dark  | 1280x800 |  2.1385 | 3.3899 |   1.6758 | 6ad15104e3fd    |
| find-markdown-open        | light | 1280x800 |  3.0678 | 3.2678 |   1.5615 | a7d20b7edd2b    |
| session-details-open      | light | 1280x800 |  3.2509 | 3.6219 |   1.5264 | a7d20b7edd2b    |
| session-details-open      | dark  | 1280x800 |  3.0306 | 3.4477 |   1.4405 | 6ad15104e3fd    |
| thread-context-menu       | light | 1280x800 |  2.9102 |  3.075 |   1.4219 | a7d20b7edd2b    |
| chat-architecture-bottom  | light | 1280x800 |  2.8951 | 3.0414 |   1.4141 | a7d20b7edd2b    |
| chat-markdown-bottom      | light | 1280x800 |  2.8861 | 3.0355 |   1.4092 | a7d20b7edd2b    |
| chat-external-read-bottom | light | 1280x800 |  2.8752 | 3.0282 |   1.4085 | a7d20b7edd2b    |
| find-markdown-open        | dark  | 1280x800 |  2.8064 | 2.9005 |   1.4049 | 6ad15104e3fd    |
| settings-general-bottom   | light | 1280x800 |  2.5315 | 3.7104 |      1.4 | 3b68588005b9    |
| thread-context-menu       | dark  | 1280x800 |  2.7283 | 2.8991 |   1.3388 | 6ad15104e3fd    |
| chat-architecture-bottom  | dark  | 1280x800 |  2.7191 | 2.8693 |   1.3349 | 6ad15104e3fd    |
| chat-markdown-bottom      | dark  | 1280x800 |  2.7106 | 2.8634 |   1.3303 | 6ad15104e3fd    |
| chat-external-read-bottom | dark  | 1280x800 |   2.701 | 2.8569 |   1.3299 | 6ad15104e3fd    |
| project-open-dialog       | light | 1280x800 |    1.56 | 1.6619 |    1.302 | a7d20b7edd2b    |
| home-no-project           | light | 1280x800 |  1.5079 |  1.565 |   1.2854 | a7d20b7edd2b    |
| composer-slash            | dark  | 1280x800 |  1.8065 | 3.0097 |   1.2664 | 6ad15104e3fd    |
| chat-markdown-top         | light | 1280x800 |  2.6891 | 2.8246 |   1.2463 | a7d20b7edd2b    |
| project-open-dialog       | dark  | 1280x800 |  1.5011 | 1.6815 |   1.2346 | 6ad15104e3fd    |
| home-no-project           | dark  | 1280x800 |  1.4534 | 1.5862 |   1.2195 | 6ad15104e3fd    |
| settings-general-bottom   | dark  | 1280x800 |  2.1271 | 3.6619 |   1.2062 | 185cf935bd72    |
| chat-markdown-top         | dark  | 1280x800 |  2.5315 | 2.7935 |   1.1846 | 6ad15104e3fd    |
| subagent-conversation     | light | 1280x800 |   1.435 |  2.366 |   1.0758 | 3b68588005b9    |
| model-picker-filtered     | light | 1280x800 |  1.3494 | 1.9094 |   1.0181 | a7d20b7edd2b    |
| question-review           | light | 1280x800 |  1.3589 | 1.5221 |    1.017 | a7d20b7edd2b    |
| question-review           | dark  | 1280x800 |  1.2801 |   1.49 |   0.9744 | 6ad15104e3fd    |
| chat-markdown-middle      | light | 1280x800 |  2.0128 | 2.1938 |   0.9699 | a7d20b7edd2b    |
| subagent-conversation     | dark  | 1280x800 |  1.2949 |  2.311 |   0.9664 | 185cf935bd72    |
| chat-markdown-middle      | dark  | 1280x800 |  1.9171 |   2.16 |   0.9492 | 6ad15104e3fd    |
| panel-terminal            | light | 1280x800 |  1.9874 | 2.2576 |   0.9478 | a7d20b7edd2b    |
| settings-general          | light | 1280x800 |  1.7872 | 2.5334 |   0.9202 | 3b68588005b9    |
| find-long-open            | light | 1280x800 |  1.7997 | 1.8673 |    0.904 | a7d20b7edd2b    |
| model-picker-filtered     | dark  | 1280x800 |  1.2123 | 1.8676 |   0.9039 | 6ad15104e3fd    |
| panel-terminal            | dark  | 1280x800 |  1.8274 | 2.0538 |   0.8858 | 6ad15104e3fd    |
| project-actions-open      | light | 1280x800 |  1.0263 | 1.2276 |   0.8257 | a7d20b7edd2b    |
| find-long-open            | dark  | 1280x800 |  1.6098 | 1.6262 |   0.7815 | 6ad15104e3fd    |
| settings-general          | dark  | 1280x800 |  1.4784 | 2.4651 |   0.7768 | 185cf935bd72    |
| question-selected         | light | 1280x800 |  1.4101 | 1.8177 |   0.7707 | a7d20b7edd2b    |
| project-actions-open      | dark  | 1280x800 |  0.9644 | 1.3665 |   0.7665 | 6ad15104e3fd    |
| worktree-picker-open      | light | 1280x800 |  1.1457 | 1.5186 |    0.757 | a7d20b7edd2b    |
| chat-long-bottom          | light | 1280x800 |  1.6139 | 1.6295 |   0.7462 | a7d20b7edd2b    |
| question-selected         | dark  | 1280x800 |  1.3057 |  1.807 |   0.7422 | 6ad15104e3fd    |
| model-picker-open         | light | 1280x800 |   1.501 | 1.7241 |   0.7327 | a7d20b7edd2b    |
| tool-detail-open          | light | 1280x800 |  1.3817 | 1.8158 |   0.7327 | a7d20b7edd2b    |
| settings-appearance       | dark  | 1280x800 |  1.0955 | 1.8858 |   0.7118 | 185cf935bd72    |
| settings-remote-access    | light | 1280x800 |  1.2999 | 2.0713 |     0.71 | 3b68588005b9    |
| chat-long-bottom          | dark  | 1280x800 |  1.5141 | 1.5891 |   0.7069 | 6ad15104e3fd    |
| chat-question-bottom      | light | 1280x800 |  1.3506 | 1.5318 |   0.7064 | a7d20b7edd2b    |
| settings-appearance       | light | 1280x800 |  1.1064 |  1.854 |    0.699 | 3b68588005b9    |
| tool-detail-open          | dark  | 1280x800 |   1.256 | 1.7602 |    0.693 | 6ad15104e3fd    |
| chat-question-bottom      | dark  | 1280x800 |  1.2443 | 1.5322 |   0.6766 | 6ad15104e3fd    |
| project-picker-open       | light | 1280x800 |  1.2036 | 1.4069 |   0.6703 | a7d20b7edd2b    |
| model-picker-open         | dark  | 1280x800 |   1.318 | 1.7032 |   0.6513 | 6ad15104e3fd    |
| worktree-picker-open      | dark  | 1280x800 |  1.0006 | 1.6106 |   0.6424 | 6ad15104e3fd    |
| chat-long-top             | light | 1280x800 |  1.3456 | 1.5012 |   0.6129 | a7d20b7edd2b    |
| settings-remote-access    | dark  | 1280x800 |  1.1125 | 2.0244 |   0.6066 | 185cf935bd72    |
| chat-long-top             | dark  | 1280x800 |   1.282 |  1.468 |   0.6022 | 6ad15104e3fd    |
| project-edit-open         | light | 1280x800 |   0.733 | 0.9785 |   0.5588 | a7d20b7edd2b    |
| project-picker-open       | dark  | 1280x800 |  1.0012 | 1.3955 |   0.5515 | 6ad15104e3fd    |
| composer-attachment       | dark  | 1280x800 |  0.8172 | 0.9707 |   0.5156 | 6ad15104e3fd    |
| tool-rows-expanded        | light | 1280x800 |  0.9655 |  1.236 |   0.4692 | a7d20b7edd2b    |
| thoughts-expanded         | light | 1280x800 |  0.9655 |  1.236 |   0.4692 | a7d20b7edd2b    |
| tasks-empty               | light | 1280x800 |  0.8102 | 1.1187 |   0.4513 | 6410390480b7    |
| composer-attachment       | light | 1280x800 |  0.7887 | 0.9497 |   0.4356 | a7d20b7edd2b    |
| sidebar-row-hover         | dark  | 1280x800 |  0.7051 | 0.8577 |   0.4333 | 6ad15104e3fd    |
| project-edit-open         | dark  | 1280x800 |  0.5556 | 0.8149 |   0.4248 | 6ad15104e3fd    |
| tasks-empty               | dark  | 1280x800 |  0.7476 | 0.9815 |   0.4245 | 7a173154edf6    |
| sidebar-row-hover         | light | 1280x800 |  0.7272 |  0.972 |   0.4231 | a7d20b7edd2b    |
| tool-rows-expanded        | dark  | 1280x800 |   0.845 | 1.1746 |   0.4224 | 6ad15104e3fd    |
| thoughts-expanded         | dark  | 1280x800 |   0.845 | 1.1746 |   0.4224 | 6ad15104e3fd    |
| worktrees-empty           | light | 1280x800 |  0.7684 | 1.0375 |   0.4113 | a7d20b7edd2b    |
| project-copy-feedback     | light | 1280x800 |  0.5556 |  0.936 |   0.3713 | a7d20b7edd2b    |
| panel-subagents           | light | 1280x800 |  0.8009 | 1.1826 |   0.3646 | 3b68588005b9    |
| subagents-list            | light | 1280x800 |  0.8009 | 1.1826 |   0.3646 | 3b68588005b9    |
| project-copy-feedback     | dark  | 1280x800 |  0.5258 | 1.0253 |    0.354 | 6ad15104e3fd    |
| settings-shortcuts        | light | 1280x800 |  0.8606 | 1.2119 |   0.3521 | 3b68588005b9    |
| panel-subagents           | dark  | 1280x800 |   0.735 | 1.1291 |   0.3411 | 185cf935bd72    |
| subagents-list            | dark  | 1280x800 |   0.735 | 1.1291 |   0.3411 | 185cf935bd72    |
| settings-shortcuts        | dark  | 1280x800 |  0.7838 | 1.1917 |   0.3351 | 185cf935bd72    |
| app-menu-open             | light | 1280x800 |  0.6785 | 0.8659 |   0.3111 | a7d20b7edd2b    |
| app-menu-open             | dark  | 1280x800 |  0.6123 | 0.8414 |   0.2822 | 6ad15104e3fd    |
| worktrees-empty           | dark  | 1280x800 |  0.5412 | 0.9026 |    0.276 | 6ad15104e3fd    |
| worktree-new-selected     | light | 1280x800 |  0.5703 | 0.7975 |   0.2705 | a7d20b7edd2b    |
| sidebar-focus-view        | light | 1280x800 |  0.5931 | 0.9075 |   0.2696 | a7d20b7edd2b    |
| sidebar-hidden            | light | 1280x800 |   0.473 | 0.5524 |   0.2683 | a7d20b7edd2b    |
| tools-expanded            | light | 1280x800 |  0.6088 | 0.8629 |   0.2679 | a7d20b7edd2b    |
| composer-text             | light | 1280x800 |  0.5673 | 0.8072 |   0.2586 | a7d20b7edd2b    |
| tools-expanded            | dark  | 1280x800 |  0.5546 | 0.8183 |   0.2576 | 6ad15104e3fd    |
| sidebar-focus-view        | dark  | 1280x800 |   0.544 | 0.8617 |   0.2545 | 6ad15104e3fd    |
| chat-checklist-bottom     | light | 1280x800 |  0.5317 | 0.7141 |   0.2535 | a7d20b7edd2b    |
| sidebar-hidden            | dark  | 1280x800 |  0.4277 | 0.5277 |   0.2512 | 6ad15104e3fd    |
| worktree-new-selected     | dark  | 1280x800 |   0.519 | 0.7537 |   0.2506 | 6ad15104e3fd    |
| settings-projects         | light | 1280x800 |  0.3959 | 0.7673 |   0.2489 | 3b68588005b9    |
| composer-focused          | light | 1280x800 |   0.545 |  0.773 |   0.2478 | a7d20b7edd2b    |
| home-empty                | light | 1280x800 |  0.5451 | 0.7729 |   0.2472 | a7d20b7edd2b    |
| chat-tools-bottom         | light | 1280x800 |  0.5377 | 0.7745 |   0.2442 | a7d20b7edd2b    |
| composer-text             | dark  | 1280x800 |  0.5179 | 0.7534 |   0.2434 | 6ad15104e3fd    |
| settings-projects         | dark  | 1280x800 |  0.3844 | 0.7746 |   0.2425 | 185cf935bd72    |
| chat-subagent-bottom      | light | 1280x800 |  0.5182 | 0.7109 |   0.2399 | a7d20b7edd2b    |
| chat-checklist-bottom     | dark  | 1280x800 |  0.4838 | 0.6757 |   0.2387 | 6ad15104e3fd    |
| chat-tools-bottom         | dark  | 1280x800 |   0.494 | 0.7319 |   0.2373 | 6ad15104e3fd    |
| composer-focused          | dark  | 1280x800 |  0.4981 | 0.7301 |   0.2349 | 6ad15104e3fd    |
| chat-subagent-bottom      | dark  | 1280x800 |  0.4801 | 0.6719 |   0.2349 | 6ad15104e3fd    |
| sidebar-project-collapsed | light | 1280x800 |  0.4943 | 0.6733 |   0.2334 | a7d20b7edd2b    |
| home-empty                | dark  | 1280x800 |  0.4931 | 0.7278 |   0.2289 | 6ad15104e3fd    |
| sidebar-project-collapsed | dark  | 1280x800 |  0.4475 |  0.631 |   0.2167 | 6ad15104e3fd    |
| thread-search-open        | light | 1280x800 |  0.4336 | 0.7162 |   0.1842 | a7d20b7edd2b    |
| connection-offline        | light | 1280x800 |  0.2936 | 0.3719 |   0.1832 | 30db6d76a773    |
| connection-offline        | dark  | 1280x800 |  0.2783 | 0.3681 |   0.1665 | a7d20b7edd2b    |
| settings-usage            | dark  | 1280x800 |  0.1981 | 0.4109 |   0.1323 | 185cf935bd72    |
| usage-limits-open         | dark  | 1280x800 |  0.1981 | 0.4109 |   0.1323 | 185cf935bd72    |
| settings-usage            | light | 1280x800 |  0.1955 | 0.4184 |   0.1216 | 3b68588005b9    |
| usage-limits-open         | light | 1280x800 |  0.1955 | 0.4184 |   0.1216 | 3b68588005b9    |
| thread-search-open        | dark  | 1280x800 |  0.2851 | 0.5532 |   0.1213 | 6ad15104e3fd    |
| apps-empty                | light | 1280x800 |  0.2142 | 0.4506 |   0.0819 | 3fb3b514c983    |
| apps-empty                | dark  | 1280x800 |  0.1828 | 0.4135 |   0.0704 | 9ed8cd8aad09    |
| chat-streaming            | dark  | 1280x800 |       — |      — |        — | unscored        |
| panel-canvas              | dark  | 1280x800 |       — |      — |        — | unscored        |
| chat-streaming            | light | 1280x800 |       — |      — |        — | unscored        |
| panel-canvas              | light | 1280x800 |       — |      — |        — | unscored        |

## Reproduce

```sh
bun apps/rune/tools/sweep/run.ts
# Optional: --states home-empty,chat-markdown-top --themes dark,light --sizes 1280x800
```

Requires Bun, Node, the pinned Electron dependency, Rust/macOS toolchain and Python Pillow. Builds the shared renderer, real desktop main/preload, and Rune incrementally; isolated CLI pinned to 2.3.2. Each Electron instance is closed after capture. Only processes whose actual environment contains `HOME=/tmp/ocr-sweep/home` are terminated during fallback cleanup. The temporary environment is removed in finally; `--keep-env` is for diagnosis only. PNGs, logs, DOM observations, fixture manifest and full per-theme metrics stay local/ignored. Reference PNGs are `.electron.png`, never historical `.web.png` files. `--report-only` regenerates this report from local results and checked-in review descriptions.
