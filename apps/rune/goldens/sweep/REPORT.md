# Same-data Electron / Rune parity sweep

Revision: `37c591922e411343e8e8e837ff9211b2640fefeb`. Clock: 2026-11-22T12:00:00.000Z.
UI/backend source fingerprint: `7edf84f6cfc6a0d785ec41833d9ed6bf12440404a2219209fd844134efd3adef`. Reviewed observations are used only for matching fingerprints.

**69 states; 138 state/theme/size attempts.** 68 equivalent (only rasterization) · 1 not capturable.

Both clients use gateway **4518**, isolated OpenCode **4988**, and the same authored fixture. No model calls or historical screenshots. **Real Electron is LEFT**, Rune RIGHT. Electron runs this checkout’s built main and sandboxed preload with `ELECTRON_RENDERER_URL=http://127.0.0.1:4518`, isolated HOME/XDG and a per-capture temporary user-data directory. Its genuine desktop bridge supplies Browser and Updates capabilities; no preload substitute or host-capability mock is installed. Fixtures include Markdown, 40-turn history, completed tools/reasoning, a real native form and permission, source diff/files, native child, side fork, tasks, and an app/canvas. Tasks/Apps empty states temporarily remove their data before the pair and restore it afterwards; both captures and their digests use the same empty lists. New side chat creates a real gateway fork before capturing that selected conversation (including inherited context) in both clients; this compares the rendered result, not native mutation behavior.

## Method and limits

- Logical size 1280×800 (unless requested otherwise), device scale 2. Installed Electron binary runs this checkout’s actual built desktop main, preload and IPC handlers; Playwright connects through its ephemeral remote-debugging port/CDP. A finite temporary bootstrap imports that real main and only sets window content size, theme and hidden state. CDP device metrics match the content size. `Page.captureScreenshot` captures the hidden renderer surface, excluding OS titlebar traffic lights. The genuine preload enables the macOS titlebar inset. Native release `--screenshot --at 0.7` uses the same size/theme. Each scored record verifies the real bridge, viewport and scale and records Electron/Chromium versions.
- Fixed browser Date and verified native realtime-clock interposer; monotonic/network time remains real. Web CSS animations paused at their initial phase and input caret hidden; the delayed follow-pill entrance is explicitly sampled at 0.7s, matching native --at 0.7 rather than hiding a mounted control at zero opacity. Native animation/caret phase uses the fixed virtual capture clock. Pointer parked except explicit hover. Transcript scroll fraction explicit. No redraw loops.
- Each pair brackets capture with a SHA-256 digest of the same gateway projects, session info/history, forms, permissions, children, side forks, tasks, apps and canvas data. A changing digest invalidates the pair (no score). Captures are sequential over an unchanged snapshot, **not atomic simultaneous GPU presentation**.
- RGB MAE is 0–255; over16 is the percentage of pixels whose maximum channel error exceeds 16. Structural metric is grayscale MAE after a 2-physical-pixel Gaussian blur and 2× downsampling (lower is better). No alignment correction, masks or cropping. Heatmap magnifies errors 4×.
- Classification is manually reviewed where noted in the driver review file; otherwise thresholds are provisional: equivalent requires RGB <1.5 and blurred MAE <0.7; small layout <5; larger errors missing/extra. State classification uses the worst theme/size. Metrics alone never prove semantic equivalence.
- See tools/sweep/LAST.md for the final fix measurements, geometry checks and inspected caveats. In particular, a new side fork may return empty history; its introduction can meet numerical thresholds while retaining locale-time/plugin-hint text differences. It must not be called pixel-equivalent or substituted with an older populated-fork capture.
- Native canvas capture composites the real WKWebView takeSnapshot export at its laid-out host rectangle; adjacent child PNG/JSON preserve pixels and placement provenance. It uses the same gateway runtime, source, data and theme, waiting for document/fonts and the snapshot paint fence. No blank-child substitute, image mask or alignment correction. Unsupported run states remain unscored with explicit reasons; chat-streaming is an active-run limitation, not a second canvas.

## States, worst first (worst theme/size shown)

