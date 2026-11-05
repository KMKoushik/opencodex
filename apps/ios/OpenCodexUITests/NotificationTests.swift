import XCTest

/// The desktop's notifications on the phone: the one-time ask after pairing, the Settings
/// switches, a "Reply finished" banner for a chat that isn't on screen (tapping it opens that
/// chat), and a muted chat staying quiet.
nonisolated final class NotificationTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  /// "Not now" closes the ask; Settings → General turns each kind on and off.
  @MainActor func testPromptNotNow() async throws {
    let app = XCUIApplication.opencodex(["-reset"])
    app.launch()
    let notNow = app.buttons["notifications-not-now"]
    XCTAssertTrue(notNow.waitForExistence(timeout: 10), "Pairing should ask about notifications")
    Panels.shot("notifications-prompt")
    notNow.tap()
    XCTAssertTrue(notNow.waitForNonExistence(timeout: 5))

    // The notification switches are tapped through in HomeSettingsTests.
  }

  /// A muted chat finishes quietly; an unmuted one shows a banner that opens it.
  @MainActor func testBannerOpensChatAndMutedStaysQuiet() async throws {
    let gateway = TestGateway()
    let app = XCUIApplication.opencodex(["-reset"])
    app.launch()

    let turnOn = app.buttons["notifications-turn-on"]
    XCTAssertTrue(turnOn.waitForExistence(timeout: 10), "Pairing should ask about notifications")
    turnOn.tap()
    allowSystemAlert()
    XCTAssertTrue(turnOn.waitForNonExistence(timeout: 5))
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    // A muted chat the phone isn't showing finishes: no banner.
    let quiet = "Quiet \(UUID().uuidString.prefix(6))"
    let muted = try await gateway.createSession(in: Panels.homeDemo, title: quiet)
    try await gateway.call("/sessions/\(muted)/mute", ["muted": true])
    try await gateway.prompt(muted, "Say hello")
    try await gateway.waitIdle(muted)
    let quietBanner = springboard.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS %@", quiet)).firstMatch
    XCTAssertFalse(quietBanner.waitForExistence(timeout: 8), "A muted chat stays quiet")

    // An unmuted one notifies.
    let title = "Notify \(UUID().uuidString.prefix(6))"
    let id = try await gateway.createSession(in: Panels.homeDemo, title: title)
    try await gateway.prompt(id, "Say hello")
    let banner = springboard.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
    XCTAssertTrue(banner.waitForExistence(timeout: 90), "The finished reply should notify")
    XCTAssertTrue(banner.label.contains("Reply finished"), banner.label)
    Panels.shot("notifications-banner")
    banner.tap()

    // The banner opens that chat.
    XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 10))
  }

  /// iOS's own permission alert, the first time.
  @MainActor private func allowSystemAlert() {
    let allow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow"]
    if allow.waitForExistence(timeout: 3) { allow.tap() }
  }
}
