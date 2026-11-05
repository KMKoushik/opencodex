import Foundation
import Observation

/// The workspace panel's server state for one project directory: changed files, lazily loaded
/// folders, and file search. Like the desktop, snapshots are refetched (coalesced) on
/// `filesystem.changed` / `vcs.*` events and after the event stream reconnects; open documents
/// follow `revision`.
@Observable
final class WorkspaceModel {
  enum Segment: String, Identifiable {
    case files, changes
    var id: String { rawValue }
  }

  let client: GatewayClient
  let events: EventHub
  let directory: String

  /// Files or Changes; the last one is remembered, like the rail's last panel.
  var segment: Segment {
    didSet { UserDefaults.standard.set(segment.rawValue, forKey: Self.segmentKey) }
  }
  var mode: CompareMode {
    didSet {
      guard mode != oldValue else { return }
      UserDefaults.standard.set(mode.rawValue, forKey: Self.modeKey)
      changes = nil
      changesError = nil
      Task { await loadChanges() }
    }
  }
  /// The filter field's text; `query` is its debounced, trimmed value.
  var search = ""
  private(set) var query = ""

  /// Nil until the first load for the current mode.
  private(set) var changes: [ChangedFile]?
  private(set) var changesError: String?
  private(set) var folders: [String: [WorkspaceEntry]] = [:]
  private(set) var folderError: (path: String, message: String)?
  private(set) var expanded: Set<String> = []
  private(set) var collapsedChanges: Set<String> = []
  private(set) var found: [WorkspaceEntry]?
  private(set) var findError: String?
  /// The document last opened, highlighted in the tree.
  var selected: String?
  /// Bumped by each coalesced refresh, so open documents refetch too.
  private(set) var revision = 0

  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var refreshTask: Task<Void, Never>?

  private static let segmentKey = "workspace.view"
  private static let modeKey = "workspace.mode"

  init(client: GatewayClient, events: EventHub, directory: String) {
    self.client = client
    self.events = events
    self.directory = directory
    segment = Segment(rawValue: UserDefaults.standard.string(forKey: Self.segmentKey) ?? "") ?? .changes
    mode = CompareMode(rawValue: UserDefaults.standard.string(forKey: Self.modeKey) ?? "") ?? .working
  }

  // MARK: Derived

  var statuses: [String: ChangeStatus] {
    Dictionary((changes ?? []).map { ($0.file, $0.status) }, uniquingKeysWith: { a, _ in a })
  }

  var totals: (additions: Int, deletions: Int) {
    (changes ?? []).reduce((0, 0)) { ($0.0 + $1.additions, $0.1 + $1.deletions) }
  }

  /// The visible rows for the current segment and filter.
  func rows() -> [TreeRow] {
    let statuses = statuses
    switch segment {
    case .changes:
      let needle = search.trimmingCharacters(in: .whitespaces)
      let paths = (changes ?? []).map(\.file).filter {
        needle.isEmpty || $0.localizedCaseInsensitiveContains(needle)
      }
      return WorkspaceTree.rows(
        paths: paths, statuses: statuses, collapsed: collapsedChanges, flatten: true)
    case .files:
      if !query.isEmpty {
        return WorkspaceTree.rows(
          paths: (found ?? []).filter { !$0.isFolder }.map(\.trimmed), statuses: statuses,
          flatten: false)
      }
      return WorkspaceTree.rows(
        folders: folders, expanded: expanded, statuses: statuses,
        changedFolders: WorkspaceTree.ancestors(of: statuses.keys))
    }
  }

  // MARK: Lifecycle

