import Foundation

/// One entry of a session's native history (`SessionMessageInfo`). Kinds the app doesn't
/// render decode as `.other`, so new OpenCode message types never break a transcript.
nonisolated enum SessionMessage: Decodable, Hashable, Identifiable, Sendable {
  case user(UserMessage)
  case assistant(AssistantMessage)
  case shell(ShellMessage)
  case synthetic(TextNote)
  case system(TextNote)
  case skill(SkillMessage)
  case compaction(CompactionMessage)
  case idle(IdleMessage)
  case other(id: String, type: String, created: Millis)

  private enum Key: String, CodingKey { case id, type, time }
  private struct Time: Decodable { var created: Millis }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Key.self)
    let type = try container.decode(String.self, forKey: .type)
    switch type {
    case "user": self = .user(try UserMessage(from: decoder))
    case "assistant": self = .assistant(try AssistantMessage(from: decoder))
    case "shell": self = .shell(try ShellMessage(from: decoder))
    case "synthetic": self = .synthetic(try TextNote(from: decoder))
    case "system": self = .system(try TextNote(from: decoder))
    case "skill": self = .skill(try SkillMessage(from: decoder))
    case "compaction": self = .compaction(try CompactionMessage(from: decoder))
    case "idle": self = .idle(try IdleMessage(from: decoder))
    default:
      self = .other(
        id: try container.decode(String.self, forKey: .id),
        type: type,
        created: try container.decode(Time.self, forKey: .time).created)
    }
  }

  var id: String {
    switch self {
    case .user(let m): m.id
    case .assistant(let m): m.id
    case .shell(let m): m.id
    case .synthetic(let m), .system(let m): m.id
    case .skill(let m): m.id
    case .compaction(let m): m.id
    case .idle(let m): m.id
    case .other(let id, _, _): id
    }
  }

  var created: Millis {
    switch self {
    case .user(let m): m.time.created
    case .assistant(let m): m.time.created
    case .shell(let m): m.time.created
    case .synthetic(let m), .system(let m): m.time.created
    case .skill(let m): m.time.created
    case .compaction(let m): m.time.created
    case .idle(let m): m.time.created
    case .other(_, _, let created): created
    }
  }
}

nonisolated struct Created: Codable, Hashable, Sendable { var created: Millis }

nonisolated struct UserMessage: Codable, Hashable, Sendable {
  struct File: Codable, Hashable, Sendable {
    var uri: String?
    var mime: String?
    var name: String?
  }
  var id: String
  var time: Created
  var text: String
  var files: [File]?
  var metadata: [String: JSONValue]?
}

nonisolated struct AssistantMessage: Codable, Hashable, Sendable {
  struct Times: Codable, Hashable, Sendable {
    var created: Millis
    var streamed: Millis?
    var completed: Millis?
  }
  struct Tokens: Codable, Hashable, Sendable {
    struct Cache: Codable, Hashable, Sendable {
      var read: Double?
      var write: Double?
    }
    var input: Double?
    var output: Double?
    var reasoning: Double?
    var cache: Cache?
  }
  var id: String
  var time: Times
  var agent: String?
  var model: ModelRef?
  var content: [AssistantPart]
  var finish: String?
  var cost: Double?
  var tokens: Tokens?
  var error: StructuredError?
}

nonisolated struct StructuredError: Codable, Hashable, Sendable {
  var type: String?
  var message: String
}

nonisolated enum AssistantPart: Codable, Hashable, Sendable {
  case text(String)
  case reasoning(String)
  case tool(ToolCall)
  case other

  private enum Key: String, CodingKey { case type, text }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Key.self)
    switch try container.decode(String.self, forKey: .type) {
    case "text": self = .text(try container.decodeIfPresent(String.self, forKey: .text) ?? "")
    case "reasoning":
      self = .reasoning(try container.decodeIfPresent(String.self, forKey: .text) ?? "")
    case "tool": self = .tool(try ToolCall(from: decoder))
    default: self = .other
    }
  }

  func encode(to encoder: Encoder) throws {}
}

nonisolated struct ToolCall: Codable, Hashable, Sendable {
  struct Times: Codable, Hashable, Sendable {
    var created: Millis
    var ran: Millis?
    var completed: Millis?
  }
  enum Status: String, Codable, Sendable {
    case streaming, running, completed, error
  }
  struct State: Codable, Hashable, Sendable {
    var status: Status
    /// A JSON object once parsed; a partial string while still streaming.
    var input: JSONValue?
    var metadata: [String: JSONValue]?
    var content: [ToolContent]?
    var error: StructuredError?
  }
  var id: String
  var name: String
  var state: State
  var time: Times

  /// One input field as text, e.g. `command` for a shell or `filePath` for a read.
  func input(_ key: String) -> String? { state.input?[key]?.string }

  /// The tool's text output, joined.
  var output: String {
    (state.content ?? []).compactMap(\.text).joined(separator: "\n")
  }
}

nonisolated struct ToolContent: Codable, Hashable, Sendable {
  var type: String
  var text: String?
  var uri: String?
  var mime: String?
  var name: String?
}

nonisolated struct ShellMessage: Codable, Hashable, Sendable {
  struct Times: Codable, Hashable, Sendable {
    var created: Millis
    var completed: Millis?
  }
  struct Output: Codable, Hashable, Sendable {
    var output: String
    var truncated: Bool?
  }
  var id: String
  var time: Times
  var shellID: String
  var command: String
  var status: String
  var output: Output?
}

nonisolated struct TextNote: Codable, Hashable, Sendable {
  var id: String
  var time: Created
  var text: String
  var description: String?
}

nonisolated struct SkillMessage: Codable, Hashable, Sendable {
  var id: String
  var time: Created
  var skill: String
  var name: String
}

nonisolated struct CompactionMessage: Codable, Hashable, Sendable {
  var id: String
  var time: Created
  var status: String
  var reason: String?
}

nonisolated struct IdleMessage: Codable, Hashable, Sendable {
  var id: String
  var time: Created
  /// `succeeded`, `failed` or `interrupted`.
  var outcome: String
}

/// `/api/sessions/:id/messages`: newest first, with a cursor to older pages.
nonisolated struct MessagePage: Decodable, Sendable {
  struct Cursor: Decodable, Sendable {
    var previous: String?
    var next: String?
  }
  var data: [SessionMessage]
  var cursor: Cursor?
}
