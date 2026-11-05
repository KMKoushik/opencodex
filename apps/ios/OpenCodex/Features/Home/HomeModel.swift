import Foundation
import Observation

/// The threads screen's snapshots, shaped like the desktop sidebar: pinned threads, then either
/// the Projects groups or the Focus list (`threads-view.tsx`, `focus.ts`).
///
/// Every loaded thread lives once in `sessions`; the Focus feed and each project's feed hold
/// IDs. A burst of events triggers one refresh that reads the newest page across all projects
/// (native order is newest update first, and every change bumps the update time), merges it
/// into every feed, and re-derives the rows. Token-level events never trigger one.
@Observable
final class HomeModel {
  enum Mode: String {
    case projects, focus
  }

  enum Phase: Equatable {
    case loading
    case loaded
    case failed(String)
  }

  /// One project in the Projects view.
  struct Group: Identifiable, Equatable {
    var canonical: String
    var badge: ProjectBadge
    var expanded: Bool
    /// The visible rows: newest first, unpinned, at most the shown count.
    var items: [ThreadItem]
    var canShowMore: Bool
    var loadingMore: Bool
    var error: String?
    var id: String { canonical }
  }

  /// A project option in a filter menu.
  struct ProjectOption: Identifiable, Equatable {
    var directory: String
    var name: String
    var shown: Bool
    var id: String { directory }
  }

  /// `ACTIVE_WINDOW`: threads active in the last three days rank in Focus.
  nonisolated static let activeWindow: Millis = 3 * 24 * 60 * 60_000
  private static let maxActivePages = 4
  static let inactiveStep = 10
  static let groupStep = 4

  let client: GatewayClient

  var mode: Mode {
    didSet {
      guard mode != oldValue else { return }
      UserDefaults.standard.set(mode.rawValue, forKey: "threadView")
      if mode == .focus { Task { await fillFocus() } }
    }
  }
  private(set) var phase = Phase.loading
  /// A refresh failed while older snapshots stay on screen.
  private(set) var refreshError: String?
  private(set) var pinned: [ThreadItem] = []
  private(set) var groups: [Group] = []
  private(set) var focusActive: [ThreadItem] = []
  private(set) var focusInactive: [ThreadItem] = []
  private(set) var focusHasMore = false
  private(set) var focusLoadingMore = false
  private(set) var focusError: String?
  /// The gateway's projects, one per folder, newest activity first.
  private(set) var projects: [ThreadProject] = []
  /// Projects hidden from the Projects view on this phone.
  private(set) var hidden: Set<String>
  /// Projects hidden from Focus; their approvals and questions still show.
  private(set) var excluded: Set<String>
  private(set) var collapsed: Set<String>
  /// The Inactive section, collapsed by default like the desktop's.
  var inactiveOpen = false
  var inactiveVisible = HomeModel.inactiveStep
  /// A thread just marked done, offered for undo for a few seconds.
  private(set) var undoDone: ThreadItem?
  var actionError: String?

  @ObservationIgnored private var sessions: [String: ThreadSession] = [:]
  @ObservationIgnored private var focusIDs: Set<String> = []
  @ObservationIgnored private var focusCursor: String?
  @ObservationIgnored private var focusPages = 0
  @ObservationIgnored private var feeds: [String: Feed] = [:]
  @ObservationIgnored private var running: Set<String> = []
  @ObservationIgnored private var attention: SessionAttention = [:]
  @ObservationIgnored private var pending: [String: FocusMarkers] = [:]
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var refreshTask: Task<Void, Never>?
  @ObservationIgnored private var refreshID: UUID?
  @ObservationIgnored private var refreshDirty = false
  @ObservationIgnored private var undoTask: Task<Void, Never>?
  @ObservationIgnored private var tickTask: Task<Void, Never>?
  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var pinIndex: PinIndex
  @ObservationIgnored private let keys: Keys

  /// One project's loaded threads, like the desktop's per-folder `useSessions`.
  private struct Feed {
    var ids: Set<String> = []
    var cursor: String?
    var hasMore = false
    var loadingMore = false
    var error: String?
    var visible = HomeModel.groupStep
  }

