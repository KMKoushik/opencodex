import XCTest

/// The threads screen, tapped through like the desktop sidebar: the brand menu, search, New
/// thread, Tasks and Apps, both views, project groups, and the Focus filters.
nonisolated final class HomeTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  override func record(_ issue: XCTIssue) {
    XCUIApplication().snap("fail-\(name.split(separator: " ").last?.dropLast() ?? "")")
    super.record(issue)
  }

  @MainActor func testHeaderSearchAndNavigation() async throws {
    let gateway = HomeGateway()
    let token = "zq\(UUID().uuidString.prefix(6).lowercased())"
    let title = "Search target \(token)"
    let id = try await gateway.thread(in: HomeGateway.homeDemo, title: title)
    addTeardownBlock { await gateway.done(id) }

    let app = XCUIApplication.home(["-threadView", "projects"])
    app.launch()
    XCTAssertTrue(app.buttons["new-chat"].waitForExistence(timeout: 15))
    app.snap("home")

    // The brand menu opens Settings at Appearance or Usage.
    app.buttons["brand-menu"].tap()
    app.buttons["Appearance"].tap()
    XCTAssertTrue(app.navigationBars["Appearance"].waitForExistence(timeout: 5))
    app.buttons["settings-done"].firstMatch.tap()
    XCTAssertTrue(app.buttons["new-chat"].waitForExistence(timeout: 5))
    app.buttons["brand-menu"].tap()
    app.buttons["Usage"].tap()
    XCTAssertTrue(app.navigationBars["Usage"].waitForExistence(timeout: 5))
    app.buttons["settings-done"].firstMatch.tap()

    // The bottom bar's usage shortcut and Settings.
    app.buttons["usage-limits"].tap()
    XCTAssertTrue(app.navigationBars["Usage"].waitForExistence(timeout: 5))
    app.buttons["settings-done"].firstMatch.tap()
    app.buttons["settings"].tap()
    XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
    app.buttons["settings-done"].firstMatch.tap()

    // Tasks and Apps open their pages and come back.
    app.buttons["home.tasks"].tap()
    XCTAssertTrue(app.navigationBars["Tasks"].waitForExistence(timeout: 10))
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.buttons["home.apps"].tap()
    XCTAssertTrue(app.navigationBars["Apps"].waitForExistence(timeout: 10))
    app.navigationBars.buttons.element(boundBy: 0).tap()

    // New thread: pick a project, then a draft opens in it.
    app.buttons["new-chat"].tap()
    let project = app.buttons["project-home-demo"]
    XCTAssertTrue(project.waitForExistence(timeout: 10))
    app.snap("new-thread-sheet")
    project.tap()
    XCTAssertTrue(app.descendants(matching: .any)["chat.new"].waitForExistence(timeout: 10))
    app.navigationBars.buttons.element(boundBy: 0).tap()

    // Search matches titles (and message text, with a local OpenCode) and opens the thread.
    // This gateway searches titles only and says so, as the desktop's dialog does.
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText(token)
    let result = app.buttons["search-\(id)"]
    XCTAssertTrue(result.waitForExistence(timeout: 15), "The thread should match its title")
    XCTAssertTrue(result.label.contains(title), result.label)
    XCTAssertTrue(result.label.contains("home-demo"), "The result names its folder")
    XCTAssertTrue(
      app.staticTexts["Searching titles only. Message search requires a local OpenCode service."]
        .exists)
    app.snap("search")
    field.typeText("nothing-matches")
    XCTAssertTrue(app.staticTexts["No threads match your search."].waitForExistence(timeout: 10))
    for _ in 0..<15 { field.typeText(XCUIKeyboardKey.delete.rawValue) }
    XCTAssertTrue(result.waitForExistence(timeout: 10))
    result.tap()
    XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 10))
  }

  @MainActor func testProjectGroups() async throws {
    let gateway = HomeGateway()
    let ids = try await (0..<5).asyncMap { index in
      try await gateway.thread(in: HomeGateway.pagingDemo, title: "Group row \(index)")
    }
    addTeardownBlock { for id in ids { await gateway.done(id) } }

    let app = XCUIApplication.home(["-threadView", "projects"])
    app.launch()
    let group = app.buttons["group-paging-demo"]
    XCTAssertTrue(app.scroll(to: group), "The project should list its group")
    if group.value as? String == "Collapsed" { group.tap() }
    let newest = app.buttons["thread-\(ids[4])"]
    XCTAssertTrue(newest.waitForExistence(timeout: 10), "The newest thread tops its project")

    // Collapse hides the rows; expanding brings them back.
    group.tap()
    XCTAssertTrue(newest.waitForNonExistence(timeout: 5))
    XCTAssertEqual(group.value as? String, "Collapsed")
    group.tap()
    XCTAssertTrue(newest.waitForExistence(timeout: 5))

    // Show more reveals the fifth-newest thread, four rows at a time.
    let oldest = app.buttons["thread-\(ids[0])"]
    XCTAssertFalse(oldest.exists, "Only four rows show at first")
    let more = app.buttons["show-more-paging-demo"]
    XCTAssertTrue(app.scroll(to: more))
    more.tap()
    XCTAssertTrue(oldest.waitForExistence(timeout: 10), "Show more should list four more rows")

    // + starts a draft in that project.
    XCTAssertTrue(app.scroll(to: group, up: true))
    app.buttons["group-new-paging-demo"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["chat.new"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Project: paging-demo"].waitForExistence(timeout: 5))
    app.navigationBars.buttons.element(boundBy: 0).tap()

    // Hide project from its menu, then bring it back from the filter.
    XCTAssertTrue(app.scroll(to: group, up: true))
    group.press(forDuration: 1)
    app.buttons["Hide project"].tap()
    XCTAssertTrue(group.waitForNonExistence(timeout: 5))
    XCTAssertTrue(app.scroll(to: app.buttons["project-filter"], up: true))
    app.buttons["project-filter"].tap()
    let option = app.switches["paging-demo"].exists ? app.switches["paging-demo"] : app.buttons["paging-demo"]
    XCTAssertTrue(option.waitForExistence(timeout: 5))
    app.snap("projects-filter")
    option.tap()
    app.dismissMenu("Show in Projects")
    XCTAssertTrue(app.scroll(to: group), "The project should come back")
  }

  @MainActor func testFocusViewFiltersAndInactive() async throws {
    let gateway = HomeGateway()
    let title = "Focus row \(UUID().uuidString.prefix(4))"
    let id = try await gateway.thread(in: HomeGateway.emptyDemo, title: title)
    let old = try await gateway.thread(in: HomeGateway.emptyDemo, title: "Settled \(title)")
    try await gateway.post("/sessions/\(old)/focus", ["action": "done"])
    // Unread ranks with what needs you, at the top of Focus, past other agents' threads.
    try await gateway.post("/sessions/\(id)/unread", ["action": "mark"])
    addTeardownBlock { await gateway.done(id) }

    let app = XCUIApplication.home(["-threadView", "focus"])
    app.launch()
    XCTAssertTrue(app.staticTexts["Focus"].waitForExistence(timeout: 15))
    let row = app.buttons["thread-\(id)"]
    XCTAssertTrue(app.scroll(to: row), "A new thread is active in Focus")
    XCTAssertTrue(row.label.contains("empty-demo"), "Focus rows name their project")

    // The filter hides a project from Focus only; Show all projects restores it.
    XCTAssertTrue(app.scroll(to: app.buttons["project-filter"], up: true))
    app.buttons["project-filter"].tap()
    let option = app.switches["empty-demo"].exists ? app.switches["empty-demo"] : app.buttons["empty-demo"]
    XCTAssertTrue(option.waitForExistence(timeout: 5))
    option.tap()
    app.dismissMenu("Show in Focus")
    XCTAssertTrue(row.waitForNonExistence(timeout: 5), "An excluded project leaves Focus")
    XCTAssertTrue(app.scroll(to: app.buttons["project-filter"], up: true))
    app.buttons["project-filter"].tap()
    app.buttons["Show all projects"].tap()
    app.dismissMenu("Show in Focus")
    XCTAssertTrue(app.scroll(to: row), "Show all projects brings it back")

    // Done threads wait in Inactive, collapsed by default.
    let inactive = app.buttons["inactive-toggle"]
    XCTAssertTrue(app.scroll(to: inactive))
    XCTAssertEqual(inactive.value as? String, "Collapsed")
    inactive.tap()
    XCTAssertEqual(inactive.value as? String, "Expanded")
    let settled = app.buttons["thread-\(old)"]
    for _ in 0..<12 where !settled.exists {
      let more = app.buttons["show-more-inactive"]
      if more.exists, more.isHittable { more.tap() } else { app.swipeUp() }
    }
    XCTAssertTrue(settled.waitForExistence(timeout: 5), "A thread marked done is inactive")
    app.snap("focus-inactive")

    // The toggle switches back to Projects.
    XCTAssertTrue(app.scroll(to: app.buttons["view-toggle"], up: true))
    app.buttons["view-toggle"].tap()
    XCTAssertTrue(app.staticTexts["Projects"].waitForExistence(timeout: 5))
  }
}

// MARK: - Support

extension XCUIApplication {
  /// The app on the test gateway, without the one-time notification prompt.
  /// Filters start clear: an aborted run can't leave a project hidden or excluded.
  static func home(_ arguments: [String] = []) -> XCUIApplication {
    let gateway = ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310"
    let clear = ["hiddenProjects", "focusExcluded", "collapsedProjects"].flatMap {
      ["-\($0):\(gateway)", "()"]
    }
    return opencodex(["-notificationsAsked", "YES"] + clear + arguments)
  }

  /// Scrolls the thread list until the element is on screen: first one way (down, or up with
  /// `up`), then back the other way. The list is lazy, so rows off screen don't exist.
  @discardableResult
  func scroll(to element: XCUIElement, up: Bool = false, attempts: Int = 12) -> Bool {
    if element.waitForExistence(timeout: 8), element.isHittable { return true }
    for direction in [up, !up] {
      for _ in 0..<attempts {
        if element.exists, element.isHittable { return true }
        if direction { swipeDown() } else { swipeUp() }
      }
    }
    return element.exists && element.isHittable
  }

  /// The filter menus stay open for more choices, like the desktop's; tap outside to close.
  func dismissMenu(_ title: String) {
    guard staticTexts[title].waitForExistence(timeout: 1) else { return }
    coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.2)).tap()
    _ = staticTexts[title].waitForNonExistence(timeout: 3)
  }

  /// Saves a screenshot to `$QA_SHOTS` (pass `TEST_RUNNER_QA_SHOTS` to xcodebuild).
  func snap(_ name: String) {
    guard let folder = ProcessInfo.processInfo.environment["QA_SHOTS"] else { return }
    let data = XCUIScreen.main.screenshot().pngRepresentation
    try? FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
    try? data.write(to: URL(fileURLWithPath: folder).appending(path: "\(name).png"))
  }
}

