import XCTest

/// Side chats, Tasks and Apps, each opened with its DEBUG launch argument.
nonisolated final class ExtrasTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  /// Start a side chat from the empty panel, see its intro, then delete it.
  @MainActor func testSideChatStartsAndDeletes() async throws {
    let gateway = TestGateway()
    let main = try await gateway.createSession()
    try await gateway.prompt(main, "hello")
    // A side chat needs a message in the main chat; wait for the reply to finish.
    let deadline = Date().addingTimeInterval(60)
    while (try await gateway.call("/sessions/active") as? [String: Any])?[main] != nil {
      if Date() > deadline { throw XCTSkip("The main chat didn’t finish in time.") }
      try await Task.sleep(for: .milliseconds(500))
    }

    let app = XCUIApplication.opencodex(["-sideChat", main])
    app.launch()
    let start = app.buttons["sidechat.new.empty"]
    XCTAssertTrue(start.waitForExistence(timeout: 15))
    start.tap()
    XCTAssertTrue(app.descendants(matching: .any)["sidechat.intro"].waitForExistence(timeout: 30))
    XCTAssertTrue(app.staticTexts["Main chat is idle"].exists)

    app.buttons["sidechat.delete"].tap()
    let delete = app.alerts.buttons["Delete"]
    XCTAssertTrue(delete.waitForExistence(timeout: 5))
    delete.tap()
    XCTAssertTrue(app.descendants(matching: .any)["sidechat.empty"].waitForExistence(timeout: 15))
    let left = try await gateway.call("/sessions/\(main)/side-chats") as? [Any]
    XCTAssertEqual(left?.count, 0)
  }

  /// Without the tasks plugin the board shows the desktop's setup; with it, the board.
  @MainActor func testTasksShowsSetupOrBoard() async throws {
    let status = try await TestGateway().call("/tasks/plugin") as? [String: Any]
    let app = XCUIApplication.opencodex(["-tasks", "YES"])
    app.launch()
    if ["active", "outdated"].contains(status?["state"] as? String) {
      XCTAssertTrue(app.descendants(matching: .any)["tasks.column.today"].waitForExistence(timeout: 15))
    } else {
      XCTAssertTrue(app.descendants(matching: .any)["tasks.setup"].waitForExistence(timeout: 15))
      XCTAssertTrue(
        app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Plan your day'")).firstMatch.exists)
    }
  }

  /// The apps index opens an app's view in the canvas frame runtime.
  @MainActor func testAppOpensInCanvasFrame() async throws {
    let apps = try await TestGateway().call("/apps") as? [[String: Any]] ?? []
    let app = XCUIApplication.opencodex(["-apps", "YES"])
    app.launch()
    guard !apps.isEmpty else {
      XCTAssertTrue(app.descendants(matching: .any)["apps.empty"].waitForExistence(timeout: 15))
      return
    }
    let tile = app.buttons.matching(identifier: "apps.tile").firstMatch
    XCTAssertTrue(tile.waitForExistence(timeout: 15))
    tile.tap()
    let frame = app.webViews.firstMatch
    XCTAssertTrue(frame.waitForExistence(timeout: 15))
    // The runtime rendered the view: it has text from the app's own code.
    XCTAssertTrue(frame.staticTexts.firstMatch.waitForExistence(timeout: 30))
  }
}
