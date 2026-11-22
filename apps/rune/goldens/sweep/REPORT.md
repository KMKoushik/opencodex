# Same-data Electron / Rune parity sweep

Revision: `1b742903c458038d361b42827918b204aa4a762a`. Clock: 2026-11-22T12:00:00.000Z.
UI/backend source fingerprints: `fb1156e51132b4be483ac00f0a690fbcef7f918cb551ad294f8f57d516781a51`, `e7b20aae1476c74980488d78a5c345fb03f2610eb05259d0609ccb063af7dd64`, `aa46c2756a6563abb979c1258b5b4f4d218a9adc3d34713412a92e799bec6c48`. Reviewed observations are used only for matching fingerprints. Targeted recaptures retain their own per-row source provenance.

**69 states; 138 state/theme/size attempts.** 68 metric-equivalent (not visual sign-off) · 1 not capturable.

Both clients use gateway **4520**, isolated OpenCode **4990**, and the same authored fixture. No model calls or historical screenshots. **Real Electron is LEFT**, Rune RIGHT. Electron runs this checkout’s built main and sandboxed preload with `ELECTRON_RENDERER_URL=http://127.0.0.1:4520`, isolated HOME/XDG and a per-capture temporary user-data directory. Its genuine desktop bridge supplies Browser and Updates capabilities; no preload substitute or host-capability mock is installed. Fixtures include Markdown, 40-turn history, completed tools/reasoning, a real native form and permission, source diff/files, native child, side fork, tasks, and an app/canvas. Tasks/Apps empty states temporarily remove their data before the pair and restore it afterwards; both captures and their digests use the same empty lists. New side chat creates a real gateway fork before capturing that selected conversation (including inherited context) in both clients; this compares the rendered result, not native mutation behavior.

## Method and limits

- Logical size 1280×800 (unless requested otherwise), device scale 2. Installed Electron binary runs this checkout’s actual built desktop main, preload and IPC handlers; Playwright connects through its ephemeral remote-debugging port/CDP. A finite temporary bootstrap imports that real main and only sets window content size, theme and hidden state. CDP device metrics match the content size. `Page.captureScreenshot` captures the hidden renderer surface, excluding OS titlebar traffic lights. The genuine preload enables the macOS titlebar inset. Native release `--screenshot --at 0.7` uses the same size/theme. Each scored record verifies the real bridge, viewport and scale and records Electron/Chromium versions.
- Fixed browser Date and verified native realtime-clock interposer; monotonic/network time remains real. Web CSS animations paused at their initial phase and input caret hidden; the delayed follow-pill entrance is explicitly sampled at 0.7s, matching native --at 0.7 rather than hiding a mounted control at zero opacity. Native animation/caret phase uses the fixed virtual capture clock. Pointer parked except explicit hover. Transcript scroll fraction explicit. No redraw loops.
- Each pair brackets capture with a SHA-256 digest of the same gateway projects, session info/history, forms, permissions, children, side forks, tasks, apps and canvas data. A changing digest invalidates the pair (no score). Captures are sequential over an unchanged snapshot, **not atomic simultaneous GPU presentation**.
- RGB MAE is 0–255; over16 is the percentage of pixels whose maximum channel error exceeds 16. Structural metric is grayscale MAE after a 2-physical-pixel Gaussian blur and 2× downsampling (lower is better). No alignment correction, masks or cropping. Heatmap magnifies errors 4×.
- Classification is manually reviewed where noted in the driver review file; otherwise thresholds are provisional: equivalent requires RGB <1.5 and blurred MAE <0.7; small layout <5; larger errors missing/extra. State classification uses the worst theme/size. Metrics alone never prove semantic equivalence.
- Alignment is checked separately at the text-run/icon level. Any flagged pair prevents an unreviewed screen from being classified equivalent, even when its whole-image error is small. See ALIGNMENT.md for thresholds, every offset and explicit matching-coverage gaps.
- See tools/sweep/ALIGNMENT-NOTES.md for this alignment follow-up and tools/sweep/LAST.md for the earlier transcript/native-child work. In particular, a new side fork may return empty history; its introduction can meet numerical thresholds while retaining locale-time/plugin-hint text differences. It must not be called pixel-equivalent or substituted with an older populated-fork capture.
- Native canvas capture composites the real WKWebView takeSnapshot export at its laid-out host rectangle; adjacent child PNG/JSON preserve pixels and placement provenance. It uses the same gateway runtime, source, data and theme, waiting for document/fonts and the snapshot paint fence. No blank-child substitute, image mask or alignment correction. Unsupported run states remain unscored with explicit reasons; chat-streaming is an active-run limitation, not a second canvas.

