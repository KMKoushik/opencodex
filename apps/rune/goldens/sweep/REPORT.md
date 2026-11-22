# Same-data Electron / Rune parity sweep

Revision: `9ab7c51e0541b33d99fd95ff4e93a3dd44ca9632`. Clock: 2026-11-22T12:00:00.000Z.
UI/backend source fingerprint: `b23848494e332ea16cc1285aa3462d158e3bb48b2867ee660fa22a4d7a36dec5`. Reviewed observations are used only for matching fingerprints.

**69 states; 138 state/theme/size attempts.** 3 small layout differences · 64 equivalent (only rasterization) · 2 not capturable.

Both clients use gateway **4517**, isolated OpenCode **4987**, and the same authored fixture. No model calls or historical screenshots. **Real Electron is LEFT**, Rune RIGHT. Electron runs this checkout’s built main and sandboxed preload with `ELECTRON_RENDERER_URL=http://127.0.0.1:4517`, isolated HOME/XDG and a per-capture temporary user-data directory. Its genuine desktop bridge supplies Browser and Updates capabilities; no preload substitute or host-capability mock is installed. Fixtures include Markdown, 40-turn history, completed tools/reasoning, a real native form and permission, source diff/files, native child, side fork, tasks, and an app/canvas. Tasks/Apps empty states temporarily remove their data before the pair and restore it afterwards; both captures and their digests use the same empty lists. New side chat creates a real gateway fork before capturing that selected conversation (including inherited context) in both clients; this compares the rendered result, not native mutation behavior.

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
| subagent-conversation     | light / 1280x800 |  1.2996 | 2.1511 |   0.9989 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| side-chat-new             | light / 1280x800 |   1.629 | 1.9831 |   0.6062 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-markdown-top         | dark / 1280x800  |  1.0867 | 1.3021 |   0.6011 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-side-chat           | light / 1280x800 |   1.607 | 1.9531 |      0.6 | small layout differences        | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-attachment       | dark / 1280x800  |  0.8095 |  0.918 |   0.5622 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-markdown-middle      | dark / 1280x800  |  1.0519 | 1.3074 |   0.5608 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-row-hover         | dark / 1280x800  |  0.6967 | 0.8067 |   0.4804 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-diff-open           | light / 1280x800 |  1.1107 | 1.5361 |   0.4641 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| session-details-open      | light / 1280x800 |  0.9166 |  1.434 |   0.4613 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-edit-open         | light / 1280x800 |  0.6198 | 0.8914 |   0.4404 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-file-open           | light / 1280x800 |  0.9265 | 1.3941 |   0.4244 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| question-review           | light / 1280x800 |  0.6597 | 0.7978 |   0.4224 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| question-selected         | light / 1280x800 |  0.6439 | 0.7995 |   0.4144 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-picker-open       | light / 1280x800 |  0.8914 |  1.046 |   0.4102 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| worktrees-empty           | light / 1280x800 |  0.7733 | 1.0417 |   0.4091 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-general-bottom   | light / 1280x800 |  0.8562 | 1.6922 |    0.408 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tasks-empty               | light / 1280x800 |  0.6533 | 0.8463 |   0.4026 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-question-bottom      | light / 1280x800 |  0.6264 | 0.7899 |   0.3977 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thread-actions-open       | light / 1280x800 |  0.8132 | 1.1729 |   0.3948 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tool-detail-open          | dark / 1280x800  |  0.6545 | 1.1644 |   0.3877 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-remote-access    | light / 1280x800 |  0.6733 |  0.961 |   0.3873 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-changes             | light / 1280x800 |  0.8464 | 1.2907 |   0.3837 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-long-middle          | dark / 1280x800  |  0.6367 | 1.0408 |    0.382 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| find-markdown-open        | light / 1280x800 |   0.777 |  1.051 |   0.3801 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-architecture-bottom  | light / 1280x800 |  0.7696 | 1.0444 |   0.3744 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| model-picker-open         | light / 1280x800 |  0.7346 | 0.9977 |   0.3701 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-copy-feedback     | light / 1280x800 |   0.559 | 0.8995 |   0.3697 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-markdown-bottom      | light / 1280x800 |  0.7627 | 1.0403 |    0.368 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thread-context-menu       | light / 1280x800 |  0.7842 | 1.0883 |   0.3677 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-files               | light / 1280x800 |  0.7766 | 1.2317 |   0.3592 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-long-top             | dark / 1280x800  |   0.607 | 0.8792 |   0.3523 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-external-read-bottom | light / 1280x800 |  0.7474 | 1.0315 |   0.3522 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-shortcuts        | light / 1280x800 |  0.8454 | 1.1912 |   0.3455 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| model-picker-filtered     | light / 1280x800 |  0.5781 | 0.8589 |   0.3349 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-terminal            | light / 1280x800 |  0.6623 |  0.846 |   0.3302 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| worktree-new-selected     | light / 1280x800 |   0.564 |   0.75 |   0.3162 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-open-dialog       | light / 1280x800 |   0.429 | 0.6823 |   0.3139 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-focus-view        | light / 1280x800 |  0.5733 | 0.8544 |   0.3127 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-general          | light / 1280x800 |  0.7255 | 1.1803 |   0.3125 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-hidden            | light / 1280x800 |   0.485 | 0.5216 |   0.3061 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| worktree-picker-open      | light / 1280x800 |  0.5409 | 0.7734 |    0.302 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-text             | light / 1280x800 |  0.5475 | 0.7541 |   0.3017 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| home-no-project           | light / 1280x800 |  0.3768 | 0.5854 |   0.2972 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| project-actions-open      | light / 1280x800 |   0.541 | 0.8315 |   0.2946 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| app-menu-open             | light / 1280x800 |  0.5272 | 0.7056 |   0.2928 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-focused          | light / 1280x800 |  0.5252 | 0.7199 |   0.2909 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| panel-subagents           | light / 1280x800 |  0.6692 | 1.0578 |   0.2905 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| subagents-list            | light / 1280x800 |  0.6692 | 1.0578 |   0.2905 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| home-empty                | light / 1280x800 |  0.5253 | 0.7198 |   0.2902 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| find-long-open            | light / 1280x800 |  0.5656 | 0.8452 |   0.2893 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-appearance       | dark / 1280x800  |  0.4852 | 0.7518 |   0.2892 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-long-bottom          | light / 1280x800 |  0.5513 | 0.8345 |   0.2772 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tool-rows-expanded        | light / 1280x800 |  0.5685 | 0.8695 |   0.2768 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thoughts-expanded         | light / 1280x800 |  0.5685 | 0.8695 |   0.2768 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| sidebar-project-collapsed | light / 1280x800 |  0.4746 | 0.6202 |   0.2765 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-slash            | light / 1280x800 |  0.5319 | 0.8607 |    0.275 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-subagent-bottom      | light / 1280x800 |  0.4546 | 0.6125 |   0.2609 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-checklist-bottom     | light / 1280x800 |  0.4281 | 0.5814 |   0.2481 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-projects         | light / 1280x800 |   0.402 |  0.732 |   0.2481 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| tools-expanded            | light / 1280x800 |  0.4759 | 0.7086 |   0.2449 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-tools-bottom         | light / 1280x800 |  0.4555 | 0.6666 |   0.2389 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| connection-offline        | light / 1280x800 |  0.3007 |  0.346 |   0.2362 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| composer-mention          | light / 1280x800 |  0.4803 | 0.7977 |   0.2335 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| thread-search-open        | light / 1280x800 |  0.4306 |  0.723 |   0.2175 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| settings-usage            | dark / 1280x800  |  0.1886 | 0.3622 |   0.1283 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| usage-limits-open         | dark / 1280x800  |  0.1886 | 0.3622 |   0.1283 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| apps-empty                | light / 1280x800 |   0.204 | 0.4062 |   0.0739 | equivalent (only rasterization) | Unreviewed metric-based classification; not a visual sign-off.                                                                                                         |
| chat-streaming            | dark / 1280x800  |       — |      — |        — | not capturable                  | No model calls: imported unfinished history does not create an active run; no native headless event-feed injection exists. Refusing a completed-transcript substitute. |
| panel-canvas              | dark / 1280x800  |       — |      — |        — | not capturable                  | WKWebView snapshot API exists but no headless CLI snapshot/export bridge mounts the native child; refusing a blank native-child pixel score.                           |

