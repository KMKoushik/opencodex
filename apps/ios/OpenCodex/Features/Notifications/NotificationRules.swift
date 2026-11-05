import Foundation

/// The desktop's notification kinds (`features/notifications`), with its wording.
nonisolated enum NotificationKind: String, CaseIterable, Codable, Sendable {
  case reply, question, permission

  var title: String {
    switch self {
    case .reply: "Reply finished"
    case .question: "Question waiting"
    case .permission: "Permission needed"
    }
  }

  /// The Settings → Notifications rows.
  var label: String {
    switch self {
    case .reply: "Finished replies"
    case .question: "Questions"
    case .permission: "Permission requests"
    }
  }

  var description: String {
    switch self {
    case .reply: "When a chat finishes or fails."
    case .question: "When a chat asks you a question."
    case .permission: "When a chat is blocked on your approval."
    }
  }
}

/// Which events raise a notification, and which thread it belongs to. A port of the desktop's
/// `notifySession` and its callers in `use-events.ts`; the gateway's `push.ts` applies the same
/// rules to APNs pushes.
nonisolated enum NotificationRules {
  struct Trigger: Equatable, Sendable {
    var kind: NotificationKind
    var sessionID: String
    var failed = false
  }

  struct Thread: Equatable, Sendable {
    var id: String
    var title: String
  }

  static func trigger(_ event: GatewayEvent) -> Trigger? {
    switch event.type {
    case "session.execution.succeeded", "session.execution.failed":
      event.sessionID.map {
        Trigger(kind: .reply, sessionID: $0, failed: event.type == "session.execution.failed")
      }
    case "form.created":
      event.data?["form"]?["sessionID"]?.string.map { Trigger(kind: .question, sessionID: $0) }
    case "permission.asked":
      event.sessionID.map { Trigger(kind: .permission, sessionID: $0) }
    default: nil
    }
  }

  static func title(_ trigger: Trigger) -> String {
    trigger.failed ? "Reply failed" : trigger.kind.title
  }

  /// The root thread to attribute a notification to, or nil if it stays quiet.
  static func thread(
    for trigger: Trigger, info: (String) async throws -> SessionInfo
  ) async throws -> Thread? {
    var session = try await info(trigger.sessionID)
    // Subagent turns end inside their thread's turn; only their requests need the user.
    if trigger.kind == .reply, session.parentID != nil { return nil }
    var depth = 0
    while let parent = session.parentID, depth < 8 {
      session = try await info(parent)
      depth += 1
    }
    // A side chat's notifications open its main chat.
    if let main = session.metadata?["opencodexSideChat"]?["parentID"]?.string, !main.isEmpty {
      session = try await info(main)
    }
    // A muted thread stays quiet, including its subagents and side chats.
    if session.metadata?["opencodexMuted"]?.bool == true { return nil }
    let title = session.title.flatMap { $0.isEmpty ? nil : $0 } ?? "Untitled session"
    return Thread(id: session.id, title: title)
  }
}