## States, worst first (worst theme/size shown)

| State                     | Theme / size     | RGB MAE |  >16 % | Blur MAE | Classification                          | Observed difference                                                                                                                                                    |
| ------------------------- | ---------------- | ------: | -----: | -------: | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| panel-side-chat           | light / 1280x800 |   1.035 | 1.2732 |   0.5562 | metric-equivalent (not visual sign-off) | 0 alignment flags / 75 matched items; 8 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| side-chat-new             | light / 1280x800 |  0.9912 | 1.2527 |   0.5356 | metric-equivalent (not visual sign-off) | 0 alignment flags / 77 matched items; 9 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| composer-attachment       | dark / 1280x800  |  0.6541 |  0.793 |   0.4445 | metric-equivalent (not visual sign-off) | 0 alignment flags / 58 matched items; 1 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| sidebar-row-hover         | dark / 1280x800  |  0.5703 |  0.701 |    0.365 | metric-equivalent (not visual sign-off) | 0 alignment flags / 55 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| settings-general-bottom   | light / 1280x800 |  0.7754 | 1.5447 |    0.341 | metric-equivalent (not visual sign-off) | 0 alignment flags / 47 matched items; 4 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-markdown-top         | light / 1280x800 |  0.8492 | 1.1185 |   0.3351 | metric-equivalent (not visual sign-off) | 0 alignment flags / 67 matched items; 1 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-markdown-middle      | light / 1280x800 |  0.8432 | 1.1068 |   0.3278 | metric-equivalent (not visual sign-off) | 0 alignment flags / 66 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| session-details-open      | light / 1280x800 |  0.7351 | 1.3087 |    0.299 | metric-equivalent (not visual sign-off) | 0 alignment flags / 94 matched items; 5 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| settings-shortcuts        | light / 1280x800 |  0.7706 | 1.0043 |   0.2735 | metric-equivalent (not visual sign-off) | 0 alignment flags / 43 matched items; 3 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| tool-detail-open          | dark / 1280x800  |  0.5243 | 1.0713 |   0.2657 | metric-equivalent (not visual sign-off) | 0 alignment flags / 78 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| model-picker-open         | light / 1280x800 |  0.6056 | 0.9062 |   0.2497 | metric-equivalent (not visual sign-off) | 0 alignment flags / 82 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| settings-general          | light / 1280x800 |  0.6527 | 1.0455 |   0.2477 | metric-equivalent (not visual sign-off) | 0 alignment flags / 46 matched items; 4 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| panel-diff-open           | light / 1280x800 |  0.6256 | 1.0714 |   0.2455 | metric-equivalent (not visual sign-off) | 0 alignment flags / 95 matched items; 39 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                   |
| tool-rows-expanded        | dark / 1280x800  |  0.4762 | 0.7989 |   0.2376 | metric-equivalent (not visual sign-off) | 0 alignment flags / 76 matched items; 4 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| thoughts-expanded         | dark / 1280x800  |  0.4762 | 0.7989 |   0.2376 | metric-equivalent (not visual sign-off) | 0 alignment flags / 76 matched items; 4 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| thread-actions-open       | light / 1280x800 |  0.6397 | 1.0547 |   0.2375 | metric-equivalent (not visual sign-off) | 0 alignment flags / 72 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| panel-file-open           | light / 1280x800 |  0.5858 | 1.0376 |   0.2284 | metric-equivalent (not visual sign-off) | 0 alignment flags / 94 matched items; 7 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| thread-context-menu       | light / 1280x800 |  0.6292 | 0.9807 |   0.2275 | metric-equivalent (not visual sign-off) | 0 alignment flags / 72 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| find-markdown-open        | light / 1280x800 |  0.6037 | 0.9335 |   0.2234 | metric-equivalent (not visual sign-off) | 0 alignment flags / 70 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| model-picker-filtered     | light / 1280x800 |  0.4458 | 0.7674 |   0.2224 | metric-equivalent (not visual sign-off) | 0 alignment flags / 65 matched items; 1 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-architecture-bottom  | light / 1280x800 |  0.5933 | 0.9279 |   0.2124 | metric-equivalent (not visual sign-off) | 0 alignment flags / 66 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| tools-expanded            | dark / 1280x800  |  0.4061 |  0.655 |   0.2124 | metric-equivalent (not visual sign-off) | 0 alignment flags / 58 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-external-read-bottom | light / 1280x800 |  0.5924 | 0.9239 |   0.2121 | metric-equivalent (not visual sign-off) | 0 alignment flags / 66 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-markdown-bottom      | light / 1280x800 |  0.5895 | 0.9228 |   0.2113 | metric-equivalent (not visual sign-off) | 0 alignment flags / 66 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| panel-changes             | light / 1280x800 |  0.5536 | 0.9368 |    0.206 | metric-equivalent (not visual sign-off) | 0 alignment flags / 84 matched items; 5 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| composer-text             | light / 1280x800 |  0.4264 | 0.6679 |   0.1996 | metric-equivalent (not visual sign-off) | 0 alignment flags / 55 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| panel-files               | light / 1280x800 |  0.5493 | 0.9449 |    0.199 | metric-equivalent (not visual sign-off) | 0 alignment flags / 85 matched items; 6 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| sidebar-focus-view        | light / 1280x800 |  0.4337 | 0.7014 |   0.1968 | metric-equivalent (not visual sign-off) | 0 alignment flags / 67 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| panel-canvas              | light / 1280x800 |  0.5037 |  0.802 |   0.1945 | metric-equivalent (not visual sign-off) | 0 alignment flags / 68 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| app-menu-open             | light / 1280x800 |  0.4064 | 0.6196 |   0.1912 | metric-equivalent (not visual sign-off) | 0 alignment flags / 59 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| composer-focused          | light / 1280x800 |  0.4041 | 0.6338 |   0.1887 | metric-equivalent (not visual sign-off) | 0 alignment flags / 55 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| worktree-new-selected     | light / 1280x800 |  0.4082 |  0.642 |   0.1887 | metric-equivalent (not visual sign-off) | 0 alignment flags / 57 matched items; 1 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| worktree-picker-open      | light / 1280x800 |  0.4081 | 0.6595 |   0.1885 | metric-equivalent (not visual sign-off) | 0 alignment flags / 62 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| home-empty                | light / 1280x800 |  0.4042 | 0.6337 |   0.1881 | metric-equivalent (not visual sign-off) | 0 alignment flags / 55 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| settings-appearance       | light / 1280x800 |  0.3766 | 0.5531 |   0.1858 | metric-equivalent (not visual sign-off) | 0 alignment flags / 53 matched items; 5 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| project-picker-open       | light / 1280x800 |  0.3996 | 0.6669 |   0.1834 | metric-equivalent (not visual sign-off) | 0 alignment flags / 66 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| connection-offline        | light / 1280x800 |  0.2349 | 0.3034 |   0.1777 | metric-equivalent (not visual sign-off) | 0 alignment flags / 23 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| sidebar-project-collapsed | light / 1280x800 |  0.3535 | 0.5341 |   0.1743 | metric-equivalent (not visual sign-off) | 0 alignment flags / 50 matched items; 1 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| panel-terminal            | light / 1280x800 |  0.4875 |  0.726 |   0.1722 | metric-equivalent (not visual sign-off) | 0 alignment flags / 59 matched items; 3 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| find-long-open            | light / 1280x800 |  0.4339 | 0.7551 |   0.1688 | metric-equivalent (not visual sign-off) | 0 alignment flags / 58 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-long-top             | light / 1280x800 |  0.4366 | 0.7834 |   0.1657 | metric-equivalent (not visual sign-off) | 0 alignment flags / 57 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-long-middle          | light / 1280x800 |  0.4338 | 0.7706 |    0.162 | metric-equivalent (not visual sign-off) | 0 alignment flags / 54 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-long-bottom          | light / 1280x800 |  0.4197 | 0.7444 |   0.1567 | metric-equivalent (not visual sign-off) | 0 alignment flags / 54 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| composer-mention          | light / 1280x800 |  0.4147 | 0.7879 |   0.1546 | metric-equivalent (not visual sign-off) | 0 alignment flags / 81 matched items; 1 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| project-edit-open         | light / 1280x800 |  0.2731 | 0.5164 |   0.1533 | metric-equivalent (not visual sign-off) | 0 alignment flags / 42 matched items; 6 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| composer-slash            | light / 1280x800 |  0.4142 | 0.8037 |   0.1524 | metric-equivalent (not visual sign-off) | 0 alignment flags / 69 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| project-open-dialog       | light / 1280x800 |  0.2505 | 0.5441 |   0.1524 | metric-equivalent (not visual sign-off) | 0 alignment flags / 33 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| sidebar-hidden            | light / 1280x800 |  0.2915 | 0.4023 |   0.1491 | metric-equivalent (not visual sign-off) | 0 alignment flags / 28 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| question-selected         | light / 1280x800 |  0.3402 | 0.6075 |   0.1479 | metric-equivalent (not visual sign-off) | 0 alignment flags / 61 matched items; 4 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| settings-remote-access    | light / 1280x800 |  0.4072 | 0.6889 |   0.1465 | metric-equivalent (not visual sign-off) | 0 alignment flags / 41 matched items; 6 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| home-no-project           | light / 1280x800 |  0.1983 | 0.4472 |   0.1357 | metric-equivalent (not visual sign-off) | 0 alignment flags / 27 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-question-bottom      | light / 1280x800 |  0.3227 |  0.598 |   0.1312 | metric-equivalent (not visual sign-off) | 0 alignment flags / 61 matched items; 4 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| subagent-conversation     | light / 1280x800 |  0.3445 |  0.619 |    0.131 | metric-equivalent (not visual sign-off) | 0 alignment flags / 63 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| thread-search-open        | light / 1280x800 |  0.3347 | 0.6183 |   0.1292 | metric-equivalent (not visual sign-off) | 0 alignment flags / 72 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| question-review           | light / 1280x800 |  0.3099 | 0.5764 |   0.1275 | metric-equivalent (not visual sign-off) | 0 alignment flags / 55 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| panel-subagents           | light / 1280x800 |   0.321 | 0.5729 |   0.1237 | metric-equivalent (not visual sign-off) | 0 alignment flags / 67 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| subagents-list            | light / 1280x800 |   0.321 | 0.5729 |   0.1237 | metric-equivalent (not visual sign-off) | 0 alignment flags / 67 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-tools-bottom         | light / 1280x800 |  0.3295 | 0.5762 |   0.1232 | metric-equivalent (not visual sign-off) | 0 alignment flags / 57 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-subagent-bottom      | light / 1280x800 |   0.293 | 0.5053 |   0.1117 | metric-equivalent (not visual sign-off) | 0 alignment flags / 55 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-checklist-bottom     | light / 1280x800 |  0.2759 | 0.4786 |   0.1073 | metric-equivalent (not visual sign-off) | 0 alignment flags / 55 matched items; 2 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| project-actions-open      | light / 1280x800 |  0.2537 | 0.3541 |   0.1051 | metric-equivalent (not visual sign-off) | 0 alignment flags / 39 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| tasks-empty               | light / 1280x800 |   0.235 | 0.4591 |   0.0867 | metric-equivalent (not visual sign-off) | 0 alignment flags / 58 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| apps-empty                | light / 1280x800 |  0.1949 | 0.3982 |   0.0685 | metric-equivalent (not visual sign-off) | 0 alignment flags / 28 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| worktrees-empty           | light / 1280x800 |  0.1618 | 0.3401 |   0.0634 | metric-equivalent (not visual sign-off) | 0 alignment flags / 35 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| settings-usage            | light / 1280x800 |  0.1287 | 0.2527 |   0.0559 | metric-equivalent (not visual sign-off) | 0 alignment flags / 26 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| usage-limits-open         | light / 1280x800 |  0.1287 | 0.2527 |   0.0559 | metric-equivalent (not visual sign-off) | 0 alignment flags / 26 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| project-copy-feedback     | light / 1280x800 |  0.1025 | 0.1978 |   0.0486 | metric-equivalent (not visual sign-off) | 0 alignment flags / 34 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| settings-projects         | light / 1280x800 |  0.0935 |   0.18 |   0.0455 | metric-equivalent (not visual sign-off) | 0 alignment flags / 33 matched items; 0 unmatched Electron items. See ALIGNMENT.md; uncovered items are not passes.                                                    |
| chat-streaming            | dark / 1280x800  |       — |      — |        — | not capturable                          | No model calls: imported unfinished history does not create an active run; no native headless event-feed injection exists. Refusing a completed-transcript substitute. |

