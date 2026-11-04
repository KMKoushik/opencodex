import Foundation

// A port of the web's `timeline-model.ts`: a keyed presentation projection of OpenCode's
// native history. It runs on snapshots (and toggles) only, never per streamed token.

/// One piece of a turn's work, grouped into an activity row.
nonisolated enum WorkEntry: Hashable, Sendable {
  case tool(ToolCall)
  case skill(SkillMessage)
  case reasoning(Reasoning)

  struct Reasoning: Hashable, Sendable {
    var id: String
    var messageID: String
    var ordinal: Int
    var text: String
    var completed: Bool
  }

  var id: String {
    switch self {
    case .tool(let tool): tool.id
    case .skill(let skill): skill.id
    case .reasoning(let reasoning): reasoning.id
    }
  }
}

/// A run of assistant text: the `ordinal`-th text part of its message.
nonisolated struct TextRow: Hashable, Sendable {
  var id: String
  var messageID: String
  var ordinal: Int
  var text: String
  var completed: Bool
  /// The finished turn's answer, which offers Copy.
  var copyable = false
}

nonisolated struct ActivityRow: Hashable, Sendable {
  var id: String
  var entries: [WorkEntry]
  var summary: String
  var active: Bool
  var errors: Int
}

/// The header that folds a turn's work, Codex-style.
nonisolated struct TurnRow: Hashable, Sendable {
  enum Status: Hashable, Sendable { case working, worked, stopped }
  var id: String
  var status: Status
  var start: Millis
  var end: Millis?
  var open: Bool
}

nonisolated enum TimelineRow: Hashable, Sendable {
  /// A user, shell, compaction or note message.
  case message(SessionMessage)
  /// An assistant message's error, after its parts.
  case failure(id: String, message: String)
  case text(TextRow)
  case activity(ActivityRow)
  case turn(TurnRow)

  var id: String {
    switch self {
    case .message(let message): message.id
    case .failure(let id, _): id
    case .text(let row): row.id
    case .activity(let row): row.id
    case .turn(let row): row.id
    }
  }

  var isUser: Bool {
    if case .message(.user) = self { return true }
    return false
  }
}

/// Projects snapshots into rows, reusing group keys, including when an older page extends a group.
nonisolated final class TimelineProjector {
  private enum Entry {
    case row(TimelineRow)
    case work(WorkEntry)
  }

  private var cache: [String: (message: SessionMessage, entries: [Entry])] = [:]
  private var groups: [String: String] = [:]

  init() {}

  func project(_ messages: [SessionMessage]) -> [TimelineRow] {
    var rows: [TimelineRow] = []
    var nextGroups: [String: String] = [:]
    var nextCache: [String: (message: SessionMessage, entries: [Entry])] = [:]
    var claimed = Set<String>()
    var work: [WorkEntry] = []
    func flush() {
      guard let first = work.first else { return }
      let id =
        work.lazy.compactMap { self.groups[$0.id] }.first { !claimed.contains($0) }
        ?? "activity:\(first.id)"
      claimed.insert(id)
      let summary = summarizeWork(work)
      rows.append(
        .activity(
          ActivityRow(
            id: id, entries: work, summary: summary.summary, active: summary.active,
            errors: summary.errors)))
      for entry in work { nextGroups[entry.id] = id }
      work = []
    }
    for message in messages {
      let entries: [Entry]
      if let cached = cache[message.id], cached.message == message {
        entries = cached.entries
      } else {
        entries = Self.entries(message)
      }
      nextCache[message.id] = (message, entries)
      for entry in entries {
        switch entry {
        case .work(let work_): work.append(work_)
        case .row(let row):
          flush()
          rows.append(row)
        }
      }
    }
    flush()
    groups = nextGroups
    cache = nextCache
    return rows
  }

  private static func entries(_ message: SessionMessage) -> [Entry] {
    switch message {
    case .assistant(let assistant):
      var entries: [Entry] = []
      var text = 0
      var reasoning = 0
      let completed = assistant.time.completed != nil
      for part in assistant.content {
        switch part {
        case .tool(let tool): entries.append(.work(.tool(tool)))
        case .reasoning(let body):
          entries.append(
            .work(
              .reasoning(
                .init(
                  id: "\(assistant.id):reasoning:\(reasoning)", messageID: assistant.id,
                  ordinal: reasoning, text: body, completed: completed))))
          reasoning += 1
        case .text(let body):
          let ordinal = text
          text += 1
          if !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !completed {
            entries.append(
              .row(
                .text(
                  TextRow(
                    id: "\(assistant.id):text:\(ordinal)", messageID: assistant.id,
                    ordinal: ordinal, text: body, completed: completed))))
          }
        case .other: continue
        }
      }
      if text == 0 && !completed {
        entries.append(
          .row(
            .text(
              TextRow(
                id: "\(assistant.id):text:0", messageID: assistant.id, ordinal: 0, text: "",
                completed: false))))
      }
      if let error = assistant.error {
        entries.append(.row(.failure(id: "\(assistant.id):status", message: error.message)))
      }
      return entries
    case .skill(let skill): return [.work(.skill(skill))]
    // Like the desktop, injected context (system, synthetic) is not part of the conversation.
    case .idle, .other, .synthetic, .system: return []
    case .user, .shell, .compaction: return [.row(.message(message))]
    }
  }
}

