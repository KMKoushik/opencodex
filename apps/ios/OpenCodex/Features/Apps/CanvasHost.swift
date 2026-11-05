import Observation
import SwiftUI
import UIKit
import WebKit

/// One canvas's snapshots, like the desktop `CanvasFrame`'s queries: its transpiled view, its
/// data values with revisions, and which of its functions are running. Live `canvas` events
/// (when the event stream forwards them) and reconnects refetch only what changed.
@Observable
final class CanvasModel {
  let client: GatewayClient
  let events: EventHub
  let id: String

  private(set) var source: CanvasSource?
  private(set) var data: CanvasData?
  private(set) var running: [String] = []
  private(set) var loadError: String?
  /// The last failed write or call bookkeeping, shown above the frame.
  var writeError: String?

  /// Opens a chat by session id, for views that link the sessions their server started.
  @ObservationIgnored var openSession: ((String) -> Void)?

  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var pending: Set<Refresh> = []
  @ObservationIgnored private var refreshTask: Task<Void, Never>?
  /// Writes waiting per key; only the latest value is sent.
  @ObservationIgnored private var queued: [String: JSONValue] = [:]
  @ObservationIgnored private var writing: Set<String> = []
  /// Called after a write is saved, so the host records the revision the frame already shows.
  @ObservationIgnored var onSaved: ((String, String) -> Void)?

  private enum Refresh { case source, data, apps }

  init(client: GatewayClient, events: EventHub, id: String) {
    self.client = client
    self.events = events
    self.id = id
  }

  func run() async {
    subscriptions = [
      events.subscribe { [weak self] event in self?.handle(event) },
      events.onReconnect { [weak self] in self?.schedule([.source, .data, .apps]) },
    ]
    defer { subscriptions = [] }
    async let source: Void = load(.source)
    async let data: Void = load(.data)
    async let apps: Void = load(.apps)
    _ = await (source, data, apps)
  }

  /// `canvas` events from the gateway's stream: `{ type: source | data | list | app, id, … }`.
  private func handle(_ event: GatewayEvent) {
    guard event.type == "canvas", let data = event.data else { return }
    let kind = data["type"]?.string
    if kind == "list" { return schedule([.apps]) }
    guard data["id"]?.string == id else { return }
    switch kind {
    case "source": schedule([.source])
    case "data": schedule([.data])
    case "app": schedule([.apps])
    default: break
    }
  }

  func refreshAfterCall() { schedule([.data, .apps]) }

  private func schedule(_ what: Set<Refresh>) {
    pending.formUnion(what)
    guard refreshTask == nil else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(250))
      guard let self else { return }
      let what = self.pending
      self.pending = []
      self.refreshTask = nil
      for item in what { await self.load(item) }
    }
  }

  private func load(_ what: Refresh) async {
    do {
      switch what {
      case .source:
        let next = try await client.canvasSource(id)
        if next != source { source = next }
      case .data:
        let next = try await client.canvasData(id)
        if next != data { data = next }
      case .apps:
        let names = try await client.apps().first { $0.id == id }?.running ?? []
        if names != running { running = names }
      }
      loadError = nil
    } catch let error as GatewayError {
      loadError = error.message
    } catch {
      if source == nil || data == nil { loadError = error.localizedDescription }
    }
  }

  // MARK: Writes

  /// Saves the frame's writes one at a time per key with compare-and-swap, always sending the
  /// latest value and the last revision this host knew. A conflict adopts the stored value.
  func set(_ key: String, _ value: JSONValue) {
    queued[key] = value
    Task { await flush(key) }
  }

  private func flush(_ key: String) async {
    guard !writing.contains(key), let value = queued.removeValue(forKey: key) else { return }
    writing.insert(key)
    defer {
      writing.remove(key)
      if queued[key] != nil { Task { await flush(key) } }
    }
    let base = data?.values[key]?.rev
    do {
      switch try await client.writeCanvasValue(id, key: key, value: value, rev: base) {
      case .saved(let rev):
        // The frame already shows this value; record it so it isn't echoed back.
        onSaved?(key, rev)
        update(key, value, rev: rev)
      case .conflict(let stored, let rev):
        queued[key] = nil
        update(key, stored ?? .null, rev: rev)
      }
      writeError = nil
    } catch {
      writeError = error.localizedDescription
      schedule([.data])
    }
  }

  private func update(_ key: String, _ value: JSONValue, rev: String?) {
    var next = data ?? CanvasData(values: [:], errors: [])
    if let rev { next.values[key] = CanvasValue(value: value, rev: rev) } else {
      next.values[key] = nil
    }
    data = next
  }
}

