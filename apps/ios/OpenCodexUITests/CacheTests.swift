import XCTest

/// Cached threads show at once over a slow connection: `-gatewayDelay 1.5` holds every gateway
/// response for 1.5 s (Debug only; skipped in Release), so anything on screen sooner came from
/// the phone's caches.
nonisolated final class CacheTests: XCTestCase {
  @MainActor func testReopenAndRelaunchShowCachedThreads() async throws {
    #if !DEBUG
      throw XCTSkip("Needs the Debug-only -gatewayDelay launch argument.")
    #endif
    // Measured from before each launch or tap, which XCUITest returns from once the app idles.
    let quick: TimeInterval = 1
    let fixture = ChatFixture()
    let id = try await fixture.chat("Cache \(UUID().uuidString.prefix(6))")
    // The test gateway has no delete route; Done keeps test threads out of Focus.
    addTeardownBlock { _ = try? await fixture.call("/sessions/\(id)/focus", ["action": "done"]) }
    try await fixture.prompt(id, "hello from the cache test")
    try await fixture.idle(id)

    let arguments = ["-gatewayDelay", "1.5", "-threadView", "projects"]
    let app = XCUIApplication.opencodex(arguments + ["-clearLocalCache", "YES"])
    var start = Date.now
    app.launch()
    let row = app.buttons["thread-\(id)"]
    let user = app.descendants(matching: .any)["transcript.user"].firstMatch
    let spinner = app.descendants(matching: .any)["transcript.loading"]
    XCTAssertTrue(row.waitForExistence(timeout: 30))
    report("home, cold", start)

    start = .now
    row.tap()
    XCTAssertTrue(user.waitForExistence(timeout: 30))
    report("chat, cold", start)

    // Back and in again: the kept chat shows its transcript with no spinner.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    start = .now
    row.tap()
    XCTAssertTrue(user.waitForExistence(timeout: quick), "A reopened thread shows at once")
    report("chat, reopened", start)
    XCTAssertFalse(spinner.exists, "No spinner over a cached transcript")

    // A relaunch draws the home list and the chat from disk before any response could land.
    app.terminate()
    app.launchArguments = XCUIApplication.opencodex(arguments).launchArguments
    start = .now
    app.launch()
    XCTAssertTrue(row.waitForExistence(timeout: quick), "Home shows cached threads at launch")
    report("home, relaunched", start)
    start = .now
    row.tap()
    XCTAssertTrue(user.waitForExistence(timeout: quick), "A cached thread opens at once")
    report("chat, from disk", start)
    XCTAssertFalse(spinner.exists)
  }

  private func report(_ label: String, _ start: Date) {
    print("CACHE-TIMING \(label): \(Int(Date.now.timeIntervalSince(start) * 1000)) ms")
  }
}
