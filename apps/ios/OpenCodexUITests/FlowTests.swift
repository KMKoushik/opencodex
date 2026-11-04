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
    XCTAssertTrue(app.descendants(matching: .any)["transcript.empty"].waitForExistence(timeout: 10))

    let input =
      app.textViews["composer.input"].exists
      ? app.textViews["composer.input"] : app.textFields["composer.input"]
    input.tap()
    input.typeText("Create a file named \(name) containing exactly the line: hello from the phone")
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
    while !app.buttons["composer.send"].exists, Date.now < deadline {
      if card.exists, app.buttons["permission.once"].isHittable { app.buttons["permission.once"].tap() }
      _ = app.buttons["composer.send"].waitForExistence(timeout: 2)
    }
    XCTAssertTrue(app.buttons["composer.send"].exists, "The reply should finish")
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Worked for'")).firstMatch
        .waitForExistence(timeout: 90))
    try? FileManager.default.removeItem(at: file)
  }
}
