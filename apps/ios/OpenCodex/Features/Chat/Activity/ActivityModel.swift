import Foundation
import Observation

/// One chat's running shells and running direct subagents, with each subagent's pending
/// approval or question. Port of the desktop `running-shells.ts`, `running-subagents.ts` and
/// `subagent-attention.ts`.
///
/// Snapshots are authoritative; events only schedule coalesced refetches of the part they
/// affect, and streamed text is ignored. One instance per chat is shared by the tray, the
/// subagents badge and the list (`ActivityModel.shared(for:)`).
@Observable
final class ActivityModel {
  nonisolated struct RunningSubagent: Identifiable, Equatable, Sendable {
    var id: String
    var title: String?
    var agent: String?
    var created: Millis
    /// Start of the current run, known only for a child's first run.
    var started: Millis?
  }

  nonisolated enum Attention: Equatable, Sendable { case permission, question, error }

  /// A part of the activity that is fetched together.
  nonisolated enum Part: CaseIterable, Hashable, Sendable { case shells, subagents, attention }

  /// Load state of one part, like a Query's pending/error/success.
  nonisolated enum Status: Equatable, Sendable { case pending, failed, loaded }

  let chat: ChatModel

  /// The chat's running shell commands, in the server's order.
  private(set) var shells: [ShellInfo] = []
  private(set) var shellStatus: Status = .pending
  /// The chat's running direct children, oldest first.
  private(set) var subagents: [RunningSubagent] = []
  private(set) var subagentStatus: Status = .pending
  /// Pending requests per running child; missing means none.
  private(set) var attention: [String: Attention] = [:]

  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var runners = 0
  @ObservationIgnored private var refreshTask: Task<Void, Never>?
  @ObservationIgnored private var pending: Set<Part> = []

  /// Running sessions' immutable identity (parent, agent, creation), fetched once per ID and
  /// shared by every chat, like the desktop's `['chat', id, 'info']` cache.
  private static var identities: [String: SessionInfo] = [:]
  private static var instances: [ObjectIdentifier: Weak] = [:]
  private struct Weak { weak var model: ActivityModel? }

  private init(chat: ChatModel) { self.chat = chat }

  /// The chat's shared activity, created on first use.
  static func shared(for chat: ChatModel) -> ActivityModel {
    let key = ObjectIdentifier(chat)
    if let model = instances[key]?.model, model.chat === chat { return model }
    instances = instances.filter { $0.value.model != nil }
    let model = ActivityModel(chat: chat)
    instances[key] = Weak(model: model)
    return model
  }

  private var sessionID: String? { chat.sessionID }
  private var directory: String? { chat.session?.location.directory ?? chat.directory }

  var visible: Bool {
    subagentStatus == .failed || shellStatus == .failed || !subagents.isEmpty || !shells.isEmpty
  }

  // MARK: Running

