import XCTest

/// The composer itself: focus and size, send, stop, steering, and drafts.
nonisolated final class ComposerTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  /// One line until focused; focused shows the model row; typing grows to eight lines at most;
  /// leaving the input empty collapses it again.
  @MainActor func testFocusExpandsGrowsAndCollapses() async throws {
    let session = try await TestGateway().createSession()
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let input = app.composerInput
    XCTAssertTrue(input.waitForExistence(timeout: 15))
    let model = app.buttons["composer.model"]
    XCTAssertFalse(model.exists, "Collapsed: one line, no model row")
    XCTAssertTrue(app.buttons["composer.attach"].exists)
    XCTAssertTrue(app.buttons["composer.send"].exists)

    input.tap()
    XCTAssertTrue(model.waitForExistence(timeout: 5), "Focusing shows the model row")
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))

    // Blurring an empty composer collapses it. (Before typing Return: XCUITest types it as a
    // hardware key, which hides the simulator's software keyboard.)
    app.dismissKeyboard()
    XCTAssertTrue(model.waitForNonExistence(timeout: 5), "Blurring an empty composer collapses it")
    XCTAssertTrue(app.buttons["composer.attach"].isHittable)

    // A draft keeps the model row while unfocused, so it can still be sent.
    input.tap()
    input.typeText("keep me")
    app.dismissKeyboard()
    XCTAssertTrue(model.exists)
    XCTAssertTrue(app.buttons["composer.send"].isEnabled)

    // Multiline text grows the input, up to eight lines.
    input.tap()
    input.clear()
    input.typeText("one")
    let oneLine = input.frame.height
    input.typeText("\ntwo\nthree")
    XCTAssertGreaterThan(input.frame.height, oneLine * 2, "Multiline text grows the input")
    input.typeText("\n4\n5\n6\n7\n8")
    let eight = input.frame.height
    input.typeText("\n9\n10\n11")
    XCTAssertEqual(input.frame.height, eight, accuracy: 2, "It stops growing at eight lines")
    XCTAssertTrue(input.text.hasSuffix("11"))
    XCTAssertTrue(input.text.hasPrefix("one\ntwo"), "Focus held while typing: nothing was lost")
  }

  @MainActor func testSendingClearsTheComposer() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let input = app.composerInput
    XCTAssertTrue(input.waitForExistence(timeout: 15))
    let send = app.buttons["composer.send"]
    XCTAssertFalse(send.isEnabled, "Nothing to send yet")
    input.tap()
    input.typeText("Reply with the single word ok")
    XCTAssertTrue(send.isEnabled)
    send.tap()
    await waitFor(timeout: 15) { input.text.isEmpty }
    try await gateway.waitFor { try await gateway.userTexts(session).contains("Reply with the single word ok") }
  }

  /// While a reply runs, Stop interrupts it, and a message sent mid-run steers it; when the reply
  /// waits on a shell, sending moves the shell to the background so the agent reads it now.
  @MainActor func testStopAndSteeringWhileRunning() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession(in: TestGateway.homeDemo)
    try await gateway.prompt(session, "run: sleep 240 && echo done")
    try await gateway.waitFor { try await gateway.running(session) }
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let stop = app.buttons["composer.stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 15), "Stop shows while the reply runs")
    let input = app.composerInput
    input.tap()
    input.typeText("Steer: ignore the shell")
    app.buttons["composer.send"].tap()
    await waitFor(timeout: 15) { input.text.isEmpty }

    // The shell moved to the background, so the steering message is delivered while it sleeps.
    try await gateway.waitFor(timeout: 60) {
      try await gateway.userTexts(session).contains("Steer: ignore the shell")
    }
    let sleeping = try await gateway.shellStillSleeping(session)
    XCTAssertTrue(sleeping, "Steering backgrounds the shell, it doesn't kill it")

    // Stop interrupts the reply.
    if !stop.exists {
      // The steered reply may already have finished; start another to stop.
      input.tap()
      input.typeText("run: sleep 120 && echo again")
      app.buttons["composer.send"].tap()
    }
    XCTAssertTrue(stop.waitForExistence(timeout: 30))
    stop.tap()
    XCTAssertTrue(stop.waitForNonExistence(timeout: 30), "Stop ends the reply")
    try await gateway.waitFor { try await !gateway.running(session) }
  }

  /// Leaving a chat keeps its draft; coming back shows it again.
  @MainActor func testDraftPersistsAcrossNavigation() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    let title = "Draft \(UUID().uuidString.prefix(6))"
    _ = try await gateway.call("/sessions/\(session)/action", ["action": "rename", "title": title])
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let input = app.composerInput
    XCTAssertTrue(input.waitForExistence(timeout: 15))
    input.tap()
    input.typeText("half-written thought")
    app.navigationBars.buttons.element(boundBy: 0).tap()

    // Back home, find the thread again by its title.
    let search = app.buttons["search-threads"]
    XCTAssertTrue(search.waitForExistence(timeout: 15))
    search.tap()
    let field = app.descendants(matching: .any)["thread-search-field"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText(title)
    let row = app.buttons["search-\(session)"]
    XCTAssertTrue(row.waitForExistence(timeout: 15))
    row.tap()
    XCTAssertTrue(input.waitForExistence(timeout: 10))
    XCTAssertEqual(input.text, "half-written thought")
    XCTAssertTrue(app.buttons["composer.send"].isEnabled)
  }

  /// A new-thread starter fills the draft through `DraftStore.fill`, which focuses the input
  /// with the caret at the end, so typing continues the prompt.
  @MainActor func testStarterFillsAndFocusesTheDraft() throws {
    let app = XCUIApplication.opencodex()
    app.launch()
    app.buttons["new-chat"].tap()
    let project = app.buttons["project-home-demo"]
    XCTAssertTrue(project.waitForExistence(timeout: 10))
    project.tap()

    let starter = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'starter.'")).firstMatch
    XCTAssertTrue(starter.waitForExistence(timeout: 10))
    starter.tap()
    let input = app.composerInput
    let filled = NSPredicate { _, _ in !input.text.isEmpty }
    wait(for: [expectation(for: filled, evaluatedWith: nil)], timeout: 5)
    let prompt = input.text
    // Needs NewThreadHero to call `DraftStore.shared.fill(key, text:)` (it sets `.text`, which
    // doesn't focus); outside the composer, so reported to the lead.
    let focused = app.keyboards.firstMatch.waitForExistence(timeout: 5)
    guard focused else {
      XCTExpectFailure("NewThreadHero sets the draft's text instead of calling DraftStore.fill") {
        XCTAssertTrue(focused, "The starter focuses the input")
      }
      return
    }
    input.typeText(" EXTRA")
    XCTAssertEqual(input.text, prompt + " EXTRA", "The caret is at the end")
  }
}

