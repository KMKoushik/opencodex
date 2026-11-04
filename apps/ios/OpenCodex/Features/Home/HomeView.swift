import SwiftUI

/// The threads screen: every project's root threads, pinned ones on top, with search, a
/// project filter, swipe actions for Pin and Done, and live status.
struct HomeView: View {
  let client: GatewayClient
  @Environment(ConnectionStore.self) private var connection
  @State private var model: HomeModel
  @State private var path: [ChatRoute] = []
  /// `-session` opens its chat once per launch, so Back can leave it.
  @State private var openedLaunchSession = false
  @State private var sheet: Sheet?

  private enum Sheet: String, Identifiable {
    case newChat, settings
    var id: String { rawValue }
  }

  init(client: GatewayClient) {
    self.client = client
    _model = State(initialValue: HomeModel(client: client))
  }

  var body: some View {
    NavigationStack(path: $path) {
      ThreadList(model: model, newChat: { sheet = .newChat })
        .navigationTitle("Threads")
        .navigationSubtitle(model.filterName ?? "")
        .searchable(text: $model.searchText, prompt: "Search threads")
        .toolbar { toolbar }
        .navigationDestination(for: ChatRoute.self) { route in
          ChatScreen(client: client, events: connection.events, route: route)
        }
        .onAppear { model.appear(events: connection.events) }
        .onDisappear { model.disappear() }
        .task {
          // Tests can open a chat directly with `-session <id>`.
          if !openedLaunchSession, let id = UserDefaults.standard.string(forKey: "session") {
            openedLaunchSession = true
            path = [.session(id)]
          }
          await model.reload()
        }
        .task(id: model.searchText) {
          try? await Task.sleep(for: .milliseconds(250))
          guard !Task.isCancelled else { return }
          await model.applySearch()
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
          "Couldn’t update the thread",
          isPresented: Binding(
            get: { model.actionError != nil }, set: { if !$0 { model.actionError = nil } })
        ) {
          Button("OK", role: .cancel) {}
        } message: {
          Text(model.actionError ?? "")
        }
        .sheet(item: $sheet) { sheet in
          switch sheet {
          case .newChat:
            NewChatSheet(model: model) { directory in
              self.sheet = nil
              path.append(.new(directory: directory))
            }
          case .settings:
            SettingsView(client: client)
          }
        }
    }
  }

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .topBarLeading) {
      Button("Settings", systemImage: "gearshape") { sheet = .settings }
    }
    ToolbarItem(placement: .topBarTrailing) {
      ProjectFilterMenu(model: model)
    }
    DefaultToolbarItem(kind: .search, placement: .bottomBar)
    ToolbarSpacer(.flexible, placement: .bottomBar)
    ToolbarItem(placement: .bottomBar) {
      Button("New Chat", systemImage: "square.and.pencil") { sheet = .newChat }
        .accessibilityIdentifier("new-chat")
    }
  }
}

/// All projects, or one project's threads.
private struct ProjectFilterMenu: View {
  let model: HomeModel

  var body: some View {
    Menu {
      Picker(
        "Project",
        selection: Binding(
          get: { model.filter },
          set: { directory in Task { await model.setFilter(directory) } })
      ) {
        Label("All Projects", systemImage: "square.stack").tag(String?.none)
        Section {
          ForEach(model.projects) { project in
            Label(project.displayName, systemImage: "folder").tag(Optional(project.canonical))
          }
        }
      }
    } label: {
      Label(
        "Filter by project",
        systemImage: model.filter == nil
          ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
    }
    .accessibilityIdentifier("project-filter")
  }
}

/// The list itself, kept apart so search typing and sheets don't re-render rows.
private struct ThreadList: View {
  let model: HomeModel
  let newChat: () -> Void

