import XCTest

/// The permission card and the question dock that take the composer's place.
nonisolated final class ComposerRequestTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  // MARK: Permission card

  /// Allow once runs the shell command the project asks about.
  @MainActor func testAllowOnceRunsTheCommand() async throws {
    let gateway = TestGateway()
    let marker = "qa-once-\(UUID().uuidString.prefix(6).lowercased())"
    let session = try await gateway.createSession()
    try await gateway.prompt(session, "run: echo \(marker)")
    try await gateway.waitFor { try await !gateway.permissions(session).isEmpty }
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let card = app.descendants(matching: .any)["request.permission"]
    XCTAssertTrue(card.waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["echo \(marker)"].exists, "The card shows the command")
    XCTAssertTrue(app.buttons["permission.always"].exists, "Shell requests offer Always allow")
    app.buttons["permission.once"].tap()
    XCTAssertTrue(card.waitForNonExistence(timeout: 15))
    try await gateway.waitFor(timeout: 60) {
      let data = try JSONSerialization.data(withJSONObject: try await gateway.messages(session))
      return String(decoding: data, as: UTF8.self).contains("The tool returned:\\n\\n```\\n\(marker)")
    }
  }

  /// Always allow shows only when the request names patterns to save; Reject declines.
  @MainActor func testAlwaysAllowOnlyWhenOfferedAndReject() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    // A unique pattern, so saving it can't change what other tests' requests ask.
    let pattern = "qa-always-\(UUID().uuidString.prefix(6).lowercased())"
    try await gateway.askPermission(session, action: "shell", resources: ["\(pattern) --once-only"])
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let card = app.descendants(matching: .any)["request.permission"]
    XCTAssertTrue(card.waitForExistence(timeout: 15))
    XCTAssertFalse(app.buttons["permission.always"].exists, "Nothing to save: allow once only")
    app.buttons["permission.reject"].tap()
    XCTAssertTrue(card.waitForNonExistence(timeout: 15))
    try await gateway.waitFor { try await gateway.permissions(session).isEmpty }

    try await gateway.askPermission(session, action: "shell", resources: [pattern], save: [pattern])
    XCTAssertTrue(card.waitForExistence(timeout: 15))
    let always = app.buttons["permission.always"]
    XCTAssertTrue(always.exists, "A request with patterns to save offers Always allow")
    always.tap()
    XCTAssertTrue(card.waitForNonExistence(timeout: 15))
    try await gateway.waitFor { try await gateway.permissions(session).isEmpty }
  }

  /// An edit shows its diff, collapsed to eight lines until expanded.
  @MainActor func testEditDiffExpandsAndReject() async throws {
    let gateway = TestGateway()
    let name = "qa-diff-\(UUID().uuidString.prefix(6).lowercased()).md"
    let lines = (1...12).map { "line \($0)" }.joined(separator: "\n")
    let session = try await gateway.createSession()
    try await gateway.prompt(session, "write \(name): \(lines)")
    try await gateway.waitFor { try await !gateway.permissions(session).isEmpty }
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let card = app.descendants(matching: .any)["request.permission"]
    XCTAssertTrue(card.waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts[name].exists, "The diff names the file")
    let more = app.buttons["Show 4 more lines"]
    XCTAssertTrue(more.exists)
    more.tap()
    let less = app.buttons["Show less"]
    XCTAssertTrue(less.waitForExistence(timeout: 3))
    less.tap()
    XCTAssertTrue(more.waitForExistence(timeout: 3))

    app.buttons["permission.reject"].tap()
    XCTAssertTrue(card.waitForNonExistence(timeout: 15))
    try await Task.sleep(for: .seconds(2))
    XCTAssertFalse(
      FileManager.default.fileExists(atPath: TestGateway.project + "/" + name), "A rejected edit isn't written")
  }

  // MARK: Question dock

  /// The scripted model's single-choice question: pick, review, send.
  @MainActor func testSingleChoiceQuestion() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    try await gateway.prompt(session, "ask: Which color do you prefer?")
    try await gateway.waitForForm(session)
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let dock = app.descendants(matching: .any)["request.question"]
    XCTAssertTrue(dock.waitForExistence(timeout: 15))
    XCTAssertFalse(app.composerInput.exists, "The question takes the composer's place")
    XCTAssertTrue(app.staticTexts["Which color do you prefer?"].exists)
    app.buttons["Blue"].tap()
    XCTAssertTrue(app.buttons["Blue"].isSelected)
    app.buttons["Red"].tap()
    XCTAssertTrue(app.buttons["Red"].isSelected)
    XCTAssertFalse(app.buttons["Blue"].isSelected, "One answer only")

    let submit = app.buttons["question.submit"]
    XCTAssertEqual(submit.label, "Review answers")
    submit.tap()
    XCTAssertTrue(app.staticTexts["Check your answers before sending"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["Red"].exists, "The review shows the answer")
    XCTAssertEqual(submit.label, "Send answers")
    submit.tap()
    XCTAssertTrue(dock.waitForNonExistence(timeout: 15))
    XCTAssertTrue(app.composerInput.waitForExistence(timeout: 5), "The composer comes back")
    try await gateway.waitFor { try await gateway.forms(session).isEmpty }
  }

  /// Several choices, a typed answer, Next / Back / Review, and the review's Back.
  @MainActor func testMultipleChoiceCustomAnswerAndNavigation() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    try await gateway.ask(
      session, title: "Setup",
      fields: [
        [
          "key": "langs", "type": "multiselect", "title": "Languages", "description": "Which languages?",
          "options": [
            ["value": "swift", "label": "Swift"], ["value": "ts", "label": "TypeScript"],
            ["value": "go", "label": "Go"],
          ],
          "custom": true,
        ],
        ["key": "name", "type": "string", "title": "Name", "description": "Project name?"],
      ])
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let dock = app.descendants(matching: .any)["request.question"]
    XCTAssertTrue(dock.waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["Question 1 of 2"].exists)
    XCTAssertTrue(app.staticTexts["Select one or more answers"].exists)
    app.buttons["Swift"].tap()
    app.buttons["Go"].tap()
    XCTAssertTrue(app.buttons["Swift"].isSelected && app.buttons["Go"].isSelected, "Several answers")
    app.buttons["Type your own answer"].tap()
    let custom = app.descendants(matching: .any).matching(identifier: "question.input.langs").firstMatch
    XCTAssertTrue(custom.waitForExistence(timeout: 3))
    custom.tap()
    custom.typeText("Rust")

    let submit = app.buttons["question.submit"]
    XCTAssertEqual(submit.label, "Next")
    submit.tap()
    XCTAssertTrue(app.staticTexts["Question 2 of 2"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["Project name?"].exists)

    // Back keeps the first answers.
    app.buttons["question.back"].tap()
    XCTAssertTrue(app.staticTexts["Question 1 of 2"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.buttons["Swift"].isSelected && app.buttons["Go"].isSelected)
    XCTAssertEqual(custom.text, "Rust")
    submit.tap()

    let name = app.descendants(matching: .any).matching(identifier: "question.input.name").firstMatch
    XCTAssertTrue(name.waitForExistence(timeout: 3))
    name.tap()
    name.typeText("Phone")
    XCTAssertEqual(submit.label, "Review answers")
    submit.tap()
    XCTAssertTrue(app.staticTexts["Review answers"].waitForExistence(timeout: 3))
    for value in ["Swift", "Go", "Rust", "Phone"] {
      XCTAssertTrue(app.staticTexts[value].exists, "The review lists \(value)")
    }
    app.buttons["question.back"].tap()
    XCTAssertTrue(app.staticTexts["Question 2 of 2"].waitForExistence(timeout: 3))
    submit.tap()
    XCTAssertEqual(submit.label, "Send answers")
    submit.tap()
    XCTAssertTrue(dock.waitForNonExistence(timeout: 15))
    try await gateway.waitFor { try await gateway.forms(session).isEmpty }
  }

  /// With several questions pending, the dock says so; Dismiss moves on to the next.
  @MainActor func testDismissAndSeveralPendingQuestions() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    let field: (String) -> [String: Any] = { question in
      [
        "key": "q", "type": "string", "title": "Pick", "description": question,
        "options": [["value": "yes", "label": "Yes"], ["value": "no", "label": "No"]],
      ]
    }
    try await gateway.ask(session, fields: [field("First question?")])
    try await gateway.ask(session, fields: [field("Second question?")])
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let dock = app.descendants(matching: .any)["request.question"]
    XCTAssertTrue(dock.waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["First question?"].exists)
    XCTAssertTrue(app.staticTexts["1 more pending"].exists)

    app.buttons["question.dismiss"].tap()
    XCTAssertTrue(app.staticTexts["Second question?"].waitForExistence(timeout: 10), "The next question shows")
    XCTAssertFalse(app.staticTexts["1 more pending"].exists)
    try await gateway.waitFor { try await gateway.forms(session).count == 1 }

    app.buttons["Yes"].tap()
    app.buttons["question.submit"].tap()
    app.buttons["question.submit"].tap()
    XCTAssertTrue(dock.waitForNonExistence(timeout: 15))
    try await gateway.waitFor { try await gateway.forms(session).isEmpty }
  }
}
