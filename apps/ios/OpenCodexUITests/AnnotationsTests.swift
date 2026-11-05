import XCTest

/// A sent prompt with review comments: the chip, then its numbered list, as on the desktop.
nonisolated final class AnnotationsTests: XCTestCase {
  /// "Mentions and annotations" in `home-demo`: a file mention, one annotation and two comments.
  private let chat = ProcessInfo.processInfo.environment["OPENCODEX_ANNOTATED_CHAT"] ?? "ses_e56fa6914ffez9zRF04mLtEERF"

  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor
  func testAnnotationsChipOpensItsList() throws {
    let app = XCUIApplication.opencodex(["-session", chat])
    app.launch()
    let chip = app.buttons["transcript.annotations"]
    XCTAssertTrue(chip.waitForExistence(timeout: 15))
    XCTAssertEqual(chip.label, "1 annotation, 2 comments")
    // The bubble keeps only the user's own words.
    XCTAssertTrue(app.descendants(matching: .any)["transcript.user"].firstMatch.label.hasPrefix("Summarize @README.md"))
    chip.tap()
    XCTAssertTrue(app.staticTexts["Annotation 1"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Comment 2"].exists || app.descendants(matching: .any)["transcript.annotations.list"].exists)
    try shot("annotations-list")
  }

  /// Saves a screenshot when `OPENCODEX_SHOTS` names a folder, for comparing with the desktop.
  @MainActor
  private func shot(_ name: String) throws {
    guard let folder = ProcessInfo.processInfo.environment["OPENCODEX_SHOTS"] else { return }
    sleep(1)
    try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "\(folder)/\(name).png"))
  }
}
