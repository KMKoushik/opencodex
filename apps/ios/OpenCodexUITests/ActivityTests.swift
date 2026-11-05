import XCTest

/// The running-activity tray against the live loopback gateway: a chat whose agent runs a
/// long shell command shows it in the tray; its output sheet stops it.
nonisolated final class ActivityTests: XCTestCase {
  private let gateway = URL(
    string: ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310")!
  /// A project whose agent may run shell commands without asking.
  private let directory =
    ProcessInfo.processInfo.environment["OPENCODEX_SHELL_PROJECT"]
    ?? "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios/home-demo"
  private let model = ["id": "scripted", "providerID": "fake"]

  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor
  func testShellOutputAndStop() async throws {
    let session = try await post("/api/sessions", ["directory": directory, "model": model])
    let id = try XCTUnwrap(session["id"] as? String)
    _ = try await post("/api/sessions/\(id)/action", ["action": "rename", "title": "Activity tray test"])
    _ = try await post(
      "/api/sessions/\(id)/prompt",
      [
        // The test server's scripted model runs `run:` commands with its shell tool.
        "text": "run: sleep 120 && echo done",
        "model": model,
      ])

    let app = XCUIApplication.opencodex(["-session", id])
    app.launch()
    // Collapsed, the tray is OpenCode's small pill; tapping it opens the tabs.
    let pill = app.buttons["activity.pill"]
    XCTAssertTrue(pill.waitForExistence(timeout: 60), "The tray never showed the running shell")
    XCTAssertTrue(pill.label.contains("Running activity"))
    if !app.buttons["activity.tab.shell"].exists { pill.tap() }
    let tab = app.buttons["activity.tab.shell"]
    XCTAssertTrue(tab.waitForExistence(timeout: 5))
    XCTAssertTrue(tab.label.hasPrefix("Shell (1)"))
    tab.tap()

    let row = app.buttons["activity.shell.row"]
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    XCTAssertTrue(row.label.contains("sleep 120"))
    XCTAssertTrue(row.value as? String ?? "" != "")
    row.tap()

    let command = app.staticTexts["shell.command"]
    XCTAssertTrue(command.waitForExistence(timeout: 10))
    XCTAssertTrue(command.label.contains("sleep 120"))
    XCTAssertTrue(app.staticTexts["shell.status"].label.hasPrefix("Running"))

    let shells = try await get("/api/shells?directory=\(directory)") as? [[String: Any]] ?? []
    let shell = try XCTUnwrap(
      shells.first { ($0["metadata"] as? [String: Any])?["sessionID"] as? String == id }?["id"]
        as? String)

    app.buttons["shell.stop"].tap()
    app.buttons["shell.stop.confirm"].tap()
    // Stopping closes the sheet and ends that command, not the chat.
    XCTAssertTrue(command.waitForNonExistence(timeout: 10))
    let status = try await get("/api/shells/\(shell)?directory=\(directory)") as? [String: Any]
    XCTAssertNotEqual(status?["status"] as? String, "running")

    // The agent may start another; once the chat stops, the tray empties.
    _ = try await post("/api/sessions/\(id)/interrupt", [:])
    XCTAssertTrue(app.buttons["activity.tab.shell"].waitForNonExistence(timeout: 20))
  }

  private func get(_ path: String) async throws -> Any {
    let url = URL(string: gateway.absoluteString + path.addingPercentEncoding(
      withAllowedCharacters: .urlQueryAllowed)!)!
    let (data, _) = try await URLSession.shared.data(from: url)
    return try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
  }

  private func post(_ path: String, _ body: [String: Any]) async throws -> [String: Any] {
    var request = URLRequest(url: gateway.appending(path: path))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (data, response) = try await URLSession.shared.data(for: request)
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, String(decoding: data, as: UTF8.self))
    return try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed) as? [String: Any] ?? [:]
  }
}