/// Folds each turn's work under one header. OpenCode does not mark which text is the final
/// answer, so a finished turn's last text is the answer and everything else is work. While a
/// turn runs, its newest text stays below the header until more work follows it.
nonisolated final class TurnGrouper {
  private var owners: [String: String] = [:]

  init() {}

  /// The turn whose header folds this row, if any.
  func owner(of id: String) -> String? { owners[id] }

  func group(
    _ rows: [TimelineRow], messages: [SessionMessage], running: Bool,
    overrides: [String: Bool]
  ) -> [TimelineRow] {
    let times = turnTimes(messages)
    var out: [TimelineRow] = []
    out.reserveCapacity(rows.count + 16)
    var nextOwners: [String: String] = [:]
    var claimed = Set<String>()
    var start = 0
    while start < rows.count {
      let user: TimelineRow? = rows[start].isUser ? rows[start] : nil
      if let user { out.append(user) }
      var end = user != nil ? start + 1 : start
      while end < rows.count && !rows[end].isUser { end += 1 }
      let turn = rows[(user != nil ? start + 1 : start)..<end]
      let live = running && end == rows.count
      var answer: Int?
      for index in turn.indices.reversed() {
        if case .text = turn[index] {
          answer = index
          break
        }
        // While running, text is only the answer so far if no work has followed it.
        if live, case .activity = turn[index] { break }
      }
      func shown(_ index: Int) -> TimelineRow {
        guard index == answer, !live, case .text(var text) = turn[index], text.completed
        else { return turn[index] }
        text.copyable = true
        return .text(text)
      }
      let members = turn.indices.filter { index in
        guard index != answer else { return false }
        switch turn[index] {
        case .activity, .text: return true
        default: return false
        }
      }
      if members.isEmpty {
        for index in turn.indices { out.append(shown(index)) }
        start = end
        continue
      }
      let userID: String? = if case .message(let message)? = user { message.id } else { nil }
      let id =
        members.lazy.compactMap { self.owners[turn[$0].id] }.first { !claimed.contains($0) }
        ?? "turn:\(userID ?? turn[members[0]].id)"
      claimed.insert(id)
      let time = times[userID ?? ""]
      let status: TurnRow.Status =
        live ? .working : time?.outcome == "interrupted" ? .stopped : .worked
      let open = overrides[id] ?? live
      let header = TurnRow(
        id: id, status: status, start: time?.start ?? 0, end: live ? nil : time?.end, open: open)
      let memberSet = Set(members)
      var placed = false
      for index in turn.indices {
        let member = memberSet.contains(index)
        if member { nextOwners[turn[index].id] = id }
        if member && !placed {
          out.append(.turn(header))
          placed = true
        }
        if !member || open { out.append(shown(index)) }
      }
      start = end
    }
    owners = nextOwners
    return out
  }

  private struct TurnTime {
    var start: Millis
    var end: Millis?
    var outcome: String?
  }

  /// Start, end and outcome per turn, keyed by its user message ("" before the first).
  private func turnTimes(_ messages: [SessionMessage]) -> [String: TurnTime] {
    var times: [String: TurnTime] = [:]
    var current: String?
    for message in messages {
      if case .user(let user) = message {
        current = user.id
        times[user.id] = TurnTime(start: user.time.created)
        continue
      }
      if current == nil {
        current = ""
        times[""] = TurnTime(start: message.created)
      }
      guard let key = current else { continue }
      switch message {
      case .idle(let idle):
        times[key]?.end = idle.time.created
        times[key]?.outcome = idle.outcome
      case .assistant(let assistant) where times[key]?.outcome == nil:
        let done = assistant.time.completed ?? assistant.time.created
        let end = max(times[key]?.end ?? 0, done)
        times[key]?.end = end
      default: break
      }
    }
    return times
  }
}

