import SwiftUI

/// The desktop's **Tasks** page (`task-board.tsx`) at phone width, where the desktop also stacks
/// its four columns: Today, This week, Someday and Done, as sections of a native inset-grouped
/// list. A task completes with its check or a leading swipe, deletes with a trailing swipe,
/// edits in a sheet, and moves between lists from its editor or long-press menu (the phone's
/// stand-in for dragging).
struct TasksScreen: View {
  @State private var model: TasksModel
  private let onOpenSession: ((String) -> Void)?
  @Environment(\.palette) private var palette

  init(client: GatewayClient, events: EventHub, onOpenSession: ((String) -> Void)? = nil) {
    _model = State(initialValue: TasksModel(client: client, events: events))
    self.onOpenSession = onOpenSession
  }

  var body: some View {
    Group {
      if let status = model.status {
        if model.ready {
          TaskBoardView(model: model, onOpenSession: onOpenSession)
        } else {
          TasksSetup(status: status, stalled: model.loadingPolls >= 30)
        }
      } else if let error = model.statusError {
        PanelUnavailable(
          "Couldn’t load Tasks", systemImage: "exclamationmark.triangle", message: error,
          tone: "error"
        ) {
          Button("Retry") { Task { await model.loadStatus() } }
            .buttonStyle(.bordered)
        }
        .accessibilityIdentifier("tasks.note")
      } else {
        PanelLoading("Loading tasks…")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(palette.color("surface").ignoresSafeArea())
    .navigationTitle("Tasks")
    .navigationSubtitle(subtitle)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if model.ready {
        ToolbarItem(placement: .topBarTrailing) { ProjectFilterMenu(model: model) }
      }
    }
    .task { await model.run() }
  }

  /// "4 open · 1 delayed", the board header's count.
  private var subtitle: String {
    guard model.ready, model.tasks != nil else { return "" }
    let groups = model.groups
    let open = [BoardTask.Bucket.today, .week, .someday].reduce(0) { $0 + (groups[$1]?.count ?? 0) }
    let delayed = (groups[.today] ?? []).filter { TaskBoardLogic.delayedDays($0, now: model.now) > 0 }
      .count
    let counts = "\(open) open\(delayed > 0 ? " · \(delayed) delayed" : "")"
    // The filter's project, which the desktop's select shows.
    return model.filter == "all" ? counts : "\(model.filterLabel) · \(counts)"
  }
}

/// The desktop's `Setup`. Turning Tasks on writes a plugin file next to OpenCode, which only the
/// computer can do, so the phone points there instead of offering the button.
private struct TasksSetup: View {
  let status: PluginStatus
  let stalled: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    ScrollView {
      PanelUnavailable(
        "Tasks", systemImage: "checklist",
        message:
          "Plan your day across Today, This week, and Someday. Tasks are saved in OpenCode by a small OpenCodex plugin, so agents can add and update them when you ask."
      ) {
        VStack(spacing: 8) {
          switch status.state {
          case .unavailable, .failed:
            Text(status.message ?? "The tasks plugin couldn’t load.")
              .foregroundStyle(palette.color("error"))
              .accessibilityIdentifier("tasks.setup.error")
          case .loading:
            HStack(spacing: 8) {
              if !stalled { ProgressView().controlSize(.small) }
              Text(
                stalled
                  ? "OpenCode hasn’t loaded the plugin yet. Restart it with opencode service restart."
                  : "Starting Tasks…")
            }
            .foregroundStyle(palette.color("text-secondary"))
          default:
            Text(
              "Turn on Tasks from OpenCodex on your computer: open Tasks there and choose Turn on Tasks."
            )
            .foregroundStyle(palette.color("text-secondary"))
            .accessibilityIdentifier("tasks.setup.computer")
          }
          if let path = status.path {
            Text(path)
              .font(.caption.monospaced())
              .foregroundStyle(palette.color("text-tertiary"))
              .textSelection(.enabled)
          }
        }
        .font(.subheadline)
        .multilineTextAlignment(.center)
      }
      .padding(.top, 48)
      .frame(maxWidth: 480)
      .frame(maxWidth: .infinity)
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("tasks.setup")
  }
}

// MARK: - Board

private let bucketIcons: [BoardTask.Bucket: String] = [
  .today: "sun.max", .week: "calendar", .someday: "archivebox", .done: "checkmark.circle",
]
private let bucketTints: [BoardTask.Bucket: String] = [
  .today: "warning", .week: "project-blue", .someday: "project-purple", .done: "success",
]
private let emptyNotes: [BoardTask.Bucket: String] = [
  .today: "Nothing planned for today.",
  .week: "Nothing else this week.",
  .someday: "Ideas and later work go here.",
  .done: "Completed tasks stay here for two weeks.",
]

private struct TaskBoardView: View {
  let model: TasksModel
  let onOpenSession: ((String) -> Void)?
  @Environment(\.palette) private var palette
  @State private var adding: BoardTask.Bucket?
  @State private var editing: BoardTask?