## All theme / size measurements

| State                     | Theme | Size     | RGB MAE |  >16 % | Blur MAE | Snapshot stable |
| ------------------------- | ----- | -------- | ------: | -----: | -------: | --------------- |
| subagent-conversation     | light | 1280x800 |  1.2996 | 2.1511 |   0.9989 | a6d677a42e68    |
| subagent-conversation     | dark  | 1280x800 |  1.1659 | 2.0812 |   0.9011 | 5f2ca1327e70    |
| side-chat-new             | light | 1280x800 |   1.629 | 1.9831 |   0.6062 | 8d115be28d8e    |
| chat-markdown-top         | dark  | 1280x800 |  1.0867 | 1.3021 |   0.6011 | 8b2f2da35a99    |
| panel-side-chat           | light | 1280x800 |   1.607 | 1.9531 |      0.6 | 98712cd2fb1b    |
| chat-markdown-top         | light | 1280x800 |  1.1232 | 1.3373 |   0.5899 | 98712cd2fb1b    |
| side-chat-new             | dark  | 1280x800 |  1.5073 |  1.879 |    0.576 | 9902c181805b    |
| panel-side-chat           | dark  | 1280x800 |  1.4917 | 1.8511 |   0.5714 | 8b2f2da35a99    |
| composer-attachment       | dark  | 1280x800 |  0.8095 |  0.918 |   0.5622 | 8b2f2da35a99    |
| chat-markdown-middle      | dark  | 1280x800 |  1.0519 | 1.3074 |   0.5608 | 8b2f2da35a99    |
| chat-markdown-middle      | light | 1280x800 |  1.0928 | 1.2967 |   0.5526 | 98712cd2fb1b    |
| sidebar-row-hover         | dark  | 1280x800 |  0.6967 | 0.8067 |   0.4804 | 8b2f2da35a99    |
| composer-attachment       | light | 1280x800 |  0.7705 | 0.8978 |   0.4798 | 98712cd2fb1b    |
| sidebar-row-hover         | light | 1280x800 |  0.7078 | 0.9215 |   0.4674 | 98712cd2fb1b    |
| panel-diff-open           | light | 1280x800 |  1.1107 | 1.5361 |   0.4641 | 98712cd2fb1b    |
| session-details-open      | light | 1280x800 |  0.9166 |  1.434 |   0.4613 | 98712cd2fb1b    |
| session-details-open      | dark  | 1280x800 |  0.8653 | 1.3844 |   0.4554 | 8b2f2da35a99    |
| panel-diff-open           | dark  | 1280x800 |  1.0178 | 1.4432 |   0.4419 | 8b2f2da35a99    |
| project-edit-open         | light | 1280x800 |  0.6198 | 0.8914 |   0.4404 | 98712cd2fb1b    |
| panel-file-open           | light | 1280x800 |  0.9265 | 1.3941 |   0.4244 | 98712cd2fb1b    |
| question-review           | light | 1280x800 |  0.6597 | 0.7978 |   0.4224 | 98712cd2fb1b    |
| question-selected         | light | 1280x800 |  0.6439 | 0.7995 |   0.4144 | 98712cd2fb1b    |
| project-picker-open       | light | 1280x800 |  0.8914 |  1.046 |   0.4102 | 98712cd2fb1b    |
| worktrees-empty           | light | 1280x800 |  0.7733 | 1.0417 |   0.4091 | 98712cd2fb1b    |
| settings-general-bottom   | light | 1280x800 |  0.8562 | 1.6922 |    0.408 | a6d677a42e68    |
| settings-general-bottom   | dark  | 1280x800 |  0.7444 | 1.5911 |   0.4043 | 5f2ca1327e70    |
| panel-file-open           | dark  | 1280x800 |  0.8557 | 1.3073 |   0.4034 | 8b2f2da35a99    |
| tasks-empty               | light | 1280x800 |  0.6533 | 0.8463 |   0.4026 | 205bca551ff7    |
| chat-question-bottom      | light | 1280x800 |  0.6264 | 0.7899 |   0.3977 | 98712cd2fb1b    |
| thread-actions-open       | light | 1280x800 |  0.8132 | 1.1729 |   0.3948 | 98712cd2fb1b    |
| question-selected         | dark  | 1280x800 |  0.5942 | 0.7732 |   0.3943 | 8b2f2da35a99    |
| question-review           | dark  | 1280x800 |  0.6018 | 0.7373 |   0.3942 | 8b2f2da35a99    |
| tool-detail-open          | dark  | 1280x800 |  0.6545 | 1.1644 |   0.3877 | 8b2f2da35a99    |
| settings-remote-access    | light | 1280x800 |  0.6733 |  0.961 |   0.3873 | a6d677a42e68    |
| thread-actions-open       | dark  | 1280x800 |  0.7664 | 1.1257 |   0.3871 | 8b2f2da35a99    |
| tasks-empty               | dark  | 1280x800 |  0.6182 | 0.7622 |    0.385 | 10668c97600f    |
| chat-question-bottom      | dark  | 1280x800 |  0.5832 |  0.778 |   0.3844 | 8b2f2da35a99    |
| panel-changes             | light | 1280x800 |  0.8464 | 1.2907 |   0.3837 | 98712cd2fb1b    |
| chat-long-middle          | dark  | 1280x800 |  0.6367 | 1.0408 |    0.382 | 8b2f2da35a99    |
| find-markdown-open        | light | 1280x800 |   0.777 |  1.051 |   0.3801 | 98712cd2fb1b    |
| chat-architecture-bottom  | light | 1280x800 |  0.7696 | 1.0444 |   0.3744 | 98712cd2fb1b    |
| tool-detail-open          | light | 1280x800 |  0.6804 | 1.2237 |    0.372 | 98712cd2fb1b    |
| model-picker-open         | light | 1280x800 |  0.7346 | 0.9977 |   0.3701 | 98712cd2fb1b    |
| project-copy-feedback     | light | 1280x800 |   0.559 | 0.8995 |   0.3697 | 98712cd2fb1b    |
| panel-changes             | dark  | 1280x800 |  0.7768 | 1.2071 |   0.3691 | 8b2f2da35a99    |
| chat-architecture-bottom  | dark  | 1280x800 |  0.7265 | 1.0003 |    0.368 | 8b2f2da35a99    |
| chat-markdown-bottom      | light | 1280x800 |  0.7627 | 1.0403 |    0.368 | 98712cd2fb1b    |
| thread-context-menu       | light | 1280x800 |  0.7842 | 1.0883 |   0.3677 | 98712cd2fb1b    |
| chat-long-middle          | light | 1280x800 |  0.6531 |  1.076 |   0.3673 | 98712cd2fb1b    |
| find-markdown-open        | dark  | 1280x800 |  0.7274 | 1.0036 |   0.3668 | 8b2f2da35a99    |
| chat-markdown-bottom      | dark  | 1280x800 |    0.72 | 0.9959 |   0.3619 | 8b2f2da35a99    |
| panel-files               | light | 1280x800 |  0.7766 | 1.2317 |   0.3592 | 98712cd2fb1b    |
| project-picker-open       | dark  | 1280x800 |  0.7305 |  0.986 |   0.3588 | 8b2f2da35a99    |
| thread-context-menu       | dark  | 1280x800 |  0.7354 | 1.0416 |   0.3578 | 8b2f2da35a99    |
| project-copy-feedback     | dark  | 1280x800 |  0.5291 | 0.9894 |   0.3535 | 8b2f2da35a99    |
| chat-long-top             | dark  | 1280x800 |   0.607 | 0.8792 |   0.3523 | 8b2f2da35a99    |
| chat-external-read-bottom | light | 1280x800 |  0.7474 | 1.0315 |   0.3522 | 98712cd2fb1b    |
| chat-external-read-bottom | dark  | 1280x800 |  0.7062 | 0.9881 |   0.3472 | 8b2f2da35a99    |
| settings-shortcuts        | light | 1280x800 |  0.8454 | 1.1912 |   0.3455 | a6d677a42e68    |
| chat-long-top             | light | 1280x800 |  0.6206 | 0.9106 |   0.3392 | 98712cd2fb1b    |
| panel-files               | dark  | 1280x800 |  0.7082 | 1.1423 |   0.3386 | 8b2f2da35a99    |
| model-picker-filtered     | light | 1280x800 |  0.5781 | 0.8589 |   0.3349 | 98712cd2fb1b    |
| settings-shortcuts        | dark  | 1280x800 |   0.772 | 1.1722 |   0.3305 | 5f2ca1327e70    |
| panel-terminal            | light | 1280x800 |  0.6623 |  0.846 |   0.3302 | 98712cd2fb1b    |
| model-picker-open         | dark  | 1280x800 |  0.6289 | 0.9421 |   0.3281 | 8b2f2da35a99    |
| panel-terminal            | dark  | 1280x800 |  0.6217 | 0.7958 |   0.3252 | 8b2f2da35a99    |
| project-edit-open         | dark  | 1280x800 |  0.4535 | 0.7059 |   0.3219 | 8b2f2da35a99    |
| settings-remote-access    | dark  | 1280x800 |  0.5531 | 0.9063 |   0.3216 | 5f2ca1327e70    |
| worktree-new-selected     | light | 1280x800 |   0.564 |   0.75 |   0.3162 | 98712cd2fb1b    |
| model-picker-filtered     | dark  | 1280x800 |  0.5219 | 0.8103 |   0.3145 | 8b2f2da35a99    |
| project-open-dialog       | light | 1280x800 |   0.429 | 0.6823 |   0.3139 | 98712cd2fb1b    |
| sidebar-focus-view        | light | 1280x800 |  0.5733 | 0.8544 |   0.3127 | 98712cd2fb1b    |
| settings-general          | light | 1280x800 |  0.7255 | 1.1803 |   0.3125 | a6d677a42e68    |
| sidebar-hidden            | light | 1280x800 |   0.485 | 0.5216 |   0.3061 | 98712cd2fb1b    |
| worktree-picker-open      | light | 1280x800 |  0.5409 | 0.7734 |    0.302 | 98712cd2fb1b    |
| composer-text             | light | 1280x800 |  0.5475 | 0.7541 |   0.3017 | 98712cd2fb1b    |
| sidebar-focus-view        | dark  | 1280x800 |  0.5351 | 0.8081 |   0.3006 | 8b2f2da35a99    |
| home-no-project           | light | 1280x800 |  0.3768 | 0.5854 |   0.2972 | 98712cd2fb1b    |
| worktree-new-selected     | dark  | 1280x800 |  0.5159 | 0.7035 |   0.2959 | 8b2f2da35a99    |
| project-actions-open      | light | 1280x800 |   0.541 | 0.8315 |   0.2946 | 98712cd2fb1b    |
| app-menu-open             | light | 1280x800 |  0.5272 | 0.7056 |   0.2928 | 98712cd2fb1b    |
| composer-focused          | light | 1280x800 |  0.5252 | 0.7199 |   0.2909 | 98712cd2fb1b    |
| panel-subagents           | light | 1280x800 |  0.6692 | 1.0578 |   0.2905 | a6d677a42e68    |
| subagents-list            | light | 1280x800 |  0.6692 | 1.0578 |   0.2905 | a6d677a42e68    |
| home-empty                | light | 1280x800 |  0.5253 | 0.7198 |   0.2902 | 98712cd2fb1b    |
| composer-text             | dark  | 1280x800 |   0.509 | 0.6997 |   0.2895 | 8b2f2da35a99    |
| find-long-open            | light | 1280x800 |  0.5656 | 0.8452 |   0.2893 | 98712cd2fb1b    |
| settings-appearance       | dark  | 1280x800 |  0.4852 | 0.7518 |   0.2892 | 5f2ca1327e70    |
| sidebar-hidden            | dark  | 1280x800 |   0.447 | 0.4971 |   0.2884 | 8b2f2da35a99    |
| worktree-picker-open      | dark  | 1280x800 |   0.498 | 0.7212 |   0.2883 | 8b2f2da35a99    |
| project-actions-open      | dark  | 1280x800 |  0.5268 | 0.8919 |   0.2878 | 8b2f2da35a99    |
| composer-focused          | dark  | 1280x800 |  0.4893 | 0.6764 |   0.2811 | 8b2f2da35a99    |
| find-long-open            | dark  | 1280x800 |  0.5272 | 0.8014 |   0.2797 | 8b2f2da35a99    |
| panel-subagents           | dark  | 1280x800 |   0.612 | 0.9928 |   0.2793 | 5f2ca1327e70    |
| subagents-list            | dark  | 1280x800 |   0.612 | 0.9928 |   0.2793 | 5f2ca1327e70    |
| chat-long-bottom          | light | 1280x800 |  0.5513 | 0.8345 |   0.2772 | 98712cd2fb1b    |
| tool-rows-expanded        | light | 1280x800 |  0.5685 | 0.8695 |   0.2768 | 98712cd2fb1b    |
| thoughts-expanded         | light | 1280x800 |  0.5685 | 0.8695 |   0.2768 | 98712cd2fb1b    |
| settings-general          | dark  | 1280x800 |  0.5943 | 1.0849 |   0.2766 | 5f2ca1327e70    |
| sidebar-project-collapsed | light | 1280x800 |  0.4746 | 0.6202 |   0.2765 | 98712cd2fb1b    |
| worktrees-empty           | dark  | 1280x800 |  0.5439 | 0.9091 |    0.276 | 8b2f2da35a99    |
| home-empty                | dark  | 1280x800 |  0.4842 | 0.6741 |   0.2751 | 8b2f2da35a99    |
| composer-slash            | light | 1280x800 |  0.5319 | 0.8607 |    0.275 | 98712cd2fb1b    |
| chat-long-bottom          | dark  | 1280x800 |  0.5198 | 0.7937 |   0.2748 | 8b2f2da35a99    |
| settings-appearance       | light | 1280x800 |  0.5001 | 0.7636 |   0.2723 | a6d677a42e68    |
| app-menu-open             | dark  | 1280x800 |  0.4771 |  0.665 |   0.2708 | 8b2f2da35a99    |
| tool-rows-expanded        | dark  | 1280x800 |  0.5135 | 0.8057 |   0.2683 | 8b2f2da35a99    |
| thoughts-expanded         | dark  | 1280x800 |  0.5135 | 0.8057 |   0.2683 | 8b2f2da35a99    |
| sidebar-project-collapsed | dark  | 1280x800 |  0.4386 | 0.5773 |   0.2629 | 8b2f2da35a99    |
| chat-subagent-bottom      | light | 1280x800 |  0.4546 | 0.6125 |   0.2609 | 98712cd2fb1b    |
| chat-subagent-bottom      | dark  | 1280x800 |   0.427 | 0.5729 |   0.2589 | 8b2f2da35a99    |
| composer-slash            | dark  | 1280x800 |  0.4492 | 0.7378 |   0.2512 | 8b2f2da35a99    |
| chat-checklist-bottom     | light | 1280x800 |  0.4281 | 0.5814 |   0.2481 | 98712cd2fb1b    |
| settings-projects         | light | 1280x800 |   0.402 |  0.732 |   0.2481 | a6d677a42e68    |
| chat-checklist-bottom     | dark  | 1280x800 |  0.4029 | 0.5434 |   0.2479 | 8b2f2da35a99    |
| tools-expanded            | light | 1280x800 |  0.4759 | 0.7086 |   0.2449 | 98712cd2fb1b    |
| tools-expanded            | dark  | 1280x800 |  0.4435 | 0.6618 |    0.243 | 8b2f2da35a99    |
| settings-projects         | dark  | 1280x800 |  0.3902 | 0.7398 |   0.2429 | 5f2ca1327e70    |
| chat-tools-bottom         | light | 1280x800 |  0.4555 | 0.6666 |   0.2389 | 98712cd2fb1b    |
| chat-tools-bottom         | dark  | 1280x800 |  0.4261 | 0.6231 |   0.2378 | 8b2f2da35a99    |
| connection-offline        | light | 1280x800 |  0.3007 |  0.346 |   0.2362 | bfc41d008e1a    |
| composer-mention          | light | 1280x800 |  0.4803 | 0.7977 |   0.2335 | 98712cd2fb1b    |
| connection-offline        | dark  | 1280x800 |   0.287 | 0.3414 |   0.2177 | 98712cd2fb1b    |
| project-open-dialog       | dark  | 1280x800 |    0.32 | 0.4635 |   0.2175 | 8b2f2da35a99    |
| thread-search-open        | light | 1280x800 |  0.4306 |  0.723 |   0.2175 | 98712cd2fb1b    |
| composer-mention          | dark  | 1280x800 |  0.4057 | 0.6794 |   0.2138 | 8b2f2da35a99    |
| home-no-project           | dark  | 1280x800 |  0.2723 | 0.3681 |   0.2024 | 8b2f2da35a99    |
| thread-search-open        | dark  | 1280x800 |  0.2848 | 0.5497 |   0.1423 | 8b2f2da35a99    |
| settings-usage            | dark  | 1280x800 |  0.1886 | 0.3622 |   0.1283 | 5f2ca1327e70    |
| usage-limits-open         | dark  | 1280x800 |  0.1886 | 0.3622 |   0.1283 | 5f2ca1327e70    |
| settings-usage            | light | 1280x800 |  0.1858 | 0.3677 |   0.1163 | a6d677a42e68    |
| usage-limits-open         | light | 1280x800 |  0.1858 | 0.3677 |   0.1163 | a6d677a42e68    |
| apps-empty                | light | 1280x800 |   0.204 | 0.4062 |   0.0739 | 487b8acf0abc    |
| apps-empty                | dark  | 1280x800 |  0.1744 | 0.3691 |   0.0644 | afbec0e0e8ce    |
| chat-streaming            | dark  | 1280x800 |       — |      — |        — | unscored        |
| panel-canvas              | dark  | 1280x800 |       — |      — |        — | unscored        |
| chat-streaming            | light | 1280x800 |       — |      — |        — | unscored        |
| panel-canvas              | light | 1280x800 |       — |      — |        — | unscored        |

## Reproduce

```sh
bun apps/rune/tools/sweep/run.ts
# Optional: --states home-empty,chat-markdown-top --themes dark,light --sizes 1280x800
```

Requires Bun, Node, the pinned Electron dependency, Rust/macOS toolchain and Python Pillow. Builds the shared renderer, real desktop main/preload, and Rune incrementally; isolated CLI pinned to 2.3.2. Each Electron instance is closed after capture. Only processes whose actual environment contains `HOME=/tmp/ocr-sweep-final2/home` are terminated during fallback cleanup. The temporary environment is removed in finally; `--keep-env` is for diagnosis only. PNGs, logs, DOM observations, fixture manifest and full per-theme metrics stay local/ignored. Reference PNGs are `.electron.png`, never historical `.web.png` files. `--report-only` regenerates this report from local results and checked-in review descriptions.
