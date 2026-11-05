import XCTest

/// Settings, tapped through: General, Notifications, Appearance, Usage, About, and Forget.
nonisolated final class HomeSettingsTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  override func record(_ issue: XCTIssue) {
    XCUIApplication().snap("fail-\(name.split(separator: " ").last?.dropLast() ?? "")")
    super.record(issue)
  }

  @MainActor func testEverySettingsSection() throws {
    let app = XCUIApplication.home()
    app.launch()
    app.buttons["settings"].tap()
    XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))

    // About shows the version with the build number.
    let version = app.staticTexts.matching(
      NSPredicate(format: "label MATCHES %@", #"^\d+\.\d+\.\d+ \(\d+\)$"#)
    ).firstMatch
    XCTAssertTrue(version.waitForExistence(timeout: 5), "About should show version (build)")
    app.snap("settings")

    // General: the service, live updates and this computer's address.
    app.buttons["settings-general"].tap()
    let status = app.staticTexts["service-status"]
    let connected = NSPredicate(format: "label BEGINSWITH 'Connected · v'")
    XCTAssertTrue(expectation(for: connected, evaluatedWith: status).wait(timeout: 10), status.label)
    XCTAssertTrue(app.staticTexts["Connected"].waitForExistence(timeout: 10), "Live updates")
    XCTAssertTrue(app.staticTexts["127.0.0.1:4310"].exists, "The computer's address")
    app.buttons["service-check"].tap()
    XCTAssertTrue(expectation(for: connected, evaluatedWith: status).wait(timeout: 10))

    // Notifications: a switch per kind, asking iOS the first time.
    let monitor = addUIInterruptionMonitor(withDescription: "Notifications") { alert in
      let allow = alert.buttons["Allow"]
      guard allow.exists else { return false }
      allow.tap()
      return true
    }
    defer { removeUIInterruptionMonitor(monitor) }
    let reply = app.switches["notifications-reply"]
    XCTAssertTrue(reply.waitForExistence(timeout: 5))
    let before = reply.value as? String
    reply.switches.firstMatch.exists ? reply.switches.firstMatch.tap() : reply.tap()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    if springboard.buttons["Allow"].waitForExistence(timeout: 3) { springboard.buttons["Allow"].tap() }
    app.tap()
    let flipped = NSPredicate(format: "value != %@", before ?? "")
    let blocked = app.staticTexts["Notifications are blocked. Allow them in the Settings app, under Notifications."]
    XCTAssertTrue(
      expectation(for: flipped, evaluatedWith: reply).wait(timeout: 5) || blocked.exists,
      "The switch should turn on, or say iOS blocks it")
    app.snap("settings-general")
    if (reply.value as? String) != before {
      reply.switches.firstMatch.exists ? reply.switches.firstMatch.tap() : reply.tap()
      XCTAssertTrue(
        expectation(for: NSPredicate(format: "value == %@", before ?? ""), evaluatedWith: reply)
          .wait(timeout: 5))
    }
    app.navigationBars.buttons["Settings"].tap()

    // Appearance: mode, themes and the chat font size.
    app.buttons["settings-appearance"].tap()
    let dark = app.segmentedControls.buttons["Dark"]
    XCTAssertTrue(dark.waitForExistence(timeout: 5))
    dark.tap()
    XCTAssertTrue(dark.isSelected)
    app.snap("appearance-dark")

    app.buttons["dark-theme"].tap()
    app.buttons["theme-catppuccin-mocha"].tap()
    XCTAssertTrue(app.buttons["theme-catppuccin-mocha"].isSelected)
    app.navigationBars.buttons["Appearance"].tap()
    XCTAssertTrue(app.buttons["dark-theme"].label.contains("Catppuccin Mocha"), app.buttons["dark-theme"].label)
    app.snap("appearance-mocha")
    app.buttons["dark-theme"].tap()
    app.buttons["theme-opencodex-dark"].tap()
    app.navigationBars.buttons["Appearance"].tap()

    app.segmentedControls.buttons["Light"].tap()
    app.buttons["light-theme"].tap()
    app.buttons["theme-gruvbox-light"].tap()
    app.navigationBars.buttons["Appearance"].tap()
    XCTAssertTrue(app.buttons["light-theme"].label.contains("Gruvbox Light"), app.buttons["light-theme"].label)
    app.buttons["light-theme"].tap()
    app.buttons["theme-opencodex-light"].tap()
    app.navigationBars.buttons["Appearance"].tap()
    app.segmentedControls.buttons["System"].tap()

    let size = app.staticTexts["chat-font-size-value"]
    let reset = app.buttons["chat-font-size-reset"]
    if reset.isEnabled { reset.tap() }
    XCTAssertEqual(size.label, "14px")
    XCTAssertFalse(reset.isEnabled, "Reset is off at the default size")
    app.sliders["chat-font-size"].adjust(toNormalizedSliderPosition: 1)
    XCTAssertEqual(size.label, "20px")
    XCTAssertTrue(reset.isEnabled)
    reset.tap()
    XCTAssertEqual(size.label, "14px")
    app.navigationBars.buttons["Settings"].tap()

    // Usage: the plans' limits, or why there are none, and Refresh.
    app.buttons["settings-usage"].tap()
    XCTAssertTrue(app.navigationBars["Usage"].waitForExistence(timeout: 5))
    let refresh = app.buttons["Refresh limits"]
    XCTAssertTrue(refresh.waitForExistence(timeout: 5))
    let settled = NSPredicate(format: "enabled == true")
    XCTAssertTrue(expectation(for: settled, evaluatedWith: refresh).wait(timeout: 15))
    refresh.tap()
    XCTAssertTrue(expectation(for: settled, evaluatedWith: refresh).wait(timeout: 15))
    XCTAssertFalse(app.staticTexts["Checking limits…"].exists, "The limits should have loaded")
    app.snap("usage")
    app.buttons["settings-done"].firstMatch.tap()
    XCTAssertTrue(app.buttons["new-chat"].waitForExistence(timeout: 5))
  }

  @MainActor func testForgetThisComputerReturnsToPairing() {
    let app = XCUIApplication.home()
    app.launch()
    app.buttons["settings"].tap()
    app.buttons["settings-general"].tap()
    let forget = app.buttons["forget-computer"]
    XCTAssertTrue(forget.waitForExistence(timeout: 5))
    forget.tap()
    // The confirmation explains what forgetting does.
    let confirm = app.buttons["Forget"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5))
    app.snap("forget-confirm")
    confirm.tap()
    XCTAssertTrue(app.buttons["pairing.scan"].waitForExistence(timeout: 5), "Back to pairing")
    XCTAssertTrue(app.buttons["pairing.manual"].exists)
    app.snap("pairing")

    // Pairing again (the loopback gateway needs no code) brings the threads back.
    app.terminate()
    app.launch()
    XCTAssertTrue(app.buttons["new-chat"].waitForExistence(timeout: 15))
  }
}
