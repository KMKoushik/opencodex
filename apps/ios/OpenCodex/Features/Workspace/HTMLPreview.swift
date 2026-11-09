import SwiftUI
import WebKit

/// A local HTML file rendered like the desktop's Browser panel renders it: the page and the
/// files it loads (styles, scripts, images, fonts) come from the computer through the gateway's
/// `/api/workspace/page`. They load under a private `opencodex-page:` scheme, so relative links
/// work and the device token stays in the app, never in the page. Web links open in Safari.
struct HTMLPreview: UIViewRepresentable {
  let client: GatewayClient
  let directory: String
  let path: String
  /// The file's version: a new one reloads the page.
  let version: String

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    // Nothing shared with other pages or kept after the preview closes.
    configuration.websiteDataStore = .nonPersistent()
    configuration.allowsInlineMediaPlayback = true
    configuration.setURLSchemeHandler(
      PageSchemeHandler(client: client, directory: directory), forURLScheme: PageSchemeHandler.scheme)
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    webView.allowsBackForwardNavigationGestures = true
    webView.accessibilityIdentifier = "html-preview"
    #if DEBUG
      webView.isInspectable = true
    #endif
    context.coordinator.version = version
    if let url = PageSchemeHandler.url(for: path) { webView.load(URLRequest(url: url)) }
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    guard context.coordinator.version != version else { return }
    context.coordinator.version = version
    webView.reload()
  }

  static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
    webView.stopLoading()
  }

  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    var version = ""

    /// The page's own files and inline content load here; other web pages open in Safari, except
    /// in embedded frames (a map or a video player).
    func webView(
      _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
      decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
      guard let url = action.request.url, let scheme = url.scheme?.lowercased() else {
        return decisionHandler(.cancel)
      }
      switch scheme {
      case PageSchemeHandler.scheme, "about", "data", "blob":
        decisionHandler(.allow)
      case "http", "https":
        if action.targetFrame?.isMainFrame == false { return decisionHandler(.allow) }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
      case "mailto", "tel":
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
      default:
        decisionHandler(.cancel)
      }
    }

    /// `target=_blank` and `window.open`: the page's own files open here, web pages in Safari.
    func webView(
      _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
      for action: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
      guard let url = action.request.url else { return nil }
      if url.scheme == PageSchemeHandler.scheme {
        webView.load(action.request)
      } else if ["http", "https"].contains(url.scheme?.lowercased()) {
        UIApplication.shared.open(url)
      }
      return nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
  }
}

/// Answers `opencodex-page://workspace/<path>` with that file from the gateway, read relative to
/// the preview's folder. The gateway keeps reads inside it.
final class PageSchemeHandler: NSObject, WKURLSchemeHandler {
  static let scheme = "opencodex-page"
  private let client: GatewayClient
  private let directory: String
  private var running: [ObjectIdentifier: Task<Void, Never>] = [:]

  init(client: GatewayClient, directory: String) {
    self.client = client
    self.directory = directory
  }

  static func url(for path: String) -> URL? {
    var components = URLComponents()
    components.scheme = scheme
    components.host = "workspace"
    components.path = "/" + path
    return components.url
  }

  func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
    guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
    let path = String(url.path(percentEncoded: false).drop { $0 == "/" })
    let request = client.request(
      client.url("/workspace/page", ["directory": directory, "path": path]))
    let id = ObjectIdentifier(task)
    running[id] = Task { [weak self] in
      let result: Result<(URL, HTTPURLResponse), any Error>
      do { result = .success(try await Self.download(request)) } catch { result = .failure(error) }
      // Stopped meanwhile: WebKit forbids answering the task.
      guard let self, running.removeValue(forKey: id) != nil else {
        if case .success((let file, _)) = result { try? FileManager.default.removeItem(at: file) }
        return
      }
      switch result {
      case .failure(let error):
        task.didFailWithError(error)
      case .success((let file, let response)):
        defer { try? FileManager.default.removeItem(at: file) }
        var data = (try? Data(contentsOf: file, options: .alwaysMapped)) ?? Data()
        var type = response.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream"
        if !(200..<300).contains(response.statusCode) {
          // The gateway's reason, readable in place of the page.
          let message =
            (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
            ?? "This file could not be opened."
          data = Data(Self.errorPage(message).utf8)
          type = "text/html; charset=utf-8"
        }
        task.didReceive(
          HTTPURLResponse(
            url: url, statusCode: response.statusCode, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": type, "Content-Length": String(data.count)])!)
        task.didReceive(data)
        task.didFinish()
      }
    }
  }

  func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {
    running.removeValue(forKey: ObjectIdentifier(task))?.cancel()
  }

  /// To a temporary file, so a large image or video isn't held twice in memory.
  @concurrent private static func download(_ request: URLRequest) async throws -> (URL, HTTPURLResponse) {
    let (location, response) = try await URLSession.shared.download(for: request)
    guard let response = response as? HTTPURLResponse else {
      try? FileManager.default.removeItem(at: location)
      throw URLError(.badServerResponse)
    }
    return (location, response)
  }

  private static func errorPage(_ message: String) -> String {
    let escaped = message
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
    return """
      <!doctype html><meta name="viewport" content="width=device-width">\
      <meta name="color-scheme" content="light dark">\
      <p style="font: -apple-system-body; color: GrayText; padding: 20px">\(escaped)</p>
      """
  }
}
