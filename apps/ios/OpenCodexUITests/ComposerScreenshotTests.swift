import XCTest

/// Screenshots of every composer and request state in light, dark and Catppuccin Mocha, for
/// review against the desktop. Runs only with `TEST_RUNNER_QA_SHOTS=<folder>`.
nonisolated final class ComposerScreenshotTests: XCTestCase {
  private var folder: String?

  override func setUp() {
    continueAfterFailure = true
    folder = ProcessInfo.processInfo.environment["QA_SHOTS"]
  }

  private static let themes: [(String, String)] = [
    ("light", "{mode=light;light=opencodex-light;dark=opencodex-dark;}"),
    ("dark", "{mode=dark;light=opencodex-light;dark=opencodex-dark;}"),
    ("mocha", "{mode=dark;light=opencodex-light;dark=catppuccin-mocha;}"),
  ]

  @MainActor func testScreenshots() async throws {
    guard let folder else { throw XCTSkip("Set TEST_RUNNER_QA_SHOTS to a folder to take screenshots.") }
    try FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
    let gateway = TestGateway()

    // A chat with an answer, a running shell, a permission and a question.
    let chat = try await gateway.createSession(in: TestGateway.homeDemo)
    try await gateway.prompt(chat, "Say hello")
    try await gateway.waitFor { try await !gateway.running(chat) }
    let running = try await gateway.createSession(in: TestGateway.homeDemo)
    try await gateway.prompt(running, "run: sleep 200 && echo done")
    let edit = try await gateway.createSession()
    try await gateway.prompt(edit, "write qa-shot.md: " + (1...12).map { "line \($0)" }.joined(separator: "\n"))
    let shell = try await gateway.createSession()
    try await gateway.prompt(shell, "run: echo screenshot")
    let question = try await gateway.createSession()
    try await gateway.ask(
      question, title: "Setup",
      fields: [
        [
          "key": "langs", "type": "multiselect", "title": "Languages", "description": "Which languages?",
          "options": [
            ["value": "swift", "label": "Swift", "description": "Apps"],
            ["value": "ts", "label": "TypeScript", "description": "Web"],
          ],
          "custom": true,
        ],
        ["key": "name", "type": "string", "title": "Name", "description": "Project name?"],
      ])
    try await gateway.ask(question, fields: [["key": "q", "type": "string", "description": "Second?"]])
    try await gateway.waitFor(timeout: 60) {
      let edits = try await gateway.permissions(edit)
      let shells = try await gateway.permissions(shell)
      return !edits.isEmpty && !shells.isEmpty
    }

    for (theme, value) in Self.themes {
      func shot(_ app: XCUIApplication, _ name: String) {
        let path = "\(folder)/\(theme)-\(name).png"
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: path))
      }
      func launch(_ args: [String]) -> XCUIApplication {
        let app = XCUIApplication.opencodex(args + ["-theme", value])
        app.launch()
        return app
      }

      var app = launch(["-session", chat])
      XCTAssertTrue(app.composerInput.waitForExistence(timeout: 15))
      sleep(1)
      shot(app, "1-idle")
      app.composerInput.tap()
      sleep(1)
      shot(app, "2-focused")
      app.composerInput.typeText("Line one\nline two\nline three")
      shot(app, "3-multiline")
      app.composerInput.clear()
      app.composerInput.typeText("/")
      _ = app.descendants(matching: .any)["composer.menu"].waitForExistence(timeout: 5)
      _ = app.buttons["menu.review"].waitForExistence(timeout: 5)
      shot(app, "4-slash")
      app.composerInput.clear()
      app.composerInput.typeText("@READ")
      _ = app.buttons["menu.file:README.md"].waitForExistence(timeout: 10)
      shot(app, "5-mention")
      app.composerInput.clear()
      app.buttons["composer.model"].tap()
      _ = app.searchFields.firstMatch.waitForExistence(timeout: 5)
      sleep(1)
      shot(app, "6-model-picker")
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
      sleep(1)
      app.dismissKeyboard()
      app.openPlusMenu()
      sleep(1)
      shot(app, "7-plus-menu")
      app.buttons["Photo Library"].tap()
      let photo = app.images.matching(NSPredicate(format: "label BEGINSWITH 'Photo'")).firstMatch
      if photo.waitForExistence(timeout: 10) {
        photo.tap()
        if app.buttons["Add"].waitForExistence(timeout: 3) { app.buttons["Add"].tap() }
        _ = app.descendants(matching: .any)["Attached photo"].waitForExistence(timeout: 15)
        sleep(1)
        shot(app, "8-attachment")
      }

      app = launch(["-session", running])
      _ = app.buttons["composer.stop"].waitForExistence(timeout: 15)
      sleep(1)
      shot(app, "9-running")

      app = launch(["-session", edit])
      _ = app.descendants(matching: .any)["request.permission"].waitForExistence(timeout: 15)
      sleep(1)
      shot(app, "10-permission-edit")
      app.buttons["Show 4 more lines"].tap()
      sleep(1)
      shot(app, "11-permission-expanded")

      app = launch(["-session", shell])
      _ = app.descendants(matching: .any)["request.permission"].waitForExistence(timeout: 15)
      sleep(1)
      shot(app, "12-permission-shell")

      app = launch(["-session", question])
      _ = app.descendants(matching: .any)["request.question"].waitForExistence(timeout: 15)
      app.buttons["Swift"].tap()
      app.buttons["Type your own answer"].tap()
      sleep(1)
      shot(app, "13-question")
      app.dismissKeyboard()
      app.buttons["question.submit"].tap()
      app.buttons["question.submit"].tap()
      sleep(1)
      shot(app, "14-question-review")
    }
    _ = try? await gateway.call("/sessions/\(running)/interrupt", [:])
  }
}
