import XCTest

/// The composer's "+" menu: attach a photo, the camera (hidden without one), and Full access.
nonisolated final class ComposerPlusMenuTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testAttachingAndRemovingAPhoto() async throws {
    let session = try await TestGateway().createSession()
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()
    XCTAssertTrue(app.composerInput.waitForExistence(timeout: 15))

    app.openPlusMenu()
    let library = app.buttons["Photo Library"]
    XCTAssertTrue(library.waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["Camera"].exists, "The simulator has no camera")
    library.tap()

    // The system photo picker: pick the first photo and add it.
    let photo = app.images.matching(NSPredicate(format: "label BEGINSWITH 'Photo'")).firstMatch
    XCTAssertTrue(photo.waitForExistence(timeout: 15), "The photo picker shows the library")
    photo.tap()
    let add = app.buttons["Add"]
    if add.waitForExistence(timeout: 3) { add.tap() }

    let thumbnail = app.descendants(matching: .any)["Attached photo"]
    XCTAssertTrue(thumbnail.waitForExistence(timeout: 20), "The picked photo shows as a thumbnail")
    XCTAssertTrue(app.buttons["composer.send"].isEnabled, "A photo alone can be sent")
    XCTAssertTrue(app.buttons["composer.model"].exists, "An attachment keeps the composer expanded")

    let remove = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Remove photo'")).firstMatch
    XCTAssertTrue(remove.exists)
    remove.tap()
    XCTAssertTrue(thumbnail.waitForNonExistence(timeout: 5))
    XCTAssertFalse(app.buttons["composer.send"].isEnabled)
  }

  /// Full access asks first, then shows on the "+" button; turning it off doesn't ask.
  @MainActor func testFullAccessToggle() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()
    let plus = app.buttons["composer.attach"]
    XCTAssertTrue(plus.waitForExistence(timeout: 15))
    XCTAssertEqual(plus.label, "Attach and permissions")

    // Cancel leaves it off.
    app.openPlusMenu()
    fullAccessItem(app).tap()
    let alert = app.alerts["Enable full access?"]
    XCTAssertTrue(alert.waitForExistence(timeout: 5))
    alert.buttons["Cancel"].tap()
    XCTAssertEqual(plus.label, "Attach and permissions")

    app.openPlusMenu()
    fullAccessItem(app).tap()
    XCTAssertTrue(alert.waitForExistence(timeout: 5))
    alert.buttons["Enable full access"].tap()
    await waitFor(timeout: 10) { plus.label == "Attach and permissions, full access on" }
    try await gateway.waitFor { try await gateway.fullAccess(session) }

    app.openPlusMenu()
    let item = fullAccessItem(app)
    XCTAssertTrue(item.isSelected || item.value as? String == "1", "The menu shows it on")
    item.tap()
    XCTAssertFalse(alert.waitForExistence(timeout: 2), "Turning it off doesn't ask")
    await waitFor(timeout: 10) { plus.label == "Attach and permissions" }
    try await gateway.waitFor { try await !gateway.fullAccess(session) }
  }

  /// A new thread keeps the choice until its first message creates it.
  @MainActor func testFullAccessOnANewThread() async throws {
    let gateway = TestGateway()
    let app = XCUIApplication.opencodex()
    app.launch()
    app.buttons["new-chat"].tap()
    let project = app.buttons["project-home-demo"]
    XCTAssertTrue(project.waitForExistence(timeout: 10))
    project.tap()

    let plus = app.buttons["composer.attach"]
    XCTAssertTrue(plus.waitForExistence(timeout: 10))
    app.openPlusMenu()
    fullAccessItem(app).tap()
    app.alerts["Enable full access?"].buttons["Enable full access"].tap()
    await waitFor(timeout: 5) { plus.label == "Attach and permissions, full access on" }

    let text = "Full access \(UUID().uuidString.prefix(6))"
    app.composerInput.tap()
    app.composerInput.typeText(text)
    app.buttons["composer.send"].tap()
    XCTAssertTrue(app.buttons["chat.details"].waitForExistence(timeout: 20), "The thread exists")

    let id = try await gateway.sessionSent(text, in: TestGateway.homeDemo)
    try await gateway.waitFor { try await gateway.fullAccess(id) }
    XCTAssertEqual(plus.label, "Attach and permissions, full access on")
  }

  private func fullAccessItem(_ app: XCUIApplication) -> XCUIElement {
    let item = app.switches["Full access"].exists ? app.switches["Full access"] : app.buttons["Full access"]
    XCTAssertTrue(item.waitForExistence(timeout: 5))
    return item
  }
}

extension TestGateway {
  /// A trailing allow-all rule is the thread's Full access override.
  func fullAccess(_ id: String) async throws -> Bool {
    guard let rule = (try await session(id)["permissions"] as? [[String: Any]])?.last else { return false }
    return rule["action"] as? String == "*" && rule["resource"] as? String == "*"
      && rule["effect"] as? String == "allow"
  }
}
