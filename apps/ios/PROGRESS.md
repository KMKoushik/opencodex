# iPhone app progress

Goal: a native iPhone client that matches the desktop app 1:1, for the owner's own phone. The
work lives on the `ios/main` branch (worktree `../opencodex-ios`), never on `main`. Update this
file with every merge.

## How it ships

1. Merge an agent's branch into `ios/main`, then build and run the unit and UI tests in the
   simulator.
2. Run the UI tests against a **Release** build too (`-configuration Release
ENABLE_TESTABILITY=YES`). Release-only crashes have happened (see Known issues).
3. Push `ios/main` to GitHub.
4. Install on the iPhone with the build number = commit count:
   `xcodebuild … -configuration Release -destination 'id=<iPhone UDID>' -allowProvisioningUpdates CURRENT_PROJECT_VERSION=$(git rev-list --count HEAD) build`,
   then `xcrun devicectl device install app …`. Settings → About shows the build.

## Done (on `ios/main`)

- **Pairing:** QR scan and code entry; bearer device token in the Keychain. The gateway side
  shipped in desktop v0.1.48.
- **Theme and brand:** all 23 desktop themes from exported tokens, the calico app icon,
  brand art and wordmark, and Settings → Appearance with theme pickers and chat font size.
- **Home:**
  - the brand header, Pinned, and Projects/Focus views with project avatars;
  - desktop status icons (ring spinner, unread dot, `!` and `?`);
  - thread actions (pin, done, unread, mute, rename, fork, export), search, and Usage limits.
- **Chat:**
  - breadcrumb title, the thread menu, Session details (context, cost, branch, changes,
    MCP, skills) and the new-thread hero with starters and Local/worktree;
  - the desktop transcript: markdown, syntax highlighting, turn headers, activity groups,
    paced streaming, images and undo;
  - the composer: provider logos, model picker, context ring, Permissions, slash commands,
    @ mentions, attachments, steering and request cards.
- **Running work:** the Subagents/Shell activity tray, Move to background, shell output with
  Stop, the subagent reader and list, and the running-subagents badge.
- **Workspace:** Changes (working and branch) with diffs, and Files with code, Markdown,
  image and PDF previews.
- **Tests:** 22 unit tests and 13 UI tests, including two end-to-end flows (new chat → send →
  approve edit → file exists, and new chat in a worktree).

## In progress (wave 3, separate worktrees)

- [ ] **Terminal:** SwiftTerm on `/api/terminals/:id/connect`, with the desktop's reconnect
      rules and key bar (`ios/w3-terminal`).
- [ ] **Side chats, Tasks board, Apps/canvases** (`ios/w3-extras`).
- [ ] **Polish:** retry and switch notes, the failed-run footer, full question-form logic,
      mention pills, one shared code highlighter and the annotations chip (`ios/w3-polish`).
- [ ] **Notifications:** in-app notifications, APNs push from the owner's gateway, and a Live
      Activity while a reply runs (`ios/w3-notify`). Needs the owner's APNs `.p8` key.

## Backlog

- Push needs the APNs key: Certificates, Identifiers & Profiles → Keys → + → Apple Push
  Notifications service. Then fill `~/.opencodex/push.json`.
- Mention pills inside the composer input (currently plain text).
- `/side` from the composer, once side chats land.
- The desktop's own gaps found while porting:
  - agent edits don't send `filesystem.changed`; the phone refreshes on
    `session.step.ended` instead;
  - shell output says "Earlier output is omitted" when nothing was dropped.

## Known issues and lessons

- **Release-only crash (fixed in the Concurrently commit):** `withTaskGroup` called from
  main-actor code crashed optimized builds in the concurrency runtime (`TaskGroup::offer` /
  `completeFuture`), so the app crashed on launch on the phone. Debug builds and the
  simulator's Debug runs were fine. Use `Concurrently.map` / `tryMap` (`Core/Concurrently.swift`)
  for fan-out, never a task group on the main actor. Always run the Release UI tests.
- **Free models:** the free OpenCode models on the test server are rate limited. Tests use the
  scripted fake model (`fake/scripted`, an OpenAI-compatible server in the test folder).