| State                     | Theme / size     | RGB MAE |  >16 % | Blur MAE | Classification                  | Observed difference                                                                                                                                                    |
| ------------------------- | ---------------- | ------: | -----: | -------: | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| side-chat-new             | light / 1280x800 |  1.0619 | 1.3108 |   0.6057 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-attachment       | dark / 1280x800  |  0.8095 |  0.918 |   0.5622 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-markdown-top         | light / 1280x800 |  1.0225 | 1.2361 |   0.4919 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-markdown-middle      | light / 1280x800 |  1.0164 | 1.2244 |   0.4845 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-row-hover         | dark / 1280x800  |  0.6967 | 0.8067 |   0.4804 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| session-details-open      | light / 1280x800 |  0.9166 | 1.4341 |   0.4613 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-edit-open         | light / 1280x800 |  0.6162 | 0.8834 |   0.4397 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| question-review           | light / 1280x800 |  0.6597 | 0.7978 |   0.4224 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| question-selected         | light / 1280x800 |  0.6439 | 0.7995 |   0.4144 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| worktrees-empty           | light / 1280x800 |  0.7733 | 1.0417 |   0.4091 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-picker-open       | light / 1280x800 |  0.8623 | 1.0146 |   0.4041 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tasks-empty               | light / 1280x800 |  0.6533 | 0.8463 |   0.4026 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-general-bottom   | light / 1280x800 |  0.8307 | 1.6584 |   0.3999 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-question-bottom      | light / 1280x800 |  0.6264 | 0.7899 |   0.3977 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thread-actions-open       | light / 1280x800 |  0.8132 |  1.173 |   0.3948 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tool-detail-open          | dark / 1280x800  |  0.6545 | 1.1644 |   0.3877 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-remote-access    | light / 1280x800 |  0.6733 |  0.961 |   0.3873 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| find-markdown-open        | light / 1280x800 |   0.777 |  1.051 |   0.3801 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-side-chat           | light / 1280x800 |  0.9192 | 1.3263 |   0.3779 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-architecture-bottom  | light / 1280x800 |  0.7696 | 1.0445 |   0.3744 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| model-picker-open         | light / 1280x800 |  0.7346 | 0.9977 |   0.3701 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-copy-feedback     | light / 1280x800 |   0.559 | 0.8995 |   0.3697 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-markdown-bottom      | light / 1280x800 |  0.7627 | 1.0404 |    0.368 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thread-context-menu       | light / 1280x800 |  0.7842 | 1.0884 |   0.3677 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tool-rows-expanded        | dark / 1280x800  |  0.6064 | 0.8919 |   0.3597 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thoughts-expanded         | dark / 1280x800  |  0.6064 | 0.8919 |   0.3597 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-diff-open           | light / 1280x800 |  0.7452 | 1.1889 |   0.3595 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-external-read-bottom | light / 1280x800 |  0.7474 | 1.0316 |   0.3523 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-file-open           | light / 1280x800 |  0.7259 | 1.1493 |   0.3484 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-shortcuts        | light / 1280x800 |  0.8454 | 1.1912 |   0.3455 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| model-picker-filtered     | light / 1280x800 |  0.5781 | 0.8589 |   0.3349 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tools-expanded            | dark / 1280x800  |  0.5364 |  0.748 |   0.3344 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-changes             | light / 1280x800 |  0.6932 | 1.0648 |    0.333 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-terminal            | light / 1280x800 |  0.6618 | 0.8445 |   0.3298 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| subagent-conversation     | light / 1280x800 |  0.6141 | 0.8486 |   0.3289 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-files               | light / 1280x800 |  0.6683 | 1.0378 |   0.3178 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| worktree-new-selected     | light / 1280x800 |   0.564 |   0.75 |   0.3162 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-open-dialog       | light / 1280x800 |   0.429 | 0.6823 |   0.3139 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-focus-view        | light / 1280x800 |  0.5733 | 0.8544 |   0.3127 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-general          | light / 1280x800 |  0.7084 | 1.1598 |   0.3067 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-hidden            | light / 1280x800 |   0.485 | 0.5216 |   0.3061 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| worktree-picker-open      | light / 1280x800 |  0.5409 | 0.7734 |    0.302 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-text             | light / 1280x800 |  0.5475 | 0.7541 |   0.3017 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-long-top             | dark / 1280x800  |   0.547 | 0.8601 |   0.2974 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| home-no-project           | light / 1280x800 |  0.3768 | 0.5854 |   0.2972 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-actions-open      | light / 1280x800 |   0.541 | 0.8315 |   0.2946 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| app-menu-open             | light / 1280x800 |  0.5272 | 0.7056 |   0.2928 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-focused          | light / 1280x800 |  0.5252 | 0.7199 |   0.2909 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| home-empty                | light / 1280x800 |  0.5253 | 0.7198 |   0.2902 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| find-long-open            | light / 1280x800 |  0.5656 | 0.8452 |   0.2893 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-appearance       | dark / 1280x800  |  0.4852 | 0.7518 |   0.2892 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-long-middle          | light / 1280x800 |  0.5655 | 0.8607 |   0.2826 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-long-bottom          | light / 1280x800 |  0.5513 | 0.8345 |   0.2772 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-project-collapsed | light / 1280x800 |  0.4746 | 0.6202 |   0.2765 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-canvas              | light / 1280x800 |  0.5911 |  0.874 |   0.2765 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-slash            | light / 1280x800 |  0.5319 | 0.8607 |    0.275 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-subagent-bottom      | light / 1280x800 |  0.4546 | 0.6125 |   0.2609 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-checklist-bottom     | light / 1280x800 |  0.4281 | 0.5814 |   0.2481 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-projects         | light / 1280x800 |   0.402 |  0.732 |   0.2481 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-tools-bottom         | light / 1280x800 |  0.4555 | 0.6666 |   0.2389 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| connection-offline        | light / 1280x800 |  0.3007 |  0.346 |   0.2362 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-mention          | light / 1280x800 |  0.4803 | 0.7977 |   0.2335 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-subagents           | light / 1280x800 |  0.4775 | 0.8121 |   0.2247 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| subagents-list            | light / 1280x800 |  0.4775 | 0.8121 |   0.2247 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thread-search-open        | light / 1280x800 |  0.4282 | 0.7174 |   0.2159 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-usage            | dark / 1280x800  |  0.1886 | 0.3622 |   0.1283 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| usage-limits-open         | dark / 1280x800  |  0.1886 | 0.3622 |   0.1283 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| apps-empty                | light / 1280x800 |   0.204 | 0.4062 |   0.0739 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-streaming            | dark / 1280x800  |       — |      — |        — | not capturable                  | No model calls: imported unfinished history does not create an active run; no native headless event-feed injection exists. Refusing a completed-transcript substitute. |

