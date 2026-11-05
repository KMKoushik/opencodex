import XCTest

/// The chat's chrome: the full Session details sheet, and the new-thread hero (project picker,
/// starters, Local/worktree with its branch picker, and starting in a worktree).
nonisolated final class ChromeTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  /// Context, project, checkout and branch, the changes row (opens Changes), subagents (opens
  /// the list), MCP and Skills expanding and collapsing, and the large detent.
  @MainActor func testSessionDetailsSheet() async throws {
    let id = try await threadWithSubagent()
    let app = XCUIApplication.opencodex(["-session", id])
    app.launch()

    let info = app.buttons["chat.details"]
    XCTAssertTrue(info.waitForExistence(timeout: 15))
    info.tap()
    let row = app.buttons["sheet.details"]
    for _ in 0..<6 where !(row.exists && row.isHittable) { app.collectionViews.firstMatch.swipeUp() }
    row.tap()

    let context = app.descendants(matching: .any)["details.context"]
    XCTAssertTrue(context.waitForExistence(timeout: 10))
    let header = app.descendants(matching: .any)["details.header"]
    XCTAssertTrue(header.label.contains("Session details"), header.label)
    XCTAssertTrue(header.label.contains("home-demo"), header.label)
    XCTAssertTrue(app.descendants(matching: .any)["details.branch"].waitForExistence(timeout: 10))
    Panels.shot("details-medium")
    // Drag the sheet up to the large detent; MCP and Skills sit below the medium one.
    header.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
      .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)))
    let skills = app.buttons["details.skills"]
    if !skills.waitForExistence(timeout: 5) { app.swipeUp() }
    XCTAssertTrue(skills.waitForExistence(timeout: 10))
    let note = app.staticTexts["Available to this project, not necessarily loaded into this conversation."]
    XCTAssertFalse(note.exists, "Sections start collapsed")

    // MCP and Skills expand and collapse.
    let mcp = app.buttons["details.mcp"]
    mcp.tap()
    let servers = app.staticTexts.matching(
      NSPredicate(format: "label == 'No MCP servers configured.' OR label IN {'Connected', 'Disabled', 'Failed', 'Needs sign-in'}"))
    XCTAssertTrue(servers.firstMatch.waitForExistence(timeout: 10), "MCP shows its servers")
    skills.tap()
    XCTAssertTrue(note.waitForExistence(timeout: 5))
    Panels.shot("details-large")
    skills.tap()
    XCTAssertTrue(note.waitForNonExistence(timeout: 5), "Skills collapse again")
    mcp.tap()

    // Usage appears only with a cost; the free scripted model has none.
    XCTAssertFalse(app.buttons["details.usage"].exists)

    // The changes row opens the workspace on Changes.
    let changes = app.buttons["details.changes"]
    if !changes.isHittable { app.swipeDown() }
    XCTAssertTrue(changes.waitForExistence(timeout: 10), "home-demo has uncommitted files")
    XCTAssertTrue(changes.label.contains("changed"), changes.label)
    changes.tap()
    XCTAssertTrue(app.navigationBars["Changes"].waitForExistence(timeout: 10))
    app.buttons["workspace-close"].tap()

    // The subagents row opens the subagents list. Session details opens from the thread sheet.
    info.tap()
    for _ in 0..<6 where !(row.exists && row.isHittable) { app.collectionViews.firstMatch.swipeUp() }
    row.tap()
    XCTAssertTrue(header.waitForExistence(timeout: 10))
    header.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
      .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)))
    let subagents = app.descendants(matching: .any)["details.subagents"]
    XCTAssertTrue(subagents.waitForExistence(timeout: 10))
    XCTAssertTrue(subagents.label.contains("Subagents"), subagents.label)
    subagents.tap()
    XCTAssertTrue(app.navigationBars["Subagents"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["subagents.row"].firstMatch.waitForExistence(timeout: 10))
  }

  /// The project picker moves the draft, starters fill it without sending, Local/New worktree
  /// and the starting branch switch, and sending starts the chat in a new worktree.
  @MainActor func testNewThreadHeroAndWorktree() async throws {
    let root = Panels.root + "/long-transcript"
    let title = "Worktree \(UUID().uuidString.prefix(6))"
    let app = XCUIApplication.opencodex()
    app.launch()
    app.buttons["new-chat"].tap()
    let project = app.descendants(matching: .any)["project-long-transcript"]
    XCTAssertTrue(project.waitForExistence(timeout: 10))
    project.tap()

    XCTAssertTrue(app.descendants(matching: .any)["chat.new"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["What should we build?"].exists)
    XCTAssertTrue(app.buttons["Project: long-transcript"].exists)
    Panels.shot("new")

    // Starters fill the draft; the next one replaces it.
    let input = XCUIElement.composer(app)
    app.buttons["starter.flask"].tap()
    let flask = await Panels.waitUntil(timeout: 5) {
      (input.value as? String)?.hasPrefix("Run the tests, find the failing one") == true
    }
    XCTAssertTrue(flask)
    app.buttons["starter.book"].tap()
    let book = await Panels.waitUntil(timeout: 5) {
      (input.value as? String)?.hasPrefix("Explain how this repo is put together") == true
    }
    XCTAssertTrue(book)
    Panels.shot("new-starter")

    // The project picker moves the draft to another project and back.
    app.buttons["newThread.project"].tap()
    let other = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'proj'")).firstMatch
    XCTAssertTrue(other.waitForExistence(timeout: 5))
    other.tap()
    XCTAssertTrue(app.buttons["Project: proj"].waitForExistence(timeout: 5))
    let carried = await Panels.waitUntil(timeout: 5) {
      (XCUIElement.composer(app).value as? String)?.hasPrefix("Explain how this repo") == true
    }
    XCTAssertTrue(carried, "The draft follows the project")
    app.buttons["newThread.project"].tap()
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'long-transcript'")).firstMatch.tap()
    XCTAssertTrue(app.buttons["Project: long-transcript"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["chat.details"].exists, "Nothing was sent")

    // Local → New worktree shows the starting branch; Local again hides it.
    let mode = app.buttons["newThread.workspace.mode"]
    XCTAssertTrue(mode.waitForExistence(timeout: 10))
    XCTAssertTrue(mode.label.contains("Local"), mode.label)
    mode.tap()
    app.buttons["New worktree"].tap()
    XCTAssertTrue(mode.label.contains("New worktree"), mode.label)
    let branch = app.buttons["newThread.workspace.branch"]
    XCTAssertTrue(branch.waitForExistence(timeout: 5))
    branch.tap()
    let master = app.buttons["master"]
    XCTAssertTrue(master.waitForExistence(timeout: 10), "The branch list loads")
    master.tap()
    let picked = await Panels.waitUntil(timeout: 5) { (branch.value as? String) == "master" }
    XCTAssertTrue(picked, "\(branch.value ?? "")")
    Panels.shot("new-worktree")
    mode.tap()
    app.buttons["Local"].tap()
    XCTAssertTrue(branch.waitForNonExistence(timeout: 5))
    mode.tap()
    app.buttons["New worktree"].tap()

    // Sending moves the chat into a new worktree before its first prompt.
    let composer = XCUIElement.composer(app)
    composer.tap()
    composer.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 200))
    composer.typeText("Reply with exactly: \(title)")
    app.buttons["composer.send"].tap()
    XCTAssertTrue(app.buttons["chat.details"].waitForExistence(timeout: 60), "The chat starts")

    let gateway = TestGateway()
    var directory: String?
    for _ in 0..<30 where directory == nil {
      try await Task.sleep(for: .seconds(1))
      // Found by its prompt: other agents create chats on this gateway too.
      let page = try await gateway.get("/session-search", ["search": title]) as? [String: Any]
      let match = (page?["sessions"] as? [[String: Any]])?.first
      if let dir = match?["directory"] as? String, dir != root { directory = dir }
    }
    let moved = try XCTUnwrap(directory, "The chat should move into a new worktree")
    XCTAssertTrue(FileManager.default.fileExists(atPath: moved + "/.git"))
  }

  // MARK: Helpers

  /// A home-demo thread that ran a subagent; made once with the scripted model if missing.
  private func threadWithSubagent() async throws -> String {
    let gateway = TestGateway()
    let page = try await gateway.get("/session-search", ["search": "Subagent research"])
    let sessions = (page as? [String: Any])?["sessions"] as? [[String: Any]] ?? []
    if let found = sessions.first(where: {
      ($0["title"] as? String) == "Subagent research" && ($0["directory"] as? String) == Panels.homeDemo
    })?["id"] as? String {
      return found
    }
    let id = try await gateway.createSession(in: Panels.homeDemo, title: "Subagent research")
    try await gateway.prompt(id, "subagent: echo from-child")
    try await gateway.waitIdle(id, timeout: 120)
    return id
  }
}
