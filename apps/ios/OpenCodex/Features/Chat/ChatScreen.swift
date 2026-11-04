import SwiftUI

/// Where the threads list navigates.
enum ChatRoute: Hashable {
  case session(String)
  /// An unsent chat in a project directory; the first message creates it.
  case new(directory: String)
}

/// One chat: the transcript (or, for an unsent draft, the new-thread hero), with pending
/// requests and the composer docked at the bottom. The toolbar matches the desktop's: the
/// project / title breadcrumb, the thread actions "…" menu and Session details.
struct ChatScreen: View {
  @State private var model: ChatModel
  @State private var projects: [SessionDetails.Project]?
  @State private var showDetails = false
  @State private var showSubagents = false
  @Environment(\.palette) private var palette
  /// The desktop's thread menu, with its rename alert, export sheet and errors on this screen.
  @State private var threadActions: ThreadActions
  /// Opens another thread, e.g. a fork just made.
  private let open: ((String) -> Void)?

  init(
    client: GatewayClient, events: EventHub, route: ChatRoute, open: ((String) -> Void)? = nil
  ) {
    _threadActions = State(initialValue: ThreadActions(client: client))
    self.open = open
    switch route {
    case .session(let id):
      _model = State(initialValue: ChatModel(client: client, events: events, sessionID: id))
    case .new(let directory):
      _model = State(initialValue: ChatModel(client: client, events: events, directory: directory))
    }
  }

  var body: some View {
    content
      .safeAreaInset(edge: .bottom, spacing: 0) { dock }
      .background(palette.color("surface"))
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { toolbar }
      .threadActionsHost(threadActions)
      .onAppear {
        threadActions.onChange = { [model] _ in model.refreshSession() }
        threadActions.onOpen = open
      }
      .sheet(isPresented: $showDetails) {
        if let id = model.sessionID {
          SessionDetailsSheet(chat: model, sessionID: id, projectName: projectName) { panel in
            guard panel == "subagents" else { return }
            showDetails = false
            showSubagents = true
          }
        }
      }
      .sheet(isPresented: $showSubagents) { SubagentsSheet(model: model) }
      // Restarts when the draft moves to another project, which makes a new model.
      .task(id: ObjectIdentifier(model)) { await model.run() }
      .task(id: model.session?.time.idle) { await model.markViewed() }
      .task { await loadProjects() }
  }

  @ViewBuilder private var content: some View {
    if model.sessionID == nil {
      NewThreadHero(model: model, projects: projects, select: moveDraft)
    } else {
      TranscriptView(model: model)
    }
  }

  /// Everything docked above the keyboard, top to bottom.
  private var dock: some View {
    VStack(spacing: 0) {
      RequestsView(model: model)
      if model.sessionID != nil {
        // Always mounted for a thread: it loads the running shells and subagents the toolbar
        // badge reads, and shows itself only while something runs.
        ActivityTray(model: model)
      }
      // A draft moved to another project gets a fresh composer for its new model.
      ComposerView(model: model)
        .id(ObjectIdentifier(model))
      if model.sessionID == nil, let directory = model.directory {
        WorkspaceBar(model: model, directory: directory, projects: projects)
          .id(directory)
      }
    }
  }

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .principal) {
      ChatTitle(project: projectName, title: title, live: model.events.live)
    }
    // Like the desktop, a thread's actions and details appear once it exists.
    if model.sessionID != nil {
      ToolbarItem(placement: .topBarTrailing) {
        Menu {
          if let target { ThreadActionsMenu(actions: threadActions, target: target) }
        } label: {
          Label("Thread actions", systemImage: "ellipsis")
        }
        .accessibilityIdentifier("chat.actions")
      }
      ToolbarItem(placement: .topBarTrailing) {
        // The desktop rail's subagents button, with its running-count badge.
        Button {
          showSubagents = true
        } label: {
          Image(systemName: ActivitySymbol.subagent)
            .overlay(alignment: .topTrailing) {
              RunningSubagentsBadge(model: model).offset(x: 8, y: -6)
            }
        }
        .accessibilityLabel("Subagents")
        .accessibilityIdentifier("chat.subagents")
      }
      ToolbarItem(placement: .topBarTrailing) {
        Button("Session details", systemImage: "info.circle") { showDetails = true }
          .accessibilityIdentifier("chat.details")
      }
    }
  }

  private var title: String { model.sessionID == nil ? "New thread" : model.title }

  private var directory: String? { model.session?.location.directory ?? model.directory }

  private var projectName: String? {
    let project =
      projects?.first { $0.id == model.session?.projectID }
      ?? projects?.first { $0.canonical == directory }
    return project?.displayName ?? directory.map { ($0 as NSString).lastPathComponent }
  }

  private func loadProjects() async {
    guard let list = try? await model.client.checkoutProjects() else { return }
    projects = list.sorted { $0.activeAt > $1.activeAt }
  }

  /// Starts the unsent chat in another project, carrying the draft along.
  private func moveDraft(to directory: String) {
    guard model.sessionID == nil, directory != model.directory else { return }
    DraftStore.shared.move(
      from: DraftStore.key(sessionID: nil, directory: model.directory),
      to: DraftStore.key(sessionID: nil, directory: directory))
    model = ChatModel(client: model.client, events: model.events, directory: directory)
  }
}

extension ChatScreen {
  /// This thread as the shared thread menu sees it.
  fileprivate var target: ThreadActionTarget? {
    guard let info = model.session else { return nil }
    let thread = ThreadSession(info)
    return ThreadActionTarget(
      id: thread.id, title: thread.title, pinned: thread.pinned != nil, done: thread.settled,
      muted: thread.muted == true, running: model.running)
  }
}