  var body: some View {
    let groups = model.groups
    List {
      Section {
        Picker("Show tasks for", selection: Bindable(model).assignee) {
          Text("Everyone").tag("all")
          Text("Me").tag("user")
          Text("Agent").tag("agent")
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("tasks.assignee")
        .listRowBackground(Color.clear)
        .listRowInsets(.init(top: 0, leading: 0, bottom: 0, trailing: 0))
      }
      .listSectionSpacing(.compact)
      if model.tasks == nil {
        Section {
          if let error = model.tasksError {
            Label(error, systemImage: "exclamationmark.triangle")
              .foregroundStyle(palette.color("error"))
          } else {
            HStack(spacing: 10) {
              ProgressView().controlSize(.small)
              Text("Loading…").foregroundStyle(palette.color("text-tertiary"))
            }
          }
        }
        .panelRow(palette)
      }
      if model.status?.state == .outdated || model.editError != nil {
        Section {
          if model.status?.state == .outdated {
            Text(
              "A newer version of the Tasks plugin is available. Update it from OpenCodex on your computer."
            )
            .foregroundStyle(palette.color("text-secondary"))
          }
          if let error = model.editError {
            Label(error, systemImage: "exclamationmark.triangle")
              .foregroundStyle(palette.color("error"))
              .accessibilityIdentifier("tasks.error")
          }
        }
        .font(.footnote)
        .panelRow(palette)
      }
      ForEach(TaskBoardLogic.columns, id: \.bucket) { column in
        TaskSection(
          model: model, bucket: column.bucket, label: column.label,
          items: groups[column.bucket] ?? [], adding: $adding,
          edit: { editing = $0 }, onOpenSession: onOpenSession)
      }
    }
    .panelList(palette)
    .scrollDismissesKeyboard(.interactively)
    .refreshable {
      await model.loadStatus()
      await model.loadTasks()
    }
    .sheet(item: $editing) { task in
      TaskEditor(model: model, task: task)
    }
  }
}

/// The desktop's "Filter by project" select, in the toolbar.
private struct ProjectFilterMenu: View {
  let model: TasksModel
  @Environment(\.palette) private var palette

  var body: some View {
    Menu {
      Picker("Filter by project", selection: Bindable(model).filter) {
        Label("All projects", systemImage: "square.stack").tag("all")
        Label("No project", systemImage: "tray").tag("none")
        if !model.filterProjects.isEmpty {
          Section {
            ForEach(model.filterProjects) { project in
              Text(project.displayName).tag(project.canonical)
            }
          }
        }
      }
    } label: {
      Label(
        model.filterLabel,
        systemImage: model.filter == "all"
          ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
    }
    .accessibilityLabel("Filter by project")
    .accessibilityValue(model.filterLabel)
    .accessibilityIdentifier("tasks.filter")
  }
}

/// One list: its tasks, the empty note, and "New task".
private struct TaskSection: View {
  let model: TasksModel
  let bucket: BoardTask.Bucket
  let label: String
  let items: [BoardTask]
  @Binding var adding: BoardTask.Bucket?
  let edit: (BoardTask) -> Void
  let onOpenSession: ((String) -> Void)?
  @Environment(\.palette) private var palette

