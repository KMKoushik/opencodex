import SwiftUI

/// The scrolling part of the sidebar. Kept apart from the screen so sheets and the header
/// don't re-render rows; each row is a small value that skips unchanged updates.
struct ThreadList: View {
  let model: HomeModel
  let actions: ThreadActions
  let open: (String) -> Void
  let newThread: () -> Void
  let newThreadIn: (String) -> Void
  let tasks: () -> Void
  let apps: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    List {
      Group {
        Button(action: newThread) {
          Label("New thread", systemImage: "square.and.pencil")
            .labelStyle(NavLabelStyle())
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(NavRowStyle())
        .accessibilityIdentifier("new-chat")

        // The desktop sidebar's Tasks and Apps, under New thread.
        Button(action: tasks) {
          Label("Tasks", systemImage: "checklist")
            .labelStyle(NavLabelStyle())
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(NavRowStyle())
        .accessibilityIdentifier("home.tasks")
        Button(action: apps) {
          Label("Apps", systemImage: "square.grid.2x2")
            .labelStyle(NavLabelStyle())
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(NavRowStyle())
        .accessibilityIdentifier("home.apps")
        .padding(.bottom, 10)

        if case .failed(let message) = model.phase {
          ErrorNote(message: message) { Task { await model.reload() } }
        }
        if let error = model.refreshError {
          ErrorNote(message: "Couldn’t refresh. \(error)") { Task { await model.reload() } }
        }

        if !model.pinned.isEmpty {
          Heading("Pinned")
          ForEach(model.pinned) { item in row(item, showsProject: true) }
          SectionGap()
        }

        switch model.mode {
        case .projects: projects
        case .focus: focus
        }
      }
      .listRowBackground(Color.clear)
      .listRowSeparator(.hidden)
      .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .environment(\.defaultMinListRowHeight, 0)
    .refreshable { await model.reload() }
    .accessibilityIdentifier("threads")
  }

  // MARK: Projects

  @ViewBuilder private var projects: some View {
    Heading("Projects") {
      ProjectFilterMenu(
        title: "Show in Projects", options: model.projectOptions,
        set: { model.setHidden($0, !$1) }, showAll: { model.showAllProjects() })
      ViewToggle(model: model)
    }
    if model.phase == .loading || (model.groupsPending && model.groups.isEmpty) {
      LoadingNote()
    } else if model.phase == .loaded, model.groups.isEmpty {
      Note(model.hidden.isEmpty ? "No threads yet" : "Every project is hidden")
    }
    ForEach(model.groups) { group in
      ProjectHeader(
        group: group,
        toggle: { model.toggle(group.canonical) },
        newThread: { newThreadIn(group.canonical) },
        hide: { model.setHidden(group.canonical, true) })
      if group.expanded {
        ForEach(group.items) { item in row(item, showsProject: false) }
        if let error = group.error {
          ErrorNote(message: error, indented: true) {
            Task { await model.showMore(group.canonical) }
          }
        } else if group.items.isEmpty {
          Note("No threads yet", indented: true)
        }
        if group.canShowMore {
          MoreButton(loading: group.loadingMore, indented: true) {
            Task { await model.showMore(group.canonical) }
          }
          .accessibilityIdentifier("show-more-\(group.badge.name)")
        }
        SectionGap()
      }
    }
  }

  // MARK: Focus

  @ViewBuilder private var focus: some View {
    Heading("Focus") {
      ProjectFilterMenu(
        title: "Show in Focus", options: model.focusOptions,
        set: { model.setExcluded($0, !$1) }, showAll: { model.showAllInFocus() })
      ViewToggle(model: model)
    }
    if let error = model.focusError, model.focusActive.isEmpty {
      ErrorNote(message: error) { Task { await model.retryFocus() } }
    } else if model.phase == .loading {
      LoadingNote()
    } else if model.focusActive.isEmpty {
      Note("Nothing needs focus")
    }
    ForEach(model.focusActive) { item in row(item, showsProject: true) }
    SectionGap()

    Button {
      model.toggleInactive()
    } label: {
      HStack(spacing: 4) {
        Text("Inactive")
        Image(systemName: model.inactiveOpen ? "chevron.down" : "chevron.right")
          .font(.system(size: 10, weight: .semibold))
      }
      .font(.footnote.weight(.medium))
      .foregroundStyle(palette.color("text-tertiary"))
      .padding(.leading, 8)
      .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityValue(model.inactiveOpen ? "Expanded" : "Collapsed")
    .accessibilityIdentifier("inactive-toggle")
    if model.inactiveOpen {
      ForEach(model.focusInactive.prefix(model.inactiveVisible)) { item in
        row(item, showsProject: true)
      }
      if model.focusInactive.isEmpty, !model.focusHasMore {
        Note("No inactive threads")
      }
      if model.focusInactive.count > model.inactiveVisible || model.focusHasMore {
        MoreButton(loading: model.focusLoadingMore) {
          Task { await model.showMoreInactive() }
        }
        .accessibilityIdentifier("show-more-inactive")
      }
    }
  }

  // MARK: Rows

  private func row(_ item: ThreadItem, showsProject: Bool) -> some View {
    Button {
      open(item.id)
    } label: {
      ThreadRow(item: item, showsProject: showsProject)
        .padding(.leading, showsProject ? 0 : ProjectHeader.indent)
    }
    .buttonStyle(NavRowStyle())
    .accessibilityIdentifier("thread-\(item.id)")
    .swipeActions(edge: .leading, allowsFullSwipe: true) {
      Button(
        item.pinned ? "Unpin" : "Pin", systemImage: item.pinned ? "pin.slash" : "pin"
      ) {
        actions.focus(item.pinned ? .unpin : .pin, item.target)
      }
      .tint(palette.color("warning"))
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      if item.done {
        Button("Not done", systemImage: "arrow.uturn.backward") {
          actions.focus(.undone, item.target)
        }
        .tint(palette.color("text-tertiary"))
      } else if !item.responding {
        Button("Done", systemImage: "checkmark") { actions.focus(.done, item.target) }
          .tint(palette.color("success"))
      }
      if !item.markedUnread {
        Button("Unread", systemImage: "circlebadge") { actions.markUnread(item.target) }
          .tint(palette.color("accent"))
      }
    }
    .contextMenu {
      ThreadActionsMenu(actions: actions, target: item.target)
    }
  }
}

// MARK: - Pieces

/// `.sidebar-heading`: a small tertiary label with optional trailing actions.
private struct Heading<Actions: View>: View {
  let title: String
  let actions: Actions
  @Environment(\.palette) private var palette

  init(_ title: String, @ViewBuilder actions: () -> Actions = { EmptyView() }) {
    self.title = title
    self.actions = actions()
  }

  var body: some View {
    HStack(spacing: 6) {
      Text(title)
        .font(.footnote.weight(.medium))
        .foregroundStyle(palette.color("text-tertiary"))
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      actions
    }
    .padding(.leading, 8)
    .frame(minHeight: 36)
    .padding(.bottom, 2)
  }
}

/// `.thread-section`'s bottom padding between sections.
private struct SectionGap: View {
  var body: some View { Color.clear.frame(height: 12).accessibilityHidden(true) }
}

private struct Note: View {
  let text: String
  var indented = false
  @Environment(\.palette) private var palette

  init(_ text: String, indented: Bool = false) {
    self.text = text
    self.indented = indented
  }

  var body: some View {
    Text(text)
      .font(.subheadline)
      .foregroundStyle(palette.color("text-tertiary"))
      .padding(.leading, 8 + (indented ? ProjectHeader.indent : 0))
      .padding(.vertical, 8)
  }
}

private struct ErrorNote: View {
  let message: String
  var indented = false
  let retry: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(message)
        .font(.subheadline)
        .foregroundStyle(palette.color("error"))
      SecondaryButton(title: "Retry", action: retry)
    }
    .padding(.leading, 8 + (indented ? ProjectHeader.indent : 0))
    .padding(.vertical, 8)
  }
}

/// "Loading…" with the native spinner, while the first snapshots arrive.
private struct LoadingNote: View {
  @Environment(\.palette) private var palette

  var body: some View {
    // Only for a slow load, so a fast one never flashes it.
    Delayed {
      HStack(spacing: 8) {
        ProgressView().controlSize(.small)
        Text("Loading…")
      }
      .font(.subheadline)
      .foregroundStyle(palette.color("text-tertiary"))
      .padding(.leading, 8)
      .padding(.vertical, 8)
    }
  }
}

/// `.session-more`: "Show more", or "Loading…" while the next page arrives.
private struct MoreButton: View {
  let loading: Bool
  var indented = false
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Text(loading ? "Loading…" : "Show more")
        if loading { ProgressView().controlSize(.small) }
      }
        .font(.subheadline)
        .foregroundStyle(palette.color("text-tertiary"))
        .padding(.leading, indented ? ProjectHeader.indent : 0)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(.rect)
    }
    .buttonStyle(NavRowStyle())
    .disabled(loading)
  }
}

