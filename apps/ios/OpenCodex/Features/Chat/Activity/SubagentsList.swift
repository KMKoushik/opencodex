import Observation
import SwiftUI

/// Every subagent a chat delegated to, oldest first, page by page. Port of the desktop
/// `subagents-query.ts`: refreshed on its children's events and after reconnecting.
@Observable
final class SubagentListModel {
  let chat: ChatModel
  private(set) var items: [SubagentSession] = []
  private(set) var loaded = false
  private(set) var loadingMore = false
  private(set) var error: String?
  private(set) var hasMore = false

  @ObservationIgnored private var pages = 1
  @ObservationIgnored private var next: String?
  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var refreshTask: Task<Void, Never>?

  init(chat: ChatModel) { self.chat = chat }

  func run() async {
    subscriptions = [
      chat.events.subscribe { [weak self] event in self?.handle(event) },
      chat.events.onReconnect { [weak self] in self?.schedule() },
    ]
    defer {
      subscriptions = []
      refreshTask?.cancel()
    }
    await reload()
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(5))
      if !chat.events.live { await reload() }
    }
  }

  func loadMore() async {
    guard let id = chat.sessionID, let cursor = next, !loadingMore else { return }
    loadingMore = true
    defer { loadingMore = false }
    do {
      let page = try await chat.client.subagents(id, cursor: cursor)
      let known = Set(items.map(\.id))
      items += page.data.filter { !known.contains($0.id) }
      next = page.cursor?.next
      hasMore = next != nil
      pages += 1
      error = nil
    } catch {
      self.error = (error as? GatewayError)?.message ?? error.localizedDescription
    }
  }

  func retry() { schedule() }

  private func handle(_ event: GatewayEvent) {
    guard let id = chat.sessionID, !event.type.hasSuffix(".delta") else { return }
    if event.type == "session.created", event.data?["parentID"]?.string == id {
      schedule()
    } else if event.type.hasPrefix("session.execution.") || event.type == "session.renamed"
      || event.type == "session.deleted"
    {
      if let child = event.sessionID, items.contains(where: { $0.id == child }) { schedule() }
    }
  }

  private func schedule() {
    guard refreshTask == nil else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      guard let self, !Task.isCancelled else { return }
      self.refreshTask = nil
      await self.reload()
    }
  }

  /// Rereads every loaded page, like an infinite Query refetch.
  private func reload() async {
    guard let id = chat.sessionID else {
      loaded = true
      return
    }
    do {
      var fresh: [SubagentSession] = []
      var seen = Set<String>()
      var cursor: String?
      var count = 0
      repeat {
        let page = try await chat.client.subagents(id, cursor: cursor)
        for session in page.data where seen.insert(session.id).inserted { fresh.append(session) }
        cursor = page.cursor?.next
        count += 1
      } while cursor != nil && count < pages
      if fresh != items { items = fresh }
      next = cursor
      hasMore = cursor != nil
      error = nil
    } catch {
      self.error = (error as? GatewayError)?.message ?? error.localizedDescription
    }
    loaded = true
  }
}

/// The chat's subagents with their outcomes; selecting one opens it read-only. Port of the
/// desktop `subagents-panel.tsx`. Use inside a `NavigationStack`, or `SubagentsSheet`.
struct SubagentsList: View {
  let model: ChatModel
  @State private var list: SubagentListModel
  @Environment(\.palette) private var palette

  init(model: ChatModel) {
    self.model = model
    _list = State(initialValue: SubagentListModel(chat: model))
  }

  private var running: Set<String> { Set(ActivityModel.shared(for: model).subagents.map(\.id)) }

