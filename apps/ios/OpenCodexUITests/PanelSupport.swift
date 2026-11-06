import XCTest

/// Shared steps for the panel tests: open a chat's "…" items, wait on conditions, save
/// screenshots (set `SCREENSHOTS=<dir>` as `TEST_RUNNER_SCREENSHOTS`), and set up gateway state.
nonisolated enum Panels {
  static let root = "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios"
  /// Runs agent edits and shells without asking.
  static let homeDemo = root + "/home-demo"

  /// Opens one item of the chat's "…" thread sheet, scrolling to it if it's below the fold.
  @MainActor static func openChatMenu(_ app: XCUIApplication, _ item: String) {
    let menu = app.buttons["chat.actions"]
    XCTAssertTrue(menu.waitForExistence(timeout: 20), "The chat should load")
    menu.tap()
    XCTAssertTrue(app.descendants(matching: .any)["sheet.title"].waitForExistence(timeout: 5))
    let button = app.buttons[item]
    // The sheet's list makes rows lazily, so a row below the fold exists only once shown.
    for _ in 0..<6 where !(button.exists && button.isHittable) {
      app.collectionViews.firstMatch.swipeUp()
    }
    XCTAssertTrue(button.waitForExistence(timeout: 5), "“\(item)” should be in the chat menu")
    button.tap()
  }

  /// Polls until `condition` holds, without blocking the runner's main actor.
  @MainActor static func waitUntil(
    timeout: TimeInterval = 20, _ condition: () -> Bool
  ) async -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if condition() { return true }
      try? await Task.sleep(for: .milliseconds(300))
    }
    return condition()
  }

  @MainActor static func shot(_ name: String) {
    guard let directory = ProcessInfo.processInfo.environment["SCREENSHOTS"] else { return }
    Thread.sleep(forTimeInterval: 0.8)
    let url = URL(fileURLWithPath: directory).appending(path: "\(name).png")
    try? XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
  }

  /// The DEBUG launch arguments (`-tasksDemo`, `-terminal`, …) don't exist in Release.
  /// Writes the element tree next to the screenshots, to debug a query.
  @MainActor static func dump(_ app: XCUIApplication, _ name: String) {
    guard let directory = ProcessInfo.processInfo.environment["SCREENSHOTS"] else { return }
    try? app.debugDescription.write(
      to: URL(fileURLWithPath: directory).appending(path: "\(name).txt"), atomically: true, encoding: .utf8)
  }

  /// The test bundle is built in the app's configuration, so this matches the app.
  static func requireDebugBuild() throws {
    #if !DEBUG
      throw XCTSkip("Needs a Debug build's launch arguments.")
    #endif
  }
}

nonisolated extension TestGateway {
  /// A new chat in `directory` with a title, so screens and banners can find it.
  func createSession(in directory: String, title: String) async throws -> String {
    let session = try await call("/sessions", ["directory": directory, "model": Self.model])
    let id = try XCTUnwrap((session as? [String: Any])?["id"] as? String)
    try await call("/sessions/\(id)/action", ["action": "rename", "title": title])
    return id
  }

  func isRunning(_ id: String) async throws -> Bool {
    (try await call("/sessions/active") as? [String: Any])?[id] != nil
  }

  /// Waits for a prompt's reply to finish.
  func waitIdle(_ id: String, timeout: TimeInterval = 90) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    // The run may not have started yet.
    try await Task.sleep(for: .milliseconds(800))
    while try await isRunning(id) {
      if Date() > deadline { throw XCTSkip("The reply didn’t finish in time.") }
      try await Task.sleep(for: .milliseconds(500))
    }
  }

  /// `/api<path>?<query>`; `call` would percent-encode a `?` inside its path.
  func url(_ path: String, _ query: [String: String] = [:]) -> URL {
    base.appending(path: "api" + path).appending(
      queryItems: query.map { URLQueryItem(name: $0.key, value: $0.value) })
  }

  func get(_ path: String, _ query: [String: String]) async throws -> Any {
    let (data, _) = try await URLSession.shared.data(from: url(path, query))
    return try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
  }

  func delete(_ path: String, _ query: [String: String] = [:]) async {
    var request = URLRequest(url: url(path, query))
    request.httpMethod = "DELETE"
    _ = try? await URLSession.shared.data(for: request)
  }
}

extension XCUIElement {
  /// The text field behind the composer, which is a text view once focused.
  @MainActor static func composer(_ app: XCUIApplication) -> XCUIElement {
    app.textViews["composer.input"].exists
      ? app.textViews["composer.input"] : app.textFields["composer.input"]
  }
}
