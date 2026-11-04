import Foundation
import Observation

/// One thread row as the list draws it: a small value, so unchanged rows skip re-rendering.
nonisolated struct ThreadItem: Hashable, Identifiable, Sendable {
  nonisolated enum Status: Hashable, Sendable {
    case permission, question, running, unread
  }
  var id: String
  var title: String
  var project: String
  var excerpt: String?
  /// When it last ran (the last idle transition), or its last update while running.
  var activity: Millis
  var status: Status?
  var pinned: Bool
  var done: Bool
}

/// The threads home screen's snapshots: loaded pages, running IDs, pending requests, and
/// projects. Refreshes are coalesced; token-level events never trigger one.
@Observable
final class HomeModel {
  enum Phase: Equatable {
    case loading
    case loaded
    case failed(String)
  }

  let client: GatewayClient

  private(set) var phase = Phase.loading
  private(set) var pinned: [ThreadItem] = []
  private(set) var threads: [ThreadItem] = []
  private(set) var hasMore = false
  private(set) var loadingMore = false
  private(set) var moreError: String?
  /// A refresh failed while older snapshots stay on screen.
  private(set) var refreshError: String?
  private(set) var searchNotice: String?
  private(set) var projects: [HomeProject] = []
  /// A thread just marked done, offered for undo for a few seconds.
  private(set) var undoDone: ThreadItem?
  /// A failed swipe action, shown as an alert.
  var actionError: String?

  /// The search field's text; `applySearch` runs it after a debounce.
  var searchText = ""
  /// The canonical directory of the chosen project, or nil for all projects.
  private(set) var filter: String?

  /// Loaded pages; the footer reloads by this, since a page can be all done threads.
  private(set) var pageCount = 0
  @ObservationIgnored private var pages: [[SessionSummary]] = [] {
    didSet { if pages.count != pageCount { pageCount = pages.count } }
  }
  @ObservationIgnored private var cursor: String?
  @ObservationIgnored private var query = ""
  @ObservationIgnored private var running: Set<String> = []
  @ObservationIgnored private var attention: SessionAttention = [:]
  @ObservationIgnored private var pending: [String: FocusMarkers] = [:]
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var refreshTask: Task<Void, Never>?
  @ObservationIgnored private var refreshID: UUID?
  @ObservationIgnored private var refreshDirty = false
  @ObservationIgnored private var undoTask: Task<Void, Never>?
  @ObservationIgnored private var names: [String: String] = [:]
  @ObservationIgnored private var subscriptions: [Subscription] = []
  /// Pinned threads beyond the loaded pages, fetched by ID from the pin index.
  @ObservationIgnored private var extraPins: [String: SessionSummary] = [:]
  /// Extra pins an event touched since they were fetched.
  @ObservationIgnored private var staleExtras: Set<String> = []
  @ObservationIgnored private lazy var pinIndex = PinIndex(gateway: client.base)

  /// The gateway's page size; a shorter page is the last one.
  private static let pageSize = 50

  init(client: GatewayClient) {
    self.client = client
  }

  var searching: Bool { !query.isEmpty }
  var filterName: String? {
    filter.map { dir in projects.first { $0.canonical == dir }?.displayName ?? folderName(dir) }
  }

  // MARK: Live updates

  /// Subscribes while the screen is visible; returning from a chat refreshes what it missed.
  func appear(events: EventHub) {
    guard subscriptions.isEmpty else { return }
    subscriptions = [
      events.subscribe { [weak self] event in self?.handle(event) },
      events.onReconnect { [weak self] in Task { await self?.reload() } },
    ]
    if phase != .loading { scheduleRefresh(after: .zero) }
  }

  func disappear() {
    subscriptions = []
  }

  private func handle(_ event: GatewayEvent) {
    let type = event.type
    if let id = event.sessionID, extraPins[id] != nil { staleExtras.insert(id) }
    if type == "session.deleted", let id = event.sessionID {
      pages = pages.map { $0.filter { $0.id != id } }
      rebuild()
    }
    if type.hasPrefix("project.") {
      Task { await loadProjects() }
      return
    }
    if Self.listEvents.contains(type) || type.hasPrefix("session.execution.")
      || type.hasPrefix("permission.") || type.hasPrefix("form.")
    {
      scheduleRefresh()
    }
  }

