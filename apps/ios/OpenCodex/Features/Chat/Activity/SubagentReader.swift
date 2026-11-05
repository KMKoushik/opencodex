import SwiftUI

/// A subagent's conversation, read-only: the transcript and its pending approvals and
/// questions, with no composer. Port of the desktop `subagent-session.tsx`.
struct SubagentReader: View {
  @State private var chat: ChatModel
  @State private var info: SubagentSession?
  @Environment(\.palette) private var palette

  init(client: GatewayClient, events: EventHub, sessionID: String) {
    _chat = State(initialValue: ChatModel(client: client, events: events, sessionID: sessionID))
  }

  var body: some View {
    TranscriptView(model: chat)
      .safeAreaInset(edge: .bottom, spacing: 0) {
        VStack(spacing: 0) {
          RequestsView(model: chat)
          footer
        }
      }
      .background(palette.color("surface"))
      .navigationTitle(info?.title ?? chat.session?.title ?? "Subagent session")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) { header }
        if chat.running {
          ToolbarItem(placement: .topBarTrailing) {
            SessionActivity()
              .accessibilityLabel("Responding")
          }
        }
      }
      .task { await chat.run() }
      // The outcome changes when a run ends; `session.get` is the only source of it.
      .task(id: chat.running) { await loadInfo() }
  }

  private var header: some View {
    VStack(spacing: 2) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(palette.color("text"))
        .lineLimit(1)
      if let model = info?.model ?? chat.session?.model {
        SubagentModel(directory: directory, model: model, client: chat.client)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("subagent.header")
  }

  private var title: String {
    let title = info?.title ?? chat.session?.title
    if let title, !title.isEmpty { return title }
    return "Subagent session"
  }

  private var directory: String? { chat.session?.location.directory ?? info?.location?.directory }

  @ViewBuilder private var footer: some View {
    let failed = !chat.running && info?.outcome == "failed"
    if failed || !status.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        if failed {
          Text("This subagent run failed.")
            .foregroundStyle(palette.color("error"))
        }
        if !status.isEmpty {
          Text(status)
            .foregroundStyle(palette.color("text-tertiary"))
            .accessibilityIdentifier("subagent.status")
        }
      }
      .font(.footnote)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 20)
      .padding(.vertical, 10)
      .background(palette.color("surface"))
    }
  }

  private var status: String {
    if !chat.permissions.isEmpty { return "Waiting for permission" }
    if !chat.forms.isEmpty { return "Waiting for an answer" }
    if chat.running || !chat.loaded { return "" }
    if !chat.inbox.isEmpty { return "Waiting to run…" }
    switch info?.outcome {
    case "interrupted": return "Stopped"
    case "succeeded": return "Completed"
    default: return info == nil ? "" : "Idle"
    }
  }

  private func loadInfo() async {
    guard let id = chat.sessionID else { return }
    if let fresh = try? await chat.client.subagent(id) { info = fresh }
  }
}

/// The child's model name, from the project's catalog when it's loaded.
private struct SubagentModel: View {
  let directory: String?
  let model: ModelRef
  let client: GatewayClient
  @Environment(\.palette) private var palette

  var body: some View {
    let catalog = directory.flatMap { ModelCatalogStore.shared.entries[$0]?.catalog }
    let name = catalog?.data.first { $0.id == model.id && $0.providerID == model.providerID }?.name
    Text(name ?? model.id)
      .font(.caption)
      .foregroundStyle(palette.color("text-tertiary"))
      .lineLimit(1)
      .accessibilityLabel("Model: \(name ?? model.id)")
      .task(id: directory) {
        if let directory { await ModelCatalogStore.shared.load(client, directory: directory) }
      }
  }
}
