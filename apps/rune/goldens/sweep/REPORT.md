# Same-data Electron / Rune parity sweep

Revision: `d83c67b0d7ed4bb7f154241929570e7fe482071d`. Clock: 2026-11-22T12:00:00.000Z.
UI/backend source fingerprint: `cabe47f5a41b50bc37387556f4272d1c233c97730c467d62ff8a7e33fed9d2de`. Reviewed observations are used only for matching fingerprints.

**69 states; 138 state/theme/size attempts.** 27 small layout differences · 40 equivalent (only rasterization) · 2 not capturable.

Both clients use gateway **4514**, isolated OpenCode **4984**, and the same authored fixture. No model calls or historical screenshots. **Real Electron is LEFT**, Rune RIGHT. Electron runs this checkout’s built main and sandboxed preload with `ELECTRON_RENDERER_URL=http://127.0.0.1:4514`, isolated HOME/XDG and a per-capture temporary user-data directory. Its genuine desktop bridge supplies Browser and Updates capabilities; no preload substitute or host-capability mock is installed. Fixtures include Markdown, 40-turn history, completed tools/reasoning, a real native form and permission, source diff/files, native child, side fork, tasks, and an app/canvas. Tasks/Apps empty states temporarily remove their data before the pair and restore it afterwards; both captures and their digests use the same empty lists. New side chat creates a real gateway fork before capturing that selected conversation (including inherited context) in both clients; this compares the rendered result, not native mutation behavior.

## Method and limits

- Logical size 1280×800 (unless requested otherwise), device scale 2. Installed Electron binary runs this checkout’s actual built desktop main, preload and IPC handlers; Playwright connects through its ephemeral remote-debugging port/CDP. A finite temporary bootstrap imports that real main and only sets window content size, theme and hidden state. CDP device metrics match the content size. `Page.captureScreenshot` captures the hidden renderer surface, excluding OS titlebar traffic lights. The genuine preload enables the macOS titlebar inset. Native release `--screenshot --at 0.7` uses the same size/theme. Each scored record verifies the real bridge, viewport and scale and records Electron/Chromium versions.
- Fixed browser Date and verified native realtime-clock interposer; monotonic/network time remains real. Web CSS animations paused at their initial phase and input caret hidden; native animation/caret phase uses the fixed virtual capture clock. Pointer parked except explicit hover. Transcript scroll fraction explicit. No redraw loops.
- Each pair brackets capture with a SHA-256 digest of the same gateway projects, session info/history, forms, permissions, children, side forks, tasks, apps and canvas data. A changing digest invalidates the pair (no score). Captures are sequential over an unchanged snapshot, **not atomic simultaneous GPU presentation**.
- RGB MAE is 0–255; over16 is the percentage of pixels whose maximum channel error exceeds 16. Structural metric is grayscale MAE after a 2-physical-pixel Gaussian blur and 2× downsampling (lower is better). No alignment correction, masks or cropping. Heatmap magnifies errors 4×.
- Classification is manually reviewed where noted in the driver review file; otherwise thresholds are provisional: equivalent requires RGB <1.5 and blurred MAE <0.7; small layout <5; larger errors missing/extra. State classification uses the worst theme/size. Metrics alone never prove semantic equivalence.
- WKWebView content and unsupported interaction/run states are unscored with explicit reasons; no blank-child or parent/completed-state substitutes.

## States, worst first (worst theme/size shown)