/// Tool families, shared by summaries and the activity rows.
nonisolated enum ToolKind: Sendable {
  case read, search, shell, edit, question, skill, other

  init(_ name: String) {
    switch name {
    case "read", "read_file": self = .read
    case "grep", "glob", "search", "list", "ls": self = .search
    case "shell", "bash", "exec", "execute": self = .shell
    case "edit", "write", "patch", "apply_patch", "write_file": self = .edit
    case "question": self = .question
    case "skill": self = .skill
    default: self = .other
    }
  }
}

nonisolated func summarizeWork(_ entries: [WorkEntry]) -> (
  summary: String, active: Bool, errors: Int
) {
  var reads = 0, searches = 0, commands = 0, edits = 0, questions = 0, skills = 0, other = 0
  var errors = 0
  var active = false
  for entry in entries {
    switch entry {
    case .skill: skills += 1
    case .reasoning(let reasoning): active = active || !reasoning.completed
    case .tool(let tool):
      let status = tool.state.status
      active = active || status == .running || status == .streaming
      if status == .error { errors += 1 }
      switch ToolKind(tool.name) {
      case .read: reads += 1
      case .search: searches += 1
      case .shell: commands += 1
      case .edit: edits += 1
      case .question: questions += 1
      case .skill: skills += 1
      case .other: other += 1
      }
    }
  }
  func count(_ n: Int, _ singular: String, _ plural: String? = nil) -> String {
    "\(n) \(n == 1 ? singular : plural ?? singular + "s")"
  }
  let parts = [
    reads > 0 ? "Read \(count(reads, "file"))" : "",
    searches > 0 ? count(searches, "search", "searches") : "",
    commands > 0 ? "ran \(count(commands, "command"))" : "",
    edits > 0 ? count(edits, "edit") : "",
    questions > 0 ? count(questions, "question") : "",
    skills > 0 ? "used \(count(skills, "skill"))" : "",
    other > 0 ? count(other, "tool call") : "",
  ].filter { !$0.isEmpty }
  let summary = parts.isEmpty ? "Thought process" : parts.joined(separator: " · ")
  return (summary.prefix(1).uppercased() + summary.dropFirst(), active, errors)
}

/// Adds the streamed parts a snapshot doesn't have yet, so they render in order: extra parts
/// on known messages, and a running assistant message for unknown ones.
nonisolated func withLiveParts(
  _ messages: [SessionMessage], live keys: some Collection<ChatModel.LiveKey>
) -> [SessionMessage] {
  guard !keys.isEmpty else { return messages }
  var byMessage: [String: [ChatModel.LiveKey]] = [:]
  for key in keys { byMessage[key.messageID, default: []].append(key) }
  var messages = messages
  for index in messages.indices.reversed() {
    guard case .assistant(var assistant) = messages[index],
      let keys = byMessage.removeValue(forKey: assistant.id)
    else { continue }
    var counts: [ChatModel.LiveKey.Kind: Int] = [.text: 0, .reasoning: 0]
    for part in assistant.content {
      if case .text = part { counts[.text, default: 0] += 1 }
      if case .reasoning = part { counts[.reasoning, default: 0] += 1 }
    }
    var changed = false
    for kind in [ChatModel.LiveKey.Kind.reasoning, .text] {
      let top = keys.filter { $0.kind == kind }.map(\.ordinal).max() ?? -1
      while counts[kind, default: 0] <= top {
        assistant.content.append(kind == .text ? .text("") : .reasoning(""))
        counts[kind, default: 0] += 1
        changed = true
      }
    }
    if changed { messages[index] = .assistant(assistant) }
  }
  // Message IDs sort by creation time.
  for (id, keys) in byMessage.sorted(by: { $0.key < $1.key }) {
    var content: [AssistantPart] = []
    for kind in [ChatModel.LiveKey.Kind.reasoning, .text] {
      let top = keys.filter { $0.kind == kind }.map(\.ordinal).max() ?? -1
      if top >= 0 {
        content += Array(repeating: kind == .text ? .text("") : .reasoning(""), count: top + 1)
      }
    }
    let created = messages.last?.created ?? Date().timeIntervalSince1970 * 1000
    messages.append(
      .assistant(
        AssistantMessage(id: id, time: .init(created: created), content: content)))
  }
  return messages
}
