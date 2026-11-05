import Foundation

/// A thread as `/api/sessions` and `/api/session-search` return it (the desktop's `Session`),
/// including the markers the sidebar draws: muted and forked.
nonisolated struct ThreadSession: Codable, Hashable, Identifiable, Sendable {
  struct Times: Codable, Hashable, Sendable {
    var created: Millis
    var idle: Millis?
    var viewed: Millis?
  }
  struct Fork: Codable, Hashable, Sendable { var sessionID: String }
  struct Match: Codable, Hashable, Sendable { var excerpt: String }

  var id: String
  var title: String
  var directory: String
  var projectID: String?
  var updatedAt: Millis
  var time: Times
  /// Set when the user marked it unread by hand.
  var unread: String?
  var pinned: Double?
  var done: Double?
  var muted: Bool?
  var model: String?
  var fork: Fork?
  var match: Match?

  /// When the last run ended. Unlike `updatedAt`, metadata writes such as pins never move it.
  var activityAt: Millis { time.idle ?? time.created }

  /// Marked done with no newer activity. Pending requests and runs still surface it.
  var settled: Bool { done.map { activityAt <= $0 } ?? false }

  /// A thread row from a native `session.get`, as the gateway's `sessionSummary` builds it.
  init(_ info: SessionInfo) {
    func marker(_ key: String) -> Double? {
      guard let value = info.metadata?[key]?.number, value > 0 else { return nil }
      return value
    }
    id = info.id
    title = info.title.flatMap { $0.isEmpty ? nil : $0 } ?? "Untitled session"
    directory = info.location.directory
    projectID = info.projectID
    updatedAt = info.time.updated ?? info.time.created
    time = Times(created: info.time.created, idle: info.time.idle, viewed: info.time.viewed)
    unread = info.metadata?["opencodexUnread"]?.string.flatMap { $0.isEmpty ? nil : $0 }
    pinned = marker("opencodexPinned")
    done = marker("opencodexDone")
    muted = info.metadata?["opencodexMuted"]?.bool == true ? true : nil
  }
}

nonisolated struct ThreadPage: Codable, Sendable {
  var sessions: [ThreadSession]
  var nextCursor: String?
  var searchNotice: String?

  /// Native cursors mark an anchor even on the last page, and the gateway drops side chats
  /// from pages, so a short page isn't the end. Follow the cursor until a page comes back empty.
  var hasMore: Bool { nextCursor != nil && !sessions.isEmpty }
}

/// A project from `/api/projects` (OpenCode's `project.list`), with its icon and activity.
nonisolated struct ThreadProject: Codable, Hashable, Identifiable, Sendable {
  nonisolated struct Icon: Codable, Hashable, Sendable {
    var url: String?
    var override: String?
    var color: String?
  }
  nonisolated struct Times: Codable, Hashable, Sendable {
    var created: Millis?
    var updated: Millis?
    var active: Millis?
  }
  var id: String
  var name: String?
  var canonical: String
  var vcs: String?
  var icon: Icon?
  var time: Times?

  /// `projectName` on the desktop: its name, else the folder's.
  var displayName: String {
    if let name, !name.isEmpty { return name }
    return folderName(canonical)
  }
  /// When a session in it last ran, else when it last changed.
  var activeAt: Millis { time?.active ?? time?.updated ?? time?.created ?? 0 }
}

/// What `/sessions/:id/focus` returns: the thread's markers after the write.
nonisolated struct FocusMarkers: Codable, Hashable, Sendable {
  var pinned: Double?
  var done: Double?
}

nonisolated enum FocusAction: String, Codable, Sendable {
  case pin, unpin, done, undone
}

nonisolated enum ExportFormat: String, Sendable {
  case markdown, json
  var fileExtension: String { self == .markdown ? "md" : "json" }
}

/// The last component of a folder path, for threads whose project isn't in the catalog.
nonisolated func folderName(_ path: String) -> String {
  let name = (path as NSString).lastPathComponent
  return name.isEmpty ? path : name
}

nonisolated extension GatewayClient {
  func threadProjects() async throws -> [ThreadProject] { try await get("/projects") }

  /// Every project's root threads, newest update first; a search also matches message text.
  func threadSearch(_ search: String = "", cursor: String? = nil) async throws -> ThreadPage {
    try await get("/session-search", ["search": search, "cursor": cursor])
  }
  /// One folder's root threads, newest update first.
  func threadSessions(directory: String, cursor: String? = nil) async throws -> ThreadPage {
    try await get("/sessions", ["directory": directory, "cursor": cursor])
  }

  struct FocusBody: Encodable {
    var action: FocusAction
    var pinned: Double?
  }
  /// Pin, Done, and their undos: OpenCodex-owned session metadata shared with the desktop.
  func focus(_ id: String, _ action: FocusAction) async throws -> FocusMarkers {
    try await post("/sessions/\(id)/focus", FocusBody(action: action))
  }

  struct Unread: Decodable, Sendable { var unread: String? }
  func markUnread(_ id: String) async throws -> Unread {
    try await post("/sessions/\(id)/unread", ["action": "mark"])
  }

  struct Muted: Codable, Sendable { var muted: Bool }
  func mute(_ id: String, _ muted: Bool) async throws -> Muted {
    try await post("/sessions/\(id)/mute", Muted(muted: muted))
  }

  /// A new thread continuing from the latest state, like the desktop's "Fork from latest".
  func fork(_ id: String) async throws -> SessionInfo {
    try await post("/sessions/\(id)/action", ["action": "fork"])
  }

  /// The transcript as Markdown or OpenCode's JSON export; the body isn't JSON-wrapped.
  @concurrent func export(_ id: String, format: ExportFormat) async throws -> Data {
    let request = request(url("/sessions/\(id)/export", ["format": format.rawValue]))
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else {
      let message = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
      throw GatewayError(
        status: status, message: message ?? "The gateway could not export this thread.")
    }
    return data
  }
}