/// A project's heading row: its avatar and name toggle the group; + starts a thread in it.
private struct ProjectHeader: View {
  /// Thread titles line up with the project name, like the desktop's 32 px text column.
  static let indent: CGFloat = 30

  let group: HomeModel.Group
  let toggle: () -> Void
  let newThread: () -> Void
  let hide: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 0) {
      Button(action: toggle) {
        HStack(spacing: 10) {
          ProjectIcon(badge: group.badge, size: 20)
          Text(group.badge.name)
            .font(.body)
            .foregroundStyle(palette.color("text-secondary"))
            .lineLimit(1)
          Image(systemName: group.expanded ? "chevron.down" : "chevron.right")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(palette.color("text-tertiary"))
          Spacer(minLength: 0)
        }
        .frame(minHeight: 44)
        .contentShape(.rect)
      }
      .buttonStyle(NavRowStyle())
      .accessibilityValue(group.expanded ? "Expanded" : "Collapsed")
      .accessibilityHint(group.canonical)
      .accessibilityIdentifier("group-\(group.badge.name)")
      Button(action: newThread) {
        Image(systemName: "plus")
          .font(.subheadline)
          .foregroundStyle(palette.color("text-secondary"))
          .frame(width: 44, height: 44)
          .contentShape(.rect)
      }
      .buttonStyle(IconButtonStyle())
      .accessibilityLabel("New chat in \(group.badge.name)")
      .accessibilityIdentifier("group-new-\(group.badge.name)")
    }
    .contextMenu {
      Button("New thread", systemImage: "square.and.pencil", action: newThread)
      Button("Hide project", systemImage: "eye.slash", action: hide)
    }
  }
}

