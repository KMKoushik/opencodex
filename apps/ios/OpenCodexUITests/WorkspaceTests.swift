import XCTest

/// The workspace panel: a new file shows under Changes with its status and diff, and opens as
/// a numbered preview from All files.
nonisolated final class WorkspaceTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testChangedFileShowsDiffAndPreview() async throws {
    let gateway = TestGateway()
    let name = "workspace-\(UUID().uuidString.prefix(8).lowercased()).ts"
    let file = URL(fileURLWithPath: gateway.directory).appending(path: name)
    try "export const one = 1;\nexport const two = 2;\n".write(to: file, atomically: true, encoding: .utf8)
    addTeardownBlock { try? FileManager.default.removeItem(at: file) }
    let session = try await gateway.createSession()

    let app = XCUIApplication.opencodex(["-session", session, "-workspace", "YES"])
    app.launch()

    let changes = app.buttons["workspace-changes"]
    XCTAssertTrue(changes.waitForExistence(timeout: 15), "The workspace should open")
    changes.tap()
    app.buttons["workspace-mode-working"].tap()

    let row = app.buttons["tree-\(name)"]
    XCTAssertTrue(row.waitForExistence(timeout: 15), "The untracked file should be listed")
    XCTAssertTrue(row.label.contains("added"))
    row.tap()

    let header = app.descendants(matching: .any)["diff-header"]
    XCTAssertTrue(header.waitForExistence(timeout: 15))
    XCTAssertTrue(header.label.contains("+2"), header.label)
    XCTAssertTrue(app.descendants(matching: .any)["Added line 1: export const one = 1;"].exists)

    app.buttons["diff-open-file"].tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["Line 2: export const two = 2;"].waitForExistence(timeout: 15),
      "Opening the file should show numbered lines")

    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.buttons["workspace-files"].tap()
    XCTAssertTrue(app.buttons["tree-\(name)"].waitForExistence(timeout: 15))
  }
}