/// The canvas frame runtime from the gateway (`/api/canvas-runtime/frame.html`) in a web view,
/// speaking the same `opencodex-canvas` messages the web UI's iframe host does. The page has no
/// network (its CSP) and no credentials: code, data and theme come from the native client,
/// and its writes and function calls go back through it, so remote gateways keep the device
/// token out of the web view.
struct CanvasFrameView: UIViewRepresentable {
  let model: CanvasModel
  let title: String
  @Environment(\.palette) private var palette

  func makeCoordinator() -> CanvasBridge { CanvasBridge(model: model) }

  func makeUIView(context: Context) -> WKWebView {
    let bridge = context.coordinator
    let configuration = WKWebViewConfiguration()
    // No cookies or storage shared with anything else, like the iframe's opaque origin.
    configuration.websiteDataStore = .nonPersistent()
    let controller = WKUserContentController()
    controller.addUserScript(
      WKUserScript(source: CanvasBridge.script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    controller.add(WeakMessageHandler(bridge), name: CanvasBridge.handlerName)
    configuration.userContentController = controller
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.isOpaque = false
    webView.backgroundColor = palette.ui("surface")
    webView.scrollView.backgroundColor = palette.ui("surface")
    webView.scrollView.contentInsetAdjustmentBehavior = .automatic
    webView.navigationDelegate = bridge
    webView.uiDelegate = bridge
    webView.accessibilityLabel = title
    webView.accessibilityIdentifier = "canvas.frame"
    #if DEBUG
      webView.isInspectable = true
    #endif
    bridge.webView = webView
    bridge.theme = Self.theme(palette)
    bridge.load()
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    webView.backgroundColor = palette.ui("surface")
    webView.scrollView.backgroundColor = palette.ui("surface")
    let bridge = context.coordinator
    bridge.theme = Self.theme(palette)
    bridge.sync(source: model.source, data: model.data, running: model.running)
  }

  static func dismantleUIView(_ webView: WKWebView, coordinator: CanvasBridge) {
    webView.configuration.userContentController.removeScriptMessageHandler(
      forName: CanvasBridge.handlerName)
    webView.stopLoading()
  }

  /// Semantic tokens a canvas can use (`canvas-theme.ts`); its own aliases derive from these.
  private static let tokens = [
    "project-gray", "project-blue", "project-green", "project-orange", "project-pink",
    "project-purple", "on-project", "surface", "elevated", "control", "text", "text-secondary",
    "text-tertiary", "border", "border-heavy", "hover", "secondary", "primary", "on-primary",
    "accent", "error", "success", "warning", "shadow", "code-bg", "chip", "chip-border",
    "chip-shadow", "well", "well-shadow", "primary-glaze", "primary-shadow",
  ]

  /// The theme in effect, as `{ scheme, vars }` with the desktop's CSS values.
  static func theme(_ palette: Palette) -> JSONValue {
    var vars: [String: JSONValue] = [:]
    for name in tokens {
      if let value = palette.string(name), !value.isEmpty { vars["--\(name)"] = .string(value) }
    }
    vars["--font-sans"] = .string("-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
    vars["--font-mono"] = .string(
      "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace")
    return .object(["scheme": .string(palette.dark ? "dark" : "light"), "vars": .object(vars)])
  }
}

/// Relays messages between the frame and the gateway, like `CanvasFrame`'s effects: first
/// contact sends everything; later only what changed (the view's modules, values whose
/// revision differs, the theme, running functions).
final class CanvasBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
  static let handlerName = "opencodexCanvas"
  static let channel = "opencodex-canvas"

  /// In a top-level page `window.parent` is the page itself, so the runtime's posts to its
  /// host are caught here and handed to native code; native messages arrive as `message`
  /// events whose source is `window.parent`, exactly as from the iframe's host.
  static let script = """
    (() => {
      const native = window.webkit && window.webkit.messageHandlers.\(handlerName);
      if (!native) return;
      const post = window.postMessage.bind(window);
      window.postMessage = function (message, ...rest) {
        if (message && message.channel === '\(channel)') {
          native.postMessage(JSON.stringify(message));
          return;
        }
        return post(message, ...rest);
      };
      window.__opencodexHost = (text) =>
        window.dispatchEvent(new MessageEvent('message', { data: JSON.parse(text), source: window }));
    })();
    """

  let model: CanvasModel
  weak var webView: WKWebView?
  var theme: JSONValue = .null {
    didSet { if theme != oldValue { sendTheme() } }
  }

  /// Whether the current frame instance has said it's listening.
  private var ready = false
  /// What the frame currently shows.
  private var shownVersion: String?
  private var shownRevs: [String: String] = [:]
  private var shownTheme: JSONValue?
  private var shownRunning: [String]?
  private var source: CanvasSource?
  private var data: CanvasData?
  private var running: [String] = []

  init(model: CanvasModel) {
    self.model = model
    super.init()
    model.onSaved = { [weak self] key, rev in self?.shownRevs[key] = rev }
  }

  func load() {
    ready = false
    webView?.load(URLRequest(url: model.client.canvasFrameURL))
  }

  func sync(source: CanvasSource?, data: CanvasData?, running: [String]) {
    self.source = source
    self.data = data
    self.running = running
    flush()
  }

  private func flush() {
    guard ready, let source, let data else { return }
    guard let version = shownVersion else {
      // First contact: everything at once.
      var values: [String: JSONValue] = [:]
      for (key, item) in data.values {
        values[key] = item.value
        shownRevs[key] = item.rev
      }
      shownVersion = source.version
      shownTheme = theme
      post([
        "type": .string("init"), "mode": .string("panel"), "theme": theme, "entry": .string(source.entry),
        "modules": .object(source.modules.mapValues { .string($0) }), "data": .object(values),
      ])
      sendRunning()
      return
    }
    // The agent edited the view: rerun it with the frame's current data.
    if version != source.version {
      shownVersion = source.version
      post([
        "type": .string("modules"), "entry": .string(source.entry),
        "modules": .object(source.modules.mapValues { .string($0) }),
      ])
    }
    // Values changed elsewhere (the agent, another view, a conflict): send only those.
    for (key, item) in data.values where shownRevs[key] != item.rev {
      shownRevs[key] = item.rev
      post(["type": .string("data"), "key": .string(key), "value": item.value])
    }
    for key in shownRevs.keys where data.values[key] == nil {
      shownRevs[key] = nil
      post(["type": .string("data"), "key": .string(key)])
    }
    sendRunning()
  }

  private func sendTheme() {
    guard ready, shownVersion != nil, theme != shownTheme else { return }
    shownTheme = theme
    post(["type": .string("theme"), "theme": theme])
  }

  private func sendRunning() {
    guard ready, shownVersion != nil, source?.server == true, running != shownRunning else { return }
    shownRunning = running
    post(["type": .string("running"), "names": .array(running.map { .string($0) })])
  }

  private func post(_ message: [String: JSONValue]) {
    var message = message
    message["channel"] = .string(Self.channel)
    guard let webView, let data = try? JSONEncoder().encode(JSONValue.object(message)),
      let text = String(data: data, encoding: .utf8)
    else { return }
    webView.callAsyncJavaScript(
      "window.__opencodexHost(text)", arguments: ["text": text], in: nil, in: .page,
      completionHandler: nil)
  }

  // MARK: Frame → host

  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    // Untrusted: the frame runs agent-written code.
    guard message.webView === webView, let text = message.body as? String,
      let value = try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)),
      value["channel"]?.string == Self.channel, let type = value["type"]?.string
    else { return }
    switch type {
    case "ready":
      ready = true
      shownVersion = nil
      shownTheme = nil
      shownRunning = nil
      shownRevs = [:]
      flush()
    case "set":
      guard let key = value["key"]?.string else { return }
      model.set(key, value["value"] ?? .null)
    case "call":
      guard let call = value["call"]?.number, let name = value["name"]?.string else { return }
      let args = value["args"]?.array ?? []
      Task { [weak self, model] in
        var reply: [String: JSONValue] = ["type": .string("result"), "call": .number(call)]
        do {
          reply["value"] = try await model.client.callCanvasFunction(model.id, name: name, args: args)
        } catch {
          reply["error"] = .string(error.localizedDescription)
        }
        self?.post(reply)
        // Without live canvas events, pick up what the function wrote.
        model.refreshAfterCall()
      }
    case "open":
      if let target = value["target"]?.string {
        if let url = URL(string: target), ["http", "https"].contains(url.scheme?.lowercased()) {
          UIApplication.shared.open(url)
        }
      } else if let session = value["target"]?["session"]?.string {
        model.openSession?(session)
      }
    default:
      // `size` only matters inline; `annotation` needs the desktop's comment overlay.
      break
    }
  }

  // MARK: Navigation

  /// Only the frame page itself; a canvas that navigates away stays put.
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
  ) {
    let frame = model.client.canvasFrameURL
    let url = action.request.url
    let allowed =
      url?.scheme == frame.scheme && url?.host == frame.host && url?.port == frame.port
      && url?.path == frame.path
    decisionHandler(allowed || url?.absoluteString == "about:blank" ? .allow : .cancel)
  }

  func webView(
    _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
    for action: WKNavigationAction, windowFeatures: WKWindowFeatures
  ) -> WKWebView? { nil }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { load() }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    model.writeError = error.localizedDescription
  }

  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    model.writeError = error.localizedDescription
  }
}

