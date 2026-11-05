import XCTest

/// The running-activity pill and tray against the live loopback gateway, with the scripted
/// model's `run:` and `subagent:` prompts.
nonisolated final class ActivityTests: XCTestCase {
  private let gateway = ChatFixture()

  override func setUp() {
    continueAfterFailure = false
  }

  /// "1 shell" pill → tray tabs → Move to background → live output sheet → Stop confirms.
  @MainActor
  func testShellPillTrayBackgroundAndStop() async throws {
    let id = try await gateway.chat("QA activity shell")
    try await gateway.prompt(id, "run: sleep 240 && echo done")

    let app = XCUIApplication.chat(id)
    app.launch()
    // Collapsed, the tray is OpenCode's small "1 shell" pill, with Background while the reply
    // waits on it.
    let pill = app.buttons["activity.pill"]
    XCTAssertTrue(pill.waitForExistence(timeout: 60), "The pill never showed the running shell")
    XCTAssertTrue(pill.wait(until: "label == '1 shell'"), pill.label)
    XCTAssertTrue(app.buttons["activity.background"].waitForExistence(timeout: 10))
    screenshot("activity-pill")

    pill.tap()
    let shellTab = app.buttons["activity.tab.shell"]
    let subagentTab = app.buttons["activity.tab.subagents"]
    XCTAssertTrue(shellTab.waitForExistence(timeout: 5), "Tapping the pill opens the tray")
    XCTAssertTrue(shellTab.label.hasPrefix("Shell (1)"), shellTab.label)
    XCTAssertTrue(shellTab.isSelected, "With no subagents the tray opens on Shell")
    let row = app.buttons["activity.shell.row"]
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    XCTAssertTrue(row.label.contains("sleep 240"))
    XCTAssertTrue((row.value as? String ?? "").hasPrefix("Foreground"))

    // The tabs switch panels.
    subagentTab.tap()
    XCTAssertTrue(subagentTab.wait(until: "selected == true"))
    XCTAssertTrue(app.staticTexts["No running subagents"].waitForExistence(timeout: 5))
    XCTAssertFalse(row.exists)
    shellTab.tap()
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    screenshot("activity-tray")

    // The chevron folds the tray back into the pill.
    app.buttons["activity.toggle"].tap()
    XCTAssertTrue(pill.waitForExistence(timeout: 5))
    XCTAssertFalse(shellTab.exists)
    pill.tap()
    XCTAssertTrue(row.waitForExistence(timeout: 5))

    // Move to background: the reply stops waiting; the command keeps running.
    app.buttons["activity.background"].tap()
    XCTAssertTrue(app.buttons["activity.background"].waitForNonExistence(timeout: 20))
    XCTAssertTrue(row.wait(until: "value BEGINSWITH 'Background'", timeout: 20), row.value as? String ?? "")

    row.tap()
    let command = app.staticTexts["shell.command"]
    XCTAssertTrue(command.waitForExistence(timeout: 10), "The row opens the live output")
    XCTAssertTrue(command.label.contains("sleep 240"))
    XCTAssertTrue(app.staticTexts["shell.status"].label.hasPrefix("Running"))
    screenshot("shell-output")

    let shells = try await gateway.call("/shells?directory=\(ChatFixture.homeDemo)") as? [[String: Any]] ?? []
    let shell = try XCTUnwrap(
      shells.first { ($0["metadata"] as? [String: Any])?["sessionID"] as? String == id }?["id"] as? String)

    // Stop asks first; Cancel keeps it running.
    app.buttons["shell.stop"].tap()
    XCTAssertTrue(app.buttons["shell.stop.confirm"].waitForExistence(timeout: 5))
    screenshot("shell-stop-confirm")
    // The native confirmation is a popover on iPhone: tapping outside cancels it.
    if app.buttons["Cancel"].exists {
      app.buttons["Cancel"].tap()
    } else {
      app.otherElements["PopoverDismissRegion"].firstMatch.tap()
    }
    XCTAssertTrue(app.buttons["shell.stop.confirm"].waitForNonExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["shell.status"].label.hasPrefix("Running"), "Cancel keeps it running")
    app.buttons["shell.stop"].tap()
    let confirm = app.buttons["shell.stop.confirm"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5))
    confirm.tap()
    // Stopping closes the sheet and ends that command, not the chat.
    XCTAssertTrue(command.waitForNonExistence(timeout: 10))
    // A stopped command leaves the running list (OpenCode drops it).
    let after = try await gateway.call("/shells?directory=\(ChatFixture.homeDemo)") as? [[String: Any]] ?? []
    XCTAssertFalse(after.contains { $0["id"] as? String == shell && $0["status"] as? String == "running" })

    // Once nothing runs, the tray goes away.
    try await gateway.call("/sessions/\(id)/interrupt", [:])
    XCTAssertTrue(row.waitForNonExistence(timeout: 20))
    XCTAssertTrue(pill.waitForNonExistence(timeout: 20))
  }

  /// "1 subagent" pill → Subagents tab → the reader sheet streams the child and closes; then
  /// the Subagents list from the chat's menu opens the same reader.
  @MainActor
  func testSubagentPillReaderAndList() async throws {
    let id = try await gateway.chat("QA activity subagent")
    let app = XCUIApplication.chat(id)
    app.launch()
    XCTAssertTrue(app.descendants(matching: .any)["transcript.empty"].waitForExistence(timeout: 15))
    // The child streams the scripted model's long answer for about 13 seconds.
    try await gateway.prompt(id, "subagent: long")
    let pill = app.buttons["activity.pill"]
    XCTAssertTrue(pill.waitForExistence(timeout: 15), "The pill never showed the subagent")
    XCTAssertTrue(pill.wait(until: "label BEGINSWITH '1 subagent'", timeout: 5), pill.label)
    screenshot("subagent-pill")
    pill.tap()
    let tab = app.buttons["activity.tab.subagents"]
    XCTAssertTrue(tab.waitForExistence(timeout: 5))
    XCTAssertTrue(tab.isSelected, "With a subagent the tray opens on Subagents")
    let row = app.buttons["activity.subagent.row"]
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    XCTAssertTrue((row.value as? String ?? "").hasPrefix("General"), row.value as? String ?? "")
    screenshot("subagent-tray")
    row.tap()
    let header = app.descendants(matching: .any)["subagent.header"]
    XCTAssertTrue(header.waitForExistence(timeout: 10), "The row opens the reader")
    let streamed = app.textViews.matching(NSPredicate(format: "value BEGINSWITH 'Streaming text should flow'"))
      .firstMatch
    XCTAssertTrue(streamed.waitForExistence(timeout: 20), "The reader shows the child's reply")
    screenshot("subagent-reader")
    // The reader stays open after the child finishes and the tray goes away.
    try await gateway.idle(id)
    XCTAssertTrue(tab.waitForNonExistence(timeout: 20), "The tray goes away once nothing runs")
    XCTAssertTrue(header.exists, "Finishing the child must not close its reader")
    app.buttons["subagent.close"].tap()
    XCTAssertTrue(header.waitForNonExistence(timeout: 5))

    // The chat's menu lists every subagent, finished ones too.
    app.buttons["chat.actions"].tap()
    let menu = app.buttons["chat.subagents"]
    XCTAssertTrue(menu.waitForExistence(timeout: 5))
    menu.tap()
    let listed = app.descendants(matching: .any)["subagents.row"].firstMatch
    XCTAssertTrue(listed.waitForExistence(timeout: 10))
    XCTAssertTrue(listed.label.contains("Completed"), listed.label)
    screenshot("subagents-list")
    listed.tap()
    XCTAssertTrue(header.waitForExistence(timeout: 10), "The list opens the reader")
    // Back from the sheet's own (topmost) navigation bar, not the chat's beneath it.
    let bars = app.navigationBars
    bars.element(boundBy: bars.count - 1).buttons["BackButton"].tap()
    XCTAssertTrue(listed.waitForExistence(timeout: 5))
    app.buttons["subagents.close"].tap()
    XCTAssertTrue(listed.waitForNonExistence(timeout: 5))
  }

  /// A child's approval shows on the pill and is answered in the reader. Needs the scripted
  /// model to run a child's `run:` command, which it doesn't while OpenCode prefixes the
  /// child's prompt; the test then skips.
  @MainActor
  func testSubagentApprovalInTheReader() async throws {
    // `proj` asks before shell commands, so the child stops for approval.
    let id = try await gateway.chat("QA activity subagent approval", in: ChatFixture.proj)
    try await gateway.prompt(id, "subagent: sleep 120 && echo done")
    var child: String?
    for _ in 0..<20 where child == nil {
      try await Task.sleep(for: .seconds(1))
      let page = try await gateway.call("/sessions/\(id)/subagents") as? [String: Any]
      for item in page?["data"] as? [[String: Any]] ?? [] {
        guard let childID = item["id"] as? String else { continue }
        let requests = try await gateway.call("/sessions/\(childID)/permissions") as? [Any] ?? []
        if !requests.isEmpty { child = childID }
      }
    }
    guard child != nil else {
      try await gateway.call("/sessions/\(id)/interrupt", [:])
      throw XCTSkip("The scripted model's subagent never asked for approval (it ignores a prefixed `run:`)")
    }
    let app = XCUIApplication.chat(id)
    app.launch()
    let pill = app.buttons["activity.pill"]
    XCTAssertTrue(pill.waitForExistence(timeout: 30))
    XCTAssertTrue(pill.wait(until: "value CONTAINS 'need approval'", timeout: 30), pill.value as? String ?? "")
    pill.tap()
    let row = app.buttons["activity.subagent.row"]
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    XCTAssertTrue((row.value as? String ?? "").contains("Needs approval"))
    row.tap()
    let card = app.descendants(matching: .any)["request.permission"]
    XCTAssertTrue(card.waitForExistence(timeout: 15), "The reader shows the child's approval")
    app.buttons["permission.once"].tap()
    XCTAssertTrue(card.waitForNonExistence(timeout: 15))
    app.buttons["subagent.close"].tap()
    XCTAssertTrue(row.wait(until: "NOT (value CONTAINS 'Needs approval')", timeout: 15))
    try await gateway.call("/sessions/\(id)/interrupt", [:])
  }
}
