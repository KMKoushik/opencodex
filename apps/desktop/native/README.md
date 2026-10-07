# macOS computer control helper

`ComputerControl.swift` is a standalone macOS 14+ AppKit/AX/ScreenCaptureKit executable. No third-party automation framework is linked. Electron owns one child, one active request, and a bounded queue; the child owns all accessibility work and ephemeral element references. The main native run loop remains available to framework callbacks while a serial background worker handles requests.

## Build and identity

```sh
node scripts/computer-use.mjs
node scripts/computer-use.mjs --check
```

Both commands run a **live-pipe** status/list protocol smoke without requesting permissions or capturing/controlling apps. Builds are cached by source, compiler, architecture, and signing identity. Default output is universal arm64/x86_64; `--host-only` is available for local development and must also be passed to `--check` for that build. Non-macOS hosts skip native building.

- Development: `apps/desktop/native/out/OpenCodex Computer Control.app/Contents/MacOS/computer-control`
- Packaged: `<resources>/native/OpenCodex Computer Control.app/Contents/MacOS/computer-control`
- Bundle/signing identifier: **`dev.opencodex.computer-control`**
- Working directory: the executable's own `Contents/MacOS` directory, independent of sessions/projects.

The development path resolves relative to the main module, not Electron's `app.getAppPath()`. Both `src/main/computer-control.ts` and the bundled `out/main/index.js` resolve `../../native/out/` to the same desktop-native build directory.

Set `OPENCODEX_COMPUTER_SIGN_IDENTITY` (or `CSC_NAME`) to a persistent Keychain code-signing certificate. The repository's existing `scripts/create-signing-identity.sh` and `scripts/import-signing-identity.sh` can provision its persistent self-signed release identity. The helper is then signed with that identity and the stable bundle identifier. Keep the certificate across upgrades; changing it can lose macOS permission continuity. The outer desktop application's signing pass must also sign this nested app with the release identity. Developer ID notarized releases should use the same Developer ID as the host.

Without a configured certificate, local builds are **explicitly ad-hoc signed**; these compile and run but permissions may need to be granted again after a rebuild. A bundle identifier alone is not a substitute for a stable cryptographic identity. The build does not create/import certificates, change TCC, or use an identifier-only designated requirement. No signing identities were installed on the implementation machine.

### Packaged-resource verification

To package an existing desktop `out/` build without rebuilding or signing, run this from `apps/desktop`, setting `output` to a disposable absolute directory:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false bun x electron-builder \
  --config electron-builder.yml --dir --mac --arm64 \
  -c.mac.identity=null -c.directories.output="$output"
