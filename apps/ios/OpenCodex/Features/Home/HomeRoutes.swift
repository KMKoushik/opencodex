import Foundation

/// A project from `/api/projects`, with the activity time the new-chat sheet sorts by.
nonisolated struct HomeProject: Codable, Hashable, Identifiable, Sendable {
  nonisolated struct Times: Codable, Hashable, Sendable {
    var created: Millis?
    var updated: Millis?
    var active: Millis?
  }
  var id: String
  var name: String?
  var canonical: String
  var time: Times?

  var displayName: String {
    if let name, !name.isEmpty { return name }
    return (canonical as NSString).lastPathComponent
  }
  /// When a session in it last ran, else when it last changed.
  var activeAt: Millis { time?.active ?? time?.updated ?? time?.created ?? 0 }
}

/// What `/sessions/:id/focus` returns: the thread's markers after the write.
nonisolated struct FocusMarkers: Codable, Sendable {
  var pinned: Double?
  var done: Double?
}

nonisolated enum FocusAction: String, Codable, Sendable {
  case pin, unpin, done, undone
}

nonisolated extension GatewayClient {
  func homeProjects() async throws -> [HomeProject] { try await get("/projects") }

  struct FocusBody: Encodable {
    var action: FocusAction
    var pinned: Double?
  }
  /// Pin, Done, and their undos: OpenCodex-owned session metadata shared with the desktop.
  func focus(_ id: String, _ action: FocusAction) async throws -> FocusMarkers {
    try await post("/sessions/\(id)/focus", FocusBody(action: action))
  }
}
