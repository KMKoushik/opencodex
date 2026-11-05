import XCTest

/// One thread row: its swipe actions, its menu, its status indicators, and live updates.
nonisolated final class HomeRowTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  override func record(_ issue: XCTIssue) {
    XCUIApplication().snap("fail-\(name.split(separator: " ").last?.dropLast() ?? "")")
    super.record(issue)
  }

  @MainActor func testSwipeActionsAndMenu() async throws {
    let gateway = HomeGateway()
    let title = "Row actions \(UUID().uuidString.prefix(4))"
    let id = try await gateway.thread(in: HomeGateway.emptyDemo, title: title)
    addTeardownBlock { await gateway.done(id) }

    let app = XCUIApplication.home(["-threadView", "projects"])
    app.launch()
    let row = app.buttons["thread-\(id)"]
    XCTAssertTrue(app.scroll(to: row), "The new thread should show in its project")

    // Pin (leading swipe) moves it into Pinned; Unpin from its menu puts it back.
    row.swipeRight()
    XCTAssertTrue(app.buttons["Pin"].waitForExistence(timeout: 5), "Swiping reveals Pin")
    app.buttons["Pin"].tap()
    try await gateway.expect(id, "the thread is pinned") { $0["pinned"] != nil }
    XCTAssertTrue(app.scroll(to: row, up: true))
    XCTAssertTrue(app.staticTexts["Pinned"].exists)
    XCTAssertLessThan(
      row.frame.minY, app.buttons["project-filter"].frame.minY, "Pinned rows sit above Projects")
    row.press(forDuration: 1)
    app.buttons["Unpin thread"].tap()
    try await gateway.expect(id, "the thread is unpinned") { $0["pinned"] == nil }

    // Done (trailing swipe) offers Undo.
    XCTAssertTrue(app.scroll(to: row))
    row.swipeLeft()
    XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5), "Swiping reveals Done")
    app.buttons["Done"].tap()
    let undo = app.buttons["undo-done"]
    XCTAssertTrue(undo.waitForExistence(timeout: 5), "Marking done offers Undo")
    app.snap("undo")
    try await gateway.expect(id, "the thread is done") { $0["done"] != nil }
    undo.tap()
    try await gateway.expect(id, "Undo reopens it") { $0["done"] == nil }

    // Unread (trailing swipe) shows the dot.
    XCTAssertTrue(app.scroll(to: row))
    row.swipeLeft()
    let unread = app.buttons["Unread"]
    XCTAssertTrue(unread.waitForExistence(timeout: 3))
    unread.tap()
    XCTAssertTrue(row.waitForValue(containing: "Unread thread"), "\(row.value ?? "")")

    // Mute from the menu marks the row.
    XCTAssertTrue(app.scroll(to: row))
    row.press(forDuration: 1)
    app.snap("row-menu")
    app.buttons["Mute notifications"].tap()
    XCTAssertTrue(row.waitForValue(containing: "Notifications muted"), "\(row.value ?? "")")
    row.press(forDuration: 1)
    app.buttons["Unmute notifications"].tap()
    XCTAssertTrue(row.waitForValue(containing: "Notifications muted", present: false))

    // Rename asks for the title and the row follows.
    let renamed = "\(title) renamed"
    row.press(forDuration: 1)
    app.buttons["Rename thread"].tap()
    let field = app.alerts["Rename thread"].textFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    // The field opens focused with the cursor after the title; replace it with keystrokes only.
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: title.count + 2))
    field.typeText(renamed)
    // The keyboard can arrive late and move the alert; tap once the button stays put.
    let confirm = app.alerts["Rename thread"].buttons["Rename"]
    var frame = CGRect.zero
    for _ in 0..<10 where confirm.frame != frame {
      frame = confirm.frame
      try await Task.sleep(for: .milliseconds(400))
    }
    confirm.tap()
    XCTAssertTrue(app.alerts["Rename thread"].waitForNonExistence(timeout: 5))
    let label = NSPredicate(format: "label CONTAINS %@", renamed)
    XCTAssertTrue(
      expectation(for: label, evaluatedWith: row).wait(timeout: 10), "The row shows the new title")

    // Export opens the share sheet with the transcript.
    row.press(forDuration: 1)
    app.buttons["Export as Markdown"].tap()
    let share = app.otherElements["ActivityListView"]
    XCTAssertTrue(
      share.waitForExistence(timeout: 10) || app.navigationBars["UIActivityContentView"].exists,
      "Export should open the share sheet")
    app.snap("export")
    let close = app.buttons.matching(NSPredicate(format: "label ==[c] 'close'")).firstMatch
    XCTAssertTrue(close.exists)
    close.tap()
    XCTAssertTrue(share.waitForNonExistence(timeout: 5))

    // Fork makes a new thread and opens it.
    XCTAssertTrue(app.scroll(to: row))
    row.press(forDuration: 1)
    app.buttons["Fork thread"].tap()
    let home = NSPredicate(format: "hittable == false")
    XCTAssertTrue(
      expectation(for: home, evaluatedWith: app.buttons["new-chat"]).wait(timeout: 10),
      "The fork's chat should open over the list")
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", renamed)).firstMatch.waitForExistence(timeout: 10))
    app.snap("fork")
  }

  @MainActor func testIndicatorsAndLiveUpdates() async throws {
    let gateway = HomeGateway()
    let tag = UUID().uuidString.prefix(4)
    let running = try await gateway.thread(in: HomeGateway.homeDemo, title: "Runs \(tag)")
    let question = try await gateway.thread(in: HomeGateway.homeDemo, title: "Asks \(tag)")
    let approval = try await gateway.thread(in: HomeGateway.proj, title: "Writes \(tag)")
    let replied = try await gateway.thread(in: HomeGateway.homeDemo, title: "Replies \(tag)")
    addTeardownBlock {
      for id in [running, question, approval, replied] { await gateway.done(id) }
    }
    try await gateway.prompt(running, "run: sleep 60 && echo done")
    try await gateway.prompt(question, "ask: Which color?")
    try await gateway.prompt(approval, "write qa-\(tag).md: hello")
    try await gateway.prompt(replied, "Say hi")

    let app = XCUIApplication.home(["-threadView", "focus"])
    app.launch()
    XCTAssertTrue(app.staticTexts["Focus"].waitForExistence(timeout: 15))

    // Waiting on you ranks first: the question and the approval.
    let asks = app.buttons["thread-\(question)"]
    XCTAssertTrue(app.scroll(to: asks))
    XCTAssertTrue(asks.waitForValue(containing: "Has a question", timeout: 30), "\(asks.value ?? "")")
    let writes = app.buttons["thread-\(approval)"]
    XCTAssertTrue(app.scroll(to: writes))
    XCTAssertTrue(
      writes.waitForValue(containing: "Needs approval", timeout: 30), "\(writes.value ?? "")")
    let runs = app.buttons["thread-\(running)"]
    XCTAssertTrue(app.scroll(to: runs))
    XCTAssertTrue(runs.waitForValue(containing: "Responding", timeout: 20), "\(runs.value ?? "")")
    XCTAssertTrue(app.activityIndicators.firstMatch.exists, "A running row shows the spinner")
    app.snap("indicators")

    // A finished reply that was never opened shows the unread dot.
    let replies = app.buttons["thread-\(replied)"]
    XCTAssertTrue(app.scroll(to: replies))
    XCTAssertTrue(
      replies.waitForValue(containing: "Unread reply", timeout: 60), "\(replies.value ?? "")")

    // A rename on the computer shows without relaunching.
    let renamed = "Renamed live \(tag)"
    try await gateway.rename(replied, renamed)
    let label = NSPredicate(format: "label CONTAINS %@", renamed)
    XCTAssertTrue(
      expectation(for: label, evaluatedWith: replies).wait(timeout: 10),
      "The rename should arrive over the event stream")

    // Pull to refresh reloads the list and keeps it.
    XCTAssertTrue(app.scroll(to: app.buttons["new-chat"], up: true))
    let start = app.buttons["new-chat"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 400)))
    XCTAssertTrue(app.staticTexts["Focus"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.scroll(to: replies))
  }
}

extension XCUIElement {
  /// Waits for the accessibility value to contain (or stop containing) the text.
  func waitForValue(containing text: String, present: Bool = true, timeout: TimeInterval = 10)
    -> Bool
  {
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
      if ((value as? String)?.contains(text) ?? false) == present { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    } while Date() < deadline
    return false
  }
}

extension XCTestExpectation {
  /// Waits for one expectation outside `XCTestCase.wait`.
  @MainActor func wait(timeout: TimeInterval) -> Bool {
    XCTWaiter().wait(for: [self], timeout: timeout) == .completed
  }
}

extension HomeGateway {
  /// Polls the thread's summary until the condition holds.
  func expect(
    _ id: String, _ what: String, timeout: TimeInterval = 10,
    _ condition: ([String: Any]) -> Bool
  ) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      let page = try await get("/session-search") as? [String: Any]
      let sessions = page?["sessions"] as? [[String: Any]] ?? []
      if let session = sessions.first(where: { $0["id"] as? String == id }), condition(session) {
        return
      }
      try await Task.sleep(for: .milliseconds(500))
    }
    XCTFail("Timed out waiting until \(what)")
  }
}
