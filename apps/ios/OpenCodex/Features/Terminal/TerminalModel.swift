import Foundation
import Observation

/// The project's native terminal list, shared by every chat in the directory, with the
/// desktop's create/remove lifecycle (`apps/web/src/features/terminal/terminal-panel.tsx`).
@Observable
final class TerminalModel {
  let client: GatewayClient
  let events: EventHub
  let directory: String

  private(set) var terminals: [Pty] = []
  /// The list has loaded at least once.
  private(set) var loaded = false
  private(set) var creating = false
  private(set) var removing: String?
  private(set) var listError: String?
  private(set) var actionError: String?
  var selectedID: String?

  @ObservationIgnored private var refreshTask: Task<Void, Never>?
  @ObservationIgnored private var subscriptions: [Subscription] = []

  init(client: GatewayClient, events: EventHub, directory: String) {
    self.client = client
    self.events = events
    self.directory = directory
  }

  var current: Pty? { terminals.first { $0.id == selectedID } ?? terminals.first }

  /// Loads the list, opens one shell when it's empty (once per visit, like the desktop), and
  /// keeps it fresh: native `pty.*` events refetch it, and polling covers a dead event stream.
  func run() async {
    subscriptions = [
      events.subscribe { [weak self] event in
        if event.type.hasPrefix("pty.") { self?.scheduleRefresh() }
      },
      events.onReconnect { [weak self] in self?.scheduleRefresh() },
    ]
    defer { subscriptions = [] }
    await refresh()
    if loaded, terminals.isEmpty { await create() }
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(5))
      if !Task.isCancelled, !events.live { await refresh() }
    }
  }

  func refresh() async {
    do {
      terminals = try await client.terminals(directory: directory)
      loaded = true
      listError = nil
    } catch is CancellationError {
    } catch {
      listError = error.localizedDescription
    }
  }

  /// Coalesces bursts of events into one refetch.
  func scheduleRefresh() {
    guard refreshTask == nil else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      await self?.refresh()
      self?.refreshTask = nil
    }
  }

  func create() async {
    guard !creating else { return }
    creating = true
    defer { creating = false }
    do {
      let terminal = try await client.createTerminal(directory: directory)
      terminals = terminals.filter { $0.id != terminal.id } + [terminal]
      selectedID = terminal.id
      actionError = nil
      scheduleRefresh()
    } catch {
      actionError = error.localizedDescription
    }
  }

  /// Closes the tab and ends its shell (native `pty.remove`), selecting its neighbor.
  func remove(_ id: String) async {
    guard removing == nil else { return }
    removing = id
    defer { removing = nil }
    do {
      try await client.removeTerminal(directory: directory, id: id)
      if current?.id == id, let index = terminals.firstIndex(where: { $0.id == id }) {
        selectedID = terminals[safe: index + 1]?.id ?? terminals[safe: index - 1]?.id
      }
      terminals.removeAll { $0.id == id }
      actionError = nil
      scheduleRefresh()
    } catch {
      actionError = error.localizedDescription
    }
  }
}

extension Array {
  fileprivate subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
