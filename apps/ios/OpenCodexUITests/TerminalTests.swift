import XCTest

/// The project terminal (chat "…" → Terminal) through every control: new tabs, typing, the key
/// bar (Esc, Tab, Ctrl+C, arrows), switching and closing tabs, a trip to the background and
/// back without duplicated output, and an exited shell's badge.
nonisolated final class TerminalTests: XCTestCase {
  static let directory = Panels.homeDemo

  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testTabsKeysReconnectAndExit() async throws {
    let gateway = TestGateway()
    let before = Set(try await Self.terminalIDs(gateway))
    addTeardownBlock {
      // Close only the shells this test opened; others' terminals in home-demo stay.
      for id in Set((try? await Self.terminalIDs(gateway)) ?? []).subtracting(before) {
        await gateway.delete("/terminals/\(id)", ["directory": Self.directory])
      }
    }
    let tag = UUID().uuidString.prefix(6).lowercased()
    let session = try await gateway.createSession(in: Self.directory, title: "Terminal test")

    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()
    Panels.openChatMenu(app, "Terminal")
    let new = app.buttons["terminal-new"]
    XCTAssertTrue(new.waitForExistence(timeout: 15))
    await enabled(new)

    // A new shell, so the output isn't confused with an older tab's.
    let tabs = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'terminal-tab-' AND NOT identifier BEGINSWITH 'terminal-tab-close'"))
    let opened = await Panels.waitUntil { tabs.count > 0 }
    XCTAssertTrue(opened, "Opening the panel starts a shell when there is none")
    let start = tabs.count
    new.tap()
    let added = await Panels.waitUntil { tabs.count == start + 1 }
    XCTAssertTrue(added, "New terminal adds a tab")
    let mine = start + 1
    XCTAssertTrue(app.buttons["terminal-tab-\(mine)"].isSelected)

    let terminal = app.descendants(matching: .any)["terminal-view"]
    XCTAssertTrue(terminal.waitForExistence(timeout: 15))
    let prompted = await Panels.waitUntil { !text(terminal).isEmpty }
    XCTAssertTrue(prompted, "The shell should print a prompt")
    terminal.tap()
    XCTAssertTrue(app.buttons["terminal-key-esc"].waitForExistence(timeout: 5), "The key bar shows over the keyboard")

    // Typing reaches the shell and its output comes back.
    app.typeText("clear\n")
    app.typeText("echo out-\(tag)\n")
    let printed = await Panels.waitUntil { count(terminal, "out-\(tag)") == 2 }
    XCTAssertTrue(printed, "The command and its output: \(text(terminal))")
    Panels.shot("terminal")

    // Tab completes a command name.
    app.typeText("printen")
    app.buttons["terminal-key-tab"].tap()
    let completed = await Panels.waitUntil(timeout: 10) { lastLine(terminal).contains("printenv") }
    XCTAssertTrue(completed, "Tab should complete printenv: \(lastLine(terminal))")
    // Ctrl+C clears the line.
    app.buttons["terminal-key-ctrl"].tap()
    XCTAssertTrue(app.buttons["terminal-key-ctrl"].isSelected, "Ctrl stays on for the next key")
    app.typeText("c")
    let cleared = await Panels.waitUntil(timeout: 10) { !lastLine(terminal).contains("printenv") }
    XCTAssertTrue(cleared)
    XCTAssertFalse(app.buttons["terminal-key-ctrl"].isSelected, "Ctrl turns off after one key")

    // Esc then "." inserts the last word of the previous command (readline and zle).
    app.typeText("echo ")
    app.buttons["terminal-key-esc"].tap()
    app.typeText(".")
    let inserted = await Panels.waitUntil(timeout: 10) { lastLine(terminal).contains("echo out-\(tag)") }
    XCTAssertTrue(inserted, "Esc . should insert out-\(tag): \(lastLine(terminal))")
    app.buttons["terminal-key-ctrl"].tap()
    app.typeText("c")

    // Ctrl+C interrupts a running command.
    app.typeText("sleep 30\n")
    try await Task.sleep(for: .seconds(1))
    app.buttons["terminal-key-ctrl"].tap()
    app.typeText("c")
    app.typeText("echo after-\(tag)\n")
    let interrupted = await Panels.waitUntil(timeout: 10) { count(terminal, "after-\(tag)") == 2 }
    XCTAssertTrue(interrupted, "Ctrl+C should stop sleep 30: \(text(terminal))")

    // Up recalls history; Down returns to the empty line; Left moves the cursor.
    app.buttons["terminal-key-up"].tap()
    let recalled = await Panels.waitUntil(timeout: 10) { lastLine(terminal).contains("echo after-\(tag)") }
    XCTAssertTrue(recalled, "Up should recall the last command: \(lastLine(terminal))")
    app.buttons["terminal-key-up"].tap()
    let older = await Panels.waitUntil(timeout: 10) { lastLine(terminal).contains("sleep 30") }
    XCTAssertTrue(older, "Up again goes further back: \(lastLine(terminal))")
    app.buttons["terminal-key-down"].tap()
    app.buttons["terminal-key-down"].tap()
    let empty = await Panels.waitUntil(timeout: 10) { !lastLine(terminal).contains("after-") }
    XCTAssertTrue(empty)
    app.typeText("echo ab")
    app.buttons["terminal-key-left"].tap()
    app.typeText("X")
    app.buttons["terminal-key-right"].tap()
    app.typeText("\n")
    let edited = await Panels.waitUntil(timeout: 10) { lines(terminal).contains("aXb") }
    XCTAssertTrue(edited, "Left should move the cursor before b: \(text(terminal))")
    Panels.shot("terminal-keys")
    app.buttons["terminal-key-hide"].tap()
    XCTAssertTrue(app.buttons["terminal-key-esc"].waitForNonExistence(timeout: 5), "The keyboard hides")

    // A second tab, then back to the first, whose output is still there.
    new.tap()
    let second = await Panels.waitUntil { tabs.count == mine + 1 }
    XCTAssertTrue(second)
    XCTAssertTrue(app.buttons["terminal-tab-\(mine + 1)"].isSelected)
    let fresh = await Panels.waitUntil { !text(terminal).isEmpty }
    XCTAssertTrue(fresh)
    XCTAssertEqual(count(terminal, "out-\(tag)"), 0, "A new tab has its own shell")
    app.buttons["terminal-tab-\(mine)"].tap()
    let back = await Panels.waitUntil { count(terminal, "aXb") > 0 }
    XCTAssertTrue(back, "Switching back shows the first tab's output: \(text(terminal))")
    app.buttons["terminal-tab-close-\(mine + 1)"].tap()
    let closed = await Panels.waitUntil { tabs.count == mine }
    XCTAssertTrue(closed, "Closing a tab removes it")

    // To the background and back: the tab reconnects from its cursor, nothing repeats.
    terminal.tap()
    app.typeText("clear\n")
    app.typeText("echo once-\(tag)\n")
    let once = await Panels.waitUntil { count(terminal, "once-\(tag)") == 2 }
    XCTAssertTrue(once)
    XCUIDevice.shared.press(.home)
    try await Task.sleep(for: .seconds(2))
    app.activate()
    XCTAssertTrue(terminal.waitForExistence(timeout: 10))
    let status = app.staticTexts["terminal-status"]
    let reconnected = await Panels.waitUntil { (status.label).isEmpty || !status.exists }
    XCTAssertTrue(reconnected, "The tab reconnects: \(status.label)")
    try await Task.sleep(for: .seconds(2))
    XCTAssertEqual(count(terminal, "once-\(tag)"), 2, "No duplicated output: \(text(terminal))")
    terminal.tap()
    app.typeText("echo still-\(tag)\n")
    let alive = await Panels.waitUntil { count(terminal, "still-\(tag)") == 2 }
    XCTAssertTrue(alive, "Input works after reconnecting")

    // An exited shell keeps its tab with the Exited badge.
    app.typeText("exit\n")
    let exited = await Panels.waitUntil(timeout: 20) {
      app.buttons["terminal-tab-\(mine)"].label.contains("Exited")
    }
    XCTAssertTrue(exited, "The tab shows Exited: \(app.buttons["terminal-tab-\(mine)"].label)")
    XCTAssertTrue(status.label.contains("xited"), status.label)
    XCTAssertTrue(
      app.buttons["terminal-key-esc"].waitForNonExistence(timeout: 5),
      "An exited shell puts the keyboard away")
    Panels.shot("terminal-exited")
    app.buttons["terminal-tab-close-\(mine)"].tap()
    let gone = await Panels.waitUntil { tabs.count == mine - 1 }
    XCTAssertTrue(gone)

    app.buttons["terminal-close"].tap()
    XCTAssertTrue(app.buttons["chat.actions"].waitForExistence(timeout: 5))
  }

  // MARK: Helpers

  @MainActor private func enabled(_ element: XCUIElement) async {
    _ = await Panels.waitUntil(timeout: 15) { element.isEnabled }
  }

  @MainActor private func text(_ terminal: XCUIElement) -> String {
    (terminal.value as? String) ?? ""
  }

  @MainActor private func lines(_ terminal: XCUIElement) -> [String] {
    text(terminal).split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
  }

  @MainActor private func lastLine(_ terminal: XCUIElement) -> String {
    lines(terminal).last ?? ""
  }

  @MainActor private func count(_ terminal: XCUIElement, _ needle: String) -> Int {
    text(terminal).components(separatedBy: needle).count - 1
  }

  private static func terminalIDs(_ gateway: TestGateway) async throws -> [String] {
    let list = try await gateway.get("/terminals", ["directory": directory]) as? [[String: Any]] ?? []
    return list.compactMap { $0["id"] as? String }
  }
}
