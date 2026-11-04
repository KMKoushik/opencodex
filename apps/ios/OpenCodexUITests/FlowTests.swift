import XCTest

/// The whole loop through the real UI: threads → new chat → send → approve the edit → reply.
/// The test project asks before edits, so the file exists only if the approval went through.
nonisolated final class FlowTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testNewChatApprovesAnEditAndReplies() throws {
    let name = "flow-\(UUID().uuidString.prefix(8).lowercased()).md"
    let file = URL(fileURLWithPath: TestGateway.project).appending(path: name)
    let app = XCUIApplication.opencodex()
    app.launch()

    app.buttons["new-chat"].tap()
    let project = app.buttons["project-proj"]
    XCTAssertTrue(project.waitForExistence(timeout: 10))
    project.tap()
    XCTAssertTrue(app.descendants(matching: .any)["chat.new"].waitForExistence(timeout: 10))

    let input =
      app.textViews["composer.input"].exists
      ? app.textViews["composer.input"] : app.textFields["composer.input"]
    input.tap()
    // The test server's scripted model writes the file with its write tool.
    input.typeText("write \(name): hello from the phone")
    app.buttons["composer.send"].tap()

    let card = app.descendants(matching: .any)["request.permission"]
    XCTAssertTrue(card.waitForExistence(timeout: 90), "The edit should ask for approval")
    app.buttons["permission.once"].tap()
    XCTAssertTrue(card.waitForNonExistence(timeout: 20))

    let written = NSPredicate { _, _ in FileManager.default.fileExists(atPath: file.path) }
    wait(for: [expectation(for: written, evaluatedWith: nil)], timeout: 90)
    XCTAssertEqual(
      try String(contentsOf: file, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
      "hello from the phone")

    // The agent may ask again (e.g. to `cat` the file); approve until the reply finishes,
    // when Send replaces Stop and the turn header settles.
    let deadline = Date.now.addingTimeInterval(120)
    // Send stays beside Stop, as on the desktop, so wait for Stop to go away.
    while app.buttons["composer.stop"].exists, Date.now < deadline {
      if card.exists, app.buttons["permission.once"].isHittable { app.buttons["permission.once"].tap() }
      _ = app.buttons["composer.stop"].waitForNonExistence(timeout: 2)
    }
    XCTAssertFalse(app.buttons["composer.stop"].exists, "The reply should finish")
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Worked for'")).firstMatch
        .waitForExistence(timeout: 90))

    // The chat's "…" menu is the desktop's thread menu.
    app.buttons["chat.actions"].tap()
    XCTAssertTrue(app.buttons["Rename thread"].waitForExistence(timeout: 5))
    try? FileManager.default.removeItem(at: file)
  }

  /// Choosing New worktree under a new chat's composer moves the chat before its first prompt.
  @MainActor func testNewChatStartsInAWorktree() async throws {
    let root = "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios/long-transcript"
    let title = "Worktree \(UUID().uuidString.prefix(6))"
    let app = XCUIApplication.opencodex()
    app.launch()
    app.buttons["new-chat"].tap()
    let project = app.buttons["project-long-transcript"]
    XCTAssertTrue(project.waitForExistence(timeout: 10))
    project.tap()

    let mode = app.buttons["newThread.workspace.mode"]
    XCTAssertTrue(mode.waitForExistence(timeout: 10))
    mode.tap()
    app.buttons["New worktree"].tap()
    let input =
      app.textViews["composer.input"].exists
      ? app.textViews["composer.input"] : app.textFields["composer.input"]
    input.tap()
    input.typeText("Reply with exactly: \(title)")
    app.buttons["composer.send"].tap()

    // The newest chat now lives in a worktree, not the project folder.
    let gateway = TestGateway()
    var directory: String?
    for _ in 0..<30 where directory == nil {
      try await Task.sleep(for: .seconds(1))
      let page = try await gateway.call("/session-search") as? [String: Any]
      let newest = (page?["sessions"] as? [[String: Any]])?.first
      if let dir = newest?["directory"] as? String, dir != root { directory = dir }
    }
    let moved = try XCTUnwrap(directory, "The chat should move into a new worktree")
    XCTAssertTrue(FileManager.default.fileExists(atPath: moved + "/.git"))
  }
}