extension Sequence where Element: Sendable {
  func asyncMap<T>(_ transform: (Element) async throws -> T) async rethrows -> [T] {
    var results: [T] = []
    for element in self { results.append(try await transform(element)) }
    return results
  }
}

/// The shared test gateway's `/api`, for making threads the screen should show.
nonisolated struct HomeGateway {
  static let root = "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios/"
  static let homeDemo = root + "home-demo"
  static let pagingDemo = root + "paging-demo"
  static let emptyDemo = root + "empty-demo"
  /// Asks before edits and shell commands.
  static let proj = root + "proj"
  static let model = ["id": "scripted", "providerID": "fake"]

  let base = URL(
    string: ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310")!

  func thread(in directory: String, title: String) async throws -> String {
    let session = try await post("/sessions", ["directory": directory, "model": Self.model])
    let id = try XCTUnwrap(session["id"] as? String)
    try await rename(id, title)
    return id
  }

  func rename(_ id: String, _ title: String) async throws {
    try await post("/sessions/\(id)/action", ["action": "rename", "title": title])
  }

  func prompt(_ id: String, _ text: String) async throws {
    try await post("/sessions/\(id)/prompt", ["text": text, "model": Self.model])
  }

  func running(_ id: String) async throws -> Bool {
    let active = try await get("/sessions/active") as? [String: Any] ?? [:]
    return active[id] != nil
  }

  func waitUntilIdle(_ id: String, timeout: TimeInterval = 60) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    try await Task.sleep(for: .seconds(1))
    while try await running(id), Date() < deadline { try await Task.sleep(for: .seconds(1)) }
  }

  /// There's no delete route; Done keeps test threads out of Focus.
  func done(_ id: String) async {
    _ = try? await post("/sessions/\(id)/interrupt", [:])
    _ = try? await post("/sessions/\(id)/focus", ["action": "done"])
  }

  func get(_ path: String) async throws -> Any {
    let (data, _) = try await URLSession.shared.data(from: base.appending(path: "api" + path))
    return try JSONSerialization.jsonObject(with: data)
  }

  @discardableResult
  func post(_ path: String, _ body: [String: Any]) async throws -> [String: Any] {
    var request = URLRequest(url: base.appending(path: "api" + path))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else {
      throw NSError(
        domain: "HomeGateway", code: status,
        userInfo: [NSLocalizedDescriptionKey: "\(path): \(String(decoding: data, as: UTF8.self))"])
    }
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }
}
