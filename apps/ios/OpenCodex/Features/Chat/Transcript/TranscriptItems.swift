import Foundation

/// A file sent with a prompt: images show as thumbnails, other files as cards.
nonisolated struct Attachment: Hashable, Sendable {
  var name: String
  var mime: String
  var source: ImageSource?

  /// `message-attachments.tsx` previews these types inline.
  var isImage: Bool {
    ["image/png", "image/jpeg", "image/gif", "image/webp"].contains(mime.lowercased())
  }

  /// The card's second line: PDF, the extension, or File.
  var typeLabel: String {
    if mime == "application/pdf" { return "PDF" }
    if name.contains("."), let ext = name.split(separator: ".").last { return ext.uppercased() }
    return "File"
  }
}

/// One list row of the transcript. Timeline rows expand into these: an answer becomes one item
/// per Markdown block and an open activity group one item per tool, so the list virtualizes
/// long answers and a streaming answer re-renders only its tail.
nonisolated struct TranscriptItem: Hashable, Sendable {
  enum Content: Hashable, Sendable {
    case history(History)
    case user(text: String, files: [Attachment], pending: Bool)
    case block(MarkdownBlock, style: ProseStyle)
    case copy(text: String)
    case turn(TurnRow)
    case activity(summary: String, active: Bool, errors: Int, open: Bool)
    case tool(ToolCall, open: Bool)
    case skill(name: String, status: ToolCall.Status, error: String?)
    case thinking(open: Bool, empty: Bool)
    case shell(ShellMessage, open: Bool)
    case note(String)
    case failure(String)
  }

  enum History: Hashable, Sendable { case more, loading, beginning }

  /// Where a block sits in a reasoning panel, which draws one background across its blocks.
  enum Panel: Hashable, Sendable { case only, first, middle, last }

  /// Cells differ per kind; an item whose kind changes is reloaded rather than reconfigured.
  enum Kind: Hashable, Sendable {
    case history, user, text, code, table, rule, image, copy, disclosure, note
  }

  var id: String
  var content: Content
  /// The timeline row this item belongs to: gaps inside a row differ from gaps between rows.
  var row: String
  /// 0 for top-level rows, 1 inside an open activity group.
  var indent = 0
  var panel: Panel?

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
      case .image: .image
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
    case .failure(let id, let message):
      return [TranscriptItem(id: id, content: .failure(message), row: id)]
    case .turn(let turn): return [TranscriptItem(id: turn.id, content: .turn(turn), row: turn.id)]
    case .text(let row):
      let shown = text(row.id, row.text, true)
      var items = blocks(row.id, shown, streaming: !row.completed).enumerated().map { index, block in
        TranscriptItem(id: "\(row.id)#\(index)", content: .block(block, style: .answer), row: row.id)
      }
      if row.copyable && !shown.isEmpty {
        items.append(TranscriptItem(id: "\(row.id)#copy", content: .copy(text: shown), row: row.id))
      }
      return items
    case .activity(let activity):
      let isOpen = open.contains(activity.id)
      let group = activity.id
      var items = [
        TranscriptItem(
          id: activity.id,
          content: .activity(
            summary: activity.summary, active: activity.active, errors: activity.errors,
            open: isOpen), row: group)
      ]
      guard isOpen else { return items }
      for entry in activity.entries {
        switch entry {
        case .tool(let tool):
          if tool.name == "skill" {
            items.append(
              TranscriptItem(
                id: tool.id,
                content: .skill(
                  name: Self.skillName(tool), status: tool.state.status,
                  error: tool.state.status == .error ? tool.state.error?.message : nil),
                row: group, indent: 1))
          } else {
            items.append(
              TranscriptItem(
                id: tool.id, content: .tool(tool, open: open.contains(tool.id)), row: group, indent: 1))
          }
        case .skill(let skill):
          items.append(
            TranscriptItem(
              id: skill.id,
              content: .skill(name: skill.name.isEmpty ? skill.skill : skill.name, status: .completed, error: nil),
              row: group, indent: 1))
        case .reasoning(let reasoning):
          let isOpen = open.contains(reasoning.id)
          let shown = text(reasoning.id, reasoning.text, isOpen)
          let empty = shown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          items.append(
            TranscriptItem(
              id: reasoning.id, content: .thinking(open: isOpen, empty: empty), row: group, indent: 1))
          if isOpen && !empty {
            let parts = blocks(reasoning.id, shown, streaming: !reasoning.completed)
            items += parts.enumerated().map { index, block in
              let panel: TranscriptItem.Panel =
                parts.count == 1 ? .only : index == 0 ? .first : index == parts.count - 1 ? .last : .middle
              return TranscriptItem(
                id: "\(reasoning.id)#\(index)", content: .block(block, style: .reasoning), row: group,
                indent: 1, panel: panel)
            }
          }
        }
      }
      return items
    }
  }

  /// `SkillTool`: the input's name or id, else the name in the loaded skill's output.
  static func skillName(_ tool: ToolCall) -> String {
    if let name = tool.input("name") ?? tool.input("id"), !name.isEmpty { return name }
    let output = tool.output
    guard let range = output.range(of: #"<skill_content\s+name=["']([^"']+)["']"#, options: .regularExpression)
    else { return "" }
    let match = output[range]
    let quote = match.last ?? "\""
    let body = match.dropLast()
    return body.split(separator: quote).last.map(String.init) ?? ""
  }

  private func items(for message: SessionMessage) -> [TranscriptItem] {
    switch message {
    case .user(let user):
      let files = (user.files ?? []).enumerated().map { index, file in
        Attachment(
          name: file.name ?? "", mime: file.mime ?? "",
          source: file.uri.flatMap { Self.source($0, key: "\(user.id)#\(index)") })
      }
      return [
        TranscriptItem(id: user.id, content: .user(text: user.text, files: files, pending: false), row: user.id)
      ]
    case .shell(let shell):
      return [
        TranscriptItem(id: shell.id, content: .shell(shell, open: open.contains(shell.id)), row: shell.id)
      ]
    case .compaction(let compaction):
      let text =
        switch compaction.status {
        case "running": "Compacting context…"
        case "failed": compaction.reason.map { "Compaction failed: \($0)" } ?? "Compaction failed"
        default: "Context compacted"
        }
      return [TranscriptItem(id: compaction.id, content: .note(text), row: compaction.id)]
    default: return []
    }
  }

  /// An attachment's bytes from a `data:` or web URL.
  static func source(_ uri: String, key: String) -> ImageSource? {
    if uri.hasPrefix("data:"), let comma = uri.firstIndex(of: ",") {
      return .data(key: key, base64: String(uri[uri.index(after: comma)...]))
    }
    if let url = URL(string: uri), url.scheme == "https" || url.scheme == "http" {
      return .request(URLRequest(url: url))
    }
    return nil
  }

  /// Pending inbox items: sent mid-run and not yet in the history.
  func pending(_ inbox: [InboxItem], known: Set<String>) -> [TranscriptItem] {
    inbox.compactMap { item in
      guard item.type == nil || item.type == "user", !known.contains(item.id) else { return nil }
      let text = item.payload?["text"]?.string ?? ""
      // Mentioned files show in the text instead, like `MessageAttachments`.
      let files = (item.payload?["files"]?.array ?? []).enumerated().compactMap { index, file -> Attachment? in
        guard file["mention"] == nil else { return nil }
        let mime = file["mime"]?.string ?? ""
        return Attachment(
          name: file["name"]?.string ?? file["filename"]?.string ?? "", mime: mime,
          source: file["data"]?.string.map { .data(key: "inbox:\(item.id)#\(index)", base64: $0) })
      }
      let id = "inbox:\(item.id)"
      return TranscriptItem(id: id, content: .user(text: text, files: files, pending: true), row: id)
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

/// Vertical space above an item, in desktop pixels (the caller scales them).
///
/// Between rows it is the previous row's `padding-bottom` (`.timeline-row`: 20px, 28px after a
/// prompt, 8px after activity, 12px after a turn header). Inside a row it is the row's own
/// spacing: 16px between Markdown blocks (24px before a heading), 14px before Copy, and an open
/// group's entries stacked with a 4px top margin.
nonisolated func transcriptGap(after previous: TranscriptItem?, _ item: TranscriptItem) -> Double {
  guard let previous, previous.kind != .history else { return 0 }
  if previous.row == item.row {
    switch item.content {
    case .copy: return 14
    case .block(_, .reasoning): return 0
    case .block(let block, .answer):
      return block.kind == .text && block.source.hasPrefix("#") ? 24 : 16
    case .tool, .skill, .thinking:
      if case .activity = previous.content { return 4 }
      return 0
    default: return 0
    }
  }
  switch previous.content {
  case .user: return 28
  case .turn: return 12
  // `.activity-entries` ends with an 8px margin inside the row.
  case .activity: return 8
  case .tool, .skill, .thinking, .block(_, .reasoning): return 16
  default: return 20
  }
}
