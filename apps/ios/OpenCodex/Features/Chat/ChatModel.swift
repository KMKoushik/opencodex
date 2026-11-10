import Foundation
import Observation

/// One chat's server state, shared by the transcript, composer and request cards.
///
/// Like the web app, OpenCode's snapshots are authoritative: events only trigger coalesced
/// refetches, except streamed text and reasoning, which go to a display-only `live` overlay.
/// A chat starts as a draft (`sessionID == nil`) for a project; the first send creates it.
@Observable
final class ChatModel {
  /// A streaming text or reasoning part: the `ordinal`-th part of that kind in its message.
  struct LiveKey: Hashable {
    enum Kind: String { case text, reasoning }
    var messageID: String
    var kind: Kind
    var ordinal: Int
  }

  let client: GatewayClient
  let events: EventHub
  /// Running shells and subagents. Owned here so every view observes the one that loads.
  @ObservationIgnored private(set) lazy var activity = ActivityModel(chat: self)
  private(set) var sessionID: String?
  let directory: String?

  private(set) var session: SessionInfo? {
    didSet {
      if oldValue?.revert != session?.revert || oldValue?.sideChatParent != session?.sideChatParent {
        updateVisible()
      }
    }
  }
  /// The visible history, oldest first: like the desktop, an undo hides the reverted message
  /// and everything after it until it's redone or a new prompt commits it.
  private(set) var messages: [SessionMessage] = []
  /// Every loaded message, oldest first, including undone ones.
  private var history: [SessionMessage] = [] { didSet { updateVisible() } }
  /// True while an undo is staged.
  var undone: Bool { session?.revert != nil }
  /// Whether older pages remain to load. A side chat stops paging at its fork.
  var hasOlder: Bool { olderPages && !reachedFork }
  private var olderPages = false
  /// A side chat's loaded history reaches back past the side session's start.
  private var reachedFork = false
  private(set) var loadingOlder = false
  private(set) var loaded = false
  /// Streamed text that the snapshot may not have yet. Display only.
  private(set) var live: [LiveKey: String] = [:]
  private(set) var running = false
  private(set) var permissions: [PermissionRequest] = []
  private(set) var forms: [FormInfo] = []
  /// Messages sent mid-run, waiting for OpenCode to deliver them.
  private(set) var inbox: [InboxItem] = []
  /// Where an unsent chat starts, like the desktop's workspace bar: nil is the local checkout,
  /// otherwise a new worktree from `branch` (nil for the current HEAD).
  struct Worktree: Equatable { var branch: String? }
  var worktree: Worktree?
  /// True while the first send is creating the chat's worktree.
  private(set) var startingWorktree = false

  /// Bumped when the user sends, so the transcript can jump to the end.
  private(set) var sends = 0
  var error: String?

  @ObservationIgnored private var olderCursor: String?
  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var refreshTask: Task<Void, Never>?
  @ObservationIgnored private var pending: Set<Refresh> = []
  @ObservationIgnored private var recovery: Task<Void, Never>?
  /// Screens running this model; a kept model can be on screen twice in a navigation stack.
  @ObservationIgnored private var runs = 0
  /// True once older pages were read, so a reload merges into them instead of replacing.
  @ObservationIgnored private var loadedOlder = false
  /// The newest snapshots' JSON, saved to the disk cache while the chat is idle.
  @ObservationIgnored private var sessionJSON: Data?
  @ObservationIgnored private var messagesJSON: Data?
  @ObservationIgnored private var savedSessionJSON: Data?
  @ObservationIgnored private var savedMessagesJSON: Data?

  private enum Refresh { case messages, session, active, requests, inbox }

  init(client: GatewayClient, events: EventHub, sessionID: String) {
    self.client = client
    self.events = events
    self.sessionID = sessionID
    self.directory = nil
  }

  /// A new, unsent chat in a project.
  init(client: GatewayClient, events: EventHub, directory: String) {
    self.client = client
    self.events = events
    self.sessionID = nil
    self.directory = directory
    self.loaded = true
  }

  var title: String {
    if let title = session?.title, !title.isEmpty { return title }
    return sessionID == nil ? "New chat" : "Untitled chat"
  }

