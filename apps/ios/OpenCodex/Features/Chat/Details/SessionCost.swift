import Foundation

/// Context usage, ported from the desktop's `context-usage.ts`.
nonisolated enum ContextUsage {
  /// The newest message page's size; like the desktop, never scan the full transcript.
  static let pageSize = 50

  static func total(_ tokens: AssistantMessage.Tokens) -> Double {
    (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0)
      + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0)
  }

  /// The newest response that reported tokens. `messages` is oldest first.
  static func latestResponse(_ messages: [SessionMessage]) -> AssistantMessage? {
    for message in messages.reversed().prefix(pageSize) {
      if case .assistant(let assistant) = message, let tokens = assistant.tokens, total(tokens) > 0 {
        return assistant
      }
    }
    return nil
  }

  /// The share of the response model's context window the latest response used.
  struct Reading: Equatable {
    var tokens: Double?
    var limit: Double?
    var ratio: Double? {
      guard let tokens, let limit, limit > 0 else { return nil }
      return tokens / limit
    }
  }

  static func reading(
    messages: [SessionMessage], fallback: ModelRef?, models: [ModelCatalog.Model]?
  ) -> Reading {
    let latest = latestResponse(messages)
    let model = latest?.model ?? fallback
    let limit = models?.first { $0.id == model?.id && $0.providerID == model?.providerID }?
      .limit?.context
    return Reading(tokens: latest?.tokens.map(total), limit: limit)
  }
}

/// The cost of a session's whole subagent tree, ported from the desktop's `session-cost.ts`.
nonisolated enum SessionCost {
  struct Failure: LocalizedError {
    var message: String
    var errorDescription: String? { message }
  }

  typealias List = @Sendable (_ parentID: String, _ cursor: String?) async throws ->
    SessionDetails.SubagentPage

  /// Every nested subagent once, never the session itself. Metadata only, with bounded
  /// concurrency and memory even for large session trees. Fails rather than returning a
  /// partial tree.
  static func subagents(of sessionID: String, list: @escaping List) async throws
    -> [SessionDetails.SessionUsage]
  {
    var sessions: [SessionDetails.SessionUsage] = []
    var seen: Set<String> = [sessionID]
    var pending = [sessionID]
    while !pending.isEmpty {
      try Task.checkCancellation()
      let batch = Array(pending.prefix(4))
      pending.removeFirst(batch.count)
      let pages = try await withThrowingTaskGroup(of: [SessionDetails.SessionUsage].self) { group in
        for parentID in batch {
          group.addTask { try await children(of: parentID, list: list) }
        }
        var all: [[SessionDetails.SessionUsage]] = []
        for try await children in group { all.append(children) }
        return all
      }
      for session in pages.joined() where !seen.contains(session.id) {
        if sessions.count >= 5000 {
          throw Failure(message: "This session has too many subagents to load the complete cost.")
        }
        seen.insert(session.id)
        sessions.append(session)
        pending.append(session.id)
      }
    }
    return sessions
  }

  /// One parent's direct children, across every page.
  private static func children(of parentID: String, list: @escaping List) async throws
    -> [SessionDetails.SessionUsage]
  {
    var children: [SessionDetails.SessionUsage] = []
    var cursors = Set<String>()
    var cursor: String?
    repeat {
      try Task.checkCancellation()
      let page = try await list(parentID, cursor)
      children += page.data
      cursor = page.cursor?.next
      if let next = cursor {
        if cursors.contains(next) {
          throw Failure(message: "OpenCode repeated a subagent page. Retry to load the complete cost.")
        }
        cursors.insert(next)
      }
    } while cursor != nil
    return children
  }
}