```

The global `extraResources` browser-extension entry and macOS-specific native-helper entry are additive. An actual unsigned arm64 package was checked: `Contents/Resources/browser-extension/` contained all five source-identical extension files, and `Contents/Resources/native/OpenCodex Computer Control.app/` contained the executable universal helper with its original valid ad-hoc signature and stable bundle identifier. The packaged helper passed live-pipe status/list requests from its packaged working directory. The installed `@electron/osx-sign` traversal also includes both the nested helper executable and its `.app` bundle, so the normal release signing pass reaches them. Certificate signing and notarization were not exercised without an installed identity.

## Electron API

`createComputerControl()` from `apps/desktop/src/main/computer-control.ts` returns:

```ts
{
  handle: DesktopToolHandler;
  requestPermissions(kind: 'accessibility' | 'screenRecording'): Promise<void>;
  close(): Promise<void>;
}
```

Call `close` when the desktop tool host shuts down. The two permission-setup methods are for trusted Settings IPC only, never model tools. `requestPermissions` sends a private `computer.request_permissions` request through the same native worker used for actions. Accessibility uses `AXIsProcessTrustedWithOptions` with prompting enabled; Screen Recording uses `CGRequestScreenCaptureAccess`. The method means a request was made, not that macOS granted it or necessarily displayed another dialog. Previously denied requests may still require a manual System Settings change.

`requestPermissions` stops an idle worker before the request, launches a fresh helper in the same host context, and stops that worker after the request returns. Subsequent normal status/action calls therefore start with fresh TCC caches. Worker rotation discards retained AX snapshots, so subsequent element actions need fresh state. Setup refuses while input/status requests are active, queued, or stopping, and reserves the worker during setup; it never silently cancels input. Regular status calls and background Settings reads continue using `handle(computer.status)` and never restart the worker. If permissions are changed manually after a denied request and still appear denied, the user can choose **Request access** again to refresh the idle helper, or relaunch the responsible app. The private request method is rejected by public `handle` even if its caller claims the Settings session ID, and is absent from the broker/plugin allowlists. Ordinary requests time out after 35 seconds; a user-initiated native permission request has a bounded two-minute timeout.

`handle({ sessionID, method, input }, signal)` returns `DesktopToolResult`. The first text block is JSON; screenshots are separate PNG `file` blocks with a data URI (never included in the text metadata or written to disk). `computer.status` always reports top-level `supported`, `accessibility`, and `screenRecording`; unavailable platforms/installations also return a `message`. Status/list do not activate apps or prompt for permission.

## Native protocol and methods

Input is JSON lines `{id, sessionID, method, input}`. Output is `{id, result}` or `{id, error:{code,message}}`; stdout has no other output. Requests are limited to 128 KiB, responses to 16 MiB, and the host allows at most 32 pending requests with a 35-second execution timeout. PNG capture is capped at 8 MiB before base64 encoding. Framework diagnostics on stderr are drained without logging.

| Method               | Input                                             | Behavior                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `computer.status`    | `{}`                                              | Permission preflight only; never requests access.                                                                                                                                                                  |
| `computer.list`      | `{}`                                              | Up to 256 running graphical apps with bundle IDs, names, PIDs, and active state.                                                                                                                                   |
| `computer.state`     | `{app, screenshot?:boolean}`                      | Indexed AX tree; optional frontmost normal on-screen window screenshot from ScreenCaptureKit.                                                                                                                      |
| `computer.click`     | `{app, elementID, snapshotID}` **or** `{app,x,y}` | AXPress when available; otherwise foreground-verified left click. A failed AXPress is not retried as a click.                                                                                                      |
| `computer.type`      | `{app,text}`                                      | Writable AXSelectedText when available; otherwise Unicode keyboard events. Up to 20,000 UTF-8 bytes. Does not use the clipboard.                                                                                   |
| `computer.press`     | `{app,key}`                                       | Named key or shortcut, e.g. `cmd+shift+s`, `enter`, `backspace`, `delete` (forward delete), `arrowdown`, `f1`. Letter/punctuation shortcuts use ANSI physical key positions; `type` is layout-independent Unicode. |
| `computer.scroll`    | `{app,deltaX,deltaY,x?,y?}`                       | Pixel deltas; positive X/Y scroll right/down. Defaults to the focused window's center; specify both coordinates otherwise.                                                                                         |
| `computer.set_value` | `{app,elementID,snapshotID,value}`                | Writes AXValue only when writable. String, number, or boolean.                                                                                                                                                     |
| `computer.drag`      | `{app,fromX,fromY,toX,toY}`                       | Foreground-verified left-button drag; both endpoints must hit the target app.                                                                                                                                      |

`app` is an **exact bundle identifier** identifying exactly one running instance. The helper does not launch target apps. Coordinates are global macOS screen points with top-left primary-display origin, including negative coordinates for other displays. Screenshot metadata includes the captured window's `bounds` in those points and `width`/`height` in pixels; map image coordinates proportionally into those bounds. Screenshots are bounded to 2048 pixels per side, exclude cursor/shadows, and never fall back to capturing the whole screen or another app.

Snapshots contain at most 512 nodes, depth 20, 64 children per node, and a five-second traversal budget (individual AX calls have short timeouts). Text attributes are bounded, secure text values are omitted, and truncated trees are marked. A snapshot ID is bound to session, bundle ID, PID, launch date, and retained AX objects; it expires after 90 seconds. At most 16 snapshots are retained. A new state invalidates that session/app's previous snapshot; an attempted mutation invalidates **every session's** snapshots for that app. Elements are revalidated against their PID and role before use. External app changes can still invalidate an AX reference; request fresh state after a failure or UI change.

## Cancellation and permissions

Cancelling a queued request removes it. Cancelling/timing out an active request terminates the helper and discards all snapshots; requests are never replayed. TERM cooperatively stops between events and releases an in-progress drag, then the host force-kills after one second if a framework call is stuck. Already-delivered input cannot be undone. Other queued requests start only after the old helper exits, on a fresh worker.

AX actions need Accessibility access. Screenshots separately need Screen Recording access; if missing, `state` returns its tree and `screenshotError`. Status checks use `AXIsProcessTrusted()` and `CGPreflightScreenCaptureAccess()` and do not request permission. Use the explicit **Request access** button in OpenCodex Settings so macOS identifies the responsible application for the actual launch. Enable that named app in System Settings, then check status. Choose **Request access** again if a later manual grant needs an idle-helper refresh. Relaunch the responsible application if macOS requires it.

TCC grants belong to the responsible application/launch context, not universally to a helper bundle ID. A normal LaunchServices-launched package was observed to attribute requests to its own OpenCodex executable. A terminal-launched development instance was observed to attribute both permissions to **Ghostty** (`/Applications/Ghostty.app`, `com.mitchellh.ghostty`). Verification processes launched by the OpenCode coding app were instead attributed to `/Applications/OpenCode.app`. Grants established in those tests therefore did **not** grant the Ghostty-launched development app. Always check status from the actual running host; granting only the helper is not a reliable setup procedure. Build/check smoke commands, all agent methods, and regular status reads remain non-prompting. The explicit request branch is not invoked by automated verification.

CoreGraphics fallback foregrounds the requested app. It checks foreground PID before events and AX hit-test ownership for mouse coordinates, stopping if focus changes. A desktop focus race between verification and event delivery remains inherently possible with global macOS input. AX actions avoid this foreground fallback. Some apps expose incomplete/non-writable AX trees, and protected windows can refuse capture.

## Native verification record

Verified on macOS arm64 on 2026-10-07 against a disposable AppKit fixture after the user manually granted permissions. Fresh direct-helper and real Electron adapter processes both reported Accessibility and Screen Recording granted.

- Live-pipe status/list and a 95-node indexed accessibility snapshot passed. ScreenCaptureKit produced a visually inspected 1280 × 944 PNG of only the fixture window.
- Element click used AXPress; `set_value` used AXValue; Unicode typing used AXSelectedText. A separate non-text-editing fixture control verified the CoreGraphics Unicode fallback, including a surrogate-pair emoji and combining mark. Coordinate click, Command-A, Tab, pixel scrolling, and a complete 20-event mouse drag produced the expected observable fixture state.
- Cross-session, superseded, and post-mutation snapshot references were rejected without delivering extra input.
- The real Electron broker and `createComputerControl` returned screenshot metadata as JSON text and PNG bytes as a separate `file` data URI. The resulting PNG was inspected.
- Real cancellation removed a queued click without delivering it, interrupted an active drag after four move events, and delivered mouse-up. The replacement worker rejected the old snapshot and successfully handled a fresh click without replaying the cancelled input.

The fixture required waiting for AppKit to publish its new window in AXChildren and installing a normal Edit → Select All menu item. These were fixture setup fixes; the production helper was not rebuilt or re-signed during verification. One coordinate attempt was refused by the target-ownership guard; the fresh full run passed. Tests never sent input to personal applications.

Universal compilation and resource packaging passed, but runtime verification was on arm64. Certificate-signed release permission continuity/notarization, snapshot TTL expiry, and maximum-size traversal were not separately exercised. The earlier isolated LaunchServices package test verified that its own packaged executable became the responsible process; it was unsigned and lacked permission grants, so that run did not verify packaged input/capture. Future end-to-end smokes must continue to use disposable fixture apps.
