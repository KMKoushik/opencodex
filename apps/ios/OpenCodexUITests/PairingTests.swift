import XCTest

/// Pairing on an unpaired iPhone: manual entry checks what's typed, the gateway's refusal is
/// shown, and the simulator explains that it can't scan.
nonisolated final class PairingTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  override func record(_ issue: XCTIssue) {
    XCUIApplication().snap("fail-\(name.split(separator: " ").last?.dropLast() ?? "")")
    super.record(issue)
  }

  @MainActor func testManualPairingShowsGatewayError() {
    let app = XCUIApplication()
    app.launchArguments = ["-reset"]
    app.launch()

    app.buttons["pairing.manual"].tap()
    let host = app.textFields["pairing.host"]
    XCTAssert(host.waitForExistence(timeout: 5))
    host.tap()
    host.typeText(ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310")
    let code = app.textFields["pairing.code"]
    code.tap()
    code.typeText("ABCD234567")

    let pair = app.buttons["pairing.submit"]
    XCTAssert(pair.isEnabled)
    pair.tap()

    let error = app.staticTexts["pairing.error"]
    XCTAssert(error.waitForExistence(timeout: 10))
    XCTAssertEqual(error.label, "Open the pairing link on the device you’re adding.")
  }

  @MainActor func testManualEntryValidation() {
    let app = XCUIApplication()
    app.launchArguments = ["-reset"]
    app.launch()
    app.buttons["pairing.manual"].tap()

    let host = app.textFields["pairing.host"]
    let code = app.textFields["pairing.code"]
    let pair = app.buttons["pairing.submit"]
    XCTAssert(host.waitForExistence(timeout: 5))
    XCTAssertFalse(pair.isEnabled, "Nothing typed yet")

    // Only https, or http on loopback.
    host.tap()
    host.typeText("http://ox.example.com")
    XCTAssertTrue(app.staticTexts["Use an https address, like ox.example.com."].waitForExistence(timeout: 3))
    host.clearField()
    host.typeText("ox.example.com")
    XCTAssertTrue(app.staticTexts["Use an https address, like ox.example.com."].waitForNonExistence(timeout: 3))

    // The code is counted, formatted, and checked for lookalikes.
    code.tap()
    code.typeText("abcde")
    XCTAssertTrue(app.staticTexts["5 of 10 characters"].waitForExistence(timeout: 3))
    code.typeText("0")
    XCTAssertTrue(app.staticTexts["Codes never use 0, 1, I or O."].waitForExistence(timeout: 3))
    XCTAssertFalse(pair.isEnabled)
    code.clearField()
    code.typeText("abcde*")
    XCTAssertTrue(app.staticTexts["Codes use only letters and digits."].waitForExistence(timeout: 3))
    code.clearField()
    code.typeText("abcde23456")
    XCTAssertEqual(code.value as? String, "abcde23456", "Every keystroke lands")
    XCTAssertTrue(pair.isEnabled)
    // Leaving the field shows the code the way the computer does.
    host.tap()
    XCTAssertEqual(code.value as? String, "ABCDE-23456")
    app.snap("pairing-manual")

    // A pasted pairing link fills in both fields.
    host.clearField()
    UIPasteboard.general.string = "https://pair.example.com/#pair=XYZWV98765"
    host.press(forDuration: 1.2)
    let paste = app.menuItems["Paste"]
    if paste.waitForExistence(timeout: 3) {
      paste.tap()
      XCTAssertEqual(host.value as? String, "pair.example.com")
      XCTAssertEqual(code.value as? String, "XYZWV-98765")
    }

    // The error path: nothing answers at that address.
    host.clearField()
    host.typeText("http://127.0.0.1:9")
    code.clearField()
    code.typeText("abcde23456")
    XCTAssertTrue(pair.isEnabled)
    pair.tap()
    let error = app.staticTexts["pairing.error"]
    XCTAssertTrue(error.waitForExistence(timeout: 15))
    XCTAssertTrue(error.label.contains("couldn’t be reached"), error.label)
    app.snap("pairing-error")
  }

  @MainActor func testScannerUnavailableOffersManualEntry() {
    let app = XCUIApplication()
    app.launchArguments = ["-reset"]
    app.launch()
    app.buttons["pairing.scan"].tap()
    // The simulator has no camera scanner.
    XCTAssertTrue(app.staticTexts["Scanning Isn’t Available"].waitForExistence(timeout: 5))
    app.snap("pairing-scan-unavailable")
    app.buttons["pairing.scan.manual"].tap()
    XCTAssertTrue(app.textFields["pairing.host"].waitForExistence(timeout: 5))
  }
}

extension XCUIElement {
  /// Deletes a text field's contents.
  func clearField() {
    guard let text = value as? String, !text.isEmpty else { return }
    tap()
    // Move to the end, then delete everything.
    coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
    typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: text.count + 2))
  }
}
