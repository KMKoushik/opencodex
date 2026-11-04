import XCTest

/// Manual pairing against the loopback gateway, which refuses pairing with its own message.
nonisolated final class PairingTests: XCTestCase {
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
}
