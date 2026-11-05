import SwiftUI

/// The threads screen, laid out like the desktop sidebar: the brand menu on top, New thread,
/// Tasks and Apps, pinned threads, then the Projects groups or the Focus list. Settings, search
/// and the usage shortcut sit in the bottom bar, where the sidebar's foot is.
struct HomeView: View {
  let client: GatewayClient
  @Environment(ConnectionStore.self) private var connection
  @Environment(\.palette) private var palette
  @State private var model: HomeModel
  @State private var actions: ThreadActions
  @State private var search: ThreadSearchModel
  @State private var searching = false
  @State private var path = NavigationPath()
  /// `-session` opens its chat once per launch, so Back can leave it.
  @State private var openedLaunchSession = false
  @State private var sheet: Sheet?

  private enum Sheet: Identifiable {
    case newChat
    case settings(SettingsSection?)
    var id: String {
      switch self {
      case .newChat: "new"
      case .settings(let section): "settings-\(section?.rawValue ?? "")"
      }
    }
  }

  init(client: GatewayClient) {
    self.client = client
    _model = State(initialValue: HomeModel(client: client))
    _actions = State(initialValue: ThreadActions(client: client))
    _search = State(initialValue: ThreadSearchModel(client: client))
  }

  var body: some View {
    NavigationStack(path: $path) {
      content
        .background(palette.color("surface-under"))
        // The brand is the screen's identity; "Threads" names it for Back and VoiceOver.
        .navigationTitle("Threads")
        .toolbarTitleDisplayMode(.inline)
        .toolbar(removing: .title)
        .toolbar { toolbar }
        .searchable(
          text: $search.text, isPresented: $searching,
          prompt: Text("Search titles and messages…"))
        .task(id: searching ? search.text : nil) {
          guard searching else { return }
          // Typing settles for a moment before each search.
          try? await Task.sleep(for: .milliseconds(250))
          guard !Task.isCancelled else { return }
          await search.run()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { undo }
        .extrasDebugLaunch(client: client, events: connection.events)
        .navigationDestination(for: ChatRoute.self) { route in
          ChatScreen(client: client, events: connection.events, route: route) { path.append($0) }
        }
        // The desktop sidebar's Tasks and Apps pages.
        .navigationDestination(for: HomeRoute.self) { route in
          switch route {
          case .tasks:
            TasksScreen(client: client, events: connection.events) {
              path.append(ChatRoute.session($0))
            }
          case .apps:
            AppsScreen(client: client, events: connection.events) {
              path.append(ChatRoute.session($0))
            }
          }
        }
        .onAppear {
          actions.focusHandler = { [model] action, target in model.perform(action, on: target) }
          actions.onChange = { [model] _ in model.scheduleRefresh(after: .zero) }
          // A fork opens at once, as the desktop's fork dialog does.
          actions.onOpen = { id in path.append(ChatRoute.session(id)) }
          model.appear(events: connection.events)
          // A tapped notification or Live Activity opens its thread over whatever is showing.
          NotificationCenterModel.shared.onOpenSession = { id in
            sheet = nil
            path = NavigationPath([ChatRoute.session(id)])
          }
        }
        .onDisappear { model.disappear() }
        .task {
          // Tests can open a chat directly with `-session <id>`.
          if !openedLaunchSession, let id = UserDefaults.standard.string(forKey: "session") {
            openedLaunchSession = true
            path.append(ChatRoute.session(id))
          }
          if model.phase != .loaded {
            // The last session's lists first, from disk; then live snapshots replace them.
            await model.hydrate()
            await model.reload()
          }
        }
        .task(id: connection.events.live) {
          // The event stream is down: poll until it recovers.
          guard !connection.events.live else { return }
          while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            await model.refresh()
          }
        }
        .alert(
          "Could not update this thread",
          isPresented: Binding(
            get: { model.actionError != nil }, set: { if !$0 { model.actionError = nil } })
        ) {
          Button("OK", role: .cancel) {}
        } message: {
          Text(model.actionError ?? "")
        }
        .threadActionsHost(actions)
        .sheet(item: $sheet) { sheet in
          switch sheet {
          case .newChat:
            NewChatSheet(model: model) { directory in
              self.sheet = nil
              path.append(ChatRoute.new(directory: directory))
            }
          case .settings(let section):
            SettingsView(client: client, section: section)
          }
        }
    }
  }

