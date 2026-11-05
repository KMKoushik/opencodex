import Foundation

/// Shell and subagent calls the current reply is waiting on, as OpenCode's app reads them.
/// Port of the desktop `blocking-work.ts`.
nonisolated struct BlockingWork: Equatable, Sendable {
  struct Shell: Equatable, Sendable {
    var id: String?
    var command: String?
  }
  var shells: [Shell] = []
  /// Subagent session IDs.
  var subagents: [String?] = []

  static let none = BlockingWork()

  var isEmpty: Bool { shells.isEmpty && subagents.isEmpty }

  /// Reads only the newest assistant message, which is the unfinished reply while it runs.
  init(_ messages: [SessionMessage]) {
    let last = messages.last { if case .assistant = $0 { true } else { false } }
    guard case .assistant(let reply) = last, reply.time.completed == nil else { return }
    for part in reply.content {
      guard case .tool(let call) = part, call.state.status == .running else { continue }
      if call.name == "shell" {
        shells.append(
          Shell(id: call.state.metadata?["shellID"]?.string, command: call.input("command")))
      }
      if call.name == "subagent" { subagents.append(call.state.metadata?["sessionID"]?.string) }
    }
  }

  private init() {}
}

extension ChatModel {
  /// What the running reply is blocked on; empty when idle.
  var blockingWork: BlockingWork { running ? BlockingWork(messages) : .none }
}
