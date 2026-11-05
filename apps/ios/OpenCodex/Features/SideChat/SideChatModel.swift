import Foundation
import Observation

/// One main chat's side chats, like the desktop's `SideChatPanel` queries: the list, which one
/// is shown, which are responding, and start and delete.
@Observable
final class SideChatList {
  let client: GatewayClient
  let events: EventHub
  let mainID: String

  private(set) var sessions: [SessionInfo]?
  private(set) var listError: String?
  var selectedID: String?
  private(set) var running: Set<String> = []
  private(set) var creating = false
  var createError: String?
  private(set) var deleting = false
  var deleteError: String?

  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var refreshTask: Task<Void, Never>?

  init(client: GatewayClient, events: EventHub, mainID: String) {
    self.client = client
    self.events = events
    self.mainID = mainID
  }

  /// The shown side chat: the one picked, else the newest.
  var selected: SessionInfo? {
    sessions?.first { $0.id == selectedID } ?? sessions?.last
  }

  var full: Bool { (sessions?.count ?? 0) >= maxSideChats }

  func index(of session: SessionInfo) -> Int {
    (sessions?.firstIndex { $0.id == session.id } ?? 0) + 1
  }

  func run() async {
    subscriptions = [
      events.subscribe { [weak self] event in self?.handle(event) },
      events.onReconnect { [weak self] in self?.scheduleRefresh() },
    ]
    defer { subscriptions = [] }
    await load()
  }

  func load() async {
    do {
      async let list = client.sideChats(mainID)
      async let active = client.active()
      sessions = try await list
      running = Set(try await active.keys)
      listError = nil
    } catch {
      listError = error.localizedDescription
    }
  }

  func create() async {
    guard !creating, sessions != nil, !full else { return }
    creating = true
    createError = nil
    defer { creating = false }
    do {
      let session = try await client.createSideChat(mainID)
      sessions = (sessions ?? []).filter { $0.id != session.id } + [session]
      selectedID = session.id
    } catch {
      createError = error.localizedDescription
    }
    scheduleRefresh()
  }

  func delete(_ session: SessionInfo) async -> Bool {
    deleting = true
    deleteError = nil
    defer { deleting = false }
    do {
      _ = try await client.deleteSideChat(mainID, session.id)
      sessions?.removeAll { $0.id == session.id }
      // Release any unsent text for the deleted chat.
      let draft = DraftStore.shared.draft(DraftStore.key(sessionID: session.id, directory: nil))
      draft.acknowledge(draft.capture())
      scheduleRefresh()
      return true
    } catch {
      deleteError = error.localizedDescription
      return false
    }
  }

  private func handle(_ event: GatewayEvent) {
    guard let id = event.sessionID, sessions?.contains(where: { $0.id == id }) == true else { return }
    if event.type.hasPrefix("session.execution.") { scheduleRefresh() }
  }

  private func scheduleRefresh() {
    guard refreshTask == nil else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      guard let self else { return }
      self.refreshTask = nil
      await self.load()
    }
  }
}

/// The main chat's state above the side composer (`MainChatStatus`): approvals, questions,
/// running or a failed last run. It refetches only on the main chat's request and run events.
@Observable
final class MainChatWatcher {
  enum State: Equatable { case attention, running, failed, idle }

  let client: GatewayClient
  let events: EventHub
  let mainID: String
  private(set) var state: State = .idle
  private(set) var label = "Main chat is idle"

  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var refreshTask: Task<Void, Never>?

  nonisolated private struct Outcome: Decodable, Sendable { var outcome: String? }

  init(client: GatewayClient, events: EventHub, mainID: String) {
    self.client = client
    self.events = events
    self.mainID = mainID
  }

  func run() async {
    subscriptions = [
      events.subscribe { [weak self] event in
        guard let self, event.sessionID == self.mainID else { return }
        let type = event.type
        if type.hasPrefix("permission.") || type.hasPrefix("form.")
          || type.hasPrefix("session.execution.")
        {
          self.scheduleRefresh()
        }
      },
      events.onReconnect { [weak self] in self?.scheduleRefresh() },
    ]
    defer { subscriptions = [] }
    await load()
  }

  private func load() async {
    async let permissions = client.permissions(mainID)
    async let forms = client.forms(mainID)
    async let active = client.active()
    async let info = client.get("/sessions/\(mainID)", as: Outcome.self)
    guard let permissions = try? await permissions, let forms = try? await forms,
      let active = try? await active
    else { return }
    let outcome = (try? await info)?.outcome
    if !permissions.isEmpty {
      (state, label) = (.attention, "Main chat needs approval")
    } else if !forms.isEmpty {
      (state, label) = (.attention, "Main chat has a question")
    } else if active[mainID] != nil {
      (state, label) = (.running, "Main chat is working")
    } else if outcome == "failed" {
      (state, label) = (.failed, "Main chat’s last run failed")
    } else {
      (state, label) = (.idle, "Main chat is idle")
    }
  }

  private func scheduleRefresh() {
    guard refreshTask == nil else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      guard let self else { return }
      self.refreshTask = nil
      await self.load()
    }
  }
}
