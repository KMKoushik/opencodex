import XCTest

/// The chat's thread sheet, opened from the title pill or "…": every control, tapped for real.
/// Set `SCREENSHOTS=<dir>` (as `TEST_RUNNER_SCREENSHOTS`) to save each state as a PNG.
nonisolated final class ThreadSheetTests: XCTestCase {
  private static let directory =
    "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios/home-demo"

  override func setUp() {
    continueAfterFailure = false
  }

  /// Pin, Unread, Mute (button and toggle), the model row, Export, Rename, then Compact and Fork.
  @MainActor func testThreadActions() async throws {
    let gateway = TestGateway()
    let id = try await thread(gateway, title: "Sheet actions")
    let app = XCUIApplication.opencodex(["-session", id])
    app.launch()

    // The title pill opens the sheet.
    let pill = app.buttons["chat.details"]
    XCTAssertTrue(pill.waitForExistence(timeout: 15))
    pill.tap()
    let title = app.descendants(matching: .any)["sheet.title"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    XCTAssertTrue(title.label.contains("Sheet actions"), title.label)
    XCTAssertTrue(title.label.contains("home-demo"), title.label)
    shot(app, "sheet-medium")

    let pin = app.buttons["sheet.pin"]
    XCTAssertEqual(pin.label, "Pin")
    pin.tap()
    expect(pin, label: "Unpin")
    pin.tap()
    expect(pin, label: "Pin")

    let unread = app.buttons["sheet.unread"]
    XCTAssertEqual(unread.label, "Unread")
    unread.tap()
    expect(unread, label: "Read")
    unread.tap()
    expect(unread, label: "Unread")

    let mute = app.buttons["sheet.mute"]
    XCTAssertEqual(mute.label, "Mute")
    mute.tap()
    expect(mute, label: "Unmute")
    let toggle = app.switches["sheet.notifications"]
    scroll(app, to: toggle)
    expect(toggle, value: "1")
    shot(app, "sheet-muted")
    toggle.switches.firstMatch.tap()
    expect(toggle, value: "0")
    expect(mute, label: "Mute")

    // The model row opens the composer's picker; a pick shows in the row.
    let model = app.buttons["sheet.model"]
    scroll(app, to: model, up: false)
    XCTAssertTrue((model.value as? String)?.hasPrefix("Scripted") == true, "\(model.value ?? "")")
    model.tap()
    let search = app.textFields["model.search"]
    XCTAssertTrue(search.waitForExistence(timeout: 10), "The model picker should open")
    search.tap()
    search.typeText("DeepSeek")
    let deepseek = app.buttons.matching(NSPredicate(format: "label CONTAINS 'DeepSeek V4.1 Flash'"))
      .firstMatch
    XCTAssertTrue(deepseek.waitForExistence(timeout: 5))
    deepseek.tap()
    expect(model, valuePrefix: "DeepSeek V4.1 Flash")

    // Export offers both formats and shows the share sheet.
    app.buttons["sheet.export"].tap()
    let markdown = app.buttons["Export as Markdown"]
    XCTAssertTrue(markdown.waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Export as JSON"].exists)
    markdown.tap()
    let share = app.otherElements["ActivityListView"]
    XCTAssertTrue(share.waitForExistence(timeout: 15), "The share sheet should open")
    shot(app, "sheet-export")
    closeShareSheet(app)
    XCTAssertTrue(share.waitForNonExistence(timeout: 10))

    // Rename.
    let rename = app.buttons["Rename thread"]
    scroll(app, to: rename)
    rename.tap()
    let field = app.alerts.textFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.clearText()
    field.typeText("Renamed from sheet")
    app.alerts.buttons["Rename"].tap()
    expect(title, labelContains: "Renamed from sheet")
    scroll(app, to: title, up: false)
    shot(app, "sheet-renamed")

    // Compact closes the sheet; the transcript shows the compaction.
    app.buttons["sheet.compact"].tap()
    XCTAssertTrue(title.waitForNonExistence(timeout: 5), "Compact closes the sheet")
    let compaction = app.descendants(matching: .any).matching(
      NSPredicate(
        format:
          "label BEGINSWITH 'Context compacted' OR label BEGINSWITH 'Compacting context' OR label BEGINSWITH 'Compaction failed'"
      )
    ).firstMatch
    XCTAssertTrue(compaction.waitForExistence(timeout: 60), "The compaction should show")
    shot(app, "compacted")

    // Fork opens the new thread.
    let actions = app.buttons["chat.actions"]
    actions.tap()
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    app.buttons["sheet.fork"].tap()
    XCTAssertTrue(title.waitForNonExistence(timeout: 15), "Fork closes the sheet")
    // The fork opens on top of this chat; Back returns to the original.
    let chatTitle = app.buttons["chat.details"]
    expect(chatTitle, labelContains: "Renamed from sheet (fork #1)", timeout: 15)
    shot(app, "forked")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    expect(chatTitle, labelContains: "Renamed from sheet")
    XCTAssertFalse(chatTitle.label.contains("fork #"), chatTitle.label)
  }

  /// Each panel row closes the sheet and opens its panel; the "…" button reopens the sheet.
  @MainActor func testPanelRowsOpenPanels() async throws {
    let id = try await thread(TestGateway(), title: "Sheet panels")
    let app = XCUIApplication.opencodex(["-session", id])
    app.launch()
    let actions = app.buttons["chat.actions"]
    XCTAssertTrue(actions.waitForExistence(timeout: 15))

    let panels: [(row: String, opened: XCUIElement, close: XCUIElement)] = [
      ("workspace-open", app.buttons["workspace-files"], app.buttons["workspace-close"]),
      ("chat.subagents", app.navigationBars["Subagents"], app.buttons["Close"]),
      ("sheet.sidechat", app.buttons["sidechat.close"], app.buttons["sidechat.close"]),
      ("sheet.terminal", app.buttons["terminal-close"], app.buttons["terminal-close"]),
      ("sheet.details", app.descendants(matching: .any)["details.context"],
       app.buttons["Close session details"]),
    ]
    for panel in panels {
      actions.tap()
      let row = app.buttons[panel.row]
      XCTAssertTrue(app.descendants(matching: .any)["sheet.title"].waitForExistence(timeout: 5))
      if panel.row == "workspace-open" { shot(app, "panels-medium") }
      scroll(app, to: row)
      if panel.row == "sheet.details" { shot(app, "sheet-large") }
      row.tap()
      XCTAssertTrue(panel.opened.waitForExistence(timeout: 15), "\(panel.row) should open its panel")
      panel.close.tap()
      XCTAssertTrue(panel.opened.waitForNonExistence(timeout: 10))
    }
  }

  /// Delete asks first, then deletes and returns to the threads list. A gateway from before
  /// the delete route says to update instead.
  @MainActor func testDeleteAsksThenDeletes() async throws {
    let gateway = TestGateway()
    let id = try await thread(gateway, title: "Sheet delete")
    let app = XCUIApplication.opencodex(["-session", id])
    app.launch()
    let actions = app.buttons["chat.actions"]
    XCTAssertTrue(actions.waitForExistence(timeout: 15))
    actions.tap()

    let delete = app.buttons["sheet.delete"]
    scroll(app, to: delete)
    delete.tap()
    let confirm = app.buttons["sheet.delete.confirm"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "Delete should ask first")
    shot(app, "sheet-delete-confirm")
    confirm.tap()

    let outdated = app.alerts["Update OpenCodex to delete threads"]
    let list = app.buttons["new-chat"]
    let done = NSPredicate { _, _ in outdated.exists || list.exists }
    await fulfillment(of: [expectation(for: done, evaluatedWith: nil)], timeout: 15)
    if outdated.exists {
      shot(app, "sheet-delete-outdated")
      outdated.buttons["OK"].tap()
      XCTAssertTrue(app.descendants(matching: .any)["sheet.title"].exists, "The sheet stays open")
    } else {
      XCTAssertFalse(app.buttons["chat.actions"].exists, "Back on the threads list")
      do {
        _ = try await gateway.call("/sessions/\(id)")
        XCTFail("The thread should be gone")
      } catch {}
    }
  }

  // MARK: Helpers

  /// A thread in home-demo with a finished reply, so it has context usage and a transcript.
  private func thread(_ gateway: TestGateway, title: String) async throws -> String {
    let session = try await gateway.call(
      "/sessions", ["directory": Self.directory, "model": TestGateway.model])
    let id = try XCTUnwrap((session as? [String: Any])?["id"] as? String)
    try await gateway.call("/sessions/\(id)/action", ["action": "rename", "title": title])
    try await gateway.prompt(id, "Say hello")
    let deadline = Date().addingTimeInterval(60)
    while Date() < deadline {
      let active = try await gateway.call("/sessions/active") as? [String: Any] ?? [:]
      if active[id] == nil { break }
      try await Task.sleep(for: .milliseconds(500))
    }
    return id
  }

  /// Swipes the sheet until the element is hittable (the sheet grows to its large detent).
  private func scroll(_ app: XCUIApplication, to element: XCUIElement, up: Bool = true) {
    for _ in 0..<10 where !(element.exists && element.isHittable) {
      let list = app.collectionViews.firstMatch
      if up { list.swipeUp() } else { list.swipeDown() }
    }
    XCTAssertTrue(element.waitForExistence(timeout: 5))
  }

  private func closeShareSheet(_ app: XCUIApplication) {
    let close = app.otherElements["ActivityListView"].buttons
      .matching(NSPredicate(format: "label IN {'Close', 'Cancel'}")).firstMatch
    if close.exists { close.tap() } else { app.swipeDown(velocity: .fast) }
  }

  private func expect(
    _ element: XCUIElement, label: String? = nil, labelContains: String? = nil,
    value: String? = nil, valuePrefix: String? = nil, timeout: TimeInterval = 10,
    file: StaticString = #filePath, line: UInt = #line
  ) {
    let predicate = NSPredicate { _, _ in
      if let label, element.label != label { return false }
      if let labelContains, !element.label.contains(labelContains) { return false }
      if let value, element.value as? String != value { return false }
      if let valuePrefix, (element.value as? String)?.hasPrefix(valuePrefix) != true { return false }
      return true
    }
    let result = XCTWaiter().wait(
      for: [XCTNSPredicateExpectation(predicate: predicate, object: nil)], timeout: timeout)
    XCTAssertEqual(
      result, .completed,
      "\(element.identifier): label “\(element.label)”, value “\(element.value ?? "")”",
      file: file, line: line)
  }

  private func shot(_ app: XCUIApplication, _ name: String) {
    guard let directory = ProcessInfo.processInfo.environment["SCREENSHOTS"] else { return }
    Thread.sleep(forTimeInterval: 1)
    let url = URL(fileURLWithPath: directory).appending(path: "\(name).png")
    try? XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
  }
}

extension XCUIElement {
  /// Selects and deletes a text field's contents.
  fileprivate func clearText() {
    guard let text = value as? String, !text.isEmpty else { return }
    tap()
    typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: text.count))
  }
}