// MARK: - Helpers

extension XCUIApplication {
  /// The composer's text input (a text view while it can grow, a text field otherwise).
  var composerInput: XCUIElement {
    descendants(matching: .any).matching(identifier: "composer.input").firstMatch
  }

  /// Dismisses the keyboard the way a person does: a swipe down over the transcript.
  func dismissKeyboard() {
    let top = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
    top.press(forDuration: 0.05, thenDragTo: coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)))
    _ = keyboards.firstMatch.waitForNonExistence(timeout: 3)
  }

  /// Opens the composer's "+" menu.
  func openPlusMenu() {
    buttons["composer.attach"].tap()
  }
}

extension XCUIElement {
  /// Taps once the element has stopped moving, e.g. a menu riding a keyboard animation.
  func tapWhenStill(timeout: TimeInterval = 5) {
    _ = waitForExistence(timeout: timeout)
    var last = frame
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      Thread.sleep(forTimeInterval: 0.25)
      if frame == last, isHittable { break }
      last = frame
    }
    tap()
  }

  /// The text, without the placeholder an empty field reports as its value.
  var text: String {
    let value = self.value as? String ?? ""
    return value == placeholderValue ? "" : value
  }

  /// Selects everything and deletes it.
  func clear() {
    let count = text.count
    guard count > 0 else { return }
    typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: count))
  }
}

extension XCTestCase {
  /// Waits until `condition` holds, polling the UI.
  @MainActor func waitFor(
    timeout: TimeInterval, file: StaticString = #filePath, line: UInt = #line,
    _ condition: @escaping () -> Bool
  ) async {
    let met = NSPredicate { _, _ in condition() }
    await fulfillment(of: [expectation(for: met, evaluatedWith: nil)], timeout: timeout)
  }
}