## All theme / size measurements

| State                     | Theme | Size     | RGB MAE |  >16 % | Blur MAE | Snapshot stable |
| ------------------------- | ----- | -------- | ------: | -----: | -------: | --------------- |
| side-chat-new             | light | 1280x800 |  1.0619 | 1.3108 |   0.6057 | 3741fb876510    |
| composer-attachment       | dark  | 1280x800 |  0.8095 |  0.918 |   0.5622 | 764ea0131284    |
| side-chat-new             | dark  | 1280x800 |   0.934 | 1.2249 |   0.5246 | 80c9c73cc08c    |
| chat-markdown-top         | light | 1280x800 |  1.0225 | 1.2361 |   0.4919 | 542800aefeda    |
| chat-markdown-middle      | light | 1280x800 |  1.0164 | 1.2244 |   0.4845 | 542800aefeda    |
| sidebar-row-hover         | dark  | 1280x800 |  0.6967 | 0.8067 |   0.4804 | 764ea0131284    |
| composer-attachment       | light | 1280x800 |  0.7705 | 0.8978 |   0.4798 | 542800aefeda    |
| chat-markdown-top         | dark  | 1280x800 |  0.9606 | 1.1862 |   0.4762 | 764ea0131284    |
| chat-markdown-middle      | dark  | 1280x800 |  0.9581 | 1.1784 |     0.47 | 764ea0131284    |
| sidebar-row-hover         | light | 1280x800 |  0.7078 | 0.9215 |   0.4674 | 542800aefeda    |
| session-details-open      | light | 1280x800 |  0.9166 | 1.4341 |   0.4613 | 542800aefeda    |
| session-details-open      | dark  | 1280x800 |  0.8653 | 1.3844 |   0.4554 | 764ea0131284    |
| project-edit-open         | light | 1280x800 |  0.6162 | 0.8834 |   0.4397 | 542800aefeda    |
| question-review           | light | 1280x800 |  0.6597 | 0.7978 |   0.4224 | 542800aefeda    |
| question-selected         | light | 1280x800 |  0.6439 | 0.7995 |   0.4144 | 542800aefeda    |
| worktrees-empty           | light | 1280x800 |  0.7733 | 1.0417 |   0.4091 | 542800aefeda    |
| project-picker-open       | light | 1280x800 |  0.8623 | 1.0146 |   0.4041 | 542800aefeda    |
| tasks-empty               | light | 1280x800 |  0.6533 | 0.8463 |   0.4026 | f04c52005659    |
| settings-general-bottom   | light | 1280x800 |  0.8307 | 1.6584 |   0.3999 | b1cba02feb4e    |
| settings-general-bottom   | dark  | 1280x800 |  0.7281 | 1.5591 |   0.3992 | 2d9010033cbf    |
| chat-question-bottom      | light | 1280x800 |  0.6264 | 0.7899 |   0.3977 | 542800aefeda    |
| thread-actions-open       | light | 1280x800 |  0.8132 |  1.173 |   0.3948 | 542800aefeda    |
| question-selected         | dark  | 1280x800 |  0.5942 | 0.7732 |   0.3943 | 764ea0131284    |
| question-review           | dark  | 1280x800 |  0.6018 | 0.7373 |   0.3942 | 764ea0131284    |
| tool-detail-open          | dark  | 1280x800 |  0.6545 | 1.1644 |   0.3877 | 764ea0131284    |
| settings-remote-access    | light | 1280x800 |  0.6733 |  0.961 |   0.3873 | b1cba02feb4e    |
| thread-actions-open       | dark  | 1280x800 |  0.7664 | 1.1256 |   0.3871 | 764ea0131284    |
| tasks-empty               | dark  | 1280x800 |  0.6182 | 0.7622 |    0.385 | 8d2be65ab18e    |
| chat-question-bottom      | dark  | 1280x800 |  0.5832 |  0.778 |   0.3844 | 764ea0131284    |
| find-markdown-open        | light | 1280x800 |   0.777 |  1.051 |   0.3801 | 542800aefeda    |
| panel-side-chat           | light | 1280x800 |  0.9192 | 1.3263 |   0.3779 | 542800aefeda    |
| chat-architecture-bottom  | light | 1280x800 |  0.7696 | 1.0445 |   0.3744 | 542800aefeda    |
| tool-detail-open          | light | 1280x800 |  0.6804 | 1.2237 |    0.372 | 542800aefeda    |
| model-picker-open         | light | 1280x800 |  0.7346 | 0.9977 |   0.3701 | 542800aefeda    |
| project-copy-feedback     | light | 1280x800 |   0.559 | 0.8995 |   0.3697 | 542800aefeda    |
| panel-side-chat           | dark  | 1280x800 |  0.8631 | 1.2427 |   0.3696 | 764ea0131284    |
| chat-architecture-bottom  | dark  | 1280x800 |  0.7265 | 1.0003 |    0.368 | 764ea0131284    |
| chat-markdown-bottom      | light | 1280x800 |  0.7627 | 1.0404 |    0.368 | 542800aefeda    |
| thread-context-menu       | light | 1280x800 |  0.7842 | 1.0884 |   0.3677 | 542800aefeda    |
| find-markdown-open        | dark  | 1280x800 |  0.7274 | 1.0035 |   0.3668 | 764ea0131284    |
| chat-markdown-bottom      | dark  | 1280x800 |    0.72 | 0.9958 |   0.3619 | 764ea0131284    |
| tool-rows-expanded        | dark  | 1280x800 |  0.6064 | 0.8919 |   0.3597 | 764ea0131284    |
| thoughts-expanded         | dark  | 1280x800 |  0.6064 | 0.8919 |   0.3597 | 764ea0131284    |
| panel-diff-open           | light | 1280x800 |  0.7452 | 1.1889 |   0.3595 | 542800aefeda    |
| thread-context-menu       | dark  | 1280x800 |  0.7354 | 1.0415 |   0.3578 | 764ea0131284    |
| project-picker-open       | dark  | 1280x800 |  0.7125 | 0.9555 |    0.355 | 764ea0131284    |
| chat-external-read-bottom | light | 1280x800 |  0.7474 | 1.0316 |   0.3523 | 542800aefeda    |
| project-copy-feedback     | dark  | 1280x800 |  0.5275 | 0.9884 |   0.3512 | 764ea0131284    |
| panel-diff-open           | dark  | 1280x800 |  0.6967 | 1.1021 |   0.3503 | 764ea0131284    |
| panel-file-open           | light | 1280x800 |  0.7259 | 1.1493 |   0.3484 | 542800aefeda    |
| chat-external-read-bottom | dark  | 1280x800 |  0.7063 | 0.9881 |   0.3472 | 764ea0131284    |
| settings-shortcuts        | light | 1280x800 |  0.8454 | 1.1912 |   0.3455 | b1cba02feb4e    |
| tool-rows-expanded        | light | 1280x800 |  0.6335 | 0.9406 |   0.3387 | 542800aefeda    |
| thoughts-expanded         | light | 1280x800 |  0.6335 | 0.9406 |   0.3387 | 542800aefeda    |
| panel-file-open           | dark  | 1280x800 |  0.6713 |  1.068 |   0.3349 | 764ea0131284    |
| model-picker-filtered     | light | 1280x800 |  0.5781 | 0.8589 |   0.3349 | 542800aefeda    |
| tools-expanded            | dark  | 1280x800 |  0.5364 |  0.748 |   0.3344 | 764ea0131284    |
| panel-changes             | light | 1280x800 |  0.6932 | 1.0648 |    0.333 | 542800aefeda    |
| settings-shortcuts        | dark  | 1280x800 |   0.772 | 1.1722 |   0.3305 | 2d9010033cbf    |
| panel-terminal            | light | 1280x800 |  0.6618 | 0.8445 |   0.3298 | 542800aefeda    |
| subagent-conversation     | light | 1280x800 |  0.6141 | 0.8486 |   0.3289 | b1cba02feb4e    |
| model-picker-open         | dark  | 1280x800 |  0.6289 | 0.9421 |   0.3281 | 764ea0131284    |
| panel-changes             | dark  | 1280x800 |  0.6424 |  0.989 |   0.3253 | 764ea0131284    |
| panel-terminal            | dark  | 1280x800 |  0.6213 | 0.7949 |   0.3249 | 764ea0131284    |
| settings-remote-access    | dark  | 1280x800 |  0.5531 | 0.9063 |   0.3216 | 2d9010033cbf    |
| project-edit-open         | dark  | 1280x800 |  0.4515 | 0.6995 |   0.3213 | 764ea0131284    |
| subagent-conversation     | dark  | 1280x800 |  0.5735 |  0.781 |   0.3209 | 2d9010033cbf    |
| panel-files               | light | 1280x800 |  0.6683 | 1.0378 |   0.3178 | 542800aefeda    |
| worktree-new-selected     | light | 1280x800 |   0.564 |   0.75 |   0.3162 | 542800aefeda    |
| model-picker-filtered     | dark  | 1280x800 |  0.5219 | 0.8103 |   0.3145 | 764ea0131284    |
| project-open-dialog       | light | 1280x800 |   0.429 | 0.6823 |   0.3139 | 542800aefeda    |
| sidebar-focus-view        | light | 1280x800 |  0.5733 | 0.8544 |   0.3127 | 542800aefeda    |
| tools-expanded            | light | 1280x800 |   0.541 | 0.7797 |   0.3067 | 542800aefeda    |
| settings-general          | light | 1280x800 |  0.7084 | 1.1598 |   0.3067 | b1cba02feb4e    |
| sidebar-hidden            | light | 1280x800 |   0.485 | 0.5216 |   0.3061 | 542800aefeda    |
| panel-files               | dark  | 1280x800 |  0.6132 | 0.9528 |    0.302 | 764ea0131284    |
| worktree-picker-open      | light | 1280x800 |  0.5409 | 0.7734 |    0.302 | 542800aefeda    |
| composer-text             | light | 1280x800 |  0.5475 | 0.7541 |   0.3017 | 542800aefeda    |
| sidebar-focus-view        | dark  | 1280x800 |  0.5351 | 0.8081 |   0.3006 | 764ea0131284    |
| chat-long-top             | dark  | 1280x800 |   0.547 | 0.8601 |   0.2974 | 764ea0131284    |
| home-no-project           | light | 1280x800 |  0.3768 | 0.5854 |   0.2972 | 542800aefeda    |
| worktree-new-selected     | dark  | 1280x800 |  0.5159 | 0.7035 |   0.2959 | 764ea0131284    |
| chat-long-top             | light | 1280x800 |  0.5761 | 0.8911 |   0.2954 | 542800aefeda    |
| project-actions-open      | light | 1280x800 |   0.541 | 0.8315 |   0.2946 | 542800aefeda    |
| app-menu-open             | light | 1280x800 |  0.5272 | 0.7056 |   0.2928 | 542800aefeda    |
| composer-focused          | light | 1280x800 |  0.5252 | 0.7199 |   0.2909 | 542800aefeda    |
| home-empty                | light | 1280x800 |  0.5253 | 0.7198 |   0.2902 | 542800aefeda    |
| composer-text             | dark  | 1280x800 |   0.509 | 0.6997 |   0.2895 | 764ea0131284    |
| find-long-open            | light | 1280x800 |  0.5656 | 0.8452 |   0.2893 | 542800aefeda    |
| settings-appearance       | dark  | 1280x800 |  0.4852 | 0.7518 |   0.2892 | 2d9010033cbf    |
| sidebar-hidden            | dark  | 1280x800 |   0.447 | 0.4971 |   0.2884 | 764ea0131284    |
| worktree-picker-open      | dark  | 1280x800 |   0.498 | 0.7212 |   0.2883 | 764ea0131284    |
| chat-long-middle          | light | 1280x800 |  0.5655 | 0.8607 |   0.2826 | 542800aefeda    |
| composer-focused          | dark  | 1280x800 |  0.4893 | 0.6764 |   0.2811 | 764ea0131284    |
| project-actions-open      | dark  | 1280x800 |  0.5156 | 0.8488 |   0.2811 | 764ea0131284    |
| chat-long-middle          | dark  | 1280x800 |  0.5335 | 0.8198 |   0.2798 | 764ea0131284    |
| find-long-open            | dark  | 1280x800 |  0.5272 | 0.8014 |   0.2797 | 764ea0131284    |
| chat-long-bottom          | light | 1280x800 |  0.5513 | 0.8345 |   0.2772 | 542800aefeda    |
| sidebar-project-collapsed | light | 1280x800 |  0.4746 | 0.6202 |   0.2765 | 542800aefeda    |
| panel-canvas              | light | 1280x800 |  0.5911 |  0.874 |   0.2765 | 542800aefeda    |
| home-empty                | dark  | 1280x800 |  0.4842 | 0.6741 |   0.2751 | 764ea0131284    |
| composer-slash            | light | 1280x800 |  0.5319 | 0.8607 |    0.275 | 542800aefeda    |
| worktrees-empty           | dark  | 1280x800 |  0.5431 | 0.9079 |   0.2749 | 764ea0131284    |
| chat-long-bottom          | dark  | 1280x800 |  0.5198 | 0.7937 |   0.2748 | 764ea0131284    |
| settings-general          | dark  | 1280x800 |  0.5833 | 1.0653 |   0.2731 | 2d9010033cbf    |
| panel-canvas              | dark  | 1280x800 |  0.5557 | 0.8131 |    0.273 | 764ea0131284    |
| settings-appearance       | light | 1280x800 |  0.5001 | 0.7636 |   0.2723 | b1cba02feb4e    |
| app-menu-open             | dark  | 1280x800 |  0.4771 |  0.665 |   0.2708 | 764ea0131284    |
| sidebar-project-collapsed | dark  | 1280x800 |  0.4386 | 0.5773 |   0.2629 | 764ea0131284    |
| chat-subagent-bottom      | light | 1280x800 |  0.4546 | 0.6125 |   0.2609 | 542800aefeda    |
| chat-subagent-bottom      | dark  | 1280x800 |   0.427 | 0.5729 |   0.2589 | 764ea0131284    |
| composer-slash            | dark  | 1280x800 |  0.4492 | 0.7378 |   0.2512 | 764ea0131284    |
| chat-checklist-bottom     | light | 1280x800 |  0.4281 | 0.5814 |   0.2481 | 542800aefeda    |
| settings-projects         | light | 1280x800 |   0.402 |  0.732 |   0.2481 | b1cba02feb4e    |
| chat-checklist-bottom     | dark  | 1280x800 |  0.4029 | 0.5434 |   0.2479 | 764ea0131284    |
| settings-projects         | dark  | 1280x800 |  0.3902 | 0.7398 |   0.2429 | 2d9010033cbf    |
| chat-tools-bottom         | light | 1280x800 |  0.4555 | 0.6666 |   0.2389 | 542800aefeda    |
| chat-tools-bottom         | dark  | 1280x800 |  0.4261 | 0.6231 |   0.2378 | 764ea0131284    |
| connection-offline        | light | 1280x800 |  0.3007 |  0.346 |   0.2362 | 1d7cd1938214    |
| composer-mention          | light | 1280x800 |  0.4803 | 0.7977 |   0.2335 | 542800aefeda    |
| panel-subagents           | light | 1280x800 |  0.4775 | 0.8121 |   0.2247 | b1cba02feb4e    |
| subagents-list            | light | 1280x800 |  0.4775 | 0.8121 |   0.2247 | b1cba02feb4e    |
| panel-subagents           | dark  | 1280x800 |  0.4387 | 0.7497 |     0.22 | 2d9010033cbf    |
| subagents-list            | dark  | 1280x800 |  0.4387 | 0.7497 |     0.22 | 2d9010033cbf    |
| connection-offline        | dark  | 1280x800 |   0.287 | 0.3414 |   0.2177 | 542800aefeda    |
| project-open-dialog       | dark  | 1280x800 |    0.32 | 0.4635 |   0.2175 | 764ea0131284    |
| thread-search-open        | light | 1280x800 |  0.4282 | 0.7174 |   0.2159 | 542800aefeda    |
| composer-mention          | dark  | 1280x800 |  0.4057 | 0.6794 |   0.2138 | 764ea0131284    |
| home-no-project           | dark  | 1280x800 |  0.2723 | 0.3681 |   0.2024 | 764ea0131284    |
| thread-search-open        | dark  | 1280x800 |  0.2833 |  0.546 |   0.1412 | 764ea0131284    |
| settings-usage            | dark  | 1280x800 |  0.1886 | 0.3622 |   0.1283 | 2d9010033cbf    |
| usage-limits-open         | dark  | 1280x800 |  0.1886 | 0.3622 |   0.1283 | 2d9010033cbf    |
| settings-usage            | light | 1280x800 |  0.1858 | 0.3677 |   0.1163 | b1cba02feb4e    |
| usage-limits-open         | light | 1280x800 |  0.1858 | 0.3677 |   0.1163 | b1cba02feb4e    |
| apps-empty                | light | 1280x800 |   0.204 | 0.4062 |   0.0739 | de7e4e0dafad    |
| apps-empty                | dark  | 1280x800 |  0.1744 | 0.3691 |   0.0644 | f275b8fc68d6    |
| chat-streaming            | dark  | 1280x800 |       — |      — |        — | unscored        |
| chat-streaming            | light | 1280x800 |       — |      — |        — | unscored        |

## Reproduce

```sh
bun apps/rune/tools/sweep/run.ts
# Optional: --states home-empty,chat-markdown-top --themes dark,light --sizes 1280x800
```

Requires Bun, Node, the pinned Electron dependency, Rust/macOS toolchain and Python Pillow. Builds the shared renderer, real desktop main/preload, and Rune incrementally; isolated CLI pinned to 2.3.2. Each Electron instance is closed after capture. Only processes whose actual environment contains `HOME=/tmp/ocr-fx-last/home` are terminated during fallback cleanup. The temporary environment is removed in finally; `--keep-env` is for diagnosis only. PNGs, logs, DOM observations, fixture manifest and full per-theme metrics stay local/ignored. Reference PNGs are `.electron.png`, never historical `.web.png` files. `--report-only` regenerates this report from local results and checked-in review descriptions.