  var body: some View {
    Section {
      ForEach(items) { task in
        TaskRow(
          model: model, task: task, items: items, onEdit: { edit(task) },
          onOpenSession: onOpenSession)
      }
      if adding == bucket {
        NewTaskField { model.create(title: $0, bucket: bucket) } onClose: {
          if adding == bucket { adding = nil }
        }
        .panelRow(palette)
      } else if items.isEmpty {
        Text(emptyNotes[bucket]!)
          .font(.footnote)
          .foregroundStyle(palette.color("text-tertiary"))
          .frame(maxWidth: .infinity, minHeight: 36)
          .panelRow(palette)
      }
      if bucket != .done && adding != bucket {
        Button {
          adding = bucket
        } label: {
          Label("New task", systemImage: "plus")
            .font(.subheadline)
            .foregroundStyle(palette.color("text-secondary"))
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .accessibilityIdentifier("tasks.new.\(bucket.rawValue)")
        .panelRow(palette)
      }
    } header: {
      HStack(spacing: 8) {
        Label {
          Text(label).foregroundStyle(palette.color("text"))
        } icon: {
          Image(systemName: bucketIcons[bucket]!).foregroundStyle(palette.color(bucketTints[bucket]!))
        }
        .font(.subheadline.weight(.semibold))
        Text("\(items.count)")
          .font(.caption2.weight(.medium).monospacedDigit())
          .foregroundStyle(palette.color("text-tertiary"))
          .padding(.horizontal, 6)
          .padding(.vertical, 1)
          .frame(minWidth: 20)
          .background(palette.color("secondary"), in: .capsule)
        Spacer(minLength: 0)
      }
      .textCase(nil)
      .accessibilityElement(children: .combine)
      .accessibilityLabel("\(label), \(items.count)")
      .accessibilityAddTraits(.isHeader)
      .accessibilityIdentifier("tasks.column.\(bucket.rawValue)")
    }
  }
}

private struct TaskRow: View {
  let model: TasksModel
  let task: BoardTask
  let items: [BoardTask]
  let onEdit: () -> Void
  let onOpenSession: ((String) -> Void)?
  @Environment(\.palette) private var palette

  private var done: Bool { task.bucket == .done }

  var body: some View {
    let delayed = TaskBoardLogic.delayedDays(task, now: model.now)
    HStack(alignment: .top, spacing: 12) {
      Button {
        model.toggleDone(task)
      } label: {
        Image(systemName: done ? "checkmark.circle.fill" : "circle")
          .font(.system(size: 21, weight: .light))
          .foregroundStyle(palette.color(done ? "success" : "border-heavy"))
          .contentTransition(.symbolEffect(.replace))
          .frame(width: 28, height: 28)
          .contentShape(.rect)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(done ? "Reopen “\(task.title)”" : "Complete “\(task.title)”")
      .accessibilityAddTraits(done ? .isSelected : [])
      .accessibilityIdentifier("tasks.check")

      Button(action: onEdit) {
        VStack(alignment: .leading, spacing: 6) {
          Text(task.title)
            .font(.subheadline)
            .strikethrough(done, color: palette.color("border-heavy"))
            .foregroundStyle(palette.color(done ? "text-tertiary" : "text"))
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading)
          if let notes = task.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
            Text(markdown(notes))
              .font(.footnote)
              .foregroundStyle(palette.color(done ? "text-tertiary" : "text-secondary"))
              .tint(palette.color("link"))
              .multilineTextAlignment(.leading)
              .lineLimit(6)
          }
          if delayed > 0 || done || task.project != nil || task.sessionID != nil || task.forAgent
            || task.workSessionID != nil
          {
            meta(delayed: delayed)
          }
        }
        .contentShape(.rect)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(task.title)
      .accessibilityHint("Edit")
      .accessibilityIdentifier("tasks.card")
    }
    .padding(.vertical, 2)
    .panelRow(palette)
    .swipeActions(edge: .leading, allowsFullSwipe: true) {
      Button(done ? "Reopen" : "Complete", systemImage: done ? "arrow.uturn.backward" : "checkmark") {
        model.toggleDone(task)
      }
      .tint(palette.color(done ? "project-blue" : "success"))
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      Button("Delete", systemImage: "trash", role: .destructive) { model.delete(task) }
      Button("Edit", systemImage: "pencil", action: onEdit)
        .tint(palette.color("text-tertiary"))
    }
    .contextMenu { menu }
  }

