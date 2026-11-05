import XCTest

/// The `/` menu and every thread action it runs, plus a skill and a server command.
nonisolated final class ComposerSlashTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  /// A thread with one finished exchange, open on screen.
  @MainActor private func openThread(_ prompt: String = "Say hello") async throws -> (TestGateway, String, XCUIApplication) {
    let gateway = TestGateway()
    let session = try await gateway.createSession(in: TestGateway.homeDemo)
    try await gateway.prompt(session, prompt)
    try await gateway.waitFor { try await gateway.messages(session).contains { $0["type"] as? String == "assistant" } }
    try await gateway.waitFor { try await !gateway.running(session) }
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()
    XCTAssertTrue(app.composerInput.waitForExistence(timeout: 15))
    return (gateway, session, app)
  }

  @MainActor private func run(_ app: XCUIApplication, _ command: String) {
    let input = app.composerInput
    input.tap()
    input.clear()
    input.typeText(command)
    app.buttons["composer.send"].tap()
  }

  /// `/` lists the thread actions, then skills, then the server's commands; typing filters, and
  /// choosing one fills it in. `/rename` renames the thread.
  @MainActor func testMenuAndRename() async throws {
    let (gateway, session, app) = try await openThread()
    let input = app.composerInput
    input.tap()
    input.typeText("/")
    let menu = app.descendants(matching: .any)["composer.menu"]
    XCTAssertTrue(menu.waitForExistence(timeout: 5))
    for name in ["undo", "redo", "fork", "new", "compact", "rename", "export"] {
      XCTAssertTrue(app.buttons["menu.\(name)"].exists, "/\(name) is listed")
    }
    // Skills and server commands load with the menu.
    XCTAssertTrue(app.buttons["menu.review"].waitForExistence(timeout: 10), "Server commands are listed")
    XCTAssertTrue(app.buttons["menu.OpenCode"].exists, "Skills are listed")

    input.typeText("ren")
    XCTAssertTrue(app.buttons["menu.rename"].exists)
    XCTAssertFalse(app.buttons["menu.undo"].exists, "Typing filters the menu")
    app.buttons["menu.rename"].tapWhenStill()
    XCTAssertEqual(input.text, "/rename ")
    XCTAssertTrue(menu.waitForNonExistence(timeout: 2), "Choosing closes the menu")
    let title = "Renamed \(UUID().uuidString.prefix(6))"
    input.typeText(title)
    app.buttons["composer.send"].tap()
    XCTAssertTrue(app.navigationBars.staticTexts[title].waitForExistence(timeout: 15))
    let renamed = try await gateway.session(session)["title"] as? String
    XCTAssertEqual(renamed, title)
    XCTAssertEqual(input.text, "", "The command clears the draft")
  }

  /// `/undo` hides the last turn and puts its prompt back in the composer; `/redo` restores it.
  @MainActor func testUndoThenRedo() async throws {
    let (gateway, session, app) = try await openThread("Undo this message with several extra words")
    let bubble = app.staticTexts["Undo this message with several extra words"]
    XCTAssertTrue(bubble.waitForExistence(timeout: 10))

    run(app, "/undo")
    await waitFor(timeout: 15) { app.composerInput.text == "Undo this message with several extra words" }
    XCTAssertTrue(bubble.waitForNonExistence(timeout: 10), "The undone turn is hidden")
    try await gateway.waitFor { try await gateway.session(session)["revert"] != nil }
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "The restored prompt is focused")

    run(app, "/redo")
    XCTAssertTrue(bubble.waitForExistence(timeout: 15), "Redo brings the turn back")
    try await gateway.waitFor { try await gateway.session(session)["revert"] == nil }
    XCTAssertEqual(app.composerInput.text, "")
  }

  @MainActor func testCompact() async throws {
    let (gateway, session, app) = try await openThread()
    run(app, "/compact")
    try await gateway.waitFor {
      try await gateway.messages(session).contains { $0["type"] as? String == "compaction" }
    }
    await waitFor(timeout: 10) { app.composerInput.text.isEmpty }
    XCTAssertFalse(app.descendants(matching: .any)["composer.error"].exists)
  }

  /// `/fork` asks where to fork from: the latest state, or just before an earlier message.
  /// Either opens the new thread.
  @MainActor func testForkFromLatestAndBeforeAMessage() async throws {
    let (gateway, session, app) = try await openThread("Fork source")

    run(app, "/fork")
    let latest = app.buttons["Fork from latest"]
    XCTAssertTrue(latest.waitForExistence(timeout: 5), "/fork asks where to fork from")
    XCTAssertTrue(app.buttons["Before: Fork source"].exists)
    latest.tap()
    let first = try await gateway.fork(of: session, count: 1)
    let kept = try await gateway.userTexts(first[0])
    XCTAssertTrue(kept.contains("Fork source"), "Latest keeps the history")
    // The fork opens; the source thread's draft is clear.
    try await waitForOpen(app, gateway, first[0])

    app.navigationBars.buttons.element(boundBy: 0).tap()
    run(app, "/fork")
    let before = app.buttons["Before: Fork source"]
    XCTAssertTrue(before.waitForExistence(timeout: 5))
    before.tap()
    let both = try await gateway.fork(of: session, count: 2)
    let second = try XCTUnwrap(both.first { $0 != first[0] })
    let texts = try await gateway.userTexts(second)
    XCTAssertFalse(texts.contains("Fork source"), "Forking before the message leaves it out")
    try await waitForOpen(app, gateway, second)
  }

  /// `/export` shares the thread as Markdown.
  @MainActor func testExportOpensTheShareSheet() async throws {
    let (_, _, app) = try await openThread()
    run(app, "/export")
    let share = app.descendants(matching: .any)["ActivityListView"]
    let copy = app.buttons["Copy"]
    let saveToFiles = app.descendants(matching: .any)["Save to Files"]
    let shown = NSPredicate { _, _ in share.exists || copy.exists || saveToFiles.exists }
    await fulfillment(of: [expectation(for: shown, evaluatedWith: nil)], timeout: 15)
    XCTAssertEqual(app.composerInput.text, "")
  }

  /// `/new` opens a new thread in the same project.
  @MainActor func testNewOpensANewThread() async throws {
    let (_, _, app) = try await openThread()
    run(app, "/new")
    XCTAssertTrue(app.descendants(matching: .any)["chat.new"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["newThread.project"].exists)
  }

  /// A skill and a server command go out with the prompt; the scripted model answers.
  @MainActor func testSkillAndServerCommand() async throws {
    let (gateway, session, app) = try await openThread()
    let before = try await gateway.userTexts(session).count

    run(app, "/OpenCode what is a session")
    try await gateway.waitFor {
      try await gateway.messages(session).contains { message in
        message["type"] as? String == "user" && message["text"] as? String == "what is a session"
          && (message["skills"] as? [[String: Any]])?.first?["id"] as? String == "opencode"
      }
    }
    try await gateway.waitFor(timeout: 60) { try await !gateway.running(session) }

    run(app, "/review")
    // The server expands the command's template into the prompt.
    try await gateway.waitFor {
      try await gateway.userTexts(session).dropFirst(before + 1).contains { $0.contains("code reviewer") }
    }
    XCTAssertFalse(app.descendants(matching: .any)["composer.error"].exists)
  }

  @MainActor private func waitForOpen(_ app: XCUIApplication, _ gateway: TestGateway, _ id: String) async throws {
    let title = try await gateway.session(id)["title"] as? String ?? ""
    XCTAssertTrue(
      app.navigationBars.staticTexts[title].waitForExistence(timeout: 15), "The fork “\(title)” opens")
  }
}

extension TestGateway {
  /// Waits for `count` forks of `id`, newest first.
  func fork(of id: String, count: Int, timeout: TimeInterval = 30) async throws -> [String] {
    let directory = try await session(id)["location"].flatMap { ($0 as? [String: Any])?["directory"] as? String }
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      let page = try await call("/sessions", query: ["directory": directory ?? Self.homeDemo]) as? [String: Any]
      var forks: [String] = []
      for row in ((page?["sessions"] as? [[String: Any]]) ?? []).prefix(12) {
        guard let candidate = row["id"] as? String, candidate != id else { continue }
        let info = try await session(candidate)
        if (info["fork"] as? [String: Any])?["sessionID"] as? String == id { forks.append(candidate) }
      }
      if forks.count >= count { return forks }
      try await Task.sleep(for: .seconds(1))
    }
    throw NSError(domain: "TestGateway", code: 0, userInfo: [NSLocalizedDescriptionKey: "No fork of \(id)"])
  }
}