  var body: some View {
    TimelineView(.everyMinute) { context in
      List {
        if let error = model.refreshError {
          Section {
            Label {
              VStack(alignment: .leading, spacing: 4) {
                Text("Couldn’t refresh").font(.subheadline.weight(.semibold))
                Text(error).font(.footnote).foregroundStyle(.secondary)
              }
            } icon: {
              Image(systemName: "exclamationmark.triangle").foregroundStyle(.orange)
            }
            Button("Retry") { Task { await model.refresh() } }
          }
        }
        if let notice = model.searchNotice {
          Section {
            Label(notice, systemImage: "info.circle")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        if !model.pinned.isEmpty {
          Section("Pinned") {
            ForEach(model.pinned) { item in
              row(item, now: context.date)
            }
          }
        }
        Section {
          ForEach(model.threads) { item in
            row(item, now: context.date)
          }
          if model.hasMore { more }
        } header: {
          if !model.pinned.isEmpty, !model.threads.isEmpty { Text("Threads") }
        }
      }
      .listStyle(.insetGrouped)
    }
    .refreshable { await model.reload() }
    .overlay { overlay }
    .safeAreaInset(edge: .bottom) {
      if let item = model.undoDone {
        UndoBanner(title: item.title) { model.undo() }
          .padding(.bottom, 8)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .animation(.default, value: model.undoDone?.id)
  }

  private func row(_ item: ThreadItem, now: Date) -> some View {
    NavigationLink(value: ChatRoute.session(item.id)) {
      ThreadRow(item: item, now: now)
    }
    .accessibilityIdentifier("thread-\(item.id)")
    .swipeActions(edge: .leading) {
      pinButton(item).tint(.orange)
    }
    .swipeActions(edge: .trailing) {
      doneButton(item)
    }
    .contextMenu {
      pinButton(item)
      doneButton(item)
    }
  }

  @ViewBuilder private func pinButton(_ item: ThreadItem) -> some View {
    if item.pinned {
      Button("Unpin", systemImage: "pin.slash") { model.perform(.unpin, on: item) }
    } else {
      Button("Pin", systemImage: "pin") { model.perform(.pin, on: item) }
    }
  }

  @ViewBuilder private func doneButton(_ item: ThreadItem) -> some View {
    if item.done {
      Button("Not Done", systemImage: "arrow.uturn.backward") { model.perform(.undone, on: item) }
        .tint(.gray)
    } else if item.status != .running {
      Button("Done", systemImage: "checkmark") { model.perform(.done, on: item) }
        .tint(.green)
    }
  }

  /// Loads the next page as it scrolls into view.
  @ViewBuilder private var more: some View {
    if let error = model.moreError {
      Button {
        Task { await model.loadMore() }
      } label: {
        Label {
          VStack(alignment: .leading) {
            Text("Couldn’t load more threads. Retry")
            Text(error).font(.footnote).foregroundStyle(.secondary)
          }
        } icon: {
          Image(systemName: "arrow.clockwise")
        }
      }
    } else {
      HStack {
        Spacer()
        ProgressView()
        Spacer()
      }
      .id(model.pageCount)
      .task { await model.loadMore() }
    }
  }

  @ViewBuilder private var overlay: some View {
    let empty = model.pinned.isEmpty && model.threads.isEmpty
    switch model.phase {
    case .loading where empty:
      ProgressView()
    case .failed(let message) where empty:
      ContentUnavailableView {
        Label("Couldn’t Load Threads", systemImage: "wifi.exclamationmark")
      } description: {
        Text(message)
      } actions: {
        Button("Try Again") { Task { await model.reload() } }
          .buttonStyle(.borderedProminent)
      }
    case .loaded where empty:
      if model.searching {
        ContentUnavailableView.search(text: model.searchText)
      } else {
        ContentUnavailableView {
          Label("No Threads", systemImage: "bubble.left.and.bubble.right")
        } description: {
          Text(
            model.filter == nil
              ? "Chats you start on this phone or your computer appear here."
              : "No open threads in \(model.filterName ?? "this project").")
        } actions: {
          Button("New Chat", action: newChat)
            .buttonStyle(.borderedProminent)
        }
      }
    default:
      EmptyView()
    }
  }
}

/// "Marked done" with an Undo button, for a few seconds after a Done.
private struct UndoBanner: View {
  let title: String
  let undo: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
      Text("Marked “\(title)” done")
        .font(.subheadline)
        .lineLimit(1)
      Spacer(minLength: 0)
      Button("Undo", action: undo)
        .font(.subheadline.weight(.semibold))
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .glassEffect(.regular, in: .capsule)
    .padding(.horizontal, 16)
  }
}