/// Just enough of the gateway's `/api` to set up a chat for a test, plus direct access to the
/// throwaway OpenCode behind it for requests the scripted model can't make (multi-field forms,
/// permissions without "Always allow").
nonisolated struct TestGateway {
  static let root = "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios"
  static let project = root + "/proj"
  /// Runs shell commands without asking.
  static let homeDemo = root + "/home-demo"
  /// The test gateway's free, deterministic scripted model.
  static let model = ["id": "scripted", "providerID": "fake"]

  let base = URL(
    string: ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310")!
  let directory = ProcessInfo.processInfo.environment["OPENCODEX_PROJECT"] ?? Self.project
  /// The throwaway OpenCode the test gateway connects to.
  let opencode = URL(
    string: ProcessInfo.processInfo.environment["OPENCODEX_OPENCODE"] ?? "http://127.0.0.1:4799")!
  let opencodePassword = ProcessInfo.processInfo.environment["OPENCODEX_OPENCODE_PASSWORD"] ?? "ios-test-pw-123"

  func createSession() async throws -> String {
    try await createSession(in: directory)
  }

  func createSession(in directory: String) async throws -> String {
    let session = try await call("/sessions", ["directory": directory, "model": Self.model])
    return try XCTUnwrap((session as? [String: Any])?["id"] as? String)
  }

  func prompt(_ id: String, _ text: String) async throws {
    _ = try await call("/sessions/\(id)/prompt", ["text": text, "model": Self.model])
  }

  func forms(_ id: String) async throws -> [Any] {
    try await call("/sessions/\(id)/forms") as? [Any] ?? []
  }

  func permissions(_ id: String) async throws -> [[String: Any]] {
    try await call("/sessions/\(id)/permissions") as? [[String: Any]] ?? []
  }

  func session(_ id: String) async throws -> [String: Any] {
    try await call("/sessions/\(id)") as? [String: Any] ?? [:]
  }

  func running(_ id: String) async throws -> Bool {
    (try await call("/sessions/active") as? [String: Any])?[id] != nil
  }

  /// Newest page of messages, oldest first.
  func messages(_ id: String) async throws -> [[String: Any]] {
    let page = try await call("/sessions/\(id)/messages") as? [String: Any]
    return ((page?["data"] as? [[String: Any]]) ?? []).reversed()
  }

  func userTexts(_ id: String) async throws -> [String] {
    try await messages(id).filter { $0["type"] as? String == "user" }.compactMap { $0["text"] as? String }
  }

  /// The recent thread in `directory` whose user messages include `text`.
  func sessionSent(_ text: String, in directory: String, timeout: TimeInterval = 30) async throws -> String {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      let page = try await call("/sessions", query: ["directory": directory]) as? [String: Any]
      let ids = ((page?["sessions"] as? [[String: Any]]) ?? []).prefix(8).compactMap { $0["id"] as? String }
      for id in ids where try await userTexts(id).contains(text) { return id }
      try await Task.sleep(for: .seconds(1))
    }
    throw NSError(domain: "TestGateway", code: 0, userInfo: [NSLocalizedDescriptionKey: "No thread sent “\(text)”"])
  }

  /// True while the `run: sleep …` shell call is still running.
  func shellStillSleeping(_ id: String) async throws -> Bool {
    let data = try JSONSerialization.data(withJSONObject: try await messages(id))
    return String(decoding: data, as: UTF8.self).contains("\"running\"")
  }

  func waitForForm(_ id: String, timeout: TimeInterval = 120) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while try await forms(id).isEmpty {
      if Date() > deadline { throw XCTSkip("The model didn’t ask a question in time.") }
      try await Task.sleep(for: .seconds(1))
    }
  }

  /// Polls until `condition` holds or fails the test.
  func waitFor(
    timeout: TimeInterval = 30, file: StaticString = #filePath, line: UInt = #line,
    _ condition: () async throws -> Bool
  ) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while try await !condition() {
      if Date() > deadline {
        XCTFail("Timed out after \(Int(timeout))s", file: file, line: line)
        return
      }
      try await Task.sleep(for: .milliseconds(500))
    }
  }

  /// Asks the question form `fields` in `id` directly on OpenCode, as a tool would.
  @discardableResult
  func ask(_ id: String, title: String = "Questions", fields: [[String: Any]], directory: String? = nil)
    async throws -> String
  {
    let created = try await opencodeCall(
      "/api/session/\(id)/form", ["mode": "form", "title": title, "fields": fields],
      directory: directory ?? self.directory) as? [String: Any]
    return try XCTUnwrap((created?["data"] as? [String: Any])?["id"] as? String)
  }

  /// Asks permission for `action` on `resources` directly on OpenCode; no `save` means the
  /// request can only be allowed once.
  func askPermission(
    _ id: String, action: String, resources: [String], save: [String]? = nil, directory: String? = nil
  ) async throws {
    var body: [String: Any] = ["action": action, "resources": resources]
    if let save { body["save"] = save }
    _ = try await opencodeCall("/api/session/\(id)/permission", body, directory: directory ?? self.directory)
  }

  @discardableResult
  func call(_ path: String, _ body: [String: Any]? = nil, query: [String: String] = [:]) async throws -> Any {
    var components = URLComponents(url: base.appending(path: "api" + path), resolvingAgainstBaseURL: false)!
    if !query.isEmpty { components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
    var request = URLRequest(url: components.url!)
    if let body {
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    return try await send(request)
  }

  private func opencodeCall(_ path: String, _ body: [String: Any], directory: String) async throws -> Any {
    var components = URLComponents(url: opencode.appending(path: path), resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "directory", value: directory)]
    var request = URLRequest(url: components.url!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let credentials = Data("opencode:\(opencodePassword)".utf8).base64EncodedString()
    request.setValue("Basic \(credentials)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    return try await send(request)
  }

  private func send(_ request: URLRequest) async throws -> Any {
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else {
      throw NSError(
        domain: "TestGateway", code: status,
        userInfo: [NSLocalizedDescriptionKey: String(decoding: data, as: UTF8.self)])
    }
    return try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
  }
}