  /// Loads and listens while any view runs it; call from `.task(id: chat.sessionID)`.
  func run() async {
    runners += 1
    let first = runners == 1
    if first {
      subscriptions = [
        chat.events.subscribe { [weak self] event in self?.handle(event) },
        chat.events.onReconnect { [weak self] in self?.schedule(Set(Part.allCases)) },
      ]
    }
    defer {
      runners -= 1
      if runners == 0 {
        subscriptions = []
        refreshTask?.cancel()
        refreshTask = nil
        pending = []
      }
    }
    await refresh(Set(Part.allCases))
    // Only the first runner polls, while the event stream is down.
    guard first else {
      while !Task.isCancelled { try? await Task.sleep(for: .seconds(3600)) }
      return
    }
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(5))
      if !chat.events.live, sessionID != nil { schedule(Set(Part.allCases)) }
    }
  }

  /// Refetches one part now, for Retry.
  func retry(_ part: Part) { schedule([part]) }

  // MARK: Events

  private func handle(_ event: GatewayEvent) {
    guard let id = sessionID else { return }
    let type = event.type
    // Streamed text and reasoning arrive per token; nothing here depends on them.
    if type.hasSuffix(".delta") { return }
    if type.hasPrefix("shell.") {
      schedule([.shells])
    } else if type.hasPrefix("permission.") || type.hasPrefix("form.") {
      if let child = event.sessionID, child != id, subagents.contains(where: { $0.id == child }) {
        schedule([.attention])
      }
    } else if type.hasPrefix("session.execution.") {
      // This chat, one of its children, or a session not seen yet (maybe a new child).
      guard let session = event.sessionID else { return }
      if session == id || Self.identities[session].map({ $0.parentID == id }) ?? true {
        schedule([.subagents])
      }
    } else if type == "session.created" {
      if event.data?["parentID"]?.string == id { schedule([.subagents]) }
    } else if type == "session.renamed" || type == "session.deleted" {
      if let child = event.sessionID, subagents.contains(where: { $0.id == child }) {
        Self.identities[child] = nil
        schedule([.subagents])
      }
    }
  }

  /// Coalesces refetches into one round every 300 ms.
  private func schedule(_ parts: Set<Part>) {
    pending.formUnion(parts)
    guard refreshTask == nil, runners > 0 else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      guard let self, !Task.isCancelled else { return }
      let parts = self.pending
      self.pending = []
      self.refreshTask = nil
      await self.refresh(parts)
    }
  }

  private func refresh(_ parts: Set<Part>) async {
    guard sessionID != nil else { return }
    let shells = parts.contains(.shells) ? Task { await refreshShells() } : nil
    if parts.contains(.subagents) {
      await refreshSubagents(attention: parts.contains(.attention))
    } else if parts.contains(.attention) {
      await refreshAttention(subagents.map(\.id))
    }
    await shells?.value
  }

  private func refreshShells() async {
    guard let id = sessionID, let directory else { return }
    do {
      let all = try await chat.client.shells(directory: directory)
      let mine = all.filter { $0.running && $0.sessionID == id }
      if mine != shells { shells = mine }
      shellStatus = .loaded
    } catch {
      if !Self.cancelled(error) { shellStatus = .failed }
    }
  }

  /// `session.active` has no parent filter, so each running ID's parent comes from its
  /// session info, fetched once.
  private func refreshSubagents(attention all: Bool) async {
    guard let id = sessionID else { return }
    do {
      let running = try await chat.client.active().keys.filter { $0 != id }
      let unknown = running.filter { Self.identities[$0] == nil }
      var failed = false
      if !unknown.isEmpty {
        let client = chat.client
        let fetched = await Concurrently.map(Array(unknown)) { child in
          try? await client.session(child)
        }
        if Task.isCancelled { return }
        for info in fetched {
          if let info { Self.identities[info.id] = info } else { failed = true }
        }
      }
      let children = running.compactMap { Self.identities[$0] }
        .filter { $0.parentID == id }
        .sorted { $0.time.created < $1.time.created }
        .map { info in
          RunningSubagent(
            id: info.id, title: info.title, agent: info.agent, created: info.time.created,
            // A resumed child's snapshot records an earlier idle; its new start is unknown.
            started: info.time.idle == nil ? info.time.created : nil)
        }
      let added = Set(children.map(\.id)).subtracting(subagents.map(\.id))
      if children != subagents { subagents = children }
      subagentStatus = failed ? .failed : .loaded
      let ids = Set(children.map(\.id))
      if attention.keys.contains(where: { !ids.contains($0) }) {
        attention = attention.filter { ids.contains($0.key) }
      }
      await refreshAttention(all ? children.map(\.id) : Array(added))
    } catch {
      if !Self.cancelled(error) { subagentStatus = .failed }
    }
  }

  /// A request dropped because its view went away, not a failure.
  nonisolated private static func cancelled(_ error: Error) -> Bool {
    error is CancellationError || (error as? URLError)?.code == .cancelled
  }

  private func refreshAttention(_ ids: [String]) async {
    guard !ids.isEmpty else { return }
    let client = chat.client
    let results = await Concurrently.map(ids) { id -> (String, Attention?) in
      do {
        if try await !client.permissions(id).isEmpty { return (id, .permission) }
        return (id, try await !client.forms(id).isEmpty ? .question : nil)
      } catch {
        return (id, Self.cancelled(error) ? nil : .error)
      }
    }
    guard !Task.isCancelled else { return }
    var next = attention
    for (id, value) in results where subagents.contains(where: { $0.id == id }) {
      next[id] = value
    }
    if next != attention { attention = next }
  }
}
