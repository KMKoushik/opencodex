import XCTest

/// The transcript against the live loopback gateway's markdown chat.
nonisolated final class TranscriptTests: XCTestCase {
  private let markdownChat = "ses_e57ae20fdffeG4BE6dcLy2S9aB"

  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor
  func testMarkdownAnswer() {
    let app = XCUIApplication.opencodex(["-session", markdownChat])
    app.launch()
    // The answer's last paragraph, where the chat opens.
    let answer = app.textViews.matching(
      NSPredicate(format: "value CONTAINS 'deliberately tiny TypeScript project'")
    ).firstMatch
    XCTAssertTrue(answer.waitForExistence(timeout: 15))
    XCTAssertTrue(
      app.otherElements["transcript.table"].exists
        || app.staticTexts["transcript.code"].exists)
    // The finished answer offers Copy, worded like the desktop.
    XCTAssertTrue(app.buttons["Copy response"].waitForExistence(timeout: 5))
    // Earlier work folds under the turn header; opening it reveals the activity group.
    let turn = app.buttons["transcript.turn"].firstMatch
    if !turn.isHittable { app.collectionViews["transcript"].swipeDown(velocity: .fast) }
    XCTAssertTrue(turn.waitForExistence(timeout: 5))
    turn.tap()
    XCTAssertTrue(app.buttons["transcript.activity"].firstMatch.waitForExistence(timeout: 5))
  }

  /// Flings a long chat (set `OPENCODEX_LONG_CHAT` to its session ID) and measures hitches.
  @MainActor
  func testScrollPerformance() throws {
    guard let chat = ProcessInfo.processInfo.environment["OPENCODEX_LONG_CHAT"] else {
      throw XCTSkip("Set OPENCODEX_LONG_CHAT to a long chat's session ID")
    }
    // The app logs its own frame pacing under the `hitches` category while flinging.
    let app = XCUIApplication.opencodex(["-session", chat, "-transcriptHitches", "YES"])
    app.launch()
    let list = app.collectionViews["transcript"]
    XCTAssertTrue(list.waitForExistence(timeout: 15))
    sleep(2)
    let options = XCTMeasureOptions()
    options.iterationCount = 5
    measure(metrics: [XCTOSSignpostMetric.scrollDecelerationMetric], options: options) {
      list.swipeDown(velocity: .fast)
      list.swipeDown(velocity: .fast)
      list.swipeUp(velocity: .fast)
      list.swipeUp(velocity: .fast)
    }
  }
}