  /// Session events that change a row. Text, reasoning, tool, step, and usage events don't.
  private static let listEvents: Set<String> = [
    "session.created", "session.updated", "session.renamed", "session.deleted",
    "session.viewed", "session.metadata.updated", "session.moved",
  ]

  /// One refresh of the first page, running threads, and requests for a burst of events.
  /// Events during a refresh queue one more after it, so refreshes never overlap.
  func scheduleRefresh(after delay: Duration = .milliseconds(400)) {
    guard refreshTask == nil else {
      refreshDirty = true
      return
    }
    let id = UUID()
    refreshID = id
    refreshTask = Task { [weak self] in
      var delay = delay
      repeat {
        try? await Task.sleep(for: delay)
        guard let self, !Task.isCancelled else { return }
        self.refreshDirty = false
        await self.refresh()
        delay = .milliseconds(400)
      } while self?.refreshDirty == true && !Task.isCancelled
      if self?.refreshID == id { self?.refreshTask = nil }
    }
  }

  // MARK: Loading

  /// Everything, from scratch: projects and the first page of the current list.
  func reload() async {
    async let projects: Void = loadProjects()
    await refresh(replacing: true)
    await projects
  }

  /// The first page (keeping older loaded pages), running threads, and pending requests.
  func refresh(replacing: Bool = false) async {
    let generation = generation
    let query = query
    let filter = filter
    do {
      async let active = client.active()
      let page = try await firstPage(query: query, filter: filter)
      let running = try await active
      guard generation == self.generation else { return }
      if replacing || pages.isEmpty {
        pages = [page.sessions]
        cursor = page.nextCursor
        hasMore = Self.more(page)
      } else {
        let ids = Set(page.sessions.map(\.id))
        pages = [page.sessions] + pages.dropFirst().map { $0.filter { !ids.contains($0.id) } }
        if pages.count == 1 {
          cursor = page.nextCursor
          hasMore = Self.more(page)
        }
      }
      searchNotice = page.searchNotice
      self.running = Set(running.keys)
      phase = .loaded
      refreshError = nil
      if replacing { staleExtras.formUnion(extraPins.keys) }
      rebuild()
      await loadExtraPins(generation: generation)
      await loadAttention(generation: generation)
    } catch {
      guard generation == self.generation, !Self.cancelled(error) else { return }
      if pages.isEmpty {
        phase = .failed(error.localizedDescription)
      } else {
        refreshError = error.localizedDescription
      }
    }
  }

  private func firstPage(query: String, filter: String?) async throws -> SessionPage {
    if let filter, query.isEmpty { return try await client.sessions(directory: filter) }
    return try await client.searchSessions(query)
  }

  /// A view's task ended (it scrolled away or the screen closed); not a failure to show.
  private static func cancelled(_ error: Error) -> Bool {
    error is CancellationError || (error as? URLError)?.code == .cancelled
  }

  private static func more(_ page: SessionPage) -> Bool {
    // Native cursors mark an anchor even on the last page.
    page.nextCursor != nil && page.sessions.count >= pageSize
  }

  func loadMore() async {
    guard hasMore, !loadingMore, let cursor else { return }
    let generation = generation
    loadingMore = true
    defer { if generation == self.generation { loadingMore = false } }
    do {
      let page: SessionPage
      if let filter, query.isEmpty {
        page = try await client.sessions(directory: filter, cursor: cursor)
      } else {
        page = try await client.searchSessions(query, cursor: cursor)
      }
      guard generation == self.generation else { return }
      let loaded = Set(pages.joined().map(\.id))
      pages.append(page.sessions.filter { !loaded.contains($0.id) })
      self.cursor = page.nextCursor
      hasMore = Self.more(page)
      moreError = nil
      rebuild()
      await loadAttention(generation: generation)
    } catch {
      guard generation == self.generation, !Self.cancelled(error) else { return }
      moreError = error.localizedDescription
    }
  }