| State                     | Theme / size     | RGB MAE |  >16 % | Blur MAE | Classification                  | Observed difference                                                                                                                                                    |
| ------------------------- | ---------------- | ------: | -----: | -------: | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chat-long-middle          | light / 1280x800 |  4.4547 | 7.4181 |   4.2332 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| side-chat-new             | light / 1280x800 |  4.9807 | 4.4985 |    4.095 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-side-chat           | light / 1280x800 |  4.9586 | 4.4685 |   4.0887 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-general-bottom   | light / 1280x800 |  2.5812 | 3.7616 |   1.4331 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| subagent-conversation     | light / 1280x800 |  1.3717 | 2.3277 |   1.0212 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| question-review           | light / 1280x800 |  1.3589 | 1.5221 |    1.017 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-diff-open           | light / 1280x800 |  2.0898 | 2.2174 |   0.9755 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-general          | light / 1280x800 |  1.8197 | 2.5658 |   0.9334 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-markdown-middle      | light / 1280x800 |  1.8965 | 2.1063 |   0.9286 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-markdown-top         | light / 1280x800 |  1.6043 | 1.8973 |   0.7844 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| session-details-open      | light / 1280x800 |  1.7516 | 2.2115 |   0.7793 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| question-selected         | light / 1280x800 |  1.4101 | 1.8177 |   0.7707 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| find-long-open            | light / 1280x800 |  1.6297 | 1.6422 |     0.76 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-terminal            | light / 1280x800 |  1.6808 | 1.7708 |   0.7589 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-file-open           | light / 1280x800 |  1.7373 | 2.0518 |   0.7522 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tool-detail-open          | light / 1280x800 |  1.4506 | 1.8633 |   0.7516 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-long-bottom          | light / 1280x800 |  1.6139 | 1.6295 |   0.7462 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thread-actions-open       | light / 1280x800 |  1.6749 | 1.9437 |   0.7186 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-appearance       | dark / 1280x800  |  1.0955 | 1.8858 |   0.7118 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-remote-access    | light / 1280x800 |  1.2999 | 2.0713 |     0.71 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| find-markdown-open        | light / 1280x800 |  1.6493 |  1.846 |   0.7097 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thread-context-menu       | light / 1280x800 |  1.6576 | 1.8728 |   0.7086 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-question-bottom      | light / 1280x800 |  1.3506 | 1.5318 |   0.7064 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-architecture-bottom  | light / 1280x800 |  1.6425 | 1.8392 |   0.7009 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-markdown-bottom      | light / 1280x800 |  1.6335 | 1.8333 |   0.6959 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-external-read-bottom | light / 1280x800 |  1.6226 |  1.826 |   0.6953 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-changes             | light / 1280x800 |  1.5599 | 1.8986 |   0.6466 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-files               | light / 1280x800 |  1.4933 | 1.8445 |   0.6265 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-long-top             | light / 1280x800 |  1.3456 | 1.5012 |   0.6129 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-attachment       | dark / 1280x800  |   0.797 | 0.9481 |   0.5088 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tool-rows-expanded        | light / 1280x800 |  1.0135 | 1.2625 |   0.4798 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thoughts-expanded         | light / 1280x800 |  1.0135 | 1.2625 |   0.4798 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tasks-empty               | light / 1280x800 |  0.8102 | 1.1187 |   0.4513 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-edit-open         | light / 1280x800 |  0.6189 | 0.8863 |   0.4438 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-row-hover         | dark / 1280x800  |  0.6851 |  0.835 |   0.4268 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| worktrees-empty           | light / 1280x800 |  0.7684 | 1.0375 |   0.4113 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-copy-feedback     | light / 1280x800 |  0.5556 |  0.936 |   0.3713 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| model-picker-open         | light / 1280x800 |  0.8428 | 1.1796 |   0.3693 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-picker-open       | light / 1280x800 |  0.8747 |  1.073 |   0.3577 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-shortcuts        | light / 1280x800 |  0.8606 | 1.2119 |   0.3521 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-subagents           | light / 1280x800 |  0.7376 | 1.1443 |     0.31 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| subagents-list            | light / 1280x800 |  0.7376 | 1.1443 |     0.31 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-actions-open      | light / 1280x800 |  0.5349 | 0.8668 |   0.2954 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| model-picker-filtered     | light / 1280x800 |  0.5918 | 0.9296 |   0.2894 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tools-expanded            | light / 1280x800 |  0.6771 | 0.9101 |   0.2865 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| worktree-new-selected     | light / 1280x800 |  0.5628 |  0.791 |   0.2643 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-tools-bottom         | light / 1280x800 |   0.606 | 0.8217 |   0.2627 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-focus-view        | light / 1280x800 |  0.5633 |  0.883 |   0.2582 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-hidden            | light / 1280x800 |  0.4432 | 0.5279 |   0.2569 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-checklist-bottom     | light / 1280x800 |  0.5305 | 0.7112 |   0.2533 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-projects         | light / 1280x800 |  0.3959 | 0.7673 |   0.2489 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-text             | light / 1280x800 |  0.5375 | 0.7827 |   0.2472 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-open-dialog       | light / 1280x800 |  0.3733 | 0.7025 |   0.2468 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| worktree-picker-open      | light / 1280x800 |  0.5292 | 0.8049 |   0.2461 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-subagent-bottom      | light / 1280x800 |  0.5182 | 0.7109 |   0.2399 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| app-menu-open             | light / 1280x800 |  0.5172 | 0.7342 |   0.2384 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-focused          | light / 1280x800 |  0.5152 | 0.7485 |   0.2364 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| home-empty                | light / 1280x800 |  0.5153 | 0.7484 |   0.2358 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| home-no-project           | light / 1280x800 |  0.3211 | 0.6056 |   0.2301 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-slash            | light / 1280x800 |   0.534 |  0.904 |   0.2237 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-project-collapsed | light / 1280x800 |  0.4646 | 0.6488 |    0.222 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-mention          | light / 1280x800 |  0.5266 | 0.8859 |   0.2124 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thread-search-open        | light / 1280x800 |  0.4351 | 0.7231 |   0.1854 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| connection-offline        | light / 1280x800 |  0.2936 | 0.3719 |   0.1832 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-usage            | dark / 1280x800  |  0.1981 | 0.4109 |   0.1323 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| usage-limits-open         | dark / 1280x800  |  0.1981 | 0.4109 |   0.1323 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| apps-empty                | light / 1280x800 |  0.2142 | 0.4506 |   0.0819 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-streaming            | dark / 1280x800  |       — |      — |        — | not capturable                  | No model calls: imported unfinished history does not create an active run; no native headless event-feed injection exists. Refusing a completed-transcript substitute. |
| panel-canvas              | dark / 1280x800  |       — |      — |        — | not capturable                  | WKWebView snapshot API exists but no headless CLI snapshot/export bridge mounts the native child; refusing a blank native-child pixel score.                           |

