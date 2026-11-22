# oc-webview

Standalone macOS WKWebView host for Rune **7286a3c5**, with a compiling no-op host on other
platforms. This crate is not yet wired into the OpenCodex application. No gateway or OpenCode
process is started by the demo/check.

```rust,ignore
let web = WebView::new(Options {
    bridge: true, // false for browser/PDF guests
    navigation: Navigation {
        origins: vec![gateway_origin],
        external_links: true,
        ..Default::default()
    },
    wake: Rc::new(move || rune_waker()),
    ..Default::default()
});
// App::on_window (repeats if Rune recreates a native window):
web.attach(window)?;
// View: normal Rune layout constraints, with one host per WebView:
web.host::<State>("canvas-panel").grow(1.0).min_w(0.0)
// App::on_ready, after the first native frame:
web.load_url(&url)?;
```

All methods and callbacks run on the main thread. Handles are `Rc`-owned and deliberately
not Send/Sync. Creating a handle, attaching a window and queuing content do not create WebKit;
the first nonempty presentation does. `load_url`/`load_html` before that replace the pending
load rather than queueing unbounded work.

## API and ownership

- `load_url`, `load_html(html, base_url)`, `back`, `forward`, `reload`, `stop`.
- `state()` is an event-maintained snapshot (title, URL, loading, estimated progress, history
  availability). Native KVO produces coalesced `Event::Changed`; there is no state polling.
- `drain_events()` also returns errors, blocked/external navigations, new-window URLs, focus
  requests and bridge messages. The queue is capped at 256 entries, bridge JSON at 1 MiB.
  Integrators must validate message schemas and attribute them to the owning canvas.
- `Navigation` allows only HTTP(S), exact `about:blank`, and subframe-only `about:srcdoc`. An optional normalized-origin
  list and synchronous policy callback further restrict navigations, including redirects and
  frame navigations. This is **not a subresource/network firewall**; retain the gateway CSP.
  Off-origin main-frame HTTP(S) links can open through NSWorkspace. No arbitrary schemes are
  handed to the OS. New-window requests never create unmanaged WKWebViews.
- Each surface owns a fresh **nonpersistent WKWebsiteDataStore**; browser, canvas and preview
  cookies/cache are never shared. This intentionally differs from Electron's persistent
  browser profile. There is no Node, preload, filesystem bridge or OpenCode client.
  Camera/microphone and device-motion permission requests are explicitly denied.
- `evaluate` reports a string description (use `JSON.stringify` for structured results).
  `snapshot` asynchronously returns PNG bytes; write them on a worker, not the frame thread.
- `set_background([r,g,b,a])` changes WebKit's loading/under-page color, in sRGB 0–1.
  Normal AppKit context menus remain enabled. Debug builds enable Web Inspector / Inspect
  Element; release builds do not enable developer extras.

## Position, lifetime, z-order, focus

`host` binds Rune's `drawn_rect_into(Live)` to the native surface. Unlike
`on_drawn_layout`, which deliberately skips spring frames in this pinned Rune revision,
the live binding reports the actual animated rectangle. A common-mode Core Foundation
runloop observer samples it just before sleep, after Rune draws and before the normal
Core Animation commit. It requests no redraws, performs no I/O, does no work in Rune's frame
loop, and only calls native frame/mask setters when the rectangle changes. Mount leases hide
the native view when the final Rune host unmounts (including retained exit lifetimes).

Coordinates are top-left **logical window points**. AppKit supplies backing-scale handling;
do not multiply by devicePixelRatio. `present(rect, clip)` is the lower-level integration API
for explicit positioning or ancestor clipping. A layer-clipped NSView container clips painting
and hit-testing without changing the document viewport. `host` assumes an unclipped panel rectangle: for scrolling or clipped
ancestors, the app must provide the intersected clip via `present` instead. Arbitrary rotated
Rune ancestors are not supported by the axis-aligned native host.

The native child view sits above Rune's Metal layer. Before showing any Rune menu, tooltip,
popover or modal which overlaps it, call `set_covered(true)`; on dismissal call
`set_covered(false)`. This hides the **whole** surface, not merely its overlap, and relinquishes
native keyboard focus, so Rune paints and hit-tests its overlay normally. A placeholder can
be drawn below it. There is no per-frame snapshot readback or second native window.

`hide` and coverage suspend all media playback and tell AppKit/WebKit the view is hidden.
WebKit applies its own hidden-page throttling. **Public WKWebView APIs cannot guarantee full
JavaScript/process suspension**; destroy the last WebView handle to stop a page completely.
No private WebKit process-suspension selectors are used.

`focus()` enters WebKit; `focus_rune()` restores winit's content view. A window-scoped native
key monitor hands Cmd+L and non-composing Escape back to Rune as `Event::Focus`; an injected
focus-only script hands boundary Tab/Shift-Tab back. Interior Tab, standard Edit menu commands,
selection and IME stay with WebKit. On `Focus`, the app chooses an appropriate Rune focus key
with `tx.focus(key, true)`. This narrow focus script also runs in browser guests but provides
no privileged host bridge. Focus traversal inside nested iframes remains WebKit-owned.

### Remaining Rune integration limitation

The observer follows actual spring positions without patching Rune. However, Rune does not
expose its acquire/present transaction or a public native-slot clipped-rect/unmount/overlay
callback. A crate outside Rune **cannot promise atomic, zero-tearing presentation** with its
independently submitted Metal drawable, nor automatically discover every Rune overlay.
The observer runs in the same runloop turn, but is not a renderer transaction guarantee.

An upstream API should be an `El::native_view(slot)` whose per-present callback receives the
drawn point rect, ancestor clip, backing scale, presence/opacity, and occlusion by later GPU
overlays; invoke it inside the same CATransaction as drawable present (as Rune's private
`system_material::macos::Materials::present` already does), and invoke unmount explicitly.
The platform-neutral app should not manage raw NSView pointers or enable
`presentsWithTransaction` behind Rune's material flag state machine.

## Canvas runtime integration

For `bridge: true`, main-frame pages get `window.ocHost.postMessage(jsonValue)`. A main-frame
shell may host the gateway's existing `/api/canvas-runtime/frame.html` inside an
`<iframe sandbox="allow-scripts">`. The injected bridge forwards only messages whose source
is that iframe. `web.post_message(&value)` sends into it; the gateway's existing runtime
continues to own `window.canvas`, CSP, opaque origin, render/theme/data and function messages.
Do not inject agent HTML into an authenticated gateway-origin document using `load_html`.
Browser guests must leave `bridge: false`; do not route their messages to canvas functions.

## Demo / locked-screen check

From `apps/rune`:

```sh
cargo run --release -p oc-webview --example panel
cargo run --release -p oc-webview --example panel -- --check
```

Interactive demo: sidebar, draggable splitter, browser URL, canvas-like sandboxed iframe,
Rune popover crossing the web panel, back/forward/reload, native context menu and focus.
The check uses `loadHTMLString` (no external server), real WK navigation delegates and JS,
and a real Rune headless runtime to drive 30 spring frames even if the native window is
occluded or the screen locked. It checks viewport/DPR, title/loading KVO, an opaque iframe
bridge round-trip, origin blocking and popup delivery, and asynchronously writes
`panel-before.png` / `panel-after.png`. Set `OC_WEBVIEW_PNG_DIR` to choose their directory;
otherwise it uses the platform temporary directory's `oc-webview-check` subfolder. It prints
PASS/FAIL and exits nonzero on errors or a 30-second deadline. Offscreen snapshots verify web
content, not Rune overlay pixels or atomic display presentation; visually check the popover
in the interactive demo when the display is available.