  /// Native lists can't filter by metadata, so pins older than the loaded pages are read by
  /// ID, like the desktop's pinned index. Metadata stays authoritative.
  private func loadExtraPins(generation: Int) async {
    guard !searching else { return }
    let loaded = Set(pages.joined().map(\.id))
    for id in extraPins.keys where loaded.contains(id) { extraPins[id] = nil }
    let wanted = pinIndex.ids.filter {
      !loaded.contains($0) && (extraPins[$0] == nil || staleExtras.contains($0))
    }
    staleExtras = []
    guard !wanted.isEmpty else { return }
    let client = client
    let results = await withTaskGroup(of: (String, SessionInfo?, Bool).self) { group in
      for id in wanted {
        group.addTask {
          do {
            return (id, try await client.session(id), false)
          } catch let error as GatewayError where error.status == 404 {
            return (id, nil, true)
          } catch {
            return (id, nil, false)
          }
        }
      }
      var results: [(String, SessionInfo?, Bool)] = []
      for await result in group { results.append(result) }
      return results
    }
    guard generation == self.generation else { return }
    for (id, info, missing) in results {
      if let info, info.parentID == nil, let summary = Self.summary(info), summary.pinned != nil {
        extraPins[id] = summary
      } else if info != nil || missing {
        extraPins[id] = nil
        pinIndex.remember(id, pinned: false)
      }
    }
    rebuild()
  }

  /// A thread row from a native `session.get`, as the gateway's lists build it.
  private static func summary(_ info: SessionInfo) -> SessionSummary? {
    func marker(_ key: String) -> Double? {
      guard let value = info.metadata?[key]?.number, value > 0 else { return nil }
      return value
    }
    return SessionSummary(
      id: info.id,
      title: info.title ?? "",
      directory: info.location.directory,
      projectID: info.projectID,
      updatedAt: info.time.updated ?? info.time.created,
      time: .init(created: info.time.created, idle: info.time.idle, viewed: info.time.viewed),
      unread: info.metadata?["opencodexUnread"]?.string.flatMap { $0.isEmpty ? nil : $0 },
      pinned: marker("opencodexPinned"),
      done: marker("opencodexDone"))
  }

  private func loadAttention(generation: Int) async {
    var seen = Set<String>()
    let directories = (pages.joined().map(\.directory) + extraPins.values.map(\.directory))
      .filter { seen.insert($0).inserted }
    guard !directories.isEmpty else {
      attention = [:]
      return
    }
    // Requests are an overlay; a failure keeps the last snapshot rather than hiding the list.
    guard let result = try? await client.attention(directories: Array(directories.prefix(32))),
      generation == self.generation
    else { return }
    if result != attention {
      attention = result
      rebuild()
    }
  }

  func loadProjects() async {
    guard let list = try? await client.homeProjects() else { return }
    // Historical project identities can share a folder; keep one row per folder.
    var byFolder: [String: HomeProject] = [:]
    for project in list where project.canonical != "/" {
      if let existing = byFolder[project.canonical], existing.activeAt >= project.activeAt {
        continue
      }
      byFolder[project.canonical] = project
    }
    var names: [String: String] = [:]
    // OpenCode's catch-all `global` project spans unrelated folders; name those by folder.
    for project in list where project.id != "global" { names[project.id] = project.displayName }
    for project in byFolder.values { names[project.canonical] = project.displayName }
    projects = byFolder.values.sorted {
      $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending
    }
    if names != self.names {
      self.names = names
      rebuild()
    }
  }

  // MARK: Search and filter

  /// Runs the debounced search text, if it changed.
  func applySearch() async {
    let text = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard text != query else { return }
    query = text
    await restart()
  }

  func setFilter(_ directory: String?) async {
    guard directory != filter else { return }
    filter = directory
    await restart()
  }

  private func restart() async {
    generation += 1
    refreshTask?.cancel()
    refreshTask = nil
    refreshID = nil
    refreshDirty = false
    pages = []
    cursor = nil
    hasMore = false
    moreError = nil
    loadingMore = false
    searchNotice = nil
    phase = .loading
    rebuild()
    await refresh(replacing: true)
  }

  // MARK: Pin and done

  func perform(_ action: FocusAction, on item: ThreadItem) {
    guard
      let session = pages.joined().first(where: { $0.id == item.id }) ?? extraPins[item.id]
    else { return }
    var markers = FocusMarkers(pinned: session.pinned, done: session.done)
    switch action {
    case .pin:
      markers = FocusMarkers(pinned: Date.now.timeIntervalSince1970 * 1000, done: nil)
    case .unpin: markers.pinned = nil
    case .done: markers = FocusMarkers(pinned: nil, done: Self.activity(session))
    case .undone: markers.done = nil
    }
    pending[item.id] = markers
    rebuild()
    if action == .done { offerUndo(item) }
    Task {
      do {
        let result = try await client.focus(item.id, action)
        patch(item.id, result)
      } catch {
        if undoDone?.id == item.id { undoDone = nil }
        actionError = error.localizedDescription
      }
      pending[item.id] = nil
      rebuild()
    }
  }