  /// Loads and listens until cancelled; call from the screen's `.task`.
  func run() async {
    subscriptions = [
      events.subscribe { [weak self] event in self?.handle(event) },
      events.onReconnect { [weak self] in self?.scheduleRefresh() },
    ]
    defer {
      subscriptions = []
      refreshTask?.cancel()
      refreshTask = nil
    }
    async let changes: Void = loadChanges()
    async let root: Void = loadFolder("")
    _ = await (changes, root)
    // While the event stream is down, poll like the desktop's 15-second refetch.
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(15))
      if !events.live { await refresh() }
    }
  }

  func loadChanges() async {
    let mode = mode
    do {
      let list = try await client.workspaceChanges(directory: directory, mode: mode)
      guard mode == self.mode else { return }
      if list != changes { changes = list }
      changesError = nil
    } catch is CancellationError {
    } catch {
      guard mode == self.mode else { return }
      changesError = error.localizedDescription
    }
  }

  func loadFolder(_ path: String) async {
    do {
      let entries = try await client.workspaceFiles(directory: directory, path: path)
      if folders[path] != entries { folders[path] = entries }
      if folderError?.path == path { folderError = nil }
    } catch is CancellationError {
    } catch {
      folderError = (path, error.localizedDescription)
    }
  }

  /// Runs the bounded native find for the debounced filter text (Files only).
  func applySearch() async {
    let text = search.trimmingCharacters(in: .whitespaces)
    query = text
    guard segment == .files, !text.isEmpty else {
      found = nil
      findError = nil
      return
    }
    do {
      let results = try await client.workspaceFiles(directory: directory, query: text)
      guard text == query else { return }
      found = results
      findError = nil
    } catch is CancellationError {
    } catch {
      findError = error.localizedDescription
    }
  }

  // MARK: Tree actions

  func toggle(_ row: TreeRow) {
    if segment == .changes || !query.isEmpty {
      if collapsedChanges.contains(row.path) {
        collapsedChanges.remove(row.path)
      } else {
        collapsedChanges.insert(row.path)
      }
      return
    }
    if expanded.contains(row.path) {
      expanded.remove(row.path)
    } else {
      expanded.insert(row.path)
      if folders[row.path] == nil { Task { await loadFolder(row.path) } }
    }
  }

  /// The desktop's "Collapse folders" (−).
  func collapseAll() {
    if segment == .changes || !query.isEmpty {
      collapsedChanges = Set(rows().filter(\.folder).map(\.path))
    } else {
      expanded = []
    }
  }

  /// The desktop's "Refresh workspace": everything loaded, and open documents.
  func refresh() async {
    revision += 1
    async let changes: Void = loadChanges()
    async let folders: Void = refreshFolders()
    async let search: Void = refreshSearch()
    _ = await (changes, folders, search)
  }

  private func refreshFolders() async {
    // Only folders on screen; collapsed ones reload when they're opened again.
    let visible = folders.keys.filter { $0.isEmpty || isVisible($0) }
    for key in folders.keys where !visible.contains(key) { folders[key] = nil }
    // One at a time on the main actor: only expanded folders reload, and each is one request.
    for path in visible { await loadFolder(path) }
  }

  private func refreshSearch() async {
    guard !query.isEmpty, segment == .files else { return }
    await applySearch()
  }

  private func isVisible(_ folder: String) -> Bool {
    var current = Substring(folder)
    while true {
      guard expanded.contains(String(current)) else { return false }
      guard let slash = current.lastIndex(of: "/") else { return true }
      current = current[..<slash]
    }
  }

  // MARK: Events

  private func handle(_ event: GatewayEvent) {
    if event.type == "filesystem.changed" {
      // OpenCode reports absolute paths; skip other projects' changes.
      if let file = event.data?["file"]?.string, file.hasPrefix("/"),
        !file.hasPrefix(directory.hasSuffix("/") ? directory : directory + "/")
      {
        return
      }
      scheduleRefresh()
    } else if event.type.hasPrefix("vcs.") {
      scheduleRefresh()
    } else if event.type == "session.step.ended", event.data?["files"]?.array?.isEmpty == false {
      // OpenCode's own list of files an agent step changed: edits show even when the
      // service runs without a file watcher (and so sends no `filesystem.changed`).
      scheduleRefresh()
    }
  }

  /// Coalesces bursts of file events into one refresh, like the desktop's 500 ms window.
  private func scheduleRefresh() {
    guard refreshTask == nil else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(500))
      guard let self, !Task.isCancelled else { return }
      self.refreshTask = nil
      await self.refresh()
    }
  }
}
