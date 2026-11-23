import Foundation
import Observation

/// One `@` menu entry.
nonisolated struct MentionOption: Identifiable, Hashable, Sendable {
  enum Kind: Sendable {
    case skill, file, canvas, chat

    var icon: String {
      switch self {
      case .skill: "square.stack.3d.up"
      case .file: "doc"
      case .canvas: "square.grid.2x2"
      case .chat: "bubble.left.and.bubble.right"
      }
    }
  }
  var id: String
  var label: String
  var detail: String?
  var kind: Kind
  var mention: DraftMention
}

nonisolated struct FileEntry: Decodable, Sendable {
  var path: String
  var type: String?
}

/// A canvas in `/api/canvases`, newest first; the `@` menu needs only its name.
nonisolated struct CanvasListItem: Decodable, Sendable {
  var id: String
  var title: String
  var sessionID: String?
}

nonisolated extension GatewayClient {
  func canvases() async throws -> [CanvasListItem] { try await get("/canvases") }

  /// Native `file.find` under the project, as the desktop's file tree and `@` menu use it.
  func findFiles(directory: String, query: String) async throws -> [FileEntry] {
    try await get("/workspace/files", ["directory": directory, "query": query])
  }
}

/// Skills and files of this chat's project, canvases, and recent chats across projects, for
/// the `@` menu. Port of the desktop `mention-options.ts`: skills and chats filter locally on every
/// key; only file search goes to OpenCode, debounced by 80 ms. Nothing loads until `@` is typed.
@Observable
final class MentionSearch {
  private(set) var skills: [SkillInfo]?
  private(set) var chats: [SessionSummary]?
  private(set) var canvases: [CanvasListItem]?
  private(set) var files: [FileEntry] = []
  private(set) var fileQuery = ""
  private(set) var searchingFiles = false
  private(set) var failed = false

  @ObservationIgnored private var fileTask: Task<Void, Never>?
  @ObservationIgnored private var listsTask: Task<Void, Never>?
  @ObservationIgnored private var listsFetched: Date?

  var loading: Bool {
    (skills == nil || chats == nil || canvases == nil) && listsTask != nil || searchingFiles
  }

  /// Call when the `@` query changes; nil closes the menu.
  func update(_ client: GatewayClient, directory: String?, query: String?) {
    guard let query else {
      fileTask?.cancel()
      return
    }
    loadLists(client, directory: directory)
    let trimmed = query.trimmingCharacters(in: .whitespaces)
    fileTask?.cancel()
    guard let directory, !trimmed.isEmpty else {
      fileQuery = ""
      searchingFiles = false
      return
    }
    fileTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(80))
      guard !Task.isCancelled, let self else { return }
      self.searchingFiles = true
      do {
        let found = try await client.findFiles(directory: directory, query: trimmed)
        guard !Task.isCancelled else { return }
        self.files = found
        self.fileQuery = trimmed
      } catch is CancellationError {
      } catch {
        if !Task.isCancelled { self.failed = true }
      }
      if !Task.isCancelled { self.searchingFiles = false }
    }
  }

  func retry(_ client: GatewayClient, directory: String?, query: String?) {
    failed = false
    listsFetched = nil
    listsTask = nil
    update(client, directory: directory, query: query)
  }

  private func loadLists(_ client: GatewayClient, directory: String?) {
    if listsTask != nil { return }
    if let listsFetched, Date().timeIntervalSince(listsFetched) < 30 { return }
    listsTask = Task { [weak self] in
      async let skills: [SkillInfo]? =
        directory == nil ? [] : try? await client.skills(directory: directory!)
      async let chats = try? await client.searchSessions("").sessions
      async let canvases = try? await client.canvases()
      let (foundSkills, foundChats, foundCanvases) = await (skills, chats, canvases)
      guard let self else { return }
      self.skills = foundSkills ?? self.skills
      self.chats = foundChats ?? self.chats
      self.canvases = foundCanvases ?? self.canvases
      if foundSkills == nil || foundChats == nil || foundCanvases == nil { self.failed = true }
      self.listsFetched = Date()
      self.listsTask = nil
    }
  }

  /// The menu for a query: up to 5 skills, 4 canvases, 6 files, then 5 recent chats.
  func options(query: String, sessionID: String?) -> [MentionOption] {
    Self.options(
      query: query, skills: skills ?? [], files: fileQuery.isEmpty ? [] : files,
      chats: chats ?? [], canvases: canvases ?? [], sessionID: sessionID)
  }

  nonisolated static func options(
    query: String, skills: [SkillInfo], files: [FileEntry], chats: [SessionSummary],
    canvases: [CanvasListItem] = [], sessionID: String?
  ) -> [MentionOption] {
    let search = query.lowercased()
    // Descriptions are long prose; matching them would crowd out files and chats.
    let ranked = skills.compactMap { skill -> (SkillInfo, Int)? in
      let name = skill.name.lowercased()
      if search.isEmpty || name.hasPrefix(search) { return (skill, 0) }
      if name.contains(search) || skill.id.lowercased().contains(search) { return (skill, 1) }
      return nil
    }
    .enumerated()
    .sorted { ($0.element.1, $0.offset) < ($1.element.1, $1.offset) }
    .prefix(5)
    .map { _, item in
      MentionOption(
        id: "skill:\(item.0.id)", label: item.0.name, detail: item.0.description, kind: .skill,
        mention: .skill(id: item.0.id, token: "@\(item.0.name)"))
    }
    let found = files.prefix(6).map { entry in
      let slash = entry.path.lastIndex(of: "/")
      return MentionOption(
        id: "file:\(entry.path)",
        label: slash.map { String(entry.path[entry.path.index(after: $0)...]) } ?? entry.path,
        detail: slash.flatMap { $0 > entry.path.startIndex ? String(entry.path[..<$0]) : nil },
        kind: .file, mention: .file(path: entry.path, token: "@\(entry.path)"))
    }
    let recent = chats
      .filter { $0.id != sessionID && (search.isEmpty || $0.title.lowercased().contains(search)) }
      .prefix(5)
      .map { chat in
        MentionOption(
          id: "chat:\(chat.id)", label: chat.title,
          detail: (chat.directory as NSString).lastPathComponent, kind: .chat,
          mention: .chat(id: chat.id, token: "@\(chat.title)"))
      }
    // Few and named, so they come before the fuzzy file matches.
    let boards = canvases
      .filter { search.isEmpty || $0.title.lowercased().contains(search) }
      .prefix(4)
      .map { canvas in
        MentionOption(
          id: "canvas:\(canvas.id)", label: canvas.title,
          detail: canvas.sessionID == sessionID ? "Canvas · this chat" : "Canvas", kind: .canvas,
          mention: .canvas(id: canvas.id, token: "@\(canvas.title)"))
      }
    return ranked + boards + found + recent
  }
}