  @ViewBuilder private var menu: some View {
    Button("Edit", systemImage: "pencil", action: onEdit)
    Button(done ? "Reopen" : "Complete", systemImage: done ? "arrow.uturn.backward" : "checkmark.circle") {
      model.toggleDone(task)
    }
    Menu("Move to", systemImage: "arrow.right") {
      ForEach(TaskBoardLogic.columns.filter { $0.bucket != task.bucket }, id: \.bucket) { column in
        Button(column.label, systemImage: bucketIcons[column.bucket]!) {
          model.move(task, to: column.bucket)
        }
      }
    }
    if !done, let index = items.firstIndex(of: task) {
      if index > 0 {
        Button("Move up", systemImage: "arrow.up") { model.shift(task, by: -1) }
      }
      if index < items.count - 1 {
        Button("Move down", systemImage: "arrow.down") { model.shift(task, by: 1) }
      }
    }
    if task.forAgent && !done && task.workSessionID == nil && task.project != nil {
      Button("Start agent", systemImage: "play.fill") { start() }
    }
    if let session = task.workSessionID, let onOpenSession {
      Button("Open agent chat", systemImage: "cpu") { onOpenSession(session) }
    }
    if let session = task.sessionID, session != task.workSessionID, let onOpenSession {
      Button("Open chat", systemImage: "bubble.left") { onOpenSession(session) }
    }
    Divider()
    Button("Delete", systemImage: "trash", role: .destructive) { model.delete(task) }
  }

  private func start() {
    model.start(task) { session in onOpenSession?(session) }
  }

  private func meta(delayed: Int) -> some View {
    TaskChipFlow(spacing: 4) {
      if task.forAgent && !done && task.workSessionID == nil {
        if task.project != nil {
          let starting = model.starting == task.id
          Button(action: start) {
            chip(tone: "accent") {
              Image(systemName: starting ? "ellipsis" : "play.fill")
              Text(starting ? "Starting…" : "Start agent").fontWeight(.medium)
            }
          }
          .buttonStyle(.borderless)
          .disabled(model.starting != nil)
          .accessibilityHint("Starts a chat in this project with the task as its first message")
          .accessibilityIdentifier("tasks.start")
        } else {
          chip {
            Image(systemName: "cpu")
            Text("Agent · needs a project")
          }
          .accessibilityHint("Choose a project for the agent to work in")
        }
      }
      if let session = task.workSessionID {
        Button {
          onOpenSession?(session)
        } label: {
          chip(tone: "accent") {
            Image(systemName: "cpu")
            Text("Agent chat")
          }
        }
        .buttonStyle(.borderless)
        .disabled(onOpenSession == nil)
        .accessibilityHint("Open the chat the agent is working in")
        .accessibilityIdentifier("tasks.agentChat")
      }
      if delayed > 0 {
        chip(tone: "warning") {
          Image(systemName: "clock")
          Text(delayed == 1 ? "From yesterday" : "Delayed \(delayed) days")
        }
        .accessibilityHint(
          "In Today since \(task.time.moved.date.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()))")
        .accessibilityIdentifier("tasks.delayed")
      }
      if done, let completed = task.time.completed {
        chip { Text(TaskBoardLogic.shortDate(completed, now: model.now)) }
      }
      if let project = task.project {
        let native = model.project(project.directory)
        let name = native?.displayName ?? folderName(project.directory)
        chip {
          ProjectIcon(badge: ProjectBadge(name: name, icon: native?.icon), size: 13)
          Text(name).lineLimit(1)
        }
      }
      if let session = task.sessionID, session != task.workSessionID {
        Button {
          onOpenSession?(session)
        } label: {
          chip {
            Image(systemName: "bubble.left")
            Text("From chat")
          }
        }
        .buttonStyle(.borderless)
        .disabled(onOpenSession == nil)
        .accessibilityHint("Open the chat that added this task")
      }
    }
  }