  /// Starts loading and listening. Call from the screen's `.task`; cancelled when it disappears.
  func run() async {
    runs += 1
    if runs == 1 {
      subscriptions = [
        events.subscribe { [weak self] event in self?.handle(event) },
        events.onReconnect { [weak self] in self?.schedule([.messages, .session, .active, .requests, .inbox]) },
      ]
    }
    defer {
      runs -= 1
      if runs == 0 {
        subscriptions = []
        recovery?.cancel()
      }
    }
    await load()
    // While the event stream is down, poll so a running reply still finishes on screen.
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(5))
      if !events.live && sessionID != nil {
        schedule([.messages, .active, .requests, .inbox])
      }
    }
  }

  /// Shows the chat as soon as the thread and its newest messages arrive (or at once from the
  /// disk cache on a cold open); running state and requests fill in as they come.
  func load() async {
    guard let id = sessionID else { return }
    // Deltas missed while off screen would splice into stale text; snapshots catch up instead.
    if !live.isEmpty { live = [:] }
    let client = client
    async let session = client.sessionFetched(id)
    async let page = client.messagesFetched(id)
    async let active = client.active()
    async let permissions = client.permissions(id)
    async let forms = client.forms(id)
    async let inbox = client.inbox(id)
    if !loaded { await hydrate(id) }
    do {
      let first = try await page
      let info = try await session
      self.session = info.value
      apply(newest: first.value)
      sessionJSON = info.data
      messagesJSON = first.data
      loaded = true
      error = nil
    } catch {
      guard !Self.cancelled(error) else { return }
      if (error as? GatewayError)?.status == 404 { forgetDeleted(id) }
      self.error = error.localizedDescription
      loaded = true
      return
    }
    do {
      running = try await active[id] != nil
      self.permissions = try await permissions
      self.forms = try await forms
      self.inbox = try await inbox
      persist()
    } catch {
      guard !Self.cancelled(error) else { return }
      self.error = error.localizedDescription
    }
  }

  /// A cold open draws the cached thread right away; the live snapshot replaces it.
  private func hydrate(_ id: String) async {
    let cache = client.cache
    guard let info = await cache.read(.session(id), as: SessionInfo.self),
      let page = await cache.read(.messages(id), as: MessagePage.self),
      !loaded
    else { return }
    session = info
    apply(newest: page)
    loaded = true
  }

  /// The newest page: replaces the history unless older pages were read, then merges into it.
  private func apply(newest page: MessagePage) {
    guard !loadedOlder else { return merge(newest: page) }
    let fresh = Array(page.data.reversed())
    if fresh != history { history = fresh }
    olderCursor = page.cursor?.next ?? nil
    olderPages = olderCursor != nil
    pruneLive()
  }

  /// Saves the newest snapshots for the next cold open, only while idle: a running reply
  /// changes them constantly, and its finished snapshot is saved once it ends.
  private func persist() {
    guard let id = sessionID, loaded, !running else { return }
    let cache = client.cache
    if let data = sessionJSON, data != savedSessionJSON {
      savedSessionJSON = data
      Task { await cache.write(.session(id), data) }
    }
    if let data = messagesJSON, data != savedMessagesJSON {
      savedMessagesJSON = data
      Task { await cache.write(.messages(id), data) }
    }
  }

  /// The thread is gone: so are its cached copies and anything it showed.
  private func forgetDeleted(_ id: String) {
    let cache = client.cache
    Task { await cache.removeThread(id) }
    ChatModelStore.shared.remove(client: client, sessionID: id)
    history = []
    sessionJSON = nil
    messagesJSON = nil
  }

  /// The screen closed mid-request; not a failure to show when the chat reopens.
  private static func cancelled(_ error: Error) -> Bool {
    error is CancellationError || (error as? URLError)?.code == .cancelled
  }

  /// Loads the next older page, for scrolling up.
  func loadOlder() async {
    guard let id = sessionID, let cursor = olderCursor, !loadingOlder else { return }
    loadingOlder = true
    defer { loadingOlder = false }
    do {
      let page = try await client.messages(id, cursor: cursor)
      let known = Set(history.map(\.id))
      history.insert(contentsOf: page.data.reversed().filter { !known.contains($0.id) }, at: 0)
      loadedOlder = true
      olderCursor = page.cursor?.next ?? nil
      olderPages = olderCursor != nil
    } catch {
      self.error = error.localizedDescription
    }
  }

  // MARK: Actions

  /// Sends a message: creates the chat first if it's a draft. Mid-run messages steer the reply.
  func send(_ text: String, model: ModelRef?, files: [GatewayClient.Prompt.File] = []) async throws {
    try await prepare(model: model)
    guard let id = sessionID else { return }
    sends += 1
    _ = try await client.prompt(
      id, .init(text: text, model: model, files: files.isEmpty ? nil : files))
    running = true
    schedule([.messages, .inbox, .active, .session])
  }

  /// Creates a draft's chat, and moves it into its worktree, before the first prompt.
  private func prepare(model: ModelRef?) async throws {
    if sessionID == nil, let directory {
      let created = try await client.createSession(directory: directory, model: model)
      sessionID = created.id
      session = created
      if let worktree {
        // Like the desktop: move the new chat before its first prompt. A failure keeps the
        // created chat, so a retry reuses it instead of making another.
        startingWorktree = true
        defer { startingWorktree = false }
        session = try await client.startWorktree(created.id, branch: worktree.branch)
        self.worktree = nil
      }
    } else if let id = sessionID, let worktree, session?.location.directory == directory {
      startingWorktree = true
      defer { startingWorktree = false }
      session = try await client.startWorktree(id, branch: worktree.branch)
      self.worktree = nil
    }
  }

  /// Sends any `/prompt` body (text with commands, skills or mentions), creating the chat first
  /// if it's a draft, exactly like `send(_:model:files:)`.
  func send(body: some Encodable & Sendable, model: ModelRef?) async throws {
    try await prepare(model: model)
    guard let id = sessionID else { return }
    sends += 1
    _ = try await client.post("/sessions/\(id)/prompt", body, as: JSONValue.self)
    running = true
    schedule([.messages, .inbox, .active, .session])
  }

  func stop() async {
    guard let id = sessionID else { return }
    do {
      _ = try await client.interrupt(id)
      schedule([.messages, .active, .inbox])
    } catch { self.error = error.localizedDescription }
  }

  /// Moves the shells and subagents the reply is waiting on to the background.
  func moveToBackground() async {
    guard let id = sessionID else { return }
    do {
      _ = try await client.background(id)
      schedule([.messages])
    } catch { self.error = error.localizedDescription }
  }

  func reply(_ request: PermissionRequest, _ decision: PermissionDecision) async {
    do {
      _ = try await client.reply(request.sessionID, permission: request.id, decision)
      permissions.removeAll { $0.id == request.id }
      schedule([.requests])
    } catch { self.error = error.localizedDescription }
  }

  func answer(_ form: FormInfo, _ answer: [String: JSONValue]) async {
    do {
      _ = try await client.reply(form.sessionID, form: form.id, answer: answer)
      forms.removeAll { $0.id == form.id }
      schedule([.requests])
    } catch { self.error = error.localizedDescription }
  }

  func dismiss(_ form: FormInfo) async {
    do {
      _ = try await client.cancel(form.sessionID, form: form.id)
      forms.removeAll { $0.id == form.id }
    } catch { self.error = error.localizedDescription }
  }

  func setFullAccess(_ full: Bool) async {
    guard let id = sessionID else { return }
    do {
      _ = try await client.setAccess(id, full: full)
      schedule([.session, .requests])
    } catch { self.error = error.localizedDescription }
  }

  private func updateVisible() {
    var visible = history
    if let boundary = session?.revert?.messageID {
      let end = history.firstIndex { $0.id == boundary }
      visible = end.map { Array(history[..<$0]) } ?? []
    }
    // Like the desktop, a side chat reads as a fresh chat: forked history keeps its original
    // times, so hide what's older than the side session, and stop paging there.
    if isSideChat, let start = session?.time.created {
      reachedFork = history.contains { $0.created < start }
      visible = visible.filter { $0.created >= start }
    } else {
      reachedFork = false
    }
    messages = visible
  }

  /// Refetches the thread's info, e.g. after a rename, pin or mute from its menu.
  func refreshSession() { schedule([.session]) }

  /// Marks the finished reply read, like the desktop app does while a chat is on screen.
  func markViewed() async {
    guard let id = sessionID, let idle = session?.time.idle, idle > (session?.time.viewed ?? 0)
    else { return }
    _ = try? await client.view(id, idle: idle)
  }

  // MARK: Events

  private func handle(_ event: GatewayEvent) {
    guard let id = sessionID else { return }
    let type = event.type
    if type.hasPrefix("permission.") || type.hasPrefix("form.") {
      // Requests can come from subagents too; the server lists only this chat's.
      if event.sessionID == id { schedule([.requests]) }
      return
    }
    guard event.sessionID == id else { return }
    switch type {
    case "session.text.started", "session.reasoning.started":
      if let key = liveKey(event) { live[key] = "" }
    case "session.text.delta", "session.reasoning.delta":
      // Only after observing the start, so a late subscriber never shows a suffix as a reply.
      if let key = liveKey(event), let text = live[key], let delta = event.data?["delta"]?.string {
        live[key] = text + delta
      }
    case "session.text.ended", "session.reasoning.ended":
      if let key = liveKey(event), live[key] != nil, let text = event.data?["text"]?.string {
        live[key] = text
      }
      schedule([.messages])
    case "session.step.started":
      pruneLive()
      schedule([.messages])
    case "session.execution.started":
      running = true
      schedule([.messages, .active])
    case "session.execution.succeeded", "session.execution.failed", "session.execution.interrupted":
      running = false
      schedule([.messages, .active, .session, .inbox])
    case "session.inbox.enqueued", "session.inbox.delivered", "session.inbox.cancelled":
      schedule([.inbox, .messages])
    case "session.renamed", "session.permissions", "session.model.selected", "session.viewed":
      schedule([.session])
    case "session.revert.staged", "session.revert.cleared", "session.revert.committed":
      // Undo and redo move the boundary the transcript hides after.
      schedule([.session, .messages])
    case "session.usage.updated":
      break
    default:
      if type.hasPrefix("session.") { schedule([.messages]) }
    }
  }

  private func liveKey(_ event: GatewayEvent) -> LiveKey? {
    guard let message = event.data?["assistantMessageID"]?.string,
      let ordinal = event.data?["ordinal"]?.number
    else { return nil }
    let kind: LiveKey.Kind = event.type.contains(".reasoning.") ? .reasoning : .text
    return LiveKey(messageID: message, kind: kind, ordinal: Int(ordinal))
  }

  /// Coalesces refetches into one round every 250 ms, like the web app.
  private func schedule(_ what: Set<Refresh>) {
    pending.formUnion(what)
    guard refreshTask == nil else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(250))
      guard let self else { return }
      let what = self.pending
      self.pending = []
      self.refreshTask = nil
      await self.refresh(what)
    }
  }

  private func refresh(_ what: Set<Refresh>) async {
    guard let id = sessionID else { return }
    do {
      if what.contains(.messages) {
        let page = try await client.messagesFetched(id)
        merge(newest: page.value)
        messagesJSON = page.data
      }
      if what.contains(.session) {
        let info = try await client.sessionFetched(id)
        session = info.value
        sessionJSON = info.data
      }
      if what.contains(.active) { running = try await client.active()[id] != nil }
      if what.contains(.requests) {
        async let permissions = client.permissions(id)
        async let forms = client.forms(id)
        self.permissions = try await permissions
        self.forms = try await forms
      }
      if what.contains(.inbox) { inbox = try await client.inbox(id) }
      error = nil
      persist()
    } catch let failure as GatewayError {
      if failure.status == 404, what.contains(.session) || what.contains(.messages) {
        forgetDeleted(id)
      }
      error = failure.message
    } catch {
      // Transient network errors recover on the next event or poll.
    }
  }

  /// Replaces the newest page in place and keeps older pages already loaded.
  private func merge(newest page: MessagePage) {
    let fresh = Array(page.data.reversed())
    guard let oldest = fresh.first else {
      history = []
      return
    }
    if let index = history.firstIndex(where: { $0.id == oldest.id }) {
      history = Array(history[..<index]) + fresh
    } else {
      // No overlap (a whole page arrived since the last read, or an undo): start over from it.
      history = fresh
      olderCursor = page.cursor?.next ?? nil
      olderPages = olderCursor != nil
    }
    pruneLive()
  }

  /// Snapshots win once they catch up: drop overlay parts the snapshot has at full length, and
  /// parts of replies that have finished. Until then the overlay stays, so text never shrinks.
  private func pruneLive() {
    guard !live.isEmpty else { return }
    var completed = Set<String>()
    for message in history {
      if case .assistant(let assistant) = message, assistant.time.completed != nil {
        completed.insert(assistant.id)
      }
    }
    let kept = live.filter { key, text in
      !completed.contains(key.messageID) && (snapshotText(key)?.count ?? -1) < text.count
    }
    if kept.count != live.count { live = kept }
  }

  /// The snapshot's text for a streaming part, if it has that part yet.
  func snapshotText(_ key: LiveKey) -> String? {
    for message in history.reversed() {
      guard case .assistant(let assistant) = message, assistant.id == key.messageID else { continue }
      var ordinal = 0
      for part in assistant.content {
        switch (part, key.kind) {
        case (.text(let text), .text), (.reasoning(let text), .reasoning):
          if ordinal == key.ordinal { return text }
          ordinal += 1
        default: continue
        }
      }
      return nil
    }
    return nil
  }
}
