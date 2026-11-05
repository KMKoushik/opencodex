import Foundation

// Gateway shapes the Session details sheet and the new-thread workspace bar read. They decode
// only the fields those screens show, so they live here instead of growing the Core models.

/// Namespaced so these shapes never collide with other screens' decodings of the same routes.
nonisolated enum SessionDetails {
  /// `TokenUsageInfo`: one response's or one session's token counts.
  nonisolated struct Tokens: Codable, Hashable, Sendable {
    struct Cache: Codable, Hashable, Sendable {
      var read: Double
      var write: Double
    }
    var input: Double
    var output: Double
    var reasoning: Double
    var cache: Cache
  }

  /// A native session's cost and token totals (`/sessions/:id` and subagent pages).
  nonisolated struct SessionUsage: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var parentID: String?
    var title: String?
    var cost: Double
    var tokens: Tokens?
  }

  /// `/sessions/:id/subagents`: one page of a session's direct children.
  nonisolated struct SubagentPage: Codable, Sendable {
    struct Cursor: Codable, Sendable { var next: String? }
    var data: [SessionUsage]
    var cursor: Cursor?
  }

  /// `/workspace/vcs`: the checkout's branch and its working-tree changes.
  nonisolated struct Vcs: Codable, Sendable {
    struct Info: Codable, Sendable {
      struct Branch: Codable, Sendable { var current: String? }
      var provider: String?
      var branch: Branch
    }
    struct File: Codable, Sendable {
      var file: String
      var additions: Double
      var deletions: Double
      var status: String?
    }
    var info: Info
    var files: [File]

    var additions: Double { files.reduce(0) { $0 + $1.additions } }
    var deletions: Double { files.reduce(0) { $0 + $1.deletions } }
  }

  /// `/workspace/mcp`: one configured MCP server and its connection state.
  nonisolated struct McpServer: Codable, Hashable, Sendable {
    struct Status: Codable, Hashable, Sendable {
      /// `connected`, `disabled`, `failed`, `needs_auth`, …
      var status: String
      var error: String?
    }
    var name: String
    var status: Status

    var connected: Bool { status.status == "connected" }
    /// As the desktop shows it: capitalized, with sign-in spelled out.
    var label: String {
      status.status == "needs_auth" ? "Needs sign-in" : status.status.capitalized
    }
  }

  /// `/workspace/skills`: a skill available to the project.
  nonisolated struct Skill: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var description: String?
  }

  /// A project with its version control, which decides whether it has a checkout.
  nonisolated struct Project: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String?
    struct Times: Codable, Hashable, Sendable {
      var created: Millis?
      var updated: Millis?
      var active: Millis?
    }
    var canonical: String
    var vcs: String?
    var time: Times?

    /// When a session in it last ran, else when it last changed.
    var activeAt: Millis { time?.active ?? time?.updated ?? time?.created ?? 0 }

    var displayName: String {
      if let name, !name.isEmpty { return name }
      return (canonical as NSString).lastPathComponent
    }
  }

  /// `/projects/:id/worktrees`: one of a project's checkouts.
  nonisolated struct Worktree: Codable, Hashable, Sendable {
    var directory: String
    var strategy: String?
  }

  /// The chat's native checkout: its project's local folder or one of its Git worktrees.
  /// A port of the desktop's `useCheckout`.
  nonisolated struct Checkout: Sendable {
    /// The project folder, when the project uses version control.
    var canonical: String?
    var directory: String
    /// The chat runs in the project folder itself, not a worktree.
    var local: Bool
    /// A chat in a worktree that OpenCode no longer lists; its history stays readable.
    var removed = false

    init(project: Project?, directory: String) {
      canonical = project?.vcs != nil ? project?.canonical : nil
      self.directory = directory
      local = canonical.map { Self.within(directory, $0) } ?? false
    }

    static func within(_ directory: String, _ checkout: String) -> Bool {
      directory == checkout || directory.hasPrefix(checkout + "/") || directory.hasPrefix(checkout + "\\")
    }

    var folderName: String {
      directory.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? directory
    }
  }
}

nonisolated extension GatewayClient {
  /// The session with its cost and token totals.
  func sessionUsage(_ id: String) async throws -> SessionDetails.SessionUsage { try await get("/sessions/\(id)") }
  func subagentUsage(_ id: String, cursor: String? = nil) async throws -> SessionDetails.SubagentPage {
    try await get("/sessions/\(id)/subagents", ["cursor": cursor])
  }
  func vcsSummary(directory: String) async throws -> SessionDetails.Vcs {
    try await get("/workspace/vcs", ["directory": directory])
  }
  func mcpServers(directory: String) async throws -> [SessionDetails.McpServer] {
    try await get("/workspace/mcp", ["directory": directory])
  }
  func projectSkills(directory: String) async throws -> [SessionDetails.Skill] {
    try await get("/workspace/skills", ["directory": directory])
  }
  func checkoutProjects() async throws -> [SessionDetails.Project] { try await get("/projects") }
  func worktreeList(projectID: String) async throws -> [SessionDetails.Worktree] {
    try await get("/projects/\(projectID)/worktrees")
  }
}
