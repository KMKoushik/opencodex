import XCTest

/// The project terminal: a shell opens on its own, typed input reaches it over the gateway's
/// WebSocket, and its output comes back. Uses the DEBUG `-terminal <directory>` launch argument.
nonisolated final class TerminalTests: XCTestCase {
  static let directory =
    "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios/home-demo"

  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testTypedCommandShowsOutput() async throws {
    let gateway = TestGateway()
    let before = Set(try await Self.terminalIDs(gateway))
    addTeardownBlock {
      // Close only the shells this test opened; others' terminals in home-demo stay.
      for id in Set((try? await Self.terminalIDs(gateway)) ?? []).subtracting(before) {
        var request = URLRequest(url: Self.url(gateway, "/\(id)"))
        request.httpMethod = "DELETE"
        _ = try? await URLSession.shared.data(for: request)
      }
    }

    let app = XCUIApplication.opencodex(["-terminal", Self.directory])
    app.launch()
    // A new shell, so the output isn't confused with an older tab's.
    let new = app.buttons["terminal-new"]
    XCTAssertTrue(new.waitForExistence(timeout: 15))
    let enabled = expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: new)
    await fulfillment(of: [enabled], timeout: 15)
    new.tap()

    let terminal = app.descendants(matching: .any)["terminal-view"]
    XCTAssertTrue(terminal.waitForExistence(timeout: 15))
    let prompted = await waitUntil { !((terminal.value as? String) ?? "").isEmpty }
    XCTAssertTrue(prompted, "The shell should print a prompt")

    XCTAssertFalse(lines(terminal).contains("opencodex-term"), "A fresh shell shouldn’t show it yet")
    terminal.tap()
    app.typeText("echo opencodex-term\n")
    let printed = await waitUntil { lines(terminal).contains("opencodex-term") }
    XCTAssertTrue(printed, "The command's output should appear: \(terminal.value ?? "")")
  }

  @MainActor private func waitUntil(timeout: TimeInterval = 20, _ condition: () -> Bool) async -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if condition() { return true }
      try? await Task.sleep(for: .milliseconds(300))
    }
    return condition()
  }

  @MainActor private func lines(_ terminal: XCUIElement) -> [String] {
    ((terminal.value as? String) ?? "").split(separator: "\n").map {
      $0.trimmingCharacters(in: .whitespaces)
    }
  }

  private static func url(_ gateway: TestGateway, _ path: String = "") -> URL {
    gateway.base.appending(path: "api/terminals\(path)").appending(
      queryItems: [URLQueryItem(name: "directory", value: directory)])
  }

  private static func terminalIDs(_ gateway: TestGateway) async throws -> [String] {
    let (data, _) = try await URLSession.shared.data(from: url(gateway))
    let list = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
    return list.compactMap { $0["id"] as? String }
  }
}
