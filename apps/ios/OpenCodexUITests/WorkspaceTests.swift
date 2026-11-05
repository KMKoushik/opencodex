import UIKit
import XCTest

/// The workspace panel (chat "…" → Files and changes), through every control: Files/Changes,
/// Uncommitted/Base branch, the tree, search, each preview kind, diffs, the too-large states,
/// and a live refresh after the agent writes a file.
nonisolated final class WorkspaceTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  /// Tree expand and collapse, search, code with line numbers, Markdown source and preview,
  /// a document too large to render, image zoom, and a file over the preview bound.
  @MainActor func testFilesTreeSearchAndPreviews() async throws {
    let gateway = TestGateway()
    let tag = "qap\(UUID().uuidString.prefix(6).lowercased())"
    let folder = URL(fileURLWithPath: gateway.directory).appending(path: tag)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
    try "export const one = 1;\nexport function two() {\n  return 2;\n}\n"
      .write(to: folder.appending(path: "code-\(tag).ts"), atomically: true, encoding: .utf8)
    try "# Notes \(tag)\n\nSome **bold** text.\n"
      .write(to: folder.appending(path: "notes-\(tag).md"), atomically: true, encoding: .utf8)
    // Over the 200,000-character rendered preview limit, under the 2 MiB preview bound.
    try String(repeating: "A line of the large document.\n", count: 7_500)
      .write(to: folder.appending(path: "big-\(tag).md"), atomically: true, encoding: .utf8)
    try String(repeating: "x", count: 3_000_000)
      .write(to: folder.appending(path: "huge-\(tag).txt"), atomically: true, encoding: .utf8)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let image = UIGraphicsImageRenderer(size: CGSize(width: 800, height: 600), format: format).pngData { context in
      UIColor.systemTeal.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 800, height: 600))
    }
    try image.write(to: folder.appending(path: "pic-\(tag).png"))
    let session = try await gateway.createSession()

    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()
    Panels.openChatMenu(app, "Files and changes")
    let files = app.buttons["All files"]
    XCTAssertTrue(files.waitForExistence(timeout: 15), "The workspace should open")
    files.tap()
    XCTAssertTrue(files.isSelected)
    XCTAssertTrue(app.navigationBars["Files"].exists)

    // Tree: a folder expands, collapses, and "Collapse folders" closes it.
    let row = app.buttons["tree-\(tag)/"]
    XCTAssertTrue(row.waitForExistence(timeout: 15), "The new folder should be listed")
    let child = app.buttons["tree-\(tag)/code-\(tag).ts"]
    XCTAssertFalse(child.exists)
    row.tap()
    XCTAssertTrue(child.waitForExistence(timeout: 10), "Expanding shows the folder's files")
    XCTAssertTrue(row.label.contains("expanded folder"), row.label)
    Panels.shot("workspace-files")
    row.tap()
    XCTAssertTrue(child.waitForNonExistence(timeout: 5), "Tapping again collapses it")
    row.tap()
    XCTAssertTrue(child.waitForExistence(timeout: 10))
    app.buttons["workspace-collapse"].tap()
    XCTAssertTrue(child.waitForNonExistence(timeout: 5), "Collapse folders closes every folder")

    // Search finds files by name.
    let search = app.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.tap()
    search.typeText(tag)
    XCTAssertTrue(child.waitForExistence(timeout: 15), "Search should find the folder's files")
    XCTAssertTrue(app.buttons["tree-\(tag)/notes-\(tag).md"].exists)
    Panels.shot("workspace-search")

    // Code: numbered lines.
    child.tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["Line 2: export function two() {"].waitForExistence(timeout: 15),
      "The file should open with line numbers")
    XCTAssertTrue(app.buttons["file-share"].exists, "Text files can be shared")
    Panels.shot("workspace-code")
    back(app)

    // Markdown: source, then preview, then source again.
    app.buttons["tree-\(tag)/notes-\(tag).md"].tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["Line 1: # Notes \(tag)"].waitForExistence(timeout: 15))
    app.buttons["Preview Markdown"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["markdown-preview"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.descendants(matching: .any)["Line 1: # Notes \(tag)"].exists)
    Panels.shot("workspace-markdown")
    app.buttons["Show source"].tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["Line 1: # Notes \(tag)"].waitForExistence(timeout: 5))
    back(app)

    // A document over the rendered preview limit offers its source instead.
    app.buttons["tree-\(tag)/big-\(tag).md"].tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["Line 1: A line of the large document."]
        .waitForExistence(timeout: 20))
    app.buttons["Preview Markdown"].tap()
    let tooLarge = app.descendants(matching: .any)["markdown-too-large"]
    XCTAssertTrue(tooLarge.waitForExistence(timeout: 5))
    Panels.shot("workspace-markdown-large")
    app.buttons["markdown-view-source"].tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["Line 1: A line of the large document."]
        .waitForExistence(timeout: 5))
    back(app)

    // An image: fit, zoom in, actual size, fit.
    app.buttons["tree-\(tag)/pic-\(tag).png"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["image-preview"].waitForExistence(timeout: 15))
    XCTAssertTrue(noteMentions(app, "800 × 600"), app.staticTexts["media-note"].label)
    let zoom = app.buttons["image-zoom"]
    let fitted = zoom.value as? String
    app.buttons["image-zoom-in"].tap()
    let zoomedIn = await Panels.waitUntil(timeout: 5) { (zoom.value as? String) != fitted }
    XCTAssertTrue(zoomedIn, "Zoom in changes the scale from \(fitted ?? "")")
    zoom.tap()
    let actual = await Panels.waitUntil(timeout: 5) { (zoom.value as? String) == "100%" }
    XCTAssertTrue(actual, "Actual size is 100%: \(zoom.value ?? "")")
    app.buttons["image-fit"].tap()
    let refitted = await Panels.waitUntil(timeout: 5) { (zoom.value as? String) == fitted }
    XCTAssertTrue(refitted)
    Panels.shot("workspace-image")
    back(app)

    // A file over the 2 MiB preview bound.
    app.buttons["tree-\(tag)/huge-\(tag).txt"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["file-too-large"].waitForExistence(timeout: 20))
    XCTAssertTrue(
      app.descendants(matching: .any)["file-too-large"].label.contains("2 MiB"),
      app.descendants(matching: .any)["file-too-large"].label)
    Panels.shot("workspace-too-large")
    back(app)

    // Search keeps the bar's Close until it's dismissed, like any iOS search.
    app.navigationBars["Files"].buttons["Close"].tap()
    app.buttons["workspace-close"].tap()
    XCTAssertTrue(app.buttons["chat.actions"].waitForExistence(timeout: 5))
  }

  /// A new file shows under Changes with its status and diff, Base branch switches the
  /// comparison, and the diff opens the file.
  @MainActor func testChangesModesAndDiff() async throws {
    let gateway = TestGateway()
    let name = "workspace-\(UUID().uuidString.prefix(8).lowercased()).ts"
    let file = URL(fileURLWithPath: gateway.directory).appending(path: name)
    try "export const one = 1;\nexport const two = 2;\n".write(to: file, atomically: true, encoding: .utf8)
    addTeardownBlock { try? FileManager.default.removeItem(at: file) }
    let session = try await gateway.createSession()

    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()
    Panels.openChatMenu(app, "Files and changes")
    let changes = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Changes'")).firstMatch
    XCTAssertTrue(changes.waitForExistence(timeout: 15), "The workspace should open")
    changes.tap()
    XCTAssertTrue(app.navigationBars["Changes"].waitForExistence(timeout: 5))

    // Base branch, then back to Uncommitted.
    let branch = app.buttons["Base branch"]
    branch.tap()
    XCTAssertTrue(branch.isSelected)
    let working = app.buttons["Uncommitted"]
    working.tap()
    XCTAssertTrue(working.isSelected)

    let row = app.buttons["tree-\(name)"]
    XCTAssertTrue(row.waitForExistence(timeout: 15), "The untracked file should be listed")
    XCTAssertTrue(row.label.contains("added"))
    XCTAssertTrue(app.descendants(matching: .any)["workspace-footer"].label.contains("changed"))
    Panels.shot("workspace-changes")
    row.tap()

    let header = app.descendants(matching: .any)["diff-header"]
    XCTAssertTrue(header.waitForExistence(timeout: 15))
    XCTAssertTrue(header.label.contains("+2"), header.label)
    XCTAssertTrue(app.descendants(matching: .any)["Added line 1: export const one = 1;"].exists)
    XCTAssertTrue(app.buttons["diff-share"].exists, "A diff can be shared")
    Panels.shot("workspace-diff")

    app.buttons["diff-open-file"].tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["Line 2: export const two = 2;"].waitForExistence(timeout: 15),
      "Opening the file should show numbered lines")

    back(app)
    back(app)
    app.buttons["All files"].tap()
    XCTAssertTrue(app.buttons["tree-\(name)"].waitForExistence(timeout: 15))
  }

  /// The agent's `write` shows under Changes without a manual refresh.
  @MainActor func testAgentWriteRefreshesChanges() async throws {
    let gateway = TestGateway()
    let name = "qap-live-\(UUID().uuidString.prefix(6).lowercased()).md"
    let file = URL(fileURLWithPath: Panels.homeDemo).appending(path: name)
    addTeardownBlock { try? FileManager.default.removeItem(at: file) }
    let session = try await gateway.createSession(in: Panels.homeDemo, title: "Workspace live refresh")

    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()
    Panels.openChatMenu(app, "Files and changes")
    let changes = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Changes'")).firstMatch
    XCTAssertTrue(changes.waitForExistence(timeout: 15))
    changes.tap()
    app.buttons["Uncommitted"].tap()
    let row = app.buttons["tree-\(name)"]
    XCTAssertFalse(row.exists)

    // home-demo lets the agent write without asking.
    try await gateway.prompt(session, "write \(name): written by the agent")
    XCTAssertTrue(row.waitForExistence(timeout: 60), "The written file should appear by itself")
    XCTAssertTrue(row.label.contains("added"), row.label)
    Panels.shot("workspace-live")
  }

  // MARK: Helpers

  @MainActor private func back(_ app: XCUIApplication) {
    app.navigationBars.buttons.element(boundBy: 0).tap()
  }

  @MainActor private func noteMentions(_ app: XCUIApplication, _ text: String) -> Bool {
    app.staticTexts["media-note"].label.contains(text)
  }
}