/// The inbox button that switches Projects and Focus; pressed while Focus shows.
private struct ViewToggle: View {
  let model: HomeModel
  @Environment(\.palette) private var palette

  var body: some View {
    let focus = model.mode == .focus
    Button {
      model.mode = focus ? .projects : .focus
    } label: {
      HeadingIcon(systemName: "tray", pressed: focus)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Focus view")
    .accessibilityValue(focus ? "On" : "Off")
    .accessibilityHint(
      focus ? "Group threads by project" : "Focus view: what needs you, running, and recent")
    .accessibilityAddTraits(focus ? .isSelected : [])
    .accessibilityIdentifier("view-toggle")
  }
}

/// Chooses which projects a view shows; unchecked projects are hidden from that view only.
private struct ProjectFilterMenu: View {
  let title: String
  let options: [HomeModel.ProjectOption]
  let set: (String, Bool) -> Void
  let showAll: () -> Void

  var body: some View {
    let hidden = options.filter { !$0.shown }.count
    Menu {
      Section(title) {
        if options.isEmpty { Text("No recent projects") }
        ForEach(options) { option in
          Toggle(
            option.name,
            isOn: Binding(get: { option.shown }, set: { set(option.directory, $0) }))
        }
      }
      if hidden > 0 {
        Button("Show all projects", action: showAll)
      }
    } label: {
      HeadingIcon(systemName: "slider.horizontal.3", pressed: hidden > 0)
    }
    .menuActionDismissBehavior(.disabled)
    .accessibilityLabel("Filter projects")
    .accessibilityIdentifier("project-filter")
    .accessibilityValue(hidden > 0 ? "\(hidden) hidden" : "")
  }
}

/// `.thread-view-toggle`: a square ghost icon in `text-tertiary`, `selected` while pressed.
private struct HeadingIcon: View {
  let systemName: String
  let pressed: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    Image(systemName: systemName)
      .font(.system(size: 15))
      .foregroundStyle(palette.color(pressed ? "text" : "text-tertiary"))
      .frame(width: 34, height: 34)
      .background(
        pressed ? palette.color("selected") : .clear,
        in: .rect(cornerRadius: 8, style: .continuous)
      )
      .frame(width: 44, height: 44)
      .contentShape(.rect)
  }
}