/// Breaks the retain cycle between the content controller and the bridge.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
  weak var target: WKScriptMessageHandler?
  init(_ target: WKScriptMessageHandler) { self.target = target }
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    target?.userContentController(controller, didReceive: message)
  }
}

/// A canvas full-size with its error line, like the desktop's panel frame.
struct CanvasPanel: View {
  @State private var model: CanvasModel
  let title: String
  @Environment(\.palette) private var palette

  init(
    client: GatewayClient, events: EventHub, id: String, title: String,
    onOpenSession: ((String) -> Void)? = nil
  ) {
    let model = CanvasModel(client: client, events: events, id: id)
    model.openSession = onOpenSession
    _model = State(initialValue: model)
    self.title = title
  }

  var body: some View {
    VStack(spacing: 0) {
      if let message = problem {
        Text(message)
          .font(.footnote.monospaced())
          .foregroundStyle(palette.color("error"))
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 16)
          .padding(.vertical, 8)
          .background(palette.color("error").opacity(0.08))
          .accessibilityIdentifier("canvas.error")
      }
      CanvasFrameView(model: model, title: title)
        // The page scrolls under the home indicator, with its own inset.
        .ignoresSafeArea(.container, edges: .bottom)
        .overlay {
          if model.source == nil || model.data == nil, model.loadError == nil {
            ProgressView().controlSize(.large)
          }
        }
    }
    .background(palette.color("surface").ignoresSafeArea())
    .task { await model.run() }
  }

  private var problem: String? {
    if let error = model.loadError { return error }
    let problems = (model.source?.errors ?? []) + (model.data?.errors ?? [])
    if !problems.isEmpty { return problems.joined(separator: "\n") }
    return model.writeError
  }
}
