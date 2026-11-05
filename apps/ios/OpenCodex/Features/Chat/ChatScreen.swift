import SwiftUI

/// Where the threads list navigates.
enum ChatRoute: Hashable {
  case session(String)
  /// An unsent chat in a project directory; the first message creates it.
  case new(directory: String)
}

/// One chat: the transcript (or, for an unsent draft, the new-thread hero), with pending
/// requests and the composer docked at the bottom. Like OpenCode's iPhone app, the toolbar has
/// a title pill and a "…" button; both open the thread sheet with the desktop's thread actions
/// and side panels.
struct ChatScreen: View {
  @State private var model: ChatModel
  @State private var projects: [SessionDetails.Project]?
  @State private var showSheet = false
  /// What to do once the thread sheet has closed.
  @State private var sheetExit: ThreadSheetExit?
  @State private var showDetails = false
  @State private var showSubagents = false
  @State private var showTerminal = false
  @State private var showSideChat = false
  /// The open workspace panel, on Files or Changes.
  @State private var workspace: WorkspaceModel.Segment?
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss
  /// The desktop's thread actions, for the thread sheet, which hosts their alerts and exports.
  @State private var threadActions: ThreadActions
  /// Opens another thread, e.g. a fork just made.
  private let open: ((ChatRoute) -> Void)?

  init(
    client: GatewayClient, events: EventHub, route: ChatRoute, open: ((ChatRoute) -> Void)? = nil
  ) {
    _threadActions = State(initialValue: ThreadActions(client: client))
    self.open = open
    switch route {
    case .session(let id):
      // A thread opened in the last few minutes comes back with its transcript.
      _model = State(
        initialValue: ChatModelStore.shared.model(client: client, events: events, sessionID: id))
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
      .onAppear {
        threadActions.onChange = { [model] _ in model.refreshSession() }
        // A fork opens once the sheet has closed.
        threadActions.onOpen = { id in leaveSheet(.open(id)) }
      }
      .sheet(isPresented: $showSheet, onDismiss: afterSheet) {
        if let target {
          ThreadSheet(
            chat: model, actions: threadActions, target: target, projectName: projectName,
            directory: directory, leave: leaveSheet)
        }
      }
      .sheet(isPresented: $showDetails) {
        if let id = model.sessionID {
          SessionDetailsSheet(chat: model, sessionID: id, projectName: projectName) { panel in
            showDetails = false
            if panel == "subagents" { showSubagents = true }
            if panel == "changes" { workspace = .changes }
          }
        }
      }
      .sheet(isPresented: $showSubagents) { SubagentsSheet(model: model) }
      .sheet(isPresented: $showSideChat) {
        if let id = model.sessionID {
          SideChatSheet(client: model.client, events: model.events, mainID: id)
        }
      }
      .fullScreenCover(isPresented: $showTerminal) {
        if let directory {
          TerminalScreen(client: model.client, events: model.events, directory: directory)
        }
      }
      .fullScreenCover(item: $workspace) { segment in
        if let directory {
          WorkspaceView(
            client: model.client, events: model.events, directory: directory, segment: segment)
        }
      }
      // `/new` and forks from the composer open threads, like the desktop.
      .environment(
        \.composerNavigation,
        ComposerNavigation(
          newThread: directory.map { directory in { open?(.new(directory: directory)) } },
          openSession: { id in open?(.session(id)) }))
      // Restarts when the draft moves to another project, which makes a new model.
      .task(id: ObjectIdentifier(model)) { await model.run() }
      .task(id: model.session?.time.idle) { await model.markViewed() }
      .task(id: model.session?.id) { await clearOpeningUnread() }
      .task { await loadProjects() }
      // The chat on screen raises no notifications of its own.
      .onChange(of: model.sessionID, initial: true) { _, id in
        NotificationCenterModel.shared.visibleSessionID = id
      }
      .onDisappear {
        ChatModelStore.shared.release(model)
        if NotificationCenterModel.shared.visibleSessionID == model.sessionID {
          NotificationCenterModel.shared.visibleSessionID = nil
        }
      }
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

  /// Like OpenCode's iPhone app: a title pill and one "…" button, which both open the thread
  /// sheet. The "…" shows the running subagent count, like the desktop's rail.
  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .principal) {
      if model.sessionID != nil {
        Button { showSheet = true } label: {
          ChatTitle(project: projectName, title: title, live: model.events.live, running: model.running)
            .padding(.horizontal, 6)
        }
        .accessibilityHint("Shows thread actions and details.")
        .accessibilityIdentifier("chat.details")
      } else {
        ChatTitle(project: projectName, title: title, live: model.events.live)
      }
    }
    // Like the desktop, a thread's actions and details appear once it exists.
    if model.sessionID != nil {
      ToolbarItem(placement: .topBarTrailing) {
        Button { showSheet = true } label: {
          Image(systemName: "ellipsis")
            .frame(width: 30, height: 30)
            .overlay(alignment: .topTrailing) {
              RunningSubagentsBadge(model: model).offset(x: 10, y: -8)
            }
        }
        .disabled(target == nil)
        .accessibilityLabel(model.running ? "Thread menu, working" : "Thread menu")
        .accessibilityIdentifier("chat.actions")
      }
    }
  }

  private func leaveSheet(_ exit: ThreadSheetExit) {
    sheetExit = exit
    // A fork can finish after the sheet was swiped away.
    if showSheet { showSheet = false } else { afterSheet() }
  }

  /// Opens what the sheet asked for once it's gone, so presentations never overlap.
  private func afterSheet() {
    guard let exit = sheetExit else { return }
    sheetExit = nil
    switch exit {
    case .panel(.workspace): workspace = .files
    case .panel(.subagents): showSubagents = true
    case .panel(.sideChat): showSideChat = true
    case .panel(.terminal): showTerminal = true
    case .panel(.details): showDetails = true
    case .open(let id): open?(.session(id))
    case .deleted: dismiss()
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
  /// Like the desktop's `SessionUnread`: opening a thread clears a manual unread mark, but only
  /// the one present when it opened, never one set while reading.
  fileprivate func clearOpeningUnread() async {
    guard let id = model.sessionID,
      let marker = model.session?.metadata?["opencodexUnread"]?.string, !marker.isEmpty
    else { return }
    do {
      try await model.client.clearUnread(id, marker: marker)
      model.refreshSession()
    } catch {}
  }

  /// This thread as the shared thread menu sees it.
  fileprivate var target: ThreadActionTarget? {
    guard let info = model.session else { return nil }
    let thread = ThreadSession(info)
    return ThreadActionTarget(
      id: thread.id, title: thread.title, pinned: thread.pinned != nil, done: thread.settled,
      muted: thread.muted == true, running: model.running)
  }
}
