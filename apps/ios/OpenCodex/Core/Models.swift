import Foundation

// App-facing gateway shapes. Field names match the JSON; unknown fields are ignored and
// optional fields stay optional, so a newer gateway or OpenCode doesn't break decoding.

/// Milliseconds since 1970, as OpenCode sends times.
typealias Millis = Double

extension Millis {
  var date: Date { Date(timeIntervalSince1970: self / 1000) }
}

nonisolated struct ModelRef: Codable, Hashable, Sendable {
  var id: String
  var providerID: String
  var variant: String?
}

/// A thread row, as `/api/sessions` and `/api/session-search` return it.
nonisolated struct SessionSummary: Codable, Hashable, Identifiable, Sendable {
  struct Times: Codable, Hashable, Sendable {
    var created: Millis
    var idle: Millis?
    var viewed: Millis?
  }
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
  var model: String?
  var match: Match?

  /// Same rule as the desktop sidebar: a reply finished after the last time it was viewed.
  var hasUnreadReply: Bool {
    if unread != nil { return true }
    guard let idle = time.idle else { return false }
    return idle > (time.viewed ?? 0)
  }
}

nonisolated struct SessionPage: Codable, Sendable {
  var sessions: [SessionSummary]
  var nextCursor: String?
  var searchNotice: String?
}

/// Native `session.get`, trimmed to what the phone reads.
nonisolated struct SessionInfo: Codable, Hashable, Identifiable, Sendable {
  struct Location: Codable, Hashable, Sendable { var directory: String }
  struct Times: Codable, Hashable, Sendable {
    var created: Millis
    var updated: Millis?
    var busy: Millis?
    var idle: Millis?
    var viewed: Millis?
  }
  struct Rule: Codable, Hashable, Sendable {
    var action: String
    var resource: String
    var effect: String
  }

  var id: String
  var title: String?
  var projectID: String?
  var parentID: String?
  var agent: String?
  var model: ModelRef?
  var location: Location
  var time: Times
  var permissions: [Rule]?
  var metadata: [String: JSONValue]?
  /// A staged undo: messages from `messageID` on are hidden until redo or the next prompt.
  struct Revert: Codable, Hashable, Sendable { var messageID: String }
  var revert: Revert?

  /// A trailing allow-all rule is the thread's Full access override.
  var fullAccess: Bool {
    guard let rule = permissions?.last else { return false }
    return rule.action == "*" && rule.resource == "*" && rule.effect == "allow"
  }
}

nonisolated struct Project: Codable, Hashable, Identifiable, Sendable {
  struct Icon: Codable, Hashable, Sendable {
    var url: String?
    var override: String?
    var color: String?
  }
  var id: String
  var name: String?
  var canonical: String
  var icon: Icon?

  var displayName: String {
    if let name, !name.isEmpty { return name }
    return (canonical as NSString).lastPathComponent
  }
}

/// `/api/sessions/active`: running session IDs.
typealias ActiveSessions = [String: JSONValue]

/// `/api/attention`: root threads waiting on an approval (`permission`) or a `question`.
typealias SessionAttention = [String: String]

nonisolated struct ModelCatalog: Codable, Sendable {
  struct Provider: Codable, Hashable, Sendable {
    var id: String
    var name: String
  }
  struct Model: Codable, Hashable, Identifiable, Sendable {
    struct Variant: Codable, Hashable, Sendable { var id: String }
    struct Limit: Codable, Hashable, Sendable { var context: Double? }
    var id: String
    var providerID: String
    var name: String
    var enabled: Bool?
    var status: String?
    var variants: [Variant]?
    var limit: Limit?

    var ref: ModelRef { ModelRef(id: id, providerID: providerID) }
  }
  var data: [Model]
  var providers: [Provider]
  var defaultModel: ModelRef?
}

nonisolated struct PermissionRequest: Codable, Hashable, Identifiable, Sendable {
  var id: String
  var sessionID: String
  var action: String
  var resources: [String]?
  /// Patterns an "Always allow" reply would save; empty means it can only be allowed once.
  var save: [String]?
  var message: String?
  var metadata: [String: JSONValue]?
}

nonisolated enum PermissionDecision: String, Codable, Sendable {
  case once, always, reject
}

/// A question the agent asked, as a native session form.
nonisolated struct FormInfo: Codable, Hashable, Identifiable, Sendable {
  struct Option: Codable, Hashable, Sendable {
    var value: String
    var label: String?
    var description: String?
  }
  struct Field: Codable, Hashable, Sendable {
    var key: String
    var title: String?
    var description: String?
    var type: String
    var options: [Option]?
    var custom: Bool?
    var multiple: Bool?
    var required: Bool?
  }
  var id: String
  var sessionID: String
  var title: String?
  var fields: [Field]
}

nonisolated struct Connection: Codable, Sendable {
  var status: String
  var version: String?
  var message: String?
}

/// A message waiting in OpenCode's inbox: sent mid-run, delivered at the next step.
nonisolated struct InboxItem: Codable, Hashable, Identifiable, Sendable {
  var id: String
  var type: String?
  var delivery: String?
  var payload: JSONValue?
}

nonisolated struct OK: Codable, Sendable { var ok: Bool? }
