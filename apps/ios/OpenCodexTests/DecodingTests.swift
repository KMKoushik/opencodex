import Foundation
import Testing

@testable import OpenCodex

/// Real gateway responses, captured from OpenCode 2.2.5, must decode without loss.
struct DecodingTests {
  private func fixture(_ name: String) throws -> Data {
    let url = try #require(Bundle(for: Marker.self).url(forResource: name, withExtension: nil, subdirectory: "Fixtures"))
    return try Data(contentsOf: url)
  }

  @Test func gatewayResponses() throws {
    let decoder = JSONDecoder()
    let page = try decoder.decode(SessionPage.self, from: fixture("sessions.json"))
    #expect(page.sessions.count == 5)
    #expect(try decoder.decode([Project].self, from: fixture("projects.json")).count == 1)
    let catalog = try decoder.decode(ModelCatalog.self, from: fixture("models.json"))
    #expect(catalog.data.count == 10)
    #expect(try decoder.decode(SessionInfo.self, from: fixture("session.json")).model != nil)
    let permission = try decoder.decode([PermissionRequest].self, from: fixture("permissions.json"))
    #expect(permission.first?.action == "edit")
    let form = try decoder.decode([FormInfo].self, from: fixture("forms.json"))
    #expect(form.first?.fields.first?.options?.count == 2)
  }

  @Test func messagesKeepToolCalls() throws {
    let page = try JSONDecoder().decode(MessagePage.self, from: fixture("messages-shell.json"))
    let tools = page.data.flatMap { message -> [ToolCall] in
      guard case .assistant(let assistant) = message else { return [] }
      return assistant.content.compactMap { if case .tool(let call) = $0 { call } else { nil } }
    }
    #expect(tools.map(\.name) == ["shell", "shell"])
    #expect(tools.allSatisfy { $0.state.status == .completed && !$0.output.isEmpty })
    #expect(page.data.contains { if case .other = $0 { true } else { false } } == false)
  }

  @Test func eventStream() throws {
    var parser = SSEParser()
    var events: [GatewayEvent] = []
    let text = String(decoding: try fixture("events.sse"), as: UTF8.self)
    for line in text.components(separatedBy: "\n") {
      guard let event = parser.line(line), event.name == "opencode" else { continue }
      events.append(try JSONDecoder().decode(GatewayEvent.self, from: Data(event.data.utf8)))
    }
    #expect(events.count > 20)
    #expect(events.contains { $0.type == "session.text.delta" && $0.sessionID != nil })
  }
}

private final class Marker {}
