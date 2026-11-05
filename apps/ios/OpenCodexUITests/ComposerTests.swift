import XCTest

/// Composer and request-card flows against the live loopback gateway.
nonisolated final class ComposerTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testAnsweringAQuestionRemovesItsCard() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    try await gateway.prompt(session, "ask: Which color do you prefer?")
    try await gateway.waitForForm(session)
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let card = app.descendants(matching: .any)["request.question"]
    XCTAssertTrue(card.waitForExistence(timeout: 15))
    app.buttons["Blue"].tap()
    XCTAssertTrue(app.buttons["Blue"].isSelected)
    // Like the desktop: Next/Review answers until the review, then Send answers.
    let submit = app.buttons["question.submit"]
    for _ in 0..<6 where card.exists {
      submit.tap()
      if submit.label == "Send answers" {
        submit.tap()
        break
      }
    }
    XCTAssertTrue(card.waitForNonExistence(timeout: 15))
  }

  @MainActor func testSendingClearsTheComposer() async throws {
    let session = try await TestGateway().createSession()
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let input = app.textViews["composer.input"].exists
      ? app.textViews["composer.input"] : app.textFields["composer.input"]
    XCTAssertTrue(input.waitForExistence(timeout: 15))
    input.tap()
    input.typeText("Reply with the single word ok")
    app.buttons["composer.send"].tap()
    let cleared = NSPredicate { _, _ in
      let value = input.value as? String ?? ""
      return value.isEmpty || value == "Message"
    }
    await fulfillment(of: [expectation(for: cleared, evaluatedWith: nil)], timeout: 15)
  }

  /// `/` opens the desktop's command menu; `/rename` runs as a thread action, no model needed.
  @MainActor func testSlashRenameRenamesTheThread() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let input = app.textViews["composer.input"].exists
      ? app.textViews["composer.input"] : app.textFields["composer.input"]
    XCTAssertTrue(input.waitForExistence(timeout: 15))
    input.tap()
    input.typeText("/ren")
    let rename = app.buttons["menu.rename"]
    XCTAssertTrue(rename.waitForExistence(timeout: 5))
    rename.tap()
    let title = "Renamed \(UUID().uuidString.prefix(6))"
    input.typeText(title)
    app.buttons["composer.send"].tap()
    XCTAssertTrue(app.navigationBars.staticTexts[title].waitForExistence(timeout: 15))
    let info = try await gateway.call("/sessions/\(session)") as? [String: Any]
    XCTAssertEqual(info?["title"] as? String, title)
  }
}

/// Just enough of the gateway's `/api` to set up a chat for a test.
nonisolated struct TestGateway {
  static let project = "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios/proj"
  /// The test gateway's free, deterministic scripted model.
  static let model = ["id": "scripted", "providerID": "fake"]

  let base = URL(
    string: ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310")!
  let directory = ProcessInfo.processInfo.environment["OPENCODEX_PROJECT"] ?? Self.project

  func createSession() async throws -> String {
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

  func waitForForm(_ id: String, timeout: TimeInterval = 120) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while try await forms(id).isEmpty {
      if Date() > deadline { throw XCTSkip("The model didn’t ask a question in time.") }
      try await Task.sleep(for: .seconds(1))
    }
  }

  @discardableResult
  func call(_ path: String, _ body: [String: Any]? = nil) async throws -> Any {
    var request = URLRequest(url: base.appending(path: "api" + path))
    if let body {
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
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
