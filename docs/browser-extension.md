# Chrome and Edge browser tools

The unpacked extension lets OpenCodex use an existing Chrome or Edge profile, including its existing tabs and signed-in websites. Only one extension instance can be connected to each running desktop host.

## Install and pair

1. In Chrome, open `chrome://extensions`; in Edge, open `edge://extensions`.
2. Enable **Developer mode**, choose **Load unpacked**, and select `apps/browser-extension` in this checkout. No extension build step is needed. Chrome/Chromium 120 or newer is required.
3. In the OpenCodex desktop app, copy its extension pairing URL. It has the shape `ws://127.0.0.1:<port>/browser-extension#<token>`.
4. Open the extension popup, paste that URL, and click **Connect**. Use the intended browser profile. A second Chrome/Edge instance is rejected while the first is connected.
5. Select the Chrome backend for browser tools (`backend: "chrome"`). Run `browser.list`, then explicitly `browser.claim` the desired `tabID`; alternatively, `browser.open` creates and claims a new background tab.

The popup stores the pairing URL in extension-local storage. Connection is explicit: after a browser restart, desktop restart, worker termination, or disconnection, open the popup and click **Connect** again. A desktop restart generates a new URL/token. **Disconnect** releases all tab claims and debugger attachments; it leaves tabs and profile data intact. Chrome's debugger banner and opening DevTools can interrupt control; claim the tab again after the competing debugger is closed.

## Host integration

`apps/desktop/src/main/extension-control.ts` exports:

```ts
const extension = createExtensionControl({
  onStateChange(state) {
    // { connected, extensionID?, connectedAt? }; forward to trusted native UI.
  },
});

// The caller starts and owns a loopback-only node:http.Server first.
extension.attach(host.server, { url: host.endpoint.url });
const pairing = extension.getPairingInfo(); // { url, token } | undefined
const pairingURL = pairing && `${pairing.url}#${pairing.token}`;

// Route only browser.* calls whose input.backend === 'chrome'.
await extension.handle(call, abortSignal);
extension.getState();
extension.disconnect(); // Keep host listening; reconnect explicitly from popup.
extension.close(); // Remove upgrade handler, disconnect, close WebSocket server.
```

`attach` generates an independent, random 256-bit extension token. An optional `token` property exists for controlled integration tests; never pass the plugin HTTP token. The pairing URL belongs only in the trusted native UI, not model/tool context. The parent HTTP broker retains its own authentication and owns its server lifecycle. The extension channel accepts only `/browser-extension` upgrades with the exact listening Host, a loopback peer, a `chrome-extension://<32-character-id>` Origin, the version subprotocol, and the separate pairing token subprotocol. Browser tabs cannot authenticate via cookies or query parameters.

The desktop package must directly depend on `ws` and have `@types/ws` for type checking. No remotely exposed debugging port is used. The extension invokes the browser's `chrome.debugger` and `chrome.scripting` APIs for a specifically claimed tab.

The canonical origin of a blank tab is `about:blank` (not the URL API's `null`). Chrome disallows `chrome.scripting` on blank pages, so those pages use the same fixed snapshot/target functions in a CDP-created isolated world. HTTP(S) pages retain the extension-isolated scripting path.

## Supported calls

All tab operations require explicit `tabID` (the string returned by list/open). Claims are exclusive to the authenticated OpenCode session supplied by the host, not a model-controlled session identifier. List, claim, open, snapshot, and screenshot results include the current `origin` for subsequent actions. The plugin supplies its approved origin as `input.expectedOrigin`; every targeted read and action (including claim/release) rejects a changed current or pending origin. Dispatch checks repeat before CDP and injected DOM commands, and completed read results are checked again. A direct caller's `input.origin` is a fallback only when `expectedOrigin` is absent. Navigation destination approval remains the plugin's responsibility; an omitted expected origin does not restrict the destination of open/navigation.

| Method               | Input and behavior                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser.list`       | Optional `offset`; up to 100 HTTP(S)/blank tabs, ownership flags, and `nextOffset`. Does not claim or select tabs.                                                                                 |
| `browser.claim`      | `tabID`; attach debugger and claim an existing web tab.                                                                                                                                            |
| `browser.release`    | `tabID`; release this session's claim without closing the tab.                                                                                                                                     |
| `browser.open`       | Optional `url` (defaults to `about:blank`); create and claim a background tab.                                                                                                                     |
| `browser.snapshot`   | `tabID`; bounded semantic DOM entries, labels, values, `elementID`s and `snapshotID`. Password values omitted.                                                                                     |
| `browser.screenshot` | `tabID`; PNG file content as a data URI, captured via CDP for this tab, independent of the active window. Viewport capture, bounded to 2048 output pixels on its longest side.                     |
| `browser.navigate`   | `tabID`, HTTP(S) `url`; start navigation, return without waiting for all resources.                                                                                                                |
| `browser.click`      | `tabID` plus `selector`, or `elementID` + `snapshotID`, or viewport CSS-pixel `x` + `y`.                                                                                                           |
| `browser.type`       | Same target plus `text`, or omit the target to type into this tab's current focus; optionally `clear: true` for selector/ref targets. Uses native input events; point targets click before typing. |
| `browser.press`      | `tabID`, `key`, e.g. `Enter`, `Control+a`, `Meta+a`, `Shift+Tab`, or an arrow. Acts on the focused element within the explicitly selected tab.                                                     |
| `browser.scroll`     | `tabID`, `deltaX`/`deltaY` in CSS pixels, and an optional selector/ref/point target; defaults to the selected tab's viewport center.                                                               |
| `browser.close`      | `tabID`; close a tab owned by this session.                                                                                                                                                        |
| `browser.console`    | `tabID`, optional `after` sequence cursor; up to 200 retained messages.                                                                                                                            |
| `browser.network`    | `tabID`, optional `after`; up to 200 retained request/response/failure metadata records, without bodies or headers.                                                                                |

Snapshot refs are invalidated by navigation, another snapshot, and completed interaction commands. A detached or stale target fails rather than falling back to a different element. Snapshots cover the top document, up to 250 semantic elements / 12,000 scanned nodes; iframe and shadow-root traversal is not implemented. Page content and console/network strings are untrusted website data.

Requests are serialized in the extension, bounded to 32 pending calls, and time out after 30 seconds at the host. Cancellation stops queued work and subsequent browser commands; a browser action already dispatched cannot be undone. There are no automatic retries of clicks, typing, opening, navigation, or other side effects. After an ambiguous timeout, inspect the tab before repeating the action. Connection loss aborts outstanding calls and releases debugger claims. At most 64 tabs may be claimed simultaneously.

## Development smoke check

Use a disposable Chromium profile with `--disable-extensions-except=<absolute-extension-path>` and `--load-extension=<absolute-extension-path>`, not a personal profile. Verify popup pairing to an ephemeral loopback host; list, claim, session-isolation rejection, snapshot refs, input/click, screenshot, logs, cancellation, release, and disconnect. Modern branded Chrome/Edge may restrict command-line unpacked extension loading; the manual **Load unpacked** flow above remains the supported installation method.