## All theme / size measurements

| State                     | Theme | Size     | RGB MAE |  >16 % | Blur MAE | Snapshot stable |
| ------------------------- | ----- | -------- | ------: | -----: | -------: | --------------- |
| panel-side-chat           | light | 1280x800 |   1.035 | 1.2732 |   0.5562 | d545d9a1ad98    |
| side-chat-new             | light | 1280x800 |  0.9912 | 1.2527 |   0.5356 | 1891d7ac4c76    |
| panel-side-chat           | dark  | 1280x800 |  0.8862 | 1.1791 |   0.4631 | 897aabf06cbd    |
| side-chat-new             | dark  | 1280x800 |  0.8464 | 1.1544 |   0.4454 | 2ac78569c100    |
| composer-attachment       | dark  | 1280x800 |  0.6541 |  0.793 |   0.4445 | 897aabf06cbd    |
| sidebar-row-hover         | dark  | 1280x800 |  0.5703 |  0.701 |    0.365 | 897aabf06cbd    |
| sidebar-row-hover         | light | 1280x800 |  0.5778 | 0.8168 |   0.3534 | f50f6c9c3294    |
| composer-attachment       | light | 1280x800 |  0.5955 | 0.7732 |   0.3533 | f50f6c9c3294    |
| settings-general-bottom   | light | 1280x800 |  0.7754 | 1.5447 |    0.341 | da56484a3c77    |
| chat-markdown-top         | light | 1280x800 |  0.8492 | 1.1185 |   0.3351 | d545d9a1ad98    |
| chat-markdown-middle      | light | 1280x800 |  0.8432 | 1.1068 |   0.3278 | d545d9a1ad98    |
| settings-general-bottom   | dark  | 1280x800 |  0.6554 | 1.4403 |   0.3216 | da56484a3c77    |
| chat-markdown-top         | dark  | 1280x800 |  0.7861 | 1.0659 |   0.3157 | 897aabf06cbd    |
| chat-markdown-middle      | dark  | 1280x800 |  0.7836 | 1.0582 |   0.3095 | 897aabf06cbd    |
| session-details-open      | light | 1280x800 |  0.7351 | 1.3087 |    0.299 | d545d9a1ad98    |
| session-details-open      | dark  | 1280x800 |  0.6832 | 1.2559 |   0.2889 | 897aabf06cbd    |
| settings-shortcuts        | light | 1280x800 |  0.7706 | 1.0043 |   0.2735 | 5471c1af0bd8    |
| tool-detail-open          | dark  | 1280x800 |  0.5243 | 1.0713 |   0.2657 | da56484a3c77    |
| tool-detail-open          | light | 1280x800 |  0.5541 | 1.1334 |   0.2563 | da56484a3c77    |
| model-picker-open         | light | 1280x800 |  0.6056 | 0.9062 |   0.2497 | f50f6c9c3294    |
| settings-general          | light | 1280x800 |  0.6527 | 1.0455 |   0.2477 | 5471c1af0bd8    |
| panel-diff-open           | light | 1280x800 |  0.6256 | 1.0714 |   0.2455 | da56484a3c77    |
| settings-shortcuts        | dark  | 1280x800 |  0.6823 | 0.9792 |   0.2417 | 91df8fde12d4    |
| tool-rows-expanded        | dark  | 1280x800 |  0.4762 | 0.7989 |   0.2376 | 897aabf06cbd    |
| thoughts-expanded         | dark  | 1280x800 |  0.4762 | 0.7989 |   0.2376 | 897aabf06cbd    |
| thread-actions-open       | light | 1280x800 |  0.6397 | 1.0547 |   0.2375 | d545d9a1ad98    |
| panel-file-open           | light | 1280x800 |  0.5858 | 1.0376 |   0.2284 | da56484a3c77    |
| thread-context-menu       | light | 1280x800 |  0.6292 | 0.9807 |   0.2275 | d545d9a1ad98    |
| panel-diff-open           | dark  | 1280x800 |  0.5722 | 0.9814 |   0.2268 | da56484a3c77    |
| thread-actions-open       | dark  | 1280x800 |  0.5914 | 1.0045 |   0.2259 | 897aabf06cbd    |
| find-markdown-open        | light | 1280x800 |  0.6037 | 0.9335 |   0.2234 | d545d9a1ad98    |
| tool-rows-expanded        | light | 1280x800 |  0.5073 | 0.8503 |   0.2229 | d545d9a1ad98    |
| thoughts-expanded         | light | 1280x800 |  0.5073 | 0.8503 |   0.2229 | d545d9a1ad98    |
| model-picker-filtered     | light | 1280x800 |  0.4458 | 0.7674 |   0.2224 | f50f6c9c3294    |
| model-picker-open         | dark  | 1280x800 |  0.5147 | 0.8499 |   0.2204 | 897aabf06cbd    |
| panel-file-open           | dark  | 1280x800 |   0.539 |  0.965 |   0.2174 | da56484a3c77    |
| thread-context-menu       | dark  | 1280x800 |  0.5781 | 0.9313 |   0.2129 | 897aabf06cbd    |
| tools-expanded            | dark  | 1280x800 |  0.4061 |  0.655 |   0.2124 | 897aabf06cbd    |
| chat-architecture-bottom  | light | 1280x800 |  0.5933 | 0.9279 |   0.2124 | d545d9a1ad98    |
| chat-external-read-bottom | light | 1280x800 |  0.5924 | 0.9239 |   0.2121 | d545d9a1ad98    |
| chat-markdown-bottom      | light | 1280x800 |  0.5895 | 0.9228 |   0.2113 | d545d9a1ad98    |
| model-picker-filtered     | dark  | 1280x800 |  0.3984 | 0.7186 |   0.2066 | 897aabf06cbd    |
| find-markdown-open        | dark  | 1280x800 |  0.5528 | 0.8833 |   0.2063 | 897aabf06cbd    |
| panel-changes             | light | 1280x800 |  0.5536 | 0.9368 |    0.206 | da56484a3c77    |
| chat-architecture-bottom  | dark  | 1280x800 |   0.549 | 0.8811 |   0.2025 | 897aabf06cbd    |
| chat-external-read-bottom | dark  | 1280x800 |  0.5489 | 0.8779 |   0.2023 | 897aabf06cbd    |
| chat-markdown-bottom      | dark  | 1280x800 |  0.5455 | 0.8756 |   0.2014 | 897aabf06cbd    |
| composer-text             | light | 1280x800 |  0.4264 | 0.6679 |   0.1996 | f50f6c9c3294    |
| panel-files               | light | 1280x800 |  0.5493 | 0.9449 |    0.199 | da56484a3c77    |
| sidebar-focus-view        | light | 1280x800 |  0.4337 | 0.7014 |   0.1968 | f50f6c9c3294    |
| settings-general          | dark  | 1280x800 |  0.5104 | 0.9461 |   0.1954 | 91df8fde12d4    |
| panel-canvas              | light | 1280x800 |  0.5037 |  0.802 |   0.1945 | d545d9a1ad98    |
| app-menu-open             | light | 1280x800 |  0.4064 | 0.6196 |   0.1912 | f50f6c9c3294    |
| tools-expanded            | light | 1280x800 |  0.4147 | 0.6894 |    0.191 | d545d9a1ad98    |
| composer-text             | dark  | 1280x800 |  0.3945 | 0.6134 |   0.1902 | 897aabf06cbd    |
| panel-changes             | dark  | 1280x800 |  0.5002 | 0.8569 |    0.189 | da56484a3c77    |
| composer-focused          | light | 1280x800 |  0.4041 | 0.6338 |   0.1887 | f50f6c9c3294    |
| worktree-new-selected     | light | 1280x800 |  0.4082 |  0.642 |   0.1887 | d545d9a1ad98    |
| worktree-picker-open      | light | 1280x800 |  0.4081 | 0.6595 |   0.1885 | d545d9a1ad98    |
| home-empty                | light | 1280x800 |  0.4042 | 0.6337 |   0.1881 | f50f6c9c3294    |
| settings-appearance       | light | 1280x800 |  0.3766 | 0.5531 |   0.1858 | 5471c1af0bd8    |
| panel-files               | dark  | 1280x800 |  0.4988 | 0.8678 |   0.1852 | da56484a3c77    |
| sidebar-focus-view        | dark  | 1280x800 |  0.3997 | 0.6542 |   0.1846 | 897aabf06cbd    |
| panel-canvas              | dark  | 1280x800 |  0.4635 | 0.7381 |   0.1837 | 897aabf06cbd    |
| project-picker-open       | light | 1280x800 |  0.3996 | 0.6669 |   0.1834 | ae32d002ff09    |
| composer-focused          | dark  | 1280x800 |  0.3748 | 0.5901 |   0.1818 | 897aabf06cbd    |
| connection-offline        | light | 1280x800 |  0.2349 | 0.3034 |   0.1777 | 3c746ba784b6    |
| home-empty                | dark  | 1280x800 |  0.3697 | 0.5878 |   0.1757 | 897aabf06cbd    |
| worktree-new-selected     | dark  | 1280x800 |  0.3721 | 0.5951 |   0.1746 | 897aabf06cbd    |
| sidebar-project-collapsed | light | 1280x800 |  0.3535 | 0.5341 |   0.1743 | f50f6c9c3294    |
| app-menu-open             | dark  | 1280x800 |  0.3645 | 0.5787 |   0.1742 | 897aabf06cbd    |
| panel-terminal            | light | 1280x800 |  0.4875 |  0.726 |   0.1722 | d545d9a1ad98    |
| project-picker-open       | dark  | 1280x800 |  0.3571 | 0.6074 |   0.1715 | ae32d002ff09    |
| worktree-picker-open      | dark  | 1280x800 |  0.3663 | 0.6028 |   0.1711 | 897aabf06cbd    |
| connection-offline        | dark  | 1280x800 |  0.2307 | 0.2992 |   0.1689 | f50f6c9c3294    |
| find-long-open            | light | 1280x800 |  0.4339 | 0.7551 |   0.1688 | d545d9a1ad98    |
| chat-long-top             | light | 1280x800 |  0.4366 | 0.7834 |   0.1657 | d545d9a1ad98    |
| sidebar-project-collapsed | dark  | 1280x800 |  0.3242 |  0.491 |   0.1636 | 897aabf06cbd    |
| panel-terminal            | dark  | 1280x800 |  0.4456 | 0.6729 |   0.1635 | 897aabf06cbd    |
| chat-long-middle          | light | 1280x800 |  0.4338 | 0.7706 |    0.162 | d545d9a1ad98    |
| chat-long-top             | dark  | 1280x800 |   0.401 | 0.7492 |   0.1585 | 897aabf06cbd    |
| chat-long-bottom          | light | 1280x800 |  0.4197 | 0.7444 |   0.1567 | d545d9a1ad98    |
| settings-appearance       | dark  | 1280x800 |  0.3182 | 0.5242 |   0.1546 | 91df8fde12d4    |
| composer-mention          | light | 1280x800 |  0.4147 | 0.7879 |   0.1546 | f50f6c9c3294    |
| chat-long-middle          | dark  | 1280x800 |  0.3982 | 0.7268 |   0.1533 | 897aabf06cbd    |
| project-edit-open         | light | 1280x800 |  0.2731 | 0.5164 |   0.1533 | d545d9a1ad98    |
| find-long-open            | dark  | 1280x800 |  0.3918 | 0.7084 |   0.1532 | 897aabf06cbd    |
| composer-slash            | light | 1280x800 |  0.4142 | 0.8037 |   0.1524 | f50f6c9c3294    |
| project-open-dialog       | light | 1280x800 |  0.2505 | 0.5441 |   0.1524 | da56484a3c77    |
| sidebar-hidden            | light | 1280x800 |  0.2915 | 0.4023 |   0.1491 | f50f6c9c3294    |
| chat-long-bottom          | dark  | 1280x800 |  0.3844 | 0.7008 |   0.1483 | 897aabf06cbd    |
| question-selected         | light | 1280x800 |  0.3402 | 0.6075 |   0.1479 | d545d9a1ad98    |
| settings-remote-access    | light | 1280x800 |  0.4072 | 0.6889 |   0.1465 | 5471c1af0bd8    |
| sidebar-hidden            | dark  | 1280x800 |  0.2632 | 0.3734 |   0.1387 | 897aabf06cbd    |
| home-no-project           | light | 1280x800 |  0.1983 | 0.4472 |   0.1357 | da56484a3c77    |
| composer-mention          | dark  | 1280x800 |  0.3298 | 0.6536 |   0.1313 | 897aabf06cbd    |
| chat-question-bottom      | light | 1280x800 |  0.3227 |  0.598 |   0.1312 | d545d9a1ad98    |
| subagent-conversation     | light | 1280x800 |  0.3445 |  0.619 |    0.131 | 5471c1af0bd8    |
| question-selected         | dark  | 1280x800 |  0.2972 | 0.5792 |   0.1306 | 897aabf06cbd    |
| thread-search-open        | light | 1280x800 |  0.3347 | 0.6183 |   0.1292 | f50f6c9c3294    |
| composer-slash            | dark  | 1280x800 |  0.3263 |  0.665 |   0.1287 | 897aabf06cbd    |
| question-review           | light | 1280x800 |  0.3099 | 0.5764 |   0.1275 | d545d9a1ad98    |
| panel-subagents           | light | 1280x800 |   0.321 | 0.5729 |   0.1237 | 5471c1af0bd8    |
| subagents-list            | light | 1280x800 |   0.321 | 0.5729 |   0.1237 | 5471c1af0bd8    |
| subagent-conversation     | dark  | 1280x800 |  0.3098 | 0.5499 |   0.1236 | 91df8fde12d4    |
| chat-tools-bottom         | light | 1280x800 |  0.3295 | 0.5762 |   0.1232 | d545d9a1ad98    |
| project-edit-open         | dark  | 1280x800 |  0.2121 | 0.3707 |   0.1222 | 897aabf06cbd    |
| chat-question-bottom      | dark  | 1280x800 |  0.2862 |  0.584 |   0.1207 | 897aabf06cbd    |
| chat-tools-bottom         | dark  | 1280x800 |   0.296 | 0.5301 |   0.1159 | 897aabf06cbd    |
| settings-remote-access    | dark  | 1280x800 |  0.3263 | 0.6372 |   0.1144 | 91df8fde12d4    |
| panel-subagents           | dark  | 1280x800 |  0.2847 | 0.5061 |   0.1132 | 91df8fde12d4    |
| subagents-list            | dark  | 1280x800 |  0.2847 | 0.5061 |   0.1132 | 91df8fde12d4    |
| chat-subagent-bottom      | light | 1280x800 |   0.293 | 0.5053 |   0.1117 | d545d9a1ad98    |
| chat-checklist-bottom     | light | 1280x800 |  0.2759 | 0.4786 |   0.1073 | d545d9a1ad98    |
| chat-subagent-bottom      | dark  | 1280x800 |  0.2635 |  0.463 |   0.1055 | 897aabf06cbd    |
| question-review           | dark  | 1280x800 |   0.264 | 0.5132 |   0.1051 | 897aabf06cbd    |
| project-actions-open      | light | 1280x800 |  0.2537 | 0.3541 |   0.1051 | d545d9a1ad98    |
| chat-checklist-bottom     | dark  | 1280x800 |  0.2481 |  0.438 |   0.1024 | 897aabf06cbd    |
| thread-search-open        | dark  | 1280x800 |  0.2326 | 0.4776 |   0.0938 | 897aabf06cbd    |
| project-actions-open      | dark  | 1280x800 |  0.2315 | 0.3586 |   0.0893 | 897aabf06cbd    |
| project-open-dialog       | dark  | 1280x800 |  0.1785 | 0.3267 |   0.0891 | da56484a3c77    |
| tasks-empty               | light | 1280x800 |   0.235 | 0.4591 |   0.0867 | 839983e2d297    |
| tasks-empty               | dark  | 1280x800 |  0.2095 |  0.422 |   0.0751 | 4afc588185d9    |
| home-no-project           | dark  | 1280x800 |  0.1308 | 0.2314 |    0.074 | da56484a3c77    |
| apps-empty                | light | 1280x800 |  0.1949 | 0.3982 |   0.0685 | 6ace268d7bd6    |
| worktrees-empty           | light | 1280x800 |  0.1618 | 0.3401 |   0.0634 | d545d9a1ad98    |
| apps-empty                | dark  | 1280x800 |  0.1662 | 0.3609 |   0.0594 | 8edfba61bab8    |
| settings-usage            | light | 1280x800 |  0.1287 | 0.2527 |   0.0559 | 5471c1af0bd8    |
| usage-limits-open         | light | 1280x800 |  0.1287 | 0.2527 |   0.0559 | 5471c1af0bd8    |
| settings-usage            | dark  | 1280x800 |  0.1147 | 0.2415 |   0.0497 | 91df8fde12d4    |
| usage-limits-open         | dark  | 1280x800 |  0.1147 | 0.2415 |   0.0497 | 91df8fde12d4    |
| project-copy-feedback     | light | 1280x800 |  0.1025 | 0.1978 |   0.0486 | d545d9a1ad98    |
| settings-projects         | light | 1280x800 |  0.0935 |   0.18 |   0.0455 | 5471c1af0bd8    |
| worktrees-empty           | dark  | 1280x800 |   0.103 | 0.2426 |   0.0421 | 897aabf06cbd    |
| project-copy-feedback     | dark  | 1280x800 |  0.0928 | 0.1884 |   0.0407 | 897aabf06cbd    |
| settings-projects         | dark  | 1280x800 |  0.0852 | 0.1713 |   0.0381 | 91df8fde12d4    |
| chat-streaming            | dark  | 1280x800 |       — |      — |        — | unscored        |
| chat-streaming            | light | 1280x800 |       — |      — |        — | unscored        |

## Reproduce

```sh
bun apps/rune/tools/sweep/run.ts
# Optional: --states home-empty,chat-markdown-top --themes dark,light --sizes 1280x800
```

Requires Bun, Node, the pinned Electron dependency, Rust/macOS toolchain and Python Pillow. Builds the shared renderer, real desktop main/preload, and Rune incrementally; isolated CLI pinned to 2.3.2. Each Electron instance is closed after capture. Only processes whose actual environment contains `HOME=/tmp/ocr-fx-align/home` are terminated during fallback cleanup. The temporary environment is removed in finally; `--keep-env` is for diagnosis only. PNGs, logs, DOM observations, fixture manifest and full per-theme metrics stay local/ignored. Reference PNGs are `.electron.png`, never historical `.web.png` files. `--report-only` regenerates this report from local results and checked-in review descriptions.
