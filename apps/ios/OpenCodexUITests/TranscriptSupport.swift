import XCTest

/// Gateway calls and launch helpers for the transcript and activity tests. Sessions are made
/// with the free scripted model (`run:`, `subagent:`, `long`, anything else is a short answer).
nonisolated struct ChatFixture {
  static let root = "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios"
  /// Runs shell commands without asking.
  static let homeDemo = root + "/home-demo"
  /// Asks before edits and shell commands.
  static let proj = root + "/proj"
  static let model = ["id": "scripted", "providerID": "fake"]

  let base = URL(
    string: ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310")!

  /// A new chat with a title, so it's easy to find and tell apart from others' chats.
  func chat(_ title: String, in directory: String = Self.homeDemo) async throws -> String {
    let session = try await call("/sessions", ["directory": directory, "model": Self.model])
    let id = try XCTUnwrap((session as? [String: Any])?["id"] as? String)
    try await call("/sessions/\(id)/action", ["action": "rename", "title": title])
    return id
  }

  func prompt(_ id: String, _ text: String, model: [String: String] = Self.model, files: [[String: String]]? = nil)
    async throws
  {
    var body: [String: Any] = ["text": text, "model": model]
    if let files { body["files"] = files }
    try await call("/sessions/\(id)/prompt", body)
  }

  func running(_ id: String) async throws -> Bool {
    (try await call("/sessions/active") as? [String: Any])?[id] != nil
  }

  /// Waits until the chat's reply has finished.
  func idle(_ id: String, timeout: TimeInterval = 90) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    try await Task.sleep(for: .milliseconds(500))
    while try await running(id) {
      if Date() > deadline { XCTFail("The reply never finished"); return }
      try await Task.sleep(for: .milliseconds(500))
    }
  }

  func messages(_ id: String) async throws -> [[String: Any]] {
    (try await call("/sessions/\(id)/messages") as? [String: Any])?["data"] as? [[String: Any]] ?? []
  }

  @discardableResult
  func call(_ path: String, _ body: [String: Any]? = nil, method: String? = nil) async throws -> Any {
    var components = URLComponents(url: base.appending(path: "api"), resolvingAgainstBaseURL: false)!
    let parts = path.split(separator: "?", maxSplits: 1)
    components.path += String(parts[0])
    if parts.count > 1 { components.percentEncodedQuery = String(parts[1]) }
    var request = URLRequest(url: components.url!)
    if let body {
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    if let method { request.httpMethod = method }
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    XCTAssertTrue((200..<300).contains(status), "\(path): \(status) \(String(decoding: data, as: UTF8.self))")
    if data.isEmpty { return NSNull() }
    return try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
  }
}

extension XCUIApplication {
  /// The app on one chat, with the notifications prompt already answered and the activity
  /// tray collapsed, so every run starts from the same screen.
  static func chat(_ id: String, _ arguments: [String] = []) -> XCUIApplication {
    opencodex(["-session", id, "-notificationsAsked", "YES", "-activityTrayOpen", "NO"] + arguments)
  }

  var transcript: XCUIElement { collectionViews["transcript"] }

  /// The composer's input, a text view or a text field depending on its state.
  var composerInput: XCUIElement {
    textViews["composer.input"].exists ? textViews["composer.input"] : textFields["composer.input"]
  }

  /// Pastes the clipboard into the composer and returns what it then holds, which shows what
  /// a Copy action put on the clipboard without asking the system for paste access.
  func pasteIntoComposer() -> String {
    let input = composerInput
    input.tap()
    input.press(forDuration: 1.1)
    let paste = menuItems["Paste"].exists ? menuItems["Paste"] : buttons["Paste"]
    guard paste.waitForExistence(timeout: 5) else { return "" }
    paste.tap()
    sleep(1)
    return composerInput.value as? String ?? ""
  }

  /// Clears the composer so a later paste starts empty.
  func clearComposer() {
    let input = composerInput
    guard let value = input.value as? String, !value.isEmpty, value != "Message" else { return }
    input.tap()
    input.press(forDuration: 1.1)
    if menuItems["Select All"].waitForExistence(timeout: 3) {
      menuItems["Select All"].tap()
      input.typeText(XCUIKeyboardKey.delete.rawValue)
    }
  }
}

extension XCUIElement {
  /// Waits until a predicate on the element holds.
  @discardableResult
  func wait(until predicate: String, timeout: TimeInterval = 10) -> Bool {
    let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: predicate), object: self)
    return XCTWaiter().wait(for: [expectation], timeout: timeout) == .completed
  }
}

/// Saves a screenshot when `OPENCODEX_SHOTS` names a folder.
@MainActor func screenshot(_ name: String) {
  guard let folder = ProcessInfo.processInfo.environment["OPENCODEX_SHOTS"] else { return }
  try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "\(folder)/\(name).png"))
}