  func undo() {
    guard let item = undoDone else { return }
    undoDone = nil
    perform(.undone, on: item)
  }

  private func offerUndo(_ item: ThreadItem) {
    undoDone = item
    undoTask?.cancel()
    undoTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(6))
      guard !Task.isCancelled, self?.undoDone?.id == item.id else { return }
      self?.undoDone = nil
    }
  }

  private func patch(_ id: String, _ markers: FocusMarkers) {
    if var extra = extraPins[id] {
      extra.pinned = markers.pinned
      extra.done = markers.done
      extraPins[id] = extra
    }
    pages = pages.map { page in
      page.map { session in
        guard session.id == id else { return session }
        var session = session
        session.pinned = markers.pinned
        session.done = markers.done
        return session
      }
    }
  }

  // MARK: Derivation

  /// When the last run ended. Unlike `updatedAt`, metadata writes such as pins never move it.
  private static func activity(_ session: SessionSummary) -> Millis {
    session.time.idle ?? session.time.created
  }

  private func rebuild() {
    var seen = Set<String>()
    var pinned: [(ThreadItem, Double)] = []
    var threads: [ThreadItem] = []
    let extras = searching ? [] : Array(extraPins.values)
    for var session in pages.joined() + extras {
      guard seen.insert(session.id).inserted else { continue }
      if let markers = pending[session.id] {
        session.pinned = markers.pinned
        session.done = markers.done
      }
      // Metadata is authoritative: remember pins seen, forget threads shown unpinned.
      pinIndex.remember(session.id, pinned: session.pinned != nil)
      if let filter, searching || extraPins[session.id] != nil, session.directory != filter {
        continue
      }
      let status = status(session)
      let isRunning = running.contains(session.id)
      // Marked done with nothing newer; runs and pending requests still surface it.
      let settled =
        (session.done.map { Self.activity(session) <= $0 } ?? false)
        && (status == nil || status == .unread)
      let item = ThreadItem(
        id: session.id,
        title: session.title.isEmpty ? "Untitled chat" : session.title,
        project: names[session.directory] ?? names[session.projectID ?? ""]
          ?? folderName(session.directory),
        excerpt: session.match?.excerpt,
        activity: isRunning ? session.updatedAt : Self.activity(session),
        status: status,
        pinned: session.pinned != nil,
        done: settled)
      if searching {
        threads.append(item)
      } else if let order = session.pinned {
        pinned.append((item, order))
      } else if !settled {
        threads.append(item)
      }
    }
    if !searching { threads.sort { $0.activity > $1.activity } }
    let sortedPins = pinned.sorted { $0.1 > $1.1 }.map(\.0)
    if sortedPins != self.pinned { self.pinned = sortedPins }
    if threads != self.threads { self.threads = threads }
  }

  private func status(_ session: SessionSummary) -> ThreadItem.Status? {
    switch attention[session.id] {
    case "permission": return .permission
    case "question": return .question
    default: break
    }
    if running.contains(session.id) { return .running }
    return session.hasUnreadReply ? .unread : nil
  }
}

/// The last component of a folder path, for threads whose project isn't in the catalog.
nonisolated func folderName(_ path: String) -> String { (path as NSString).lastPathComponent }

/// Pinned thread IDs this phone has seen, per gateway, so old pins can be read by ID.
/// Bounded like the desktop's `pinnedThreads` preference.
private struct PinIndex {
  private static let limit = 50
  private let key: String
  private(set) var ids: [String]

  init(gateway: URL) {
    key = "pinnedThreads:\(gateway.absoluteString)"
    ids = UserDefaults.standard.stringArray(forKey: key) ?? []
  }

  func contains(_ id: String) -> Bool { ids.contains(id) }

  mutating func remember(_ id: String, pinned: Bool) {
    guard ids.contains(id) != pinned else { return }
    ids = pinned ? Array(([id] + ids).prefix(Self.limit)) : ids.filter { $0 != id }
    UserDefaults.standard.set(ids, forKey: key)
  }
}
