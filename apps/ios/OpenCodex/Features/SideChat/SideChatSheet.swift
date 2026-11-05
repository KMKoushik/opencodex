import SwiftUI

/// The desktop's Side chat panel (`side-chat-panel.tsx`) as a sheet over the main chat: the
/// main chat's side chats as "Side chat N" tabs (a menu in the title), New side chat, and
/// Delete side chat. A side chat is a guarded fork of the main chat; its inherited history
/// stays hidden, so it reads as a fresh chat.
struct SideChatSheet: View {
  @State private var list: SideChatList
  @State private var confirmDelete: SessionInfo?
  /// Opens tall: a chat needs room for its transcript and the keyboard.
  @State private var detent: PresentationDetent = .large
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss

  init(client: GatewayClient, events: EventHub, mainID: String) {
    _list = State(initialValue: SideChatList(client: client, events: events, mainID: mainID))
  }

  var body: some View {
    NavigationStack {
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.color("surface").ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .alert(
          "Delete side chat?", isPresented: deleteAlert, presenting: confirmDelete
        ) { session in
          Button("Cancel", role: .cancel) { list.deleteError = nil }
          Button(list.deleting ? "Deleting…" : "Delete", role: .destructive) {
            Task {
              if await list.delete(session) { confirmDelete = nil }
            }
          }
        } message: { _ in
          Text(
            list.deleteError
              ?? "This deletes the side chat and its messages. The main chat isn’t affected.")
        }
    }
    .tint(palette.color("text"))
    .presentationDetents([.medium, .large], selection: $detent)
    .presentationDragIndicator(.visible)
    .presentationBackground(palette.color("surface"))
    .task { await list.run() }
  }

  private var deleteAlert: Binding<Bool> {
    Binding { confirmDelete != nil } set: { if !$0 { confirmDelete = nil } }
  }

  @ViewBuilder private var content: some View {
    if let selected = list.selected {
      SideChatView(list: list, session: selected)
        .id(selected.id)
    } else if list.creating {
      PanelLoading("Starting a side chat…")
    } else if let error = list.createError ?? list.listError {
      PanelUnavailable(
        "Couldn’t open side chats", systemImage: "exclamationmark.triangle", message: error,
        tone: "error"
      ) {
        Button("Retry") {
          list.createError = nil
          Task { await list.load() }
        }
        .buttonStyle(SideChatSecondaryButton())
      }
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("sidechat.error")
    } else if list.sessions != nil {
      empty
    } else {
      PanelLoading("Loading side chats…")
    }
  }

  /// The panel's empty state.
  private var empty: some View {
    PanelUnavailable(
      "Ask on the side", systemImage: "questionmark.bubble",
      message:
        "A side chat starts from this chat’s history, so you can ask questions or explore without interrupting the main chat."
    ) {
      Button("New side chat") { Task { await list.create() } }
        .buttonStyle(SideChatSecondaryButton())
        .accessibilityIdentifier("sidechat.new.empty")
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("sidechat.empty")
  }

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .topBarLeading) {
      Button("Close", systemImage: "xmark") { dismiss() }
        .accessibilityIdentifier("sidechat.close")
    }
    ToolbarItem(placement: .principal) { tabs }
    ToolbarItem(placement: .topBarTrailing) {
      Button("New side chat", systemImage: "plus") { Task { await list.create() } }
        .disabled(list.creating || list.full || list.sessions == nil)
        .accessibilityHint(
          list.full ? "Delete a side chat to start another (up to \(maxSideChats))" : "")
        .accessibilityIdentifier("sidechat.new")
    }
    if let selected = list.selected {
      ToolbarItem(placement: .topBarTrailing) {
        Button("Delete side chat", systemImage: "trash") { confirmDelete = selected }
          .accessibilityIdentifier("sidechat.delete")
      }
    }
  }

  /// The desktop's tab strip, as a title menu: one entry per side chat, with a dot while it
  /// responds.
  @ViewBuilder private var tabs: some View {
    let sessions = list.sessions ?? []
    if let selected = list.selected {
      Menu {
        Picker("Side chats", selection: selection) {
          ForEach(Array(sessions.enumerated()), id: \.element.id) { index, session in
            Label(
              "Side chat \(index + 1)",
              systemImage: list.running.contains(session.id) ? "circle.fill" : "questionmark.bubble"
            )
            .tag(session.id)
          }
        }
      } label: {
        HStack(spacing: 6) {
          Image(systemName: "questionmark.bubble")
            .font(.footnote)
            .foregroundStyle(palette.color("text-secondary"))
          Text("Side chat \(list.index(of: selected))")
            .font(.headline)
            .foregroundStyle(palette.color("text"))
          if list.running.contains(selected.id) {
            ProgressView().controlSize(.mini)
              .accessibilityLabel("Responding")
          }
          if sessions.count > 1 {
            Image(systemName: "chevron.down")
              .font(.caption2.weight(.semibold))
              .foregroundStyle(palette.color("text-tertiary"))
          }
        }
      }
      .disabled(sessions.count < 2)
      .accessibilityIdentifier("sidechat.tabs")
    } else {
      Text("Side chat")
        .font(.headline)
        .foregroundStyle(palette.color("text"))
    }
  }

  private var selection: Binding<String> {
    Binding { list.selected?.id ?? "" } set: { list.selectedID = $0 }
  }
}

