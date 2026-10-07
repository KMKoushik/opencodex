# Desktop tools plugin

OpenCode V2 runs these tools in the original session. The gateway installs a bundled, self-contained plugin through Settings → General → Browser and computer tools. The desktop app hosts browser and native input operations; it must remain open. The gateway never receives endpoint credentials.

`browser_enable` and `computer_enable` load instructions and expose their direct tools for that session. These bootstrap tools also work with the Claude proxy's fixed catalog. Separate skills describe when to enable each group. Enablement is presentation state; authorization always uses native OpenCode permissions.

Existing Chrome tabs require `browser_claim`; `browser_release` relinquishes ownership without closing the tab. Both default to the Chrome backend. Chrome supports paged tab listings (`offset`), incremental console/network reads (`after`), and replacing targeted text (`clear`).

## Permission boundary

The pinned `@opencode/plugin@2.0.19` context has no permission-create or invocation-ask API. The bundled official client discovers the shared local service, checks that `server.info().pid === process.pid`, and creates native permission requests with invocation-provided session, agent, message, and call IDs. It subscribes before creating a request, waits for the matching `permission.replied` when the decision is `ask`, and rejects the outstanding prompt on cancellation. It never starts or stops OpenCode.

Permission actions are method names (`browser.click`, `computer.type`, etc.). Resources are `embedded:<origin>` / `chrome:<origin>`, `<backend>:tabs` for listing, or the macOS bundle identifier. Native permission rules and the existing permission UI apply.

Tab operations require `tabID` and the current `origin`. Navigate also requests permission for the destination. The plugin converts approved `origin` to `input.expectedOrigin`; **both browser runtimes must compare it with the actual origin immediately before executing and fail closed on mismatch**. This includes reads, screenshots, and closing tabs. Open can use HTTP(S) or `about:blank`. All macOS operations except status/list require `app` (bundle identifier). Element targets require `elementID` + `snapshotID`; coordinates are explicit.

## Transport

Private descriptors live in `${XDG_CONFIG_HOME || ~/.config}/opencode/opencodex-desktop/*.json`, or a file selected explicitly by `OPENCODEX_DESKTOP_ENDPOINT`. Descriptors are owner-only, non-symlink regular files with `{version:1,pid,label,url,token}`. Only authenticated loopback HTTP endpoints passing `/health` are candidates; exactly one must be live. Discovery is repeated for each call, with bounded candidate count and parallel probes.

`POST /call` carries `{sessionID,method,input}` with bearer authentication. Requests have a 60-second deadline and the invocation abort signal. Responses use `DesktopToolResult` from contracts: image/file content stays native file content rather than being serialized into text. Redirects, oversized responses, and malformed content are rejected.

`bun plugins` bundles the official client and embeds the artifact in the gateway. `bun claude-code-plugin` refreshes the Claude proxy allowlist artifact.
