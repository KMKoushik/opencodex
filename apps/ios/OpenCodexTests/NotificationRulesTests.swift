import Foundation
import Testing

@testable import OpenCodex

/// The desktop's notification rules (`notifySession`), ported 1:1.
struct NotificationRulesTests {
  private func session(_ json: String) -> SessionInfo {
    try! JSONDecoder().decode(
      SessionInfo.self,
      from: Data(#"{"location":{"directory":"/a"},"time":{"created":1},\#(json)}"#.utf8))
  }

  private func event(_ type: String, _ data: String) -> GatewayEvent {
    try! JSONDecoder().decode(GatewayEvent.self, from: Data(#"{"type":"\#(type)","data":\#(data)}"#.utf8))
  }

  @Test func attributesNotificationsToTheRootThread() async throws {
    let sessions = [
      "root": session(#""id":"root","title":"Fix the build""#),
      "child": session(#""id":"child","parentID":"root""#),
      "side": session(#""id":"side","title":"Side","metadata":{"opencodexSideChat":{"parentID":"root"}}"#),
      "muted": session(#""id":"muted","title":"Quiet","metadata":{"opencodexMuted":true}"#),
      "untitled": session(#""id":"untitled""#),
    ]
    func thread(_ event: GatewayEvent) async throws -> NotificationRules.Thread? {
      let trigger = try #require(NotificationRules.trigger(event))
      return try await NotificationRules.thread(for: trigger, info: { sessions[$0]! })
    }
    let root = NotificationRules.Thread(id: "root", title: "Fix the build")

    #expect(try await thread(event("session.execution.succeeded", #"{"sessionID":"root"}"#)) == root)
    // Subagent turns end inside their thread's turn; their requests still notify the thread.
    #expect(try await thread(event("session.execution.succeeded", #"{"sessionID":"child"}"#)) == nil)
    #expect(try await thread(event("permission.asked", #"{"sessionID":"child"}"#)) == root)
    #expect(try await thread(event("form.created", #"{"form":{"sessionID":"child"}}"#)) == root)
    // Side chats open their main chat; muted threads stay quiet.
    #expect(try await thread(event("session.execution.succeeded", #"{"sessionID":"side"}"#)) == root)
    #expect(try await thread(event("permission.asked", #"{"sessionID":"muted"}"#)) == nil)
    #expect(
      try await thread(event("session.execution.failed", #"{"sessionID":"untitled"}"#))
        == .init(id: "untitled", title: "Untitled session"))

    let failed = try #require(
      NotificationRules.trigger(event("session.execution.failed", #"{"sessionID":"root"}"#)))
    #expect(NotificationRules.title(failed) == "Reply failed")
    #expect(NotificationRules.trigger(event("session.execution.interrupted", #"{"sessionID":"root"}"#)) == nil)
  }
}