struct SideChatSecondaryButton: ButtonStyle {
  @Environment(\.palette) private var palette
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.subheadline.weight(.medium))
      .foregroundStyle(palette.color("text"))
      .padding(.horizontal, 14)
      .frame(minHeight: 36)
      .background(
        palette.color(configuration.isPressed ? "secondary-hover" : "secondary"), in: .capsule)
  }
}

/// One side chat (`side-chat-view.tsx`): the intro while it's empty, else its own turns, with
/// the main chat's status above its composer.
private struct SideChatView: View {
  let list: SideChatList
  @State private var model: ChatModel
  @State private var main: MainChatWatcher
  @State private var plugin: PluginStatus?
  @Environment(\.palette) private var palette

  init(list: SideChatList, session: SessionInfo) {
    self.list = list
    _model = State(
      initialValue: ChatModel(client: list.client, events: list.events, sessionID: session.id))
    _main = State(
      initialValue: MainChatWatcher(client: list.client, events: list.events, mainID: list.mainID))
  }

  var body: some View {
    Group {
      if empty {
        intro
      } else {
        TranscriptView(model: model)
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) { dock }
    // Side composers start no threads of their own.
    .environment(\.composerNavigation, ComposerNavigation())
    .task { await model.run() }
    .task { await main.run() }
    .task(id: model.session?.location.directory) {
      guard let directory = model.session?.location.directory else { return }
      plugin = try? await list.client.sideChatPlugin(directory: directory)
    }
  }

  /// No turns of its own yet. The forked history is hidden (see the integration note), so this
  /// reads only this chat's messages.
  private var empty: Bool {
    model.loaded && model.session != nil && model.messages.isEmpty && model.inbox.isEmpty
      && !model.running && model.permissions.isEmpty && !model.undone && model.error == nil
  }

  private var intro: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Text("Side chat")
          .font(.subheadline.weight(.medium))
          .foregroundStyle(palette.color("text"))
        Text(
          "It knows the main chat up to \(since). Questions here don’t interrupt the main chat. Edits ask for approval first."
        )
        .foregroundStyle(palette.color("text-secondary"))
        if let plugin, plugin.state != .active, plugin.state != .unavailable {
          Text(
            "To let side chats check the main chat’s latest progress, install the live context plugin in Settings → General on your computer."
          )
          .font(.footnote)
          .foregroundStyle(palette.color("text-tertiary"))
        }
      }
      .font(.subheadline)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 20)
      .padding(.vertical, 24)
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("sidechat.intro")
  }

  private var since: String {
    model.session.map { $0.time.created.date.formatted(date: .omitted, time: .shortened) } ?? "now"
  }

  private var dock: some View {
    VStack(spacing: 0) {
      RequestsView(model: model)
      MainChatStatusLine(main: main)
        .padding(.horizontal, 24)
        .padding(.top, 6)
        .padding(.bottom, 2)
      ComposerView(model: model)
    }
  }
}

/// "Main chat is idle", with the desktop's colored dot.
private struct MainChatStatusLine: View {
  let main: MainChatWatcher
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(palette.color(dot))
        .frame(width: 6, height: 6)
      Text(main.label)
        .font(.caption)
        .foregroundStyle(palette.color(main.state == .attention ? "warning" : "text-tertiary"))
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("sidechat.main-status")
  }

  private var dot: String {
    switch main.state {
    case .running: "accent"
    case .attention: "warning"
    case .failed: "error"
    case .idle: "text-tertiary"
    }
  }
}
