import Foundation

/// One list row of the transcript. Timeline rows expand into these: an answer becomes one item
/// per Markdown block and an open activity group one item per tool, so the list virtualizes
/// long answers and a streaming answer re-renders only its tail.
nonisolated struct TranscriptItem: Hashable, Sendable {
  enum Content: Hashable, Sendable {
    case history(loading: Bool)
    case user(text: String, files: [String], pending: Bool)
    case block(MarkdownBlock, style: ProseStyle)
    case copy(text: String)
    case turn(TurnRow)
    case activity(summary: String, active: Bool, errors: Int, open: Bool)
    case tool(ToolCall, open: Bool)
    case skill(name: String, status: ToolCall.Status, error: String?)
    case thinking(active: Bool, open: Bool, empty: Bool)
    case shell(ShellMessage, open: Bool)
    case note(String)
    case failure(String)
  }

  /// Cells differ per kind; an item whose kind changes is reloaded rather than reconfigured.
  enum Kind: Hashable, Sendable {
    case history, user, text, code, table, rule, copy, disclosure, note
  }

  var id: String
  var content: Content
  /// 0 for top-level rows, 1 inside an open activity group, 2 inside open reasoning.
  var indent = 0

  var kind: Kind {
    switch content {
    case .history: .history
    case .user: .user
    case .block(let block, _):
      switch block.kind {
      case .text, .quote: .text
      case .code: .code
      case .table: .table
      case .rule: .rule
      }
    case .copy: .copy
    case .turn, .activity, .tool, .skill, .thinking, .shell: .disclosure
    case .note, .failure: .note
    }
  }
}

