import Foundation

// Gateway shapes and routes for running shells and subagents, as the desktop's `api.ts` reads
// them. Kept here rather than in Core because only the activity views use them.

/// One OpenCode-owned shell command (`/api/shells`).
nonisolated struct ShellInfo: Codable, Hashable, Identifiable, Sendable {
  struct Times: Codable, Hashable, Sendable {
    var started: Millis
    var completed: Millis?
  }
  var id: String
  /// `running`, `exited`, `killed` or `timeout`.
  var status: String
  var command: String
  var cwd: String?
  var exit: Double?
  var metadata: [String: JSONValue]?
  var time: Times

  var running: Bool { status == "running" }
  /// The session whose agent started it.
  var sessionID: String? { metadata?["sessionID"]?.string }
}

/// A slice of a shell's log from a byte cursor.
nonisolated struct ShellOutputChunk: Codable, Sendable {
  var output: String
  var cursor: Int
  var size: Int
  var truncated: Bool?
}

/// A child session as `/api/sessions/:id/subagents` and `session.get` return it, with the
/// outcome of its last run.
nonisolated struct SubagentSession: Codable, Hashable, Identifiable, Sendable {
  struct Times: Codable, Hashable, Sendable {
    var created: Millis
    var idle: Millis?
  }
  var id: String
  var parentID: String?
  var title: String?
  var agent: String?
  var model: ModelRef?
  /// `succeeded`, `failed` or `interrupted`; nil before the first run ends.
  var outcome: String?
  var location: SessionInfo.Location?
  var time: Times
}

nonisolated struct SubagentPage: Codable, Sendable {
  struct Cursor: Codable, Sendable { var next: String? }
  var data: [SubagentSession]
  var cursor: Cursor?
}

nonisolated extension GatewayClient {
  func shells(directory: String) async throws -> [ShellInfo] {
    try await get("/shells", ["directory": directory])
  }
  func shell(_ id: String, directory: String) async throws -> ShellInfo {
    try await get("/shells/\(id)", ["directory": directory])
  }
  func shellOutput(_ id: String, directory: String, cursor: Int?) async throws -> ShellOutputChunk {
    try await get("/shells/\(id)/output", ["directory": directory, "cursor": cursor.map(String.init)])
  }
  /// Stops the command (native `shell.remove`); never interrupts the session.
  func stopShell(_ id: String, directory: String) async throws -> OK {
    try await send(request(url("/shells/\(id)", ["directory": directory]), method: "DELETE"))
  }
  func subagents(_ id: String, cursor: String? = nil) async throws -> SubagentPage {
    try await get("/sessions/\(id)/subagents", ["cursor": cursor])
  }
  func subagent(_ id: String) async throws -> SubagentSession { try await get("/sessions/\(id)") }
}

// Elapsed labels use `formatDuration` from the transcript (a port of `elapsed.ts`).

/// Milliseconds since 1970 now, as OpenCode stamps times.
func nowMillis(_ date: Date = .now) -> Millis { date.timeIntervalSince1970 * 1000 }

/// "general" → "General", like the desktop rows.
func agentName(_ agent: String?) -> String {
  guard let agent, let first = agent.first else { return "Subagent" }
  return first.uppercased() + agent.dropFirst()
}
