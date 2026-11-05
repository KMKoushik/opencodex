import XCTest

/// Side chats (chat "…"), Tasks and Apps (Home), through every control. Apps only views the
/// owner's real canvases: it never runs, edits or deletes one.
nonisolated final class ExtrasTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  // MARK: Side chat

  /// Start, ask (scripted reply), the main chat's status line, a second side chat, switching,
  /// and deleting both.
  @MainActor func testSideChatAskSwitchAndDelete() async throws {
    let gateway = TestGateway()
    let main = try await gateway.createSession(in: Panels.homeDemo, title: "Side chat main")
    try await gateway.prompt(main, "hello")
    // A side chat needs a message in the main chat; wait for the reply to finish.
    try await gateway.waitIdle(main)

    let app = XCUIApplication.opencodex(["-session", main])
    app.launch()
    Panels.openChatMenu(app, "Side chat")
    let start = app.buttons["sidechat.new.empty"]
    XCTAssertTrue(start.waitForExistence(timeout: 15))
    Panels.shot("sidechat-empty")
    start.tap()
    XCTAssertTrue(app.descendants(matching: .any)["sidechat.intro"].waitForExistence(timeout: 30))
    let status = app.descendants(matching: .any)["sidechat.main-status"]
    XCTAssertTrue(status.waitForExistence(timeout: 10))
    XCTAssertTrue(status.label.contains("Main chat is idle"), status.label)
    XCTAssertTrue(app.buttons["sidechat.tabs"].label.contains("Side chat 1"), app.buttons["sidechat.tabs"].label)

    // Ask: the side chat answers with the scripted reply.
    // The main chat's composer stays under the sheet; use the side chat's.
    let input = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier == 'composer.input' AND placeholderValue == 'Ask a side question'")
    ).firstMatch
    XCTAssertTrue(input.waitForExistence(timeout: 5), "The side composer asks for a side question")
    input.tap()
    app.typeText("What does this project do?")
    let send = app.buttons.matching(NSPredicate(format: "identifier == 'composer.send' AND enabled == true"))
      .firstMatch
    XCTAssertTrue(send.waitForExistence(timeout: 5))
    send.tap()
    let reply = app.textViews.matching(NSPredicate(format: "value CONTAINS 'short answer'")).firstMatch
    XCTAssertTrue(reply.waitForExistence(timeout: 60), "The side chat should answer")
    Panels.shot("sidechat-reply")

    // The main chat's state shows above the side composer.
    try await gateway.prompt(main, "run: sleep 12 && echo done")
    let working = await Panels.waitUntil(timeout: 30) { status.label.contains("Main chat is working") }
    XCTAssertTrue(working, "The status line follows the main chat: \(status.label)")
    Panels.shot("sidechat-main-working")
    let idle = await Panels.waitUntil(timeout: 60) { status.label.contains("Main chat is idle") }
    XCTAssertTrue(idle, status.label)

    // A second side chat, then back to the first.
    app.buttons["sidechat.new"].tap()
    let second = await Panels.waitUntil(timeout: 30) {
      app.buttons["sidechat.tabs"].label.contains("Side chat 2")
    }
    XCTAssertTrue(second, "New side chat opens Side chat 2")
    XCTAssertTrue(app.descendants(matching: .any)["sidechat.intro"].waitForExistence(timeout: 30))
    app.buttons["sidechat.tabs"].tap()
    let first = app.buttons["Side chat 1"]
    XCTAssertTrue(first.waitForExistence(timeout: 5))
    first.tap()
    XCTAssertTrue(reply.waitForExistence(timeout: 15), "Side chat 1 still has its answer")
    XCTAssertTrue(app.buttons["sidechat.tabs"].label.contains("Side chat 1"))

    // Delete both; the main chat is untouched.
    for remaining in [1, 0] {
      app.buttons["sidechat.delete"].tap()
      let delete = app.alerts.buttons["Delete"]
      XCTAssertTrue(delete.waitForExistence(timeout: 5))
      delete.tap()
      var left = -1
      for _ in 0..<30 where left != remaining {
        try await Task.sleep(for: .milliseconds(500))
        left = (try await gateway.call("/sessions/\(main)/side-chats") as? [Any])?.count ?? -1
      }
      XCTAssertEqual(left, remaining, "Side chats left after deleting")
    }
    XCTAssertTrue(app.descendants(matching: .any)["sidechat.empty"].waitForExistence(timeout: 15))
    app.buttons["sidechat.close"].tap()
    XCTAssertTrue(app.buttons["chat.actions"].waitForExistence(timeout: 5))
  }

  // MARK: Tasks

  /// Without the tasks plugin, Home → Tasks shows the desktop's setup.
  @MainActor func testTasksSetupFromHome() async throws {
    let status = try await TestGateway().call("/tasks/plugin") as? [String: Any]
    let state = status?["state"] as? String
    let app = XCUIApplication.opencodex()
    app.launch()
    let entry = app.buttons["home.tasks"]
    XCTAssertTrue(entry.waitForExistence(timeout: 15))
    entry.tap()
    if ["active", "outdated"].contains(state) {
      XCTAssertTrue(app.descendants(matching: .any)["tasks.column.today"].waitForExistence(timeout: 15))
      return
    }
    XCTAssertTrue(app.descendants(matching: .any)["tasks.setup"].waitForExistence(timeout: 15))
    XCTAssertTrue(
      app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Plan your day'")).firstMatch.exists)
    if state == "unavailable" || state == "failed" {
      let message = app.staticTexts["tasks.setup.error"]
      XCTAssertTrue(message.exists)
      XCTAssertEqual(message.label, status?["message"] as? String)
    }
    Panels.shot("tasks-setup")
  }

  /// The board with DEBUG `-tasksDemo` (local edits only): add, edit, move, done, reopen,
  /// delete, and the project filter.
  @MainActor func testTasksBoardEdits() async throws {
    try Panels.requireDebugBuild()
    let app = XCUIApplication.opencodex(["-tasks", "YES", "-tasksDemo", "YES"])
    app.launch()
    XCTAssertTrue(card(app, "Review the release checklist").waitForExistence(timeout: 15))
    XCTAssertEqual(count(app, .today), 3)
    Panels.shot("tasks-board")

    // Add two to Today; an empty submit closes the field.
    app.buttons["tasks.new.today"].tap()
    let field = app.textFields["tasks.new.input"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.typeText("Buy milk\n")
    XCTAssertTrue(card(app, "Buy milk").waitForExistence(timeout: 5))
    field.typeText("Call the bank\n")
    XCTAssertTrue(card(app, "Call the bank").waitForExistence(timeout: 5))
    field.typeText("\n")
    XCTAssertTrue(field.waitForNonExistence(timeout: 5), "An empty submit closes the field")
    XCTAssertEqual(count(app, .today), 5)

    // Edit: title, notes and list, saved from the sheet.
    card(app, "Buy milk").tap()
    XCTAssertTrue(app.navigationBars["Edit task"].waitForExistence(timeout: 5))
    Panels.shot("tasks-editor")
    let title = editorField(app, "tasks.editor.title")
    // At the end of the text, so the deletes remove the old title.
    title.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
    title.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 12) + "Buy oat milk")
    let notes = editorField(app, "tasks.editor.notes")
    notes.tap()
    notes.typeText("Not dairy")
    app.buttons["tasks.editor.list"].tap()
    app.buttons["This week"].tap()
    app.buttons["tasks.editor.save"].tap()
    XCTAssertTrue(card(app, "Buy oat milk").waitForExistence(timeout: 5))
    XCTAssertFalse(card(app, "Buy milk").exists)
    XCTAssertEqual(count(app, .today), 4)
    XCTAssertEqual(count(app, .week), 2)
    XCTAssertTrue(app.staticTexts["Not dairy"].exists, "Notes show under the title")

    // Cancel leaves it as it was.
    card(app, "Buy oat milk").tap()
    XCTAssertTrue(app.navigationBars["Edit task"].waitForExistence(timeout: 5))
    let editing = editorField(app, "tasks.editor.title")
    editing.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
    editing.typeText(" later")
    app.buttons["tasks.editor.cancel"].tap()
    XCTAssertTrue(card(app, "Buy oat milk").waitForExistence(timeout: 5))

    // Move from the long-press menu.
    card(app, "Buy oat milk").press(forDuration: 1.2)
    app.buttons["Move to"].tap()
    app.buttons["Someday"].tap()
    let moved = await Panels.waitUntil(timeout: 5) { count(app, .someday) == 2 }
    XCTAssertTrue(moved)
    XCTAssertEqual(count(app, .week), 1)

    // Done with its check, then reopened with a swipe: back to Someday.
    app.buttons["Complete “Buy oat milk”"].tap()
    let done = await Panels.waitUntil(timeout: 5) { count(app, .done) == 3 }
    XCTAssertTrue(done)
    XCTAssertEqual(count(app, .someday), 1)
    Panels.shot("tasks-done")
    card(app, "Buy oat milk").swipeRight()
    app.buttons["Reopen"].tap()
    let reopened = await Panels.waitUntil(timeout: 5) { count(app, .someday) == 2 }
    XCTAssertTrue(reopened, "Reopen returns it to the list it came from")
    XCTAssertEqual(count(app, .done), 2)

    // Delete with a swipe, and from the editor.
    card(app, "Buy oat milk").swipeLeft()
    app.buttons["Delete"].tap()
    XCTAssertTrue(card(app, "Buy oat milk").waitForNonExistence(timeout: 5))
    card(app, "Call the bank").tap()
    app.buttons["tasks.editor.delete"].tap()
    let confirm = app.buttons.matching(NSPredicate(format: "label == 'Delete'")).firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5))
    confirm.tap()
    XCTAssertTrue(card(app, "Call the bank").waitForNonExistence(timeout: 5))
    XCTAssertEqual(count(app, .today), 3)

    // The project filter.
    let filter = app.buttons["tasks.filter"]
    filter.tap()
    app.buttons["home-demo"].tap()
    XCTAssertTrue(card(app, "Review the release checklist").waitForExistence(timeout: 5))
    XCTAssertTrue(card(app, "Write the changelog").waitForNonExistence(timeout: 5))
    XCTAssertTrue(
      app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'home-demo · '")).firstMatch.exists,
      "The subtitle names the filter")
    Panels.shot("tasks-filtered")
    filter.tap()
    app.buttons["No project"].tap()
    XCTAssertTrue(card(app, "Write the changelog").waitForExistence(timeout: 5))
    XCTAssertFalse(card(app, "Review the release checklist").exists)
    filter.tap()
    app.buttons["All projects"].tap()
    XCTAssertTrue(card(app, "Review the release checklist").waitForExistence(timeout: 5))
  }

  // MARK: Apps

  /// Home → Apps lists every app; one opens with its view, its code (file switch and share)
  /// and its runs.
  @MainActor func testAppsListViewCodeAndRuns() async throws {
    let apps = try await TestGateway().call("/apps") as? [[String: Any]] ?? []
    let app = XCUIApplication.opencodex()
    app.launch()
    let entry = app.buttons["home.apps"]
    XCTAssertTrue(entry.waitForExistence(timeout: 15))
    entry.tap()
    guard !apps.isEmpty else {
      XCTAssertTrue(app.descendants(matching: .any)["apps.empty"].waitForExistence(timeout: 15))
      return
    }
    let tiles = app.buttons.matching(identifier: "apps.tile")
    XCTAssertTrue(tiles.firstMatch.waitForExistence(timeout: 15))
    XCTAssertEqual(tiles.count, apps.count)
    Panels.shot("apps-list")

    // The app with the fewest functions; viewing it runs only its view.
    let pick = apps.min { ($0["functions"] as? [Any])?.count ?? 0 < ($1["functions"] as? [Any])?.count ?? 0 }!
    let title = try XCTUnwrap(pick["title"] as? String)
    tiles.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch.tap()
    XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["App"].isSelected)
    let frame = app.webViews.firstMatch
    XCTAssertTrue(frame.waitForExistence(timeout: 15))
    XCTAssertTrue(frame.staticTexts.firstMatch.waitForExistence(timeout: 30), "The view renders")
    Panels.shot("apps-view")

    app.buttons["Code"].tap()
    let coded = await Panels.waitUntil(timeout: 5) { app.buttons["Code"].isSelected }
    XCTAssertTrue(coded)
    if !app.descendants(matching: .any)["apps.code.text"].waitForExistence(timeout: 30) {
      Panels.dump(app, "apps-code")
      Panels.shot("apps-code-missing")
    }
    XCTAssertTrue(app.descendants(matching: .any)["apps.code.text"].exists)
    XCTAssertFalse(frame.exists, "Code replaces the view")
    let file = app.buttons["apps.code.file"]
    let first = file.value as? String
    file.tap()
    let names = app.buttons.matching(NSPredicate(format: "label ENDSWITH '.ts' OR label ENDSWITH '.tsx' OR label ENDSWITH '.css' OR label ENDSWITH '.json'"))
    let other = (0..<names.count).map { names.element(boundBy: $0) }.first { $0.label != first }
    if let other {
      let name = other.label
      other.tap()
      let switched = await Panels.waitUntil(timeout: 5) { (file.value as? String) == name }
      XCTAssertTrue(switched, "Picking a file shows it")
    } else {
      app.tap()
    }
    Panels.shot("apps-code")
    app.buttons["apps.code.share"].tap()
    let share = app.otherElements["ActivityListView"]
    XCTAssertTrue(share.waitForExistence(timeout: 10), "The share sheet opens")
    Panels.shot("apps-share")
    // Dismiss it from above the sheet.
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
    XCTAssertTrue(share.waitForNonExistence(timeout: 10))

    app.buttons["App"].tap()
    XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))

    // Runs, from the actions menu (Run and Delete stay untouched).
    app.buttons["apps.actions"].tap()
    app.buttons["apps.runs"].tap()
    XCTAssertTrue(app.navigationBars["Runs"].waitForExistence(timeout: 10))
    Panels.shot("apps-runs")
    app.buttons["Done"].tap()
    XCTAssertTrue(app.navigationBars["Runs"].waitForNonExistence(timeout: 5))
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(tiles.firstMatch.waitForExistence(timeout: 5))
  }

  // MARK: Helpers

  /// A task's row, scrolled into the lazy list when it exists off screen.
  @MainActor private func card(_ app: XCUIApplication, _ title: String) -> XCUIElement {
    let element = app.buttons.matching(identifier: "tasks.card")
      .matching(NSPredicate(format: "label == %@", title)).firstMatch
    let list = app.collectionViews.firstMatch
    for direction in [true, false] {
      for _ in 0..<3 where !element.exists && list.exists {
        if direction { list.swipeUp() } else { list.swipeDown() }
      }
    }
    return element
  }

  /// A list's count, from its header ("Today, 3").
  @MainActor private func count(_ app: XCUIApplication, _ bucket: Bucket) -> Int {
    let label = app.descendants(matching: .any)["tasks.column.\(bucket.rawValue)"].label
    return Int(label.split(separator: ",").last?.trimmingCharacters(in: .whitespaces) ?? "") ?? -1
  }

  private enum Bucket: String { case today, week, someday, done }

  @MainActor private func editorField(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.textViews[id].exists ? app.textViews[id] : app.textFields[id]
  }
}
