import Foundation

/// A task on the board, stored by the OpenCodex tasks plugin in OpenCode's plugin storage
/// (`Task` in `packages/contracts`).
nonisolated struct BoardTask: Codable, Hashable, Identifiable, Sendable {
  enum Bucket: String, Codable, CaseIterable, Sendable {
    case today, week, someday, done
  }
  struct Project: Codable, Hashable, Sendable {
    var id: String
    var directory: String
  }
  struct Times: Codable, Hashable, Sendable {
    var created: Millis
    var updated: Millis
    var moved: Millis
    var completed: Millis?
  }

  var id: String
  var title: String
  var notes: String?
  var bucket: Bucket
  /// Ascending position within its bucket.
  var order: Double
  var project: Project?
  /// The chat whose agent created the task.
  var sessionID: String?
  var source: String?
  /// Where the task returns when it's reopened from Done.
  var reopen: Bucket?
  var time: Times
}

/// Installation and load state of an OpenCodex plugin (`TasksPluginStatus`).
nonisolated struct PluginStatus: Codable, Hashable, Sendable {
  enum State: String, Codable, Sendable {
    case unavailable, missing, outdated, loading, active, failed
  }
  var state: State
  var path: String?
  var message: String?
}

/// `PATCH /api/tasks/:id`. Only the fields that are set are sent; `project` sends `null` to
/// clear it, as the desktop's `TaskUpdate` does.
nonisolated struct TaskUpdate: Encodable, Sendable {
  var title: String?
  var notes: String?
  var bucket: BoardTask.Bucket?
  var order: Double?
  /// `.some(nil)` clears the project.
  var project: BoardTask.Project??

  var isEmpty: Bool {
    title == nil && notes == nil && bucket == nil && order == nil && project == nil
  }

  private enum Key: String, CodingKey { case title, notes, bucket, order, project }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: Key.self)
    try container.encodeIfPresent(title, forKey: .title)
    try container.encodeIfPresent(notes, forKey: .notes)
    try container.encodeIfPresent(bucket, forKey: .bucket)
    try container.encodeIfPresent(order, forKey: .order)
    if let project {
      if let project { try container.encode(project, forKey: .project) } else {
        try container.encodeNil(forKey: .project)
      }
    }
  }
}

nonisolated struct TaskCreate: Encodable, Sendable {
  var title: String
  var bucket: BoardTask.Bucket
  var project: BoardTask.Project?
}

nonisolated extension GatewayClient {
  func tasksPlugin() async throws -> PluginStatus { try await get("/tasks/plugin") }
  func tasks() async throws -> [BoardTask] { try await get("/tasks") }
  func createTask(_ input: TaskCreate) async throws -> BoardTask { try await post("/tasks", input) }
  func updateTask(_ id: String, _ input: TaskUpdate) async throws -> BoardTask {
    try await send(
      request(
        url("/tasks/\(id)"), method: "PATCH", body: JSONEncoder().encode(input)))
  }
  func deleteTask(_ id: String) async throws -> OK {
    try await delete("/tasks/\(id)")
  }

}
