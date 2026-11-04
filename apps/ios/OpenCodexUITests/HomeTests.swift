import XCTest

/// The threads list shows a thread made on the gateway, and opening it shows its chat.
nonisolated final class HomeTests: XCTestCase {
  private static var gateway: URL {
    URL(string: ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310")!
  }

  @MainActor func testOpensThreadFromList() async throws {
    let title = "Home test \(UUID().uuidString.prefix(8))"
    let id = try await makeThread(title: title)
    addTeardownBlock {
      // There's no delete route; Done keeps test threads out of the list.
      _ = try? await Self.post("/api/sessions/\(id)/focus", ["action": "done"])
    }

    let app = XCUIApplication.opencodex()
    app.launch()
    let row = app.buttons["thread-\(id)"]
    XCTAssertTrue(row.waitForExistence(timeout: 15), "The new thread should appear in the list")
    XCTAssertTrue(row.label.contains(title))

    row.tap()
    XCTAssertTrue(
      app.navigationBars[title].waitForExistence(timeout: 10),
      "Opening the thread should show its chat")
  }

  private func makeThread(title: String) async throws -> String {
    let (data, _) = try await URLSession.shared.data(from: Self.gateway.appending(path: "api/projects"))
    let projects = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
    let directory = try XCTUnwrap(
      projects.compactMap { $0["canonical"] as? String }.first { $0 != "/" },
      "The test gateway needs a project")
    let session = try await Self.post("/api/sessions", ["directory": directory])
    let id = try XCTUnwrap(session["id"] as? String)
    _ = try await Self.post("/api/sessions/\(id)/action", ["action": "rename", "title": title])
    return id
  }

  @discardableResult
  private static func post(_ path: String, _ body: [String: String]) async throws -> [String: Any] {
    var request = URLRequest(url: gateway.appending(path: path))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    XCTAssertEqual(status, 200, String(decoding: data, as: UTF8.self))
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }
}