/// Builds transcript items from timeline rows, caching Markdown splits per row.
nonisolated final class TranscriptItemBuilder {
  /// Presentation state: open activity groups, tools, reasoning and shells.
  var open: Set<String> = []

  private var completedBlocks: [String: (text: String, blocks: [MarkdownBlock])] = [:]
  private var splitters: [String: BlockSplitter] = [:]

  init() {}

  /// Items for one timeline row. `text` resolves a text or reasoning part's displayed text
  /// (snapshot, live overlay or paced reveal) by its ID; `paced` is false for hidden text.
  func items(for row: TimelineRow, text: (_ id: String, _ snapshot: String, _ paced: Bool) -> String)
    -> [TranscriptItem]
  {
    switch row {
    case .message(let message): return items(for: message)
    case .failure(let id, let message): return [TranscriptItem(id: id, content: .failure(message))]
    case .turn(let turn): return [TranscriptItem(id: turn.id, content: .turn(turn))]
    case .text(let row):
      let shown = text(row.id, row.text, true)
      var items = blocks(row.id, shown, streaming: !row.completed).enumerated().map { index, block in
        TranscriptItem(id: "\(row.id)#\(index)", content: .block(block, style: .answer))
      }
      if row.copyable && !shown.isEmpty {
        items.append(TranscriptItem(id: "\(row.id)#copy", content: .copy(text: shown)))
      }
      return items
    case .activity(let activity):
      let isOpen = open.contains(activity.id)
      var items = [
        TranscriptItem(
          id: activity.id,
          content: .activity(
            summary: activity.summary, active: activity.active, errors: activity.errors,
            open: isOpen))
      ]
      guard isOpen else { return items }
      for entry in activity.entries {
        switch entry {
        case .tool(let tool):
          if ToolKind(tool.name) == .skill {
            items.append(
              TranscriptItem(
                id: tool.id,
                content: .skill(
                  name: tool.input("name") ?? tool.input("id") ?? "", status: tool.state.status,
                  error: tool.state.error?.message), indent: 1))
          } else {
            items.append(
              TranscriptItem(
                id: tool.id, content: .tool(tool, open: open.contains(tool.id)), indent: 1))
          }
        case .skill(let skill):
          items.append(
            TranscriptItem(
              id: skill.id,
              content: .skill(
                name: skill.name.isEmpty ? skill.skill : skill.name, status: .completed,
                error: nil), indent: 1))
        case .reasoning(let reasoning):
          let isOpen = open.contains(reasoning.id)
          let shown = text(reasoning.id, reasoning.text, isOpen)
          items.append(
            TranscriptItem(
              id: reasoning.id,
              content: .thinking(
                active: !reasoning.completed, open: isOpen,
                empty: shown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty),
              indent: 1))
          if isOpen {
            items += blocks(reasoning.id, shown, streaming: !reasoning.completed).enumerated()
              .map { index, block in
                TranscriptItem(
                  id: "\(reasoning.id)#\(index)", content: .block(block, style: .reasoning),
                  indent: 2)
              }
          }
        }
      }
      return items
    }
  }

  private func items(for message: SessionMessage) -> [TranscriptItem] {
    switch message {
    case .user(let user):
      let files = (user.files ?? []).map { $0.name ?? $0.uri ?? "File" }
      return [
        TranscriptItem(id: user.id, content: .user(text: user.text, files: files, pending: false))
      ]
    case .shell(let shell):
      return [TranscriptItem(id: shell.id, content: .shell(shell, open: open.contains(shell.id)))]
    case .compaction(let compaction):
      let text =
        switch compaction.status {
        case "running": "Compacting context…"
        case "failed": "Context compaction failed"
        default: "Context compacted"
        }
      return [TranscriptItem(id: compaction.id, content: .note(text))]
    case .synthetic(let note), .system(let note):
      let text = note.description ?? ""
      return text.isEmpty ? [] : [TranscriptItem(id: note.id, content: .note(text))]
    default: return []
    }
  }

  /// Pending inbox items: sent mid-run and not yet in the history.
  func pending(_ inbox: [InboxItem], known: Set<String>) -> [TranscriptItem] {
    inbox.compactMap { item in
      guard item.type == nil || item.type == "user", !known.contains(item.id) else { return nil }
      let text = item.payload?["text"]?.string ?? ""
      let files = (item.payload?["files"]?.array ?? []).compactMap {
        $0["name"]?.string ?? $0["filename"]?.string
      }
      return TranscriptItem(
        id: "inbox:\(item.id)", content: .user(text: text, files: files, pending: true))
    }
  }

  /// Splits a part's text into blocks. Streaming parts keep settled blocks; finished ones are
  /// split once per text.
  func blocks(_ id: String, _ text: String, streaming: Bool) -> [MarkdownBlock] {
    if streaming {
      let splitter = splitters[id] ?? BlockSplitter()
      splitters[id] = splitter
      return splitter.split(text)
    }
    if let cached = completedBlocks[id], cached.text == text { return cached.blocks }
    splitters[id] = nil
    let blocks = MarkdownBlocks.split(text)
    completedBlocks[id] = (text, blocks)
    return blocks
  }

  /// Drops caches for rows no longer shown.
  func retain(_ ids: Set<String>) {
    completedBlocks = completedBlocks.filter { ids.contains($0.key) }
    splitters = splitters.filter { ids.contains($0.key) }
  }
}

/// Vertical space above an item, from what precedes it.
nonisolated func transcriptGap(after previous: TranscriptItem?, _ item: TranscriptItem) -> Double {
  guard let previous else { return 8 }
  switch (previous.content, item.content) {
  case (_, .user): return previous.kind == .history ? 4 : 30
  case (.user, _): return 18
  case (_, .copy): return 2
  case (.block, .block(let block, let style)):
    if style == .reasoning { return 8 }
    if block.kind == .text, block.source.hasPrefix("#") { return 20 }
    return 14
  case (_, .block(_, let style)) where style == .reasoning: return 4
  case (.turn, _): return 10
  case (_, .turn): return 18
  case (.activity, .tool), (.activity, .skill), (.activity, .thinking): return 2
  case (.tool, .tool), (.tool, .skill), (.tool, .thinking), (.skill, .tool), (.skill, .skill),
    (.skill, .thinking), (.thinking, .tool), (.thinking, .skill), (.thinking, .thinking):
    return 0
  case (.block(_, .reasoning), .tool), (.block(_, .reasoning), .thinking),
    (.block(_, .reasoning), .skill):
    return 6
  case (_, .activity), (_, .shell): return 12
  case (.activity, _), (.shell, _): return 12
  default: return 14
  }
}