  /// Preferences are per gateway, as the desktop's local storage is per origin.
  private struct Keys {
    let hidden: String
    let excluded: String
    let collapsed: String
    init(_ base: URL) {
      hidden = "hiddenProjects:\(base.absoluteString)"
      excluded = "focusExcluded:\(base.absoluteString)"
      collapsed = "collapsedProjects:\(base.absoluteString)"
    }
  }

  init(client: GatewayClient) {
    self.client = client
    let defaults = UserDefaults.standard
    let keys = Keys(client.base)
    self.keys = keys
    mode = defaults.string(forKey: "threadView") == Mode.focus.rawValue ? .focus : .projects
    hidden = Set(defaults.stringArray(forKey: keys.hidden) ?? [])
    excluded = Set(defaults.stringArray(forKey: keys.excluded) ?? [])
    collapsed = Set(defaults.stringArray(forKey: keys.collapsed) ?? [])
    pinIndex = PinIndex(gateway: client.base)
  }

  // MARK: Live updates

  /// Subscribes while the screen is visible; returning from a chat refreshes what it missed.
  func appear(events: EventHub) {
    guard subscriptions.isEmpty else { return }
    subscriptions = [
      events.subscribe { [weak self] event in self?.handle(event) },
      events.onReconnect { [weak self] in Task { await self?.reload() } },
    ]
    // One tick a minute moves threads out of Focus's active window; rows hold no timers.
    tickTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(60))
        self?.rebuild()
      }
    }
    if phase != .loading { scheduleRefresh(after: .zero) }
  }

  func disappear() {
    subscriptions = []
    tickTask?.cancel()
    tickTask = nil
  }

  private func handle(_ event: GatewayEvent) {
    let type = event.type
    if type == "session.deleted", let id = event.sessionID {
      remove(id)
      rebuild()
      return
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

  /// One refresh for a burst of events. Events during a refresh queue one more after it, so
  /// refreshes never overlap.
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

  /// Everything from scratch: projects, the newest threads, every shown project's first page,
  /// and pins older than all of them.
  func reload() async {
    generation += 1
    let generation = generation
    do {
      async let catalog = client.threadProjects()
      async let active = client.active()
      let page = try await client.threadSearch()
      let projects = Self.folders(try await catalog)
      let running = Set(try await active.keys)
      let shown = projects.map(\.canonical).filter { !hidden.contains($0) }
      let pages = await fetchFirstPages(shown)
      guard generation == self.generation else { return }

      var sessions: [String: ThreadSession] = [:]
      var feeds: [String: Feed] = [:]
      for session in page.sessions { sessions[session.id] = session }
      for (directory, result) in pages {
        var feed = Feed(visible: self.feeds[directory]?.visible ?? Self.groupStep)
        switch result {
        case .success(let page):
          for session in page.sessions { sessions[session.id] = session }
          feed.ids = Set(page.sessions.map(\.id))
          feed.cursor = page.nextCursor
          feed.hasMore = page.hasMore
        case .failure(let error):
          feed.error = error.localizedDescription
        }
        feeds[directory] = feed
      }
      self.projects = projects
      self.sessions = sessions
      self.feeds = feeds
      self.running = running
      focusIDs = Set(page.sessions.map(\.id))
      focusCursor = page.nextCursor
      focusHasMore = page.hasMore
      focusPages = 1
      focusError = nil
      phase = .loaded
      refreshError = nil
      rebuild()
      await loadExtraPins(generation: generation)
      await loadAttention(generation: generation)
      await fillFocus()
    } catch {
      guard generation == self.generation, !Self.cancelled(error) else { return }
      if phase == .loaded {
        refreshError = error.localizedDescription
      } else {
        phase = .failed(error.localizedDescription)
      }
    }
  }

  /// The newest threads across projects and the running set, merged into every feed.
  func refresh() async {
    guard phase == .loaded else {
      await reload()
      return
    }
    let generation = generation
    do {
      async let active = client.active()
      let page = try await client.threadSearch()
      let running = Set(try await active.keys)
      guard generation == self.generation else { return }
      self.running = running
      var newFolders: [String] = []
      for session in page.sessions {
        sessions[session.id] = session
        focusIDs.insert(session.id)
        if feeds[session.directory] != nil {
          feeds[session.directory]?.ids.insert(session.id)
        } else if !hidden.contains(session.directory),
          projects.contains(where: { $0.canonical == session.directory })
        {
          // A project's first thread: list it now.
          feeds[session.directory] = Feed(ids: [session.id])
          newFolders.append(session.directory)
        }
      }
      refreshError = nil
      rebuild()
      for folder in Set(newFolders) { await loadFeed(folder, more: false) }
      await loadAttention(generation: generation)
    } catch {
      guard generation == self.generation, !Self.cancelled(error) else { return }
      refreshError = error.localizedDescription
    }
  }

  func loadProjects() async {
    guard let list = try? await client.threadProjects() else { return }
    let projects = Self.folders(list)
    let added = projects.map(\.canonical).filter { feeds[$0] == nil && !hidden.contains($0) }
    if projects != self.projects {
      self.projects = projects
      rebuild()
    }
    for folder in added { await loadFeed(folder, more: false) }
  }

  /// One folder per row, newest activity first. Historical project identities can share a
  /// folder; OpenCode's `/` catch-all isn't a project folder.
  private static func folders(_ list: [ThreadProject]) -> [ThreadProject] {
    var byFolder: [String: ThreadProject] = [:]
    for project in list where project.canonical != "/" {
      if let existing = byFolder[project.canonical], existing.activeAt >= project.activeAt {
        continue
      }
      byFolder[project.canonical] = project
    }
    return byFolder.values.sorted {
      $0.activeAt != $1.activeAt
        ? $0.activeAt > $1.activeAt
        : $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending
    }
  }

  private func fetchFirstPages(_ folders: [String]) async -> [String: Result<ThreadPage, Error>] {
    let client = client
    // A few at a time, so a gateway with many projects isn't flooded.
    let pages = await Concurrently.map(folders, limit: 6) { folder -> Result<ThreadPage, Error> in
      do {
        return .success(try await client.threadSessions(directory: folder))
      } catch {
        return .failure(error)
      }
    }
    return Dictionary(zip(folders, pages), uniquingKeysWith: { first, _ in first })
  }

  /// A project's first page, or its next one for Show more.
  private func loadFeed(_ folder: String, more: Bool) async {
    let generation = generation
    let cursor = more ? feeds[folder]?.cursor : nil
    if more {
      guard cursor != nil, feeds[folder]?.loadingMore == false else { return }
      feeds[folder]?.loadingMore = true
      rebuild()
    }
    do {
      let page = try await client.threadSessions(directory: folder, cursor: cursor)
      guard generation == self.generation else { return }
      for session in page.sessions { sessions[session.id] = session }
      var feed = feeds[folder] ?? Feed()
      feed.ids.formUnion(page.sessions.map(\.id))
      if more || feed.cursor == nil {
        feed.cursor = page.nextCursor
        feed.hasMore = page.hasMore
      }
      feed.loadingMore = false
      feed.error = nil
      feeds[folder] = feed
    } catch {
      guard generation == self.generation, !Self.cancelled(error) else { return }
      feeds[folder]?.loadingMore = false
      feeds[folder]?.error = error.localizedDescription
    }
    rebuild()
  }

  /// Like the desktop, Focus follows pages while they still reach into the active window, so
  /// every recently active thread can rank, up to four pages.
  private func fillFocus() async {
    while mode == .focus, focusHasMore, focusPages < Self.maxActivePages, !focusLoadingMore {
      let oldest = focusIDs.compactMap { sessions[$0]?.updatedAt }.min() ?? 0
      guard oldest >= Self.nowMillis - Self.activeWindow else { return }
      guard await loadFocusPage() else { return }
    }
  }

  @discardableResult
  private func loadFocusPage() async -> Bool {
    guard focusHasMore, !focusLoadingMore, let cursor = focusCursor else { return false }
    let generation = generation
    focusLoadingMore = true
    defer { if generation == self.generation { focusLoadingMore = false } }
    do {
      let page = try await client.threadSearch(cursor: cursor)
      guard generation == self.generation else { return false }
      for session in page.sessions {
        // An older page never overwrites a newer snapshot of the same thread.
        if let current = sessions[session.id], current.updatedAt > session.updatedAt { continue }
        sessions[session.id] = session
      }
      focusIDs.formUnion(page.sessions.map(\.id))
      focusCursor = page.nextCursor
      focusHasMore = page.hasMore
      focusPages += 1
      focusError = nil
      rebuild()
      await loadAttention(generation: generation)
      return true
    } catch {
      guard generation == self.generation, !Self.cancelled(error) else { return false }
      focusError = error.localizedDescription
      return false
    }
  }

  /// Native lists can't filter by metadata, so pins older than the loaded pages are read by
  /// ID, like the desktop's pinned index. Metadata stays authoritative.
  private func loadExtraPins(generation: Int) async {
    let wanted = pinIndex.ids.filter { sessions[$0] == nil }
    guard !wanted.isEmpty else { return }
    let client = client
    let results = await Concurrently.map(wanted) { id -> (String, SessionInfo?, Bool) in
      do {
        return (id, try await client.session(id), false)
      } catch let error as GatewayError where error.status == 404 {
        return (id, nil, true)
      } catch {
        return (id, nil, false)
      }
    }
    guard generation == self.generation else { return }
    for (id, info, missing) in results {
      if let info, info.parentID == nil {
        let session = ThreadSession(info)
        if session.pinned != nil { sessions[id] = session } else { pinIndex.remember(id, pinned: false) }
      } else if info != nil || missing {
        pinIndex.remember(id, pinned: false)
      }
    }
    rebuild()
  }

  /// Pending requests are location-scoped, and a thread waiting on one is still running, so
  /// only folders with running threads are asked.
  private func loadAttention(generation: Int) async {
    let directories = Set(running.compactMap { sessions[$0]?.directory }).sorted().prefix(32)
    guard !directories.isEmpty else {
      if !attention.isEmpty {
        attention = [:]
        rebuild()
      }
      return
    }
    // Requests are an overlay; a failure keeps the last snapshot rather than hiding the list.
    guard let result = try? await client.attention(directories: Array(directories)),
      generation == self.generation
    else { return }
    if result != attention {
      attention = result
      rebuild()
    }
  }

  private func remove(_ id: String) {
    sessions[id] = nil
    focusIDs.remove(id)
    for key in feeds.keys { feeds[key]?.ids.remove(id) }
  }

  /// A view's task ended (it scrolled away or the screen closed); not a failure to show.
  private static func cancelled(_ error: Error) -> Bool {
    error is CancellationError || (error as? URLError)?.code == .cancelled
  }

  // MARK: Projects view

  func toggle(_ folder: String) {
    if !collapsed.insert(folder).inserted { collapsed.remove(folder) }
    UserDefaults.standard.set(Array(collapsed), forKey: keys.collapsed)
    rebuild()
  }

  /// Four more rows, fetching the next page when the loaded ones run out.
  func showMore(_ folder: String) async {
    guard var feed = feeds[folder] else { return }
    let shown = feed.ids.filter { sessions[$0]?.pinned == nil }.count
    if shown <= feed.visible, feed.hasMore {
      await loadFeed(folder, more: true)
      guard let loaded = feeds[folder], loaded.error == nil else { return }
      feed = loaded
    }
    feeds[folder]?.visible = feed.visible + Self.groupStep
    rebuild()
  }

  func setHidden(_ folder: String, _ hide: Bool) {
    if hide { hidden.insert(folder) } else { hidden.remove(folder) }
    UserDefaults.standard.set(Array(hidden), forKey: keys.hidden)
    rebuild()
    if !hide, feeds[folder] == nil { Task { await loadFeed(folder, more: false) } }
  }

  func showAllProjects() {
    let restored = hidden
    hidden = []
    UserDefaults.standard.removeObject(forKey: keys.hidden)
    rebuild()
    Task { for folder in restored where feeds[folder] == nil { await loadFeed(folder, more: false) } }
  }

  /// Every project, for the Projects view's filter: hidden ones too, so they can come back.
  var projectOptions: [ProjectOption] {
    projects.map {
      ProjectOption(directory: $0.canonical, name: $0.displayName, shown: !hidden.contains($0.canonical))
    }
    .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
  }

  // MARK: Focus view

  /// Offer projects with loaded threads, plus hidden ones so they can always be restored.
  var focusOptions: [ProjectOption] {
    let folders = Set(focusIDs.compactMap { sessions[$0]?.directory }).union(excluded)
    return folders.map {
      ProjectOption(directory: $0, name: badge($0).name, shown: !excluded.contains($0))
    }
    .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
  }

  func setExcluded(_ folder: String, _ exclude: Bool) {
    if exclude { excluded.insert(folder) } else { excluded.remove(folder) }
    saveExcluded()
  }

  func showAllInFocus() {
    excluded = []
    saveExcluded()
  }

  private func saveExcluded() {
    if excluded.isEmpty {
      UserDefaults.standard.removeObject(forKey: keys.excluded)
    } else {
      UserDefaults.standard.set(Array(excluded), forKey: keys.excluded)
    }
    rebuild()
  }

  func toggleInactive() { inactiveOpen.toggle() }

  /// Ten more inactive threads, loading the next page when the loaded ones run out.
  func showMoreInactive() async {
    if focusInactive.count <= inactiveVisible, focusHasMore {
      guard await loadFocusPage() else { return }
    }
    inactiveVisible += Self.inactiveStep
  }

  func retryFocus() async {
    focusError = nil
    if focusPages == 0 { await reload() } else { await loadFocusPage() }
  }

  // MARK: Pin and done

  func perform(_ action: FocusAction, on target: ThreadActionTarget) {
    guard let session = sessions[target.id] else { return }
    var markers = pending[target.id] ?? FocusMarkers(pinned: session.pinned, done: session.done)
    // The gateway's rules: Done also unpins, and pinning reopens.
    switch action {
    case .pin: markers = FocusMarkers(pinned: Self.nowMillis, done: nil)
    case .unpin: markers.pinned = nil
    case .done: markers = FocusMarkers(pinned: nil, done: session.activityAt)
    case .undone: markers.done = nil
    }
    pending[target.id] = markers
    rebuild()
    if action == .done, let item = item(for: target.id) { offerUndo(item) }
    Task {
      do {
        let result = try await client.focus(target.id, action)
        sessions[target.id]?.pinned = result.pinned
        sessions[target.id]?.done = result.done
      } catch {
        if undoDone?.id == target.id { undoDone = nil }
        actionError = error.localizedDescription
      }
      pending[target.id] = nil
      rebuild()
    }
  }

  func undo() {
    guard let item = undoDone else { return }
    undoDone = nil
    perform(.undone, on: item.target)
  }

  func dismissUndo() { undoDone = nil }

  private func offerUndo(_ item: ThreadItem) {
    undoDone = item
    undoTask?.cancel()
    undoTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(6))
      guard !Task.isCancelled, self?.undoDone?.id == item.id else { return }
      self?.undoDone = nil
    }
  }

  // MARK: Derivation

  private static var nowMillis: Millis { Date.now.timeIntervalSince1970 * 1000 }

  /// The project avatar for a folder: the catalog's name and icon, else the folder name.
  func badge(_ folder: String) -> ProjectBadge {
    if let project = projects.first(where: { $0.canonical == folder }) {
      return ProjectBadge(name: project.displayName, icon: project.icon)
    }
    return ProjectBadge(name: folderName(folder), icon: nil)
  }

  private func effective(_ id: String) -> ThreadSession? {
    guard var session = sessions[id] else { return nil }
    if let markers = pending[id] {
      session.pinned = markers.pinned
      session.done = markers.done
    }
    return session
  }

  private func item(for id: String) -> ThreadItem? {
    effective(id).map { item($0, badges: [:]) }
  }

  private func item(_ session: ThreadSession, badges: [String: ProjectBadge]) -> ThreadItem {
    let responding = running.contains(session.id)
    let request: ThreadItem.Attention? =
      switch attention[session.id] {
      case "permission": .permission
      case "question": .question
      default: nil
      }
    let replied = (session.time.idle ?? 0) > (session.time.viewed ?? 0)
    return ThreadItem(
      id: session.id,
      title: session.title.isEmpty ? "Untitled session" : session.title,
      directory: session.directory,
      project: badges[session.directory] ?? badge(session.directory),
      attention: request,
      responding: responding,
      unread: session.unread != nil || (!responding && replied),
      markedUnread: session.unread != nil,
      muted: session.muted == true,
      forked: session.fork != nil,
      pinned: session.pinned != nil,
      done: session.settled)
  }

  /// Re-derives every row list from the snapshots. Runs per refresh, never per token.
  private func rebuild() {
    let now = Self.nowMillis
    var badges: [String: ProjectBadge] = [:]
    for project in projects {
      badges[project.canonical] = ProjectBadge(name: project.displayName, icon: project.icon)
    }
    var pinned: [(ThreadItem, Double)] = []
    var all: [String: (session: ThreadSession, item: ThreadItem)] = [:]
    for id in sessions.keys {
      guard let session = effective(id) else { continue }
      let item = item(session, badges: badges)
      all[id] = (session, item)
      // Metadata is authoritative: remember pins seen, forget threads shown unpinned.
      pinIndex.remember(id, pinned: session.pinned != nil)
      if let order = session.pinned { pinned.append((item, order)) }
    }

    let sortedPins = pinned.sorted { $0.1 > $1.1 }.map(\.0)
    if sortedPins != self.pinned { self.pinned = sortedPins }

    // Projects: running threads stay on top; others follow their last run.
    var groups: [Group] = []
    for project in projects where !hidden.contains(project.canonical) {
      guard let feed = feeds[project.canonical], !feed.ids.isEmpty || feed.error != nil else {
        continue
      }
      let rows = feed.ids.compactMap { all[$0] }
        .filter { $0.0.pinned == nil }
        .map { ($0.1, $0.1.responding ? $0.0.updatedAt : $0.0.activityAt) }
        .sorted { $0.1 > $1.1 }
      let expanded = !collapsed.contains(project.canonical)
      groups.append(
        Group(
          canonical: project.canonical,
          badge: badges[project.canonical]!,
          expanded: expanded,
          items: expanded ? rows.prefix(feed.visible).map(\.0) : [],
          canShowMore: rows.count > feed.visible || feed.hasMore,
          loadingMore: feed.loadingMore,
          error: feed.error))
    }
    if groups != self.groups { self.groups = groups }

    let focus = Self.deriveFocus(
      focusIDs.compactMap { all[$0] }, now: now, excluded: excluded)
    if focus.active != focusActive { focusActive = focus.active }
    if focus.inactive != focusInactive { focusInactive = focus.inactive }
  }

  /// The desktop's `deriveFocus`: places each unpinned thread once. Active holds pending
  /// requests, runs, and recent activity (needs-you first); Inactive holds older threads and
  /// those marked done with nothing new since.
  nonisolated static func deriveFocus(
    _ rows: [(session: ThreadSession, item: ThreadItem)], now: Millis, excluded: Set<String>
  ) -> (active: [ThreadItem], inactive: [ThreadItem]) {
    var active: [(ThreadItem, Int, Millis)] = []
    var inactive: [(ThreadItem, Millis)] = []
    for (session, item) in rows where session.pinned == nil {
      // `threadStatus`: a request, else running, else unread.
      let request = item.attention != nil
      let running = !request && item.responding
      let unread = !request && !running && item.unread
      if excluded.contains(session.directory), !request { continue }
      // Requests and runs always surface; unread replies rank only within the window, so
      // never-opened history does not flood Active.
      let waiting = request || running
      let settled = session.settled && !waiting
      if !settled, waiting || session.activityAt >= now - activeWindow {
        let rank = request || unread ? 0 : running ? 1 : 2
        active.append((item, rank, session.activityAt))
      } else {
        inactive.append((item, session.activityAt))
      }
    }
    return (
      active.sorted { $0.1 != $1.1 ? $0.1 < $1.1 : $0.2 > $1.2 }.map(\.0),
      inactive.sorted { $0.1 > $1.1 }.map(\.0)
    )
  }
}

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

  mutating func remember(_ id: String, pinned: Bool) {
    guard ids.contains(id) != pinned else { return }
    ids = pinned ? Array(([id] + ids).prefix(Self.limit)) : ids.filter { $0 != id }
    UserDefaults.standard.set(ids, forKey: key)
  }
}
