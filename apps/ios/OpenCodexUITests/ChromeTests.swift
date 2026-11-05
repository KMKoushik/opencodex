import XCTest

/// The chat's chrome: Session details opens from the thread sheet, and a new thread's starter fills
/// the draft without sending, then follows the draft to another project.
/// Set `SCREENSHOTS=<dir>` (as `TEST_RUNNER_SCREENSHOTS`) to save each state as a PNG.
nonisolated final class ChromeTests: XCTestCase {
  private static var gateway: URL {
    URL(string: ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310")!
  }

  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testSessionDetailsOpensFromToolbar() async throws {
    let id = try await anySession()
    let app = XCUIApplication.opencodex(["-session", id])
    app.launch()

    let info = app.buttons["chat.details"]
    XCTAssertTrue(info.waitForExistence(timeout: 15))
    shot(app, "chat")
    // The title pill opens the thread sheet, which lists Session details.
    info.tap()
    let row = app.buttons["sheet.details"]
    for _ in 0..<6 where !(row.exists && row.isHittable) { app.collectionViews.firstMatch.swipeUp() }
    row.tap()

    let context = app.descendants(matching: .any)["details.context"]
    XCTAssertTrue(context.waitForExistence(timeout: 10))
    let skills = app.buttons["details.skills"]
    XCTAssertTrue(skills.waitForExistence(timeout: 10))
    XCTAssertTrue(
      app.staticTexts["Available to this project, not necessarily loaded into this conversation."]
        .exists == false, "Sections start collapsed")
    shot(app, "details-medium")
    app.buttons["details.mcp"].tap()
    skills.tap()
    XCTAssertTrue(
      app.staticTexts["Available to this project, not necessarily loaded into this conversation."]
        .waitForExistence(timeout: 5))
    // Drag the sheet's bar up to the large detent.
    let bar = app.navigationBars["Session"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    bar.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)))
    shot(app, "details-large")
  }

  @MainActor func testStarterFillsDraftAndFollowsProject() throws {
    let app = XCUIApplication.opencodex()
    app.launch()
    app.buttons["new-chat"].tap()
    let project = app.buttons["project-home-demo"]
    XCTAssertTrue(project.waitForExistence(timeout: 10))
    project.tap()

    XCTAssertTrue(app.descendants(matching: .any)["chat.new"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["What should we build?"].exists)
    XCTAssertTrue(app.descendants(matching: .any)["newThread.workspace"].exists)
    shot(app, "new")

    app.buttons["starter.flask"].tap()
    let input =
      app.textViews["composer.input"].exists
      ? app.textViews["composer.input"] : app.textFields["composer.input"]
    let filled = NSPredicate { _, _ in
      (input.value as? String)?.hasPrefix("Run the tests, find the failing one") == true
    }
    wait(for: [expectation(for: filled, evaluatedWith: nil)], timeout: 5)
    shot(app, "new-starter")

    app.buttons["newThread.project"].tap()
    let other = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'proj'")).firstMatch
    XCTAssertTrue(other.waitForExistence(timeout: 5))
    other.tap()
    XCTAssertTrue(app.buttons["Project: proj"].waitForExistence(timeout: 5))
    wait(for: [expectation(for: filled, evaluatedWith: nil)], timeout: 5)
    // Nothing was sent: the chat is still a draft.
    XCTAssertFalse(app.buttons["chat.details"].exists)
  }

  // MARK: Helpers

  private func shot(_ app: XCUIApplication, _ name: String) {
    guard let directory = ProcessInfo.processInfo.environment["SCREENSHOTS"] else { return }
    Thread.sleep(forTimeInterval: 1)
    let url = URL(fileURLWithPath: directory).appending(path: "\(name).png")
    try? XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
  }

  /// A thread with a reply, so the sheet has context usage to show.
  private func anySession() async throws -> String {
    let (data, _) = try await URLSession.shared.data(
      from: Self.gateway.appending(path: "api/session-search"))
    let page = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let sessions = page?["sessions"] as? [[String: Any]] ?? []
    let preferred = sessions.first { ($0["title"] as? String) == "Subagent research" }
    return try XCTUnwrap((preferred ?? sessions.first)?["id"] as? String, "The gateway needs a thread")
  }
}