  private func chip(tone: String? = nil, @ViewBuilder content: () -> some View) -> some View {
    HStack(spacing: 5) { content() }
      .font(.caption)
      .foregroundStyle(palette.color(tone ?? "text-secondary"))
      .padding(.horizontal, 7)
      .frame(height: 22)
      .background(
        tone.map { palette.color($0).opacity(0.14) } ?? palette.color("secondary"),
        in: .rect(cornerRadius: 6, style: .continuous))
  }

  private func markdown(_ text: String) -> AttributedString {
    (try? AttributedString(
      markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
      ?? AttributedString(text)
  }
}

/// The desktop's `NewTask`: stays open for the next task, like a checklist, and closes when
/// it's left empty.
private struct NewTaskField: View {
  let onSubmit: (String) -> Void
  let onClose: () -> Void
  @State private var title = ""
  @FocusState private var focused: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: "circle")
        .font(.system(size: 21, weight: .light))
        .foregroundStyle(palette.color("border-heavy"))
        .frame(width: 28, height: 28)
      TextField(
        "New task", text: $title,
        prompt: Text("New task").foregroundStyle(palette.color("text-tertiary"))
      )
      .font(.subheadline)
      .foregroundStyle(palette.color("text"))
      .focused($focused)
      .submitLabel(.done)
      .onSubmit {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return onClose() }
        onSubmit(String(trimmed.prefix(500)))
        title = ""
        focused = true
      }
      .accessibilityIdentifier("tasks.new.input")
    }
    .onAppear { focused = true }
    .onChange(of: focused) { _, now in
      if !now && title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { onClose() }
    }
  }
}

/// The desktop's `TaskEditor` as a native form sheet: title, notes, list and project, then
/// Delete; Cancel and Save in the bar.
private struct TaskEditor: View {
  let model: TasksModel
  let task: BoardTask
  @State private var title: String
  @State private var notes: String
  @State private var directory: String
  @State private var bucket: BoardTask.Bucket
  @State private var assignee: BoardTask.Assignee
  @State private var confirmDelete = false
  @FocusState private var titleFocused: Bool
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss

  init(model: TasksModel, task: BoardTask) {
    self.model = model
    self.task = task
    _title = State(initialValue: task.title)
    _notes = State(initialValue: task.notes ?? "")
    _directory = State(initialValue: task.project?.directory ?? "")
    _bucket = State(initialValue: task.bucket)
    _assignee = State(initialValue: task.assignee ?? .user)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(
            "Task title", text: $title,
            prompt: Text("Task title").foregroundStyle(palette.color("text-tertiary")), axis: .vertical
          )
          .foregroundStyle(palette.color("text"))
          .focused($titleFocused)
          .lineLimit(1...4)
          .accessibilityIdentifier("tasks.editor.title")
          TextField(
            "Notes", text: $notes,
            prompt: Text("Notes").foregroundStyle(palette.color("text-tertiary")), axis: .vertical
          )
          .font(.subheadline)
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(3...10)
          .accessibilityIdentifier("tasks.editor.notes")
        }
        .panelRow(palette)
        Section {
          Picker(selection: $bucket) {
            ForEach(TaskBoardLogic.columns, id: \.bucket) { column in
              Label(column.label, systemImage: bucketIcons[column.bucket]!).tag(column.bucket)
            }
          } label: {
            Label("List", systemImage: "list.bullet").foregroundStyle(palette.color("text"))
          }
          .accessibilityIdentifier("tasks.editor.list")
          Picker(selection: $assignee) {
            Label("Me", systemImage: "person").tag(BoardTask.Assignee.user)
            Label("An agent", systemImage: "cpu").tag(BoardTask.Assignee.agent)
          } label: {
            Label("For", systemImage: "person.crop.circle").foregroundStyle(palette.color("text"))
          }
          .accessibilityIdentifier("tasks.editor.assignee")
          Picker(selection: $directory) {
            Text("No project").tag("")
            ForEach(model.projects) { Text($0.displayName).tag($0.canonical) }
            if let project = task.project, model.project(project.directory) == nil {
              // Keep a project that's no longer listed, so saving other fields doesn't drop it.
              Text(folderName(project.directory)).tag(project.directory)
            }
          } label: {
            Label("Project", systemImage: "folder").foregroundStyle(palette.color("text"))
          }
          .accessibilityIdentifier("tasks.editor.project")
        }
        .pickerStyle(.menu)
        .tint(palette.color("text-secondary"))
        .panelRow(palette)
        Section {
          Button("Delete task", systemImage: "trash", role: .destructive) { confirmDelete = true }
            .foregroundStyle(palette.color("error"))
            .accessibilityIdentifier("tasks.editor.delete")
        }
        .panelRow(palette)
      }
      .panelList(palette)
      .navigationTitle("Edit task")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", role: .cancel) { dismiss() }
            .accessibilityIdentifier("tasks.editor.cancel")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save", role: .confirm, action: save)
            .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityIdentifier("tasks.editor.save")
        }
      }
      .confirmationDialog("Delete “\(task.title)”?", isPresented: $confirmDelete, titleVisibility: .visible) {
        Button("Delete", role: .destructive) {
          model.delete(task)
          dismiss()
        }
      }
    }
    .tint(palette.color("text"))
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .presentationBackground(palette.color("surface"))
  }

  private func save() {
    var input = TaskUpdate()
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty && trimmed != task.title { input.title = String(trimmed.prefix(500)) }
    if notes.trimmingCharacters(in: .whitespacesAndNewlines) != (task.notes ?? "") { input.notes = notes }
    if directory != (task.project?.directory ?? "") {
      input.project = .some(model.project(directory).map { .init(id: $0.id, directory: $0.canonical) })
    }
    if assignee != (task.assignee ?? .user) { input.assignee = assignee }
    if bucket != task.bucket {
      // Into another list goes to its end, like dropping it below the last card.
      if bucket == .done {
        input.bucket = .done
      } else {
        input.bucket = bucket
        let siblings = (model.groups[bucket] ?? []).filter { $0.id != task.id }
        input.order = TaskBoardLogic.orderBetween(siblings.last, nil)
      }
    }
    dismiss()
    model.update(task, input)
  }
}

/// Wraps chips onto as many lines as they need, like the desktop's `flex-wrap`.
private struct TaskChipFlow: Layout {
  var spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    var x: CGFloat = 0
    var y: CGFloat = 0
    var line: CGFloat = 0
    var widest: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.init(width: width, height: nil))
      if x > 0 && x + size.width > width {
        y += line + spacing
        x = 0
        line = 0
      }
      x += size.width + spacing
      line = max(line, size.height)
      widest = max(widest, x - spacing)
    }
    return CGSize(width: min(widest, width), height: y + line)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var x = bounds.minX
    var y = bounds.minY
    var line: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.init(width: bounds.width, height: nil))
      if x > bounds.minX && x + size.width > bounds.maxX {
        y += line + spacing
        x = bounds.minX
        line = 0
      }
      subview.place(at: CGPoint(x: x, y: y), proposal: .init(width: min(size.width, bounds.width), height: size.height))
      x += size.width + spacing
      line = max(line, size.height)
    }
  }
}