## All theme / size measurements

| State                     | Theme | Size     | RGB MAE |  >16 % | Blur MAE | Snapshot stable |
| ------------------------- | ----- | -------- | ------: | -----: | -------: | --------------- |
| chat-long-middle          | light | 1280x800 |  4.4547 | 7.4181 |   4.2332 | cc011bd65229    |
| side-chat-new             | light | 1280x800 |  4.9807 | 4.4985 |    4.095 | 5434e55ec6dd    |
| panel-side-chat           | light | 1280x800 |  4.9586 | 4.4685 |   4.0887 | cc011bd65229    |
| chat-long-middle          | dark  | 1280x800 |  4.0327 | 7.3912 |   3.8296 | 69993ff73586    |
| side-chat-new             | dark  | 1280x800 |  4.6413 | 4.3481 |   3.8228 | 6df71ad401fc    |
| panel-side-chat           | dark  | 1280x800 |  4.6258 | 4.3203 |   3.8182 | 69993ff73586    |
| settings-general-bottom   | light | 1280x800 |  2.5812 | 3.7616 |   1.4331 | 0159311bb905    |
| settings-general-bottom   | dark  | 1280x800 |  2.1603 |  3.711 |   1.2286 | 7717df32e924    |
| subagent-conversation     | light | 1280x800 |  1.3717 | 2.3277 |   1.0212 | 0159311bb905    |
| question-review           | light | 1280x800 |  1.3589 | 1.5221 |    1.017 | cc011bd65229    |
| panel-diff-open           | light | 1280x800 |  2.0898 | 2.2174 |   0.9755 | cc011bd65229    |
| question-review           | dark  | 1280x800 |  1.2801 |   1.49 |   0.9744 | 69993ff73586    |
| settings-general          | light | 1280x800 |  1.8197 | 2.5658 |   0.9334 | 0159311bb905    |
| chat-markdown-middle      | light | 1280x800 |  1.8965 | 2.1063 |   0.9286 | cc011bd65229    |
| subagent-conversation     | dark  | 1280x800 |  1.2373 | 2.2595 |   0.9198 | 7717df32e924    |
| panel-diff-open           | dark  | 1280x800 |  1.9336 | 2.1186 |   0.9174 | 69993ff73586    |
| chat-markdown-middle      | dark  | 1280x800 |  1.8112 | 2.1035 |   0.9102 | 69993ff73586    |
| settings-general          | dark  | 1280x800 |  1.4991 | 2.4958 |   0.7853 | 7717df32e924    |
| chat-markdown-top         | light | 1280x800 |  1.6043 | 1.8973 |   0.7844 | cc011bd65229    |
| session-details-open      | light | 1280x800 |  1.7516 | 2.2115 |   0.7793 | cc011bd65229    |
| question-selected         | light | 1280x800 |  1.4101 | 1.8177 |   0.7707 | cc011bd65229    |
| chat-markdown-top         | dark  | 1280x800 |  1.5178 | 1.8807 |   0.7663 | 69993ff73586    |
| find-long-open            | light | 1280x800 |  1.6297 | 1.6422 |     0.76 | cc011bd65229    |
| panel-terminal            | light | 1280x800 |  1.6808 | 1.7708 |   0.7589 | cc011bd65229    |
| panel-file-open           | light | 1280x800 |  1.7373 | 2.0518 |   0.7522 | cc011bd65229    |
| tool-detail-open          | light | 1280x800 |  1.4506 | 1.8633 |   0.7516 | cc011bd65229    |
| session-details-open      | dark  | 1280x800 |  1.6533 | 2.1376 |   0.7505 | 69993ff73586    |
| chat-long-bottom          | light | 1280x800 |  1.6139 | 1.6295 |   0.7462 | cc011bd65229    |
| question-selected         | dark  | 1280x800 |  1.3057 |  1.807 |   0.7422 | 69993ff73586    |
| thread-actions-open       | light | 1280x800 |  1.6749 | 1.9437 |   0.7186 | cc011bd65229    |
| panel-terminal            | dark  | 1280x800 |  1.5558 | 1.6708 |   0.7172 | 69993ff73586    |
| find-long-open            | dark  | 1280x800 |  1.5227 | 1.5989 |   0.7132 | 69993ff73586    |
| settings-appearance       | dark  | 1280x800 |  1.0955 | 1.8858 |   0.7118 | 7717df32e924    |
| tool-detail-open          | dark  | 1280x800 |  1.3208 | 1.8076 |   0.7108 | 69993ff73586    |
| settings-remote-access    | light | 1280x800 |  1.2999 | 2.0713 |     0.71 | 0159311bb905    |
| find-markdown-open        | light | 1280x800 |  1.6493 |  1.846 |   0.7097 | cc011bd65229    |
| thread-context-menu       | light | 1280x800 |  1.6576 | 1.8728 |   0.7086 | cc011bd65229    |
| chat-long-bottom          | dark  | 1280x800 |  1.5141 | 1.5891 |   0.7069 | 69993ff73586    |
| chat-question-bottom      | light | 1280x800 |  1.3506 | 1.5318 |   0.7064 | cc011bd65229    |
| chat-architecture-bottom  | light | 1280x800 |  1.6425 | 1.8392 |   0.7009 | cc011bd65229    |
| panel-file-open           | dark  | 1280x800 |  1.6072 |  1.959 |   0.7003 | 69993ff73586    |
| settings-appearance       | light | 1280x800 |  1.1064 |  1.854 |    0.699 | 0159311bb905    |
| chat-markdown-bottom      | light | 1280x800 |  1.6335 | 1.8333 |   0.6959 | cc011bd65229    |
| chat-external-read-bottom | light | 1280x800 |  1.6226 |  1.826 |   0.6953 | cc011bd65229    |
| thread-actions-open       | dark  | 1280x800 |  1.5781 | 1.8721 |   0.6864 | 69993ff73586    |
| chat-question-bottom      | dark  | 1280x800 |  1.2443 | 1.5322 |   0.6766 | 69993ff73586    |
| thread-context-menu       | dark  | 1280x800 |  1.5604 | 1.8005 |   0.6746 | 69993ff73586    |
| find-markdown-open        | dark  | 1280x800 |  1.5513 | 1.7746 |   0.6723 | 69993ff73586    |
| chat-architecture-bottom  | dark  | 1280x800 |  1.5511 | 1.7707 |   0.6707 | 69993ff73586    |
| chat-markdown-bottom      | dark  | 1280x800 |  1.5427 | 1.7648 |   0.6661 | 69993ff73586    |
| chat-external-read-bottom | dark  | 1280x800 |  1.5331 | 1.7582 |   0.6656 | 69993ff73586    |
| panel-changes             | light | 1280x800 |  1.5599 | 1.8986 |   0.6466 | cc011bd65229    |
| panel-files               | light | 1280x800 |  1.4933 | 1.8445 |   0.6265 | cc011bd65229    |
| chat-long-top             | light | 1280x800 |  1.3456 | 1.5012 |   0.6129 | cc011bd65229    |
| settings-remote-access    | dark  | 1280x800 |  1.1125 | 2.0244 |   0.6066 | 7717df32e924    |
| panel-changes             | dark  | 1280x800 |   1.437 | 1.8079 |   0.6055 | 69993ff73586    |
| chat-long-top             | dark  | 1280x800 |   1.282 |  1.468 |   0.6022 | 69993ff73586    |
| panel-files               | dark  | 1280x800 |  1.3715 | 1.7497 |   0.5789 | 69993ff73586    |
| composer-attachment       | dark  | 1280x800 |   0.797 | 0.9481 |   0.5088 | 69993ff73586    |
| tool-rows-expanded        | light | 1280x800 |  1.0135 | 1.2625 |   0.4798 | cc011bd65229    |
| thoughts-expanded         | light | 1280x800 |  1.0135 | 1.2625 |   0.4798 | cc011bd65229    |
| tasks-empty               | light | 1280x800 |  0.8102 | 1.1187 |   0.4513 | c643d7c613a3    |
| project-edit-open         | light | 1280x800 |  0.6189 | 0.8863 |   0.4438 | cc011bd65229    |
| tool-rows-expanded        | dark  | 1280x800 |  0.8902 | 1.2007 |   0.4323 | 69993ff73586    |
| thoughts-expanded         | dark  | 1280x800 |  0.8902 | 1.2007 |   0.4323 | 69993ff73586    |
| sidebar-row-hover         | dark  | 1280x800 |  0.6851 |  0.835 |   0.4268 | 69993ff73586    |
| tasks-empty               | dark  | 1280x800 |  0.7476 | 0.9815 |   0.4245 | 16582264b925    |
| composer-attachment       | light | 1280x800 |  0.7589 | 0.9255 |   0.4242 | cc011bd65229    |
| sidebar-row-hover         | light | 1280x800 |  0.6974 | 0.9475 |   0.4117 | cc011bd65229    |
| worktrees-empty           | light | 1280x800 |  0.7684 | 1.0375 |   0.4113 | cc011bd65229    |
| project-copy-feedback     | light | 1280x800 |  0.5556 |  0.936 |   0.3713 | cc011bd65229    |
| model-picker-open         | light | 1280x800 |  0.8428 | 1.1796 |   0.3693 | cc011bd65229    |
| project-picker-open       | light | 1280x800 |  0.8747 |  1.073 |   0.3577 | cc011bd65229    |
| project-copy-feedback     | dark  | 1280x800 |  0.5258 | 1.0253 |    0.354 | 69993ff73586    |
| settings-shortcuts        | light | 1280x800 |  0.8606 | 1.2119 |   0.3521 | 0159311bb905    |
| settings-shortcuts        | dark  | 1280x800 |  0.7838 | 1.1917 |   0.3351 | 7717df32e924    |
| model-picker-open         | dark  | 1280x800 |  0.7412 | 1.1622 |    0.326 | 69993ff73586    |
| project-edit-open         | dark  | 1280x800 |  0.4532 | 0.6989 |   0.3224 | 69993ff73586    |
| panel-subagents           | light | 1280x800 |  0.7376 | 1.1443 |     0.31 | 0159311bb905    |
| subagents-list            | light | 1280x800 |  0.7376 | 1.1443 |     0.31 | 0159311bb905    |
| project-picker-open       | dark  | 1280x800 |  0.7173 | 1.0138 |   0.3078 | 69993ff73586    |
| project-actions-open      | light | 1280x800 |  0.5349 | 0.8668 |   0.2954 | cc011bd65229    |
| panel-subagents           | dark  | 1280x800 |  0.6774 | 1.0776 |   0.2945 | 7717df32e924    |
| subagents-list            | dark  | 1280x800 |  0.6774 | 1.0776 |   0.2945 | 7717df32e924    |
| model-picker-filtered     | light | 1280x800 |  0.5918 | 0.9296 |   0.2894 | cc011bd65229    |
| project-actions-open      | dark  | 1280x800 |  0.5215 | 0.9263 |   0.2876 | 69993ff73586    |
| tools-expanded            | light | 1280x800 |  0.6771 | 0.9101 |   0.2865 | cc011bd65229    |
| worktrees-empty           | dark  | 1280x800 |  0.5412 | 0.9026 |    0.276 | 69993ff73586    |
| tools-expanded            | dark  | 1280x800 |   0.619 | 0.8654 |   0.2751 | 69993ff73586    |
| model-picker-filtered     | dark  | 1280x800 |  0.5383 | 0.8965 |   0.2702 | 69993ff73586    |
| worktree-new-selected     | light | 1280x800 |  0.5628 |  0.791 |   0.2643 | cc011bd65229    |
| chat-tools-bottom         | light | 1280x800 |   0.606 | 0.8217 |   0.2627 | cc011bd65229    |
| sidebar-focus-view        | light | 1280x800 |  0.5633 |  0.883 |   0.2582 | cc011bd65229    |
| sidebar-hidden            | light | 1280x800 |  0.4432 | 0.5279 |   0.2569 | cc011bd65229    |
| chat-tools-bottom         | dark  | 1280x800 |  0.5583 |  0.779 |   0.2548 | 69993ff73586    |
| chat-checklist-bottom     | light | 1280x800 |  0.5305 | 0.7112 |   0.2533 | cc011bd65229    |
| settings-projects         | light | 1280x800 |  0.3959 | 0.7673 |   0.2489 | 0159311bb905    |
| sidebar-focus-view        | dark  | 1280x800 |  0.5241 | 0.8391 |   0.2479 | 69993ff73586    |
| composer-text             | light | 1280x800 |  0.5375 | 0.7827 |   0.2472 | cc011bd65229    |
| project-open-dialog       | light | 1280x800 |  0.3733 | 0.7025 |   0.2468 | cc011bd65229    |
| worktree-picker-open      | light | 1280x800 |  0.5292 | 0.8049 |   0.2461 | cc011bd65229    |
| worktree-new-selected     | dark  | 1280x800 |  0.5123 | 0.7475 |   0.2452 | 69993ff73586    |
| sidebar-hidden            | dark  | 1280x800 |  0.4077 | 0.5051 |   0.2446 | 69993ff73586    |
| settings-projects         | dark  | 1280x800 |  0.3844 | 0.7746 |   0.2425 | 7717df32e924    |
| chat-subagent-bottom      | light | 1280x800 |  0.5182 | 0.7109 |   0.2399 | cc011bd65229    |
| app-menu-open             | light | 1280x800 |  0.5172 | 0.7342 |   0.2384 | cc011bd65229    |
| chat-checklist-bottom     | dark  | 1280x800 |   0.482 |  0.674 |   0.2378 | 69993ff73586    |
| composer-text             | dark  | 1280x800 |  0.4979 | 0.7307 |   0.2368 | 69993ff73586    |
| composer-focused          | light | 1280x800 |  0.5152 | 0.7485 |   0.2364 | cc011bd65229    |
| home-empty                | light | 1280x800 |  0.5153 | 0.7484 |   0.2358 | cc011bd65229    |
| chat-subagent-bottom      | dark  | 1280x800 |  0.4801 | 0.6719 |   0.2349 | 69993ff73586    |
| worktree-picker-open      | dark  | 1280x800 |  0.4847 | 0.7537 |   0.2338 | 69993ff73586    |
| home-no-project           | light | 1280x800 |  0.3211 | 0.6056 |   0.2301 | cc011bd65229    |
| composer-focused          | dark  | 1280x800 |  0.4782 | 0.7074 |   0.2284 | 69993ff73586    |
| composer-slash            | light | 1280x800 |   0.534 |  0.904 |   0.2237 | cc011bd65229    |
| home-empty                | dark  | 1280x800 |  0.4731 | 0.7051 |   0.2223 | 69993ff73586    |
| sidebar-project-collapsed | light | 1280x800 |  0.4646 | 0.6488 |    0.222 | cc011bd65229    |
| app-menu-open             | dark  | 1280x800 |  0.4661 |  0.696 |   0.2181 | 69993ff73586    |
| composer-mention          | light | 1280x800 |  0.5266 | 0.8859 |   0.2124 | cc011bd65229    |
| sidebar-project-collapsed | dark  | 1280x800 |  0.4276 | 0.6083 |   0.2102 | 69993ff73586    |
| composer-slash            | dark  | 1280x800 |  0.4499 | 0.7807 |   0.2017 | 69993ff73586    |
| composer-mention          | dark  | 1280x800 |   0.446 |  0.765 |   0.1915 | 69993ff73586    |
| thread-search-open        | light | 1280x800 |  0.4351 | 0.7231 |   0.1854 | cc011bd65229    |
| connection-offline        | light | 1280x800 |  0.2936 | 0.3719 |   0.1832 | cb8e5f4b27ff    |
| connection-offline        | dark  | 1280x800 |  0.2783 | 0.3681 |   0.1665 | cc011bd65229    |
| project-open-dialog       | dark  | 1280x800 |  0.2694 | 0.4878 |   0.1568 | 69993ff73586    |
| home-no-project           | dark  | 1280x800 |  0.2217 | 0.3925 |   0.1417 | 69993ff73586    |
| settings-usage            | dark  | 1280x800 |  0.1981 | 0.4109 |   0.1323 | 7717df32e924    |
| usage-limits-open         | dark  | 1280x800 |  0.1981 | 0.4109 |   0.1323 | 7717df32e924    |
| thread-search-open        | dark  | 1280x800 |  0.2863 | 0.5588 |   0.1222 | 69993ff73586    |
| settings-usage            | light | 1280x800 |  0.1955 | 0.4184 |   0.1216 | 0159311bb905    |
| usage-limits-open         | light | 1280x800 |  0.1955 | 0.4184 |   0.1216 | 0159311bb905    |
| apps-empty                | light | 1280x800 |  0.2142 | 0.4506 |   0.0819 | f0821ce60eb0    |
| apps-empty                | dark  | 1280x800 |  0.1828 | 0.4135 |   0.0704 | 3cfc1c27c09e    |
| chat-streaming            | dark  | 1280x800 |       — |      — |        — | unscored        |
| panel-canvas              | dark  | 1280x800 |       — |      — |        — | unscored        |
| chat-streaming            | light | 1280x800 |       — |      — |        — | unscored        |
| panel-canvas              | light | 1280x800 |       — |      — |        — | unscored        |

## Reproduce

```sh
bun apps/rune/tools/sweep/run.ts
# Optional: --states home-empty,chat-markdown-top --themes dark,light --sizes 1280x800
```

Requires Bun, Node, the pinned Electron dependency, Rust/macOS toolchain and Python Pillow. Builds the shared renderer, real desktop main/preload, and Rune incrementally; isolated CLI pinned to 2.3.2. Each Electron instance is closed after capture. Only processes whose actual environment contains `HOME=/tmp/ocr-sweep-final/home` are terminated during fallback cleanup. The temporary environment is removed in finally; `--keep-env` is for diagnosis only. PNGs, logs, DOM observations, fixture manifest and full per-theme metrics stay local/ignored. Reference PNGs are `.electron.png`, never historical `.web.png` files. `--report-only` regenerates this report from local results and checked-in review descriptions.