  var body: some View {
    List {
      Section {
        if let error = list.error {
          HStack {
            Text(error).foregroundStyle(palette.color("error"))
            Spacer()
            Button("Retry") { list.retry() }
              .foregroundStyle(palette.color("text-secondary"))
          }
          .font(.footnote)
        }
        if !list.loaded {
          Text("Loading subagents…")
            .font(.footnote)
            .foregroundStyle(palette.color("text-tertiary"))
          }
        let running = running
        ForEach(list.items) { item in
          NavigationLink(value: SubagentRoute(id: item.id)) {
            SubagentListRow(item: item, running: running.contains(item.id))
          }
          .accessibilityIdentifier("subagents.row")
        }
        if list.hasMore {
          Button(list.loadingMore ? "Loading…" : "Load more subagents") {
            Task { await list.loadMore() }
          }
          .disabled(list.loadingMore)
          .font(.footnote.weight(.medium))
          .foregroundStyle(palette.color("text-secondary"))
          .frame(maxWidth: .infinity, minHeight: 44)
        }
      } header: {
        HStack {
          Text("Delegated sessions")
          Spacer()
          Text("\(list.items.count)\(list.hasMore ? "+" : "")")
            .foregroundStyle(palette.color("text-tertiary"))
            .monospacedDigit()
        }
        .foregroundStyle(palette.color("text-secondary"))
        .textCase(nil)
      }
    }
    // Like the thread sheet: a stock inset-grouped list, so the sheet keeps its Liquid Glass.
    .listStyle(.insetGrouped)
    .tint(palette.color("accent"))
    .overlay {
      if list.loaded, list.error == nil, list.items.isEmpty {
        VStack(spacing: 8) {
          RobotIcon(size: 28)
            .foregroundStyle(palette.color("text-tertiary"))
          Text("No subagents yet")
            .font(.headline)
            .foregroundStyle(palette.color("text"))
          Text("Delegated sessions will appear here as the agent starts them.")
            .font(.footnote)
            .foregroundStyle(palette.color("text-secondary"))
            .multilineTextAlignment(.center)
        }
        .padding(32)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("subagents.empty")
      }
    }
    .navigationTitle("Subagents")
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(for: SubagentRoute.self) { route in
      SubagentReader(client: model.client, events: model.events, sessionID: route.id)
    }
    .task(id: model.sessionID) { await list.run() }
  }
}

/// Where the subagents list navigates.
struct SubagentRoute: Hashable { let id: String }

private struct SubagentListRow: View {
  let item: SubagentSession
  let running: Bool
  @Environment(\.palette) private var palette

  private var status: (text: String, color: String) {
    if running { return ("Working", "text-secondary") }
    switch item.outcome {
    case "succeeded": return ("Completed", "text-tertiary")
    case "failed": return ("Failed", "error")
    case "interrupted": return ("Stopped", "text-tertiary")
    default: return ("Idle", "text-tertiary")
    }
  }

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      RobotIcon(size: 16)
        .foregroundStyle(palette.color("accent-text"))
        .frame(width: 28, height: 28)
        .background(palette.color("accent-soft"), in: .circle)
      VStack(alignment: .leading, spacing: 2) {
        Text(item.title.flatMap { $0.isEmpty ? nil : $0 } ?? "Untitled subagent")
          .font(.body)
          .foregroundStyle(palette.color("text"))
          .lineLimit(1)
        HStack(spacing: 6) {
          Text(item.agent ?? "Subagent").lineLimit(1)
          Text("·").accessibilityHidden(true)
          Text(status.text)
            .foregroundStyle(palette.color(status.color))
            .fixedSize()
        }
        .font(.caption)
        .foregroundStyle(palette.color("text-tertiary"))
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.vertical, 4)
    .accessibilityElement(children: .combine)
  }
}

/// The subagents list in its own sheet, with a Close button, for a toolbar button.
struct SubagentsSheet: View {
  let model: ChatModel
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      SubagentsList(model: model)
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            Button("Close", systemImage: "xmark") { dismiss() }
              .accessibilityIdentifier("subagents.close")
          }
        }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }
}

/// The running-subagent count for a toolbar button, hidden at zero; "!" when it can't be
/// checked. Port of the desktop `running-subagents-badge.tsx`.
struct RunningSubagentsBadge: View {
  let model: ChatModel
  @Environment(\.palette) private var palette

  var body: some View {
    let activity = ActivityModel.shared(for: model)
    let count = activity.subagents.count
    if activity.subagentStatus == .failed {
      badge("!", background: "surface", foreground: "error")
        .accessibilityLabel("Could not load running subagent count")
    } else if activity.subagentStatus == .loaded, count > 0 {
      badge(count > 99 ? "99+" : "\(count)", background: "accent", foreground: "on-accent")
        .accessibilityLabel("\(count) \(count == 1 ? "subagent" : "subagents") running")
    }
  }

  private func badge(_ text: String, background: String, foreground: String) -> some View {
    Text(text)
      .font(.system(size: 10, weight: .semibold).monospacedDigit())
      .foregroundStyle(palette.color(foreground))
      .padding(.horizontal, 3)
      .frame(minWidth: 15, minHeight: 15)
      .background(palette.color(background), in: .capsule)
      .overlay { Capsule().strokeBorder(palette.color("surface"), lineWidth: 1) }
      .accessibilityIdentifier("subagents.badge")
  }
}
