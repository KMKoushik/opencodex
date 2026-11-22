# Web UI goldens

Run from `/Users/koushik/git/personal/opencodex-rune` on branch `rune-port`.
Requires Bun, Node, installed worktree dependencies, built `apps/web/dist`, and Google
Chrome. Scripts import the worktree's installed `playwright-core` and launch the Chrome
channel. No browser extension or real user profile is used.

## Isolated services

```sh
T=/tmp/ocr-goldens
mkdir -p "$T/home" "$T/pkg" "$T/proj"
cat > "$T/env.sh" <<'EOF'
export HOME=/tmp/ocr-goldens/home
export XDG_CONFIG_HOME=$HOME/.config XDG_DATA_HOME=$HOME/.local/share
export XDG_STATE_HOME=$HOME/.local/state XDG_CACHE_HOME=$HOME/.cache
export PATH=/tmp/ocr-goldens/pkg/node_modules/.bin:$PATH
[ "$HOME" = /tmp/ocr-goldens/home ] || exit 1
EOF
npm install --prefix "$T/pkg" @opencode/cli@2.3.2
```

In one terminal, source that environment then `opencode service set port 4902` and
`opencode serve --service`. In another terminal:

```sh
source /tmp/ocr-goldens/env.sh
cd packages/gateway
PORT=4432 node --import tsx src/cli.ts --production
```

Never use the real service on 49374. All API URLs are fixed to the isolated gateway 4432. Both services must inherit the isolated environment. The fixture resolves `/tmp`
to `/private/tmp` on macOS before creating sessions: native project canonical paths
must match session locations or the UI will regard the chat as a removed worktree.

## Seed and capture

From the worktree root, in a third terminal:

```sh
source /tmp/ocr-goldens/env.sh
bun apps/rune/goldens/seed.ts
bun apps/rune/goldens/capture.ts
```

Seed on a fresh fixture directory; it is not an upsert. Two committed git projects,
eight main sessions, real free-model responses, source edits, a question, a subagent
request, 40 follow-up turns and an attempted external-directory permission request are
created. Model: `opencode/big-pickle`. The service must have network access. Pending
questions/permissions are intentionally left unanswered. Allow several minutes.

Capture creates fresh contexts for default dark and light at 1280×800 and 1600×1000,
deviceScaleFactor 2. It overwrites the PNG corpus and `computed.json`. Each file is
`<screen>-<state>-<theme>-<width>x<height>.png`. `computed.json` keys list successful
captures; `failures` includes locators/states that could not be reached. Capture also
starts and interrupts a real streamed response, so re-running changes that fixture chat.
The disconnected state is browser-local request blocking, not a server shutdown.

`SPEC.md` documents dimensions, tokens, interactions, fonts and source locations.
The JSON also preserves source CSS and per-component icon names. `capture.ts --extras`
refreshes only supplemental interaction states and streaming while retaining the main
corpus; a plain capture run includes these states automatically.
`computed.json` is a measured oracle, not an API fixture: element rects are viewport CSS
pixels and PNGs are 2×. Compare font rasterization only on matching macOS/Chrome builds.
These are web screenshots; Electron's native traffic-light/titlebar adjustments require
an additional host-specific reference.

## Coverage notes

Supported categories include home, sidebar/project states, composer focus/draft/
attachment, model and slash/mention menus, project/worktree chooser, search/app menu,
all six settings pages, Tasks/Apps empty pages, seeded transcripts, tools/thoughts,
question, workspace changes/files/terminal/canvas/side-chat/subagent states, context
menus, find, streaming and browser-offline state. Consult `computed.json` rather than
assuming that an attempted state succeeded. There is no separate agent picker or
Cmd+K command palette in the current UI. Empty Apps/canvas views do not stand in for
installed app execution or populated canvases. Permission requests depend on native
policy; external-directory access is attempted without overriding that policy.
In the recorded run the external read was allowed, so no pending-permission card was
captured. Copy-path feedback is an inline status, not a floating toast. Populated Apps,
populated canvases, host-native browser panes, and Electron traffic lights are not part
of this fixture. No standalone toast was triggered.

## Recorded inventory

**69 distinct states × 2 themes × 2 sizes = 276 PNGs.** Basenames below omit the
`-dark/light-1280x800/1600x1000` suffix. All four variants exist for each state.

- Shell: `home-empty`, `home-no-project`, `sidebar-hidden`, `sidebar-project-collapsed`,
  `sidebar-row-hover`, `sidebar-focus-view`, `app-menu-open`, `thread-search-open`.
- Composer: `composer-focused`, `composer-text`, `composer-attachment`, `composer-slash`,
  `composer-mention`, `model-picker-open`, `model-picker-filtered`.
- Projects: `project-picker-open`, `project-open-dialog`, `project-actions-open`,
  `project-edit-open`, `project-copy-feedback`, `worktree-picker-open`,
  `worktree-new-selected`, `worktrees-empty`.
- Transcripts: `chat-markdown-top/middle/bottom`, `chat-long-top/middle/bottom`,
  `chat-tools-bottom`, `chat-question-bottom`, `chat-architecture-bottom`,
  `chat-subagent-bottom`, `chat-checklist-bottom`, `chat-external-read-bottom`,
  `chat-streaming`.
- Activity: `tools-expanded`, `tool-rows-expanded`, `tool-detail-open`,
  `thoughts-expanded`, `question-selected`, `question-review`.
- Thread controls: `thread-actions-open`, `thread-context-menu`, `session-details-open`,
  `find-markdown-open`, `find-long-open`.
- Workspace: `panel-changes`, `panel-diff-open`, `panel-files`, `panel-file-open`,
  `panel-terminal`, `panel-canvas`, `panel-side-chat`, `side-chat-new`,
  `panel-subagents`, `subagents-list`, `subagent-conversation`.
- Settings: `settings-general`, `settings-general-bottom`, `settings-appearance`,
  `settings-shortcuts`, `settings-projects`, `settings-usage`, `settings-remote-access`,
  `usage-limits-open`.
- Other pages: `tasks-empty`, `apps-empty`, `connection-offline`.

## Cleanup procedure

Record service PIDs when launching. For each PID inspect `ps e -p PID -o command=`;
terminate it only if its **environment** includes `HOME=/tmp/ocr-goldens/home`.
Do not kill by executable name or port, and do not stop the user's real service.
After terminating isolated service/gateway/PTY processes, remove `/tmp/ocr-goldens`.
Keep `web/*.png` for local review; `web/` and future native `rune/` captures are ignored
by git. Commit only scripts, this README, SPEC, computed JSON and `.gitignore`.
