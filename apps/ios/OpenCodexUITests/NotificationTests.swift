import XCTest

/// The desktop's "Reply finished" notification on the phone: asked once after pairing, raised
/// for a chat that isn't on screen, and opening that chat when tapped.
nonisolated final class NotificationTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testAReplyInAnotherChatNotifiesAndOpensIt() async throws {
    let gateway = TestGateway()
    let title = "Notify \(UUID().uuidString.prefix(6))"
    let app = XCUIApplication.opencodex(["-reset"])
    app.launch()

    let turnOn = app.buttons["notifications-turn-on"]
    XCTAssertTrue(turnOn.waitForExistence(timeout: 10), "Pairing should ask about notifications")
    turnOn.tap()
    // iOS's own permission alert, the first time.
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let allow = springboard.buttons["Allow"]
    if allow.waitForExistence(timeout: 5) { allow.tap() }
    XCTAssertTrue(turnOn.waitForNonExistence(timeout: 5))

    // A chat the phone isn't showing finishes a reply.
    let root = "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios/home-demo"
    let session = try await gateway.call(
      "/sessions", ["directory": root, "model": TestGateway.model])
    let id = try XCTUnwrap((session as? [String: Any])?["id"] as? String)
    try await gateway.call("/sessions/\(id)/action", ["action": "rename", "title": title])
    try await gateway.call(
      "/sessions/\(id)/prompt", ["text": "Say hello", "model": TestGateway.model])

    let banner = springboard.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
    XCTAssertTrue(banner.waitForExistence(timeout: 90), "The finished reply should notify")
    XCTAssertTrue(banner.label.contains("Reply finished"), banner.label)
    banner.tap()

    // The banner opens that chat.
    XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 10))
  }
}
