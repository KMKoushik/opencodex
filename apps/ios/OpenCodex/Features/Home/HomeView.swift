import SwiftUI

/// The threads screen, laid out like the desktop sidebar: the brand with search, New thread,
/// pinned threads, then the Projects groups or the Focus list, and Settings at the foot.
struct HomeView: View {
  let client: GatewayClient
  @Environment(ConnectionStore.self) private var connection
  @Environment(\.palette) private var palette
  @State private var model: HomeModel
  @State private var actions: ThreadActions
  @State private var path = NavigationPath()
  /// `-session` opens its chat once per launch, so Back can leave it.
  @State private var openedLaunchSession = false
  @State private var sheet: Sheet?

  private enum Sheet: Identifiable {
    case newChat, search
    case settings(SettingsSection?)
    var id: String {
      switch self {
      case .newChat: "new"
      case .search: "search"
      case .settings(let section): "settings-\(section?.rawValue ?? "")"
      }
    }
  }

  init(client: GatewayClient) {
    self.client = client
    _model = State(initialValue: HomeModel(client: client))
    _actions = State(initialValue: ThreadActions(client: client))
  }

  var body: some View {
    NavigationStack(path: $path) {
      ThreadList(
        model: model, actions: actions,
        open: { path.append(ChatRoute.session($0)) },
        newThread: { sheet = .newChat },
        newThreadIn: { path.append(ChatRoute.new(directory: $0)) },
        tasks: { path.append(HomeRoute.tasks) },
        apps: { path.append(HomeRoute.apps) }
      )
      .safeAreaInset(edge: .top, spacing: 0) {
        HomeHeader(
          search: { sheet = .search },
          settings: { sheet = .settings($0) })
      }
      .safeAreaInset(edge: .bottom, spacing: 0) { footer }
      .background(palette.color("surface-under"))
      .toolbar(.hidden, for: .navigationBar)
      .navigationTitle("Threads")
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
        if model.phase != .loaded { await model.reload() }
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
        case .search:
          ThreadSearchSheet(client: client) { id in
            self.sheet = nil
            path.append(ChatRoute.session(id))
          }
        case .settings(let section):
          SettingsView(client: client, section: section)
        }
      }
    }
  }

  /// The undo notice above the sidebar footer: Settings, and the usage shortcut.
  private var footer: some View {
    VStack(spacing: 6) {
      if let item = model.undoDone {
        UndoNotice(undo: { model.undo() }, dismiss: { model.dismissUndo() })
          .id(item.id)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
      HStack(spacing: 2) {
        Button {
          sheet = .settings(nil)
        } label: {
          Label("Settings", systemImage: "gearshape")
            .labelStyle(NavLabelStyle())
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(NavRowStyle())
        .accessibilityIdentifier("settings")
        Button {
          sheet = .settings(.usage)
        } label: {
          Image(systemName: "gauge.with.dots.needle.33percent")
            .font(.body)
            .foregroundStyle(palette.color("text-secondary"))
            .frame(width: 44, height: 44)
            .contentShape(.rect)
        }
        .buttonStyle(IconButtonStyle())
        .accessibilityLabel("Usage limits")
      }
    }
    .padding(.horizontal, 12)
    .padding(.top, 6)
    .background(palette.color("surface-under"))
    .animation(.default, value: model.undoDone?.id)
  }
}

/// The sidebar's identity row: the brand (a menu of settings sections) and search.
private struct HomeHeader: View {
  let search: () -> Void
  let settings: (SettingsSection?) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 4) {
      Menu {
        // The desktop's brand menu, without the sections a phone can't use.
        Button("Appearance") { settings(.appearance) }
        Button("Usage") { settings(.usage) }
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
      Spacer(minLength: 0)
      Button(action: search) {
        Image(systemName: "magnifyingglass")
          .font(.body)
          .foregroundStyle(palette.color("text-secondary"))
          .frame(width: 44, height: 44)
          .contentShape(.rect)
      }
      .buttonStyle(IconButtonStyle())
      .accessibilityLabel("Search threads")
      .accessibilityIdentifier("search-threads")
    }
    .padding(.leading, 20)
    .padding(.trailing, 12)
    .padding(.bottom, 4)
    .background(palette.color("surface-under"))
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

/// The desktop's `.thread-undo`: "Marked as done" with Undo and dismiss.
private struct UndoNotice: View {
  let undo: () -> Void
  let dismiss: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 2) {
      Text("Marked as done")
        .font(.subheadline)
        .foregroundStyle(palette.color("text-secondary"))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 12)
      Button("Undo", action: undo)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(palette.color("text"))
        .padding(.horizontal, 12)
        .frame(minHeight: 40)
        .buttonStyle(IconButtonStyle())
      Button(action: dismiss) {
        Image(systemName: "xmark")
          .font(.caption.weight(.semibold))
          .foregroundStyle(palette.color("text-secondary"))
          .frame(width: 40, height: 40)
          .contentShape(.rect)
      }
      .buttonStyle(IconButtonStyle())
      .accessibilityLabel("Dismiss")
    }
    .background(palette.color("elevated"), in: .rect(cornerRadius: 10, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .strokeBorder(palette.color("border"))
    }
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
