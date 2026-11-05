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

## Owner feedback (checklist; newest last)

- [x] App crashed on launch (Release-only task-group crash) — fixed, build 131.
- [x] Subagent icon should be a robot — the desktop's Hugeicons BotIcon.
- [x] Composer too clumsy — OpenCode-style one-line Liquid Glass capsule; model row on focus.
- [x] Model switcher broken after the redesign — the picker opens from "Model · Thinking";
      thinking level in the picker's bottom bar; covered by `ModelSwitchTests`.
- [x] Use native UI, e.g. the iOS spinner — `RingSpinner` is now `ProgressView`; the title
      shows the spinner while running.
- [x] "…" opens a native drawer like OpenCode's — the thread sheet, build 142.
- [x] Session details looks like the thread sheet: native inset-grouped list, same header
      and rows.
- [x] Test every interaction (QA wave) and prefer native components everywhere: composer,
      home/settings/pairing, transcript/activity and panels QA merged with tap tests.

- [x] Video preview should be the native player with full screen — `AVPlayerViewController`
      (full screen, scrubbing, ±10 s, speed, AirPlay, Picture in Picture), build 155.

- [x] Model picker like OpenCode's: Cancel / Model / thinking level in the bar, search, one
      flat list (logo, model, provider), most used first.

- [x] Loading screens everywhere — instant like the desktop: an on-disk cache of the thread
      list and each thread's newest page (40 threads / ~30 MB), the last 8 chats kept in memory
      for 5 minutes, progressive loads, prefetch of the top 6 threads, 400 ms spinner delay.
      Modelled on T3 Code's mobile cache.

- [~] Camera / Photo Library sometimes open nothing on device (never reproduced in the
  simulator). Build 160 presents both from UIKit's topmost controller after any running
  transition instead of SwiftUI modifiers; awaiting owner confirmation.

- [x] OpenCode-style header: no divider, soft scroll-edge blur, glass title capsule that hugs
      the title, white "…" with a running ring.
- [x] Shell pill morphs into a Liquid Glass panel when opened (`GlassEffectContainer`).
- [x] Usage loading screen: full-width background, centered native spinner after 400 ms.

- [x] Push notifications live (desktop 0.1.54, APNs key in `~/.opencodex/apns/`): Slack-style —
      sent only after 30 s if the thread wasn't opened, the request wasn't answered, and the Mac
      had no input; title = thread, subtitle = project, body = reply preview / question /
      "Needs approval: …". Tapping opens the thread (build 167 fixed a tap crash).

## In progress

- [ ] Notifications: in-app notifications, APNs push from the owner's gateway, and a Live
      Activity while a reply runs (`ios/w3-notify`). Needs the owner's APNs `.p8` key.

## Done in wave 3

- Terminal: SwiftTerm 1.20 on `/api/terminals/:id/connect` with the desktop's replay
  cursor, reconnect rules, wording, ANSI colours and key bar; in the chat's "…" menu. Builds need
  `-skipPackagePluginValidation` (SwiftTerm's build plugin) and the Metal Toolchain
  (`xcodebuild -downloadComponent MetalToolchain`).
- Side chats (chat "…" menu), Tasks board and Apps/canvases (home, under New thread).
- Polish: retry and switch notes, the failed-run footer, full question-form logic, mention
  pills in sent messages, one shared code highlighter, and the annotations chip.
- OpenCode-style chrome, from the owner's feedback:
  - a Liquid Glass composer that's one line ("+ Message ↑") until focused, then shows a
    quiet "Model · Thinking" row; Full access is in "+";
  - a title pill (tap for Session details) and one "…" menu with a running ring;
  - a compact activity pill ("1 shell", "Background");
  - the desktop's robot icon for subagents.

## Backlog

- Push needs the APNs key: Certificates, Identifiers & Profiles → Keys → + → Apple Push
  Notifications service. Then fill `~/.opencodex/push.json`.
- Mention pills inside the composer input (currently plain text).
- `/side` from the composer, and "Ask in side chat" quoting.
- Apps: Settings tab, model and icon pickers, comment overlay, inline canvas cards in chats.
- Composer mic button (OpenCode has one; the keyboard's dictation works meanwhile).
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