  @ViewBuilder private var content: some View {
    if searching {
      ThreadSearchResults(model: search) { id in
        path.append(ChatRoute.session(id))
      }
    } else {
      ThreadList(
        model: model, actions: actions,
        open: { path.append(ChatRoute.session($0)) },
        newThread: { sheet = .newChat },
        newThreadIn: { path.append(ChatRoute.new(directory: $0)) },
        tasks: { path.append(HomeRoute.tasks) },
        apps: { path.append(HomeRoute.apps) }
      )
    }
  }

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .topBarLeading) {
      BrandMenu(settings: { sheet = .settings($0) })
    }
    .sharedBackgroundVisibility(.hidden)
    // The sidebar's foot: Settings and the usage shortcut, with search between them.
    ToolbarItem(placement: .bottomBar) {
      Button("Settings", systemImage: "gearshape") { sheet = .settings(nil) }
        .accessibilityIdentifier("settings")
    }
    ToolbarSpacer(.flexible, placement: .bottomBar)
    DefaultToolbarItem(kind: .search, placement: .bottomBar)
    ToolbarSpacer(.flexible, placement: .bottomBar)
    ToolbarItem(placement: .bottomBar) {
      Button("Usage limits", systemImage: "gauge.with.dots.needle.33percent") {
        sheet = .settings(.usage)
      }
      .accessibilityIdentifier("usage-limits")
    }
  }

  /// "Marked as done" with Undo, floating over the list's foot for a few seconds.
  @ViewBuilder private var undo: some View {
    if let item = model.undoDone, !searching {
      UndoNotice(undo: { model.undo() }, dismiss: { model.dismissUndo() })
        .id(item.id)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
  }
}

/// The sidebar's identity: the brand, opening a menu of settings sections.
private struct BrandMenu: View {
  let settings: (SettingsSection?) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Menu {
      // The desktop's brand menu, without the sections a phone can't use.
      Button("Appearance", systemImage: SettingsSection.appearance.systemImage) {
        settings(.appearance)
      }
      Button("Usage", systemImage: SettingsSection.usage.systemImage) { settings(.usage) }
    } label: {
      HStack(spacing: 6) {
        BrandIcon(size: 28)
        Wordmark(height: 19)
        DevelopmentBadge()
        Image(systemName: "chevron.down")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .accessibilityLabel("OpenCodex menu")
    .accessibilityIdentifier("brand-menu")
  }
}

/// "Dev" on development builds, like the desktop's `DevelopmentBadge`.
struct DevelopmentBadge: View {
  @Environment(\.palette) private var palette

  var body: some View {
    #if DEBUG
      Text("Dev")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(palette.color("on-project"))
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(palette.color("project-blue"), in: .rect(cornerRadius: 4))
    #endif
  }
}

/// The desktop's `.thread-undo`: "Marked as done" with Undo and dismiss, on Liquid Glass.
private struct UndoNotice: View {
  let undo: () -> Void
  let dismiss: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 4) {
      Text("Marked as done")
        .font(.subheadline)
        .foregroundStyle(palette.color("text-secondary"))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 16)
      Button("Undo", action: undo)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(palette.color("text"))
        .buttonStyle(.borderless)
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityIdentifier("undo-done")
      Button("Dismiss", systemImage: "xmark", action: dismiss)
        .labelStyle(.iconOnly)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(palette.color("text-secondary"))
        .buttonStyle(.borderless)
        .frame(width: 44, height: 44)
    }
    .padding(.trailing, 4)
    .glassEffect(.regular, in: .capsule)
  }
}

/// Icon and title in `text-secondary`, like `.nav-row`.
struct NavLabelStyle: LabelStyle {
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 12) {
      configuration.icon
        .frame(width: 22)
      configuration.title
    }
    .font(.body)
    .foregroundStyle(palette.color("text-secondary"))
  }
}

/// Ghost icon buttons press to `hover`.
struct IconButtonStyle: ButtonStyle {
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(
        configuration.isPressed ? palette.color("hover") : .clear,
        in: .rect(cornerRadius: 8, style: .continuous))
  }
}

/// Pages the sidebar opens besides chats, like the desktop's Tasks and Apps entries.
enum HomeRoute: Hashable {
  case tasks, apps
}
