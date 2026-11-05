import SwiftUI

/// The desktop's **Tasks** page (`task-board.tsx`) at phone width, where the desktop also stacks
/// its four columns: Today, This week, Someday and Done, each with its cards, an empty note and
/// "New task". Cards complete with their check, edit in place, and move between lists from their
/// editor or long-press menu (the phone's stand-in for dragging).
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
          ScrollView { TasksSetup(status: status, stalled: model.loadingPolls >= 30) }
        }
      } else {
        TasksNote(text: model.statusError ?? "Loading tasks…")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(palette.color("surface").ignoresSafeArea())
    .navigationTitle("Tasks")
    .navigationBarTitleDisplayMode(.inline)
    .task { await model.run() }
  }
}

private struct TasksNote: View {
  let text: String
  @Environment(\.palette) private var palette

  var body: some View {
    Text(text)
      .font(.subheadline)
      .foregroundStyle(palette.color("text-tertiary"))
      .multilineTextAlignment(.center)
      .padding(32)
      .accessibilityIdentifier("tasks.note")
  }
}

/// The desktop's `Setup`. Turning Tasks on writes a plugin file next to OpenCode, which only the
/// computer can do, so the phone points there instead of offering the button.
private struct TasksSetup: View {
  let status: PluginStatus
  let stalled: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: "checklist")
        .font(.system(size: 20, weight: .regular))
        .foregroundStyle(palette.color("text"))
        .frame(width: 44, height: 44)
        .background(palette.gradient("glaze"), in: .rect(cornerRadius: 12, style: .continuous))
        .shadow(color: Color(uiColor: palette.shadows("glaze-shadow").first?.color ?? .clear), radius: 1, y: 1)
      Text("Tasks")
        .font(.title3.weight(.semibold))
        .foregroundStyle(palette.color("text"))
      Text(
        "Plan your day across Today, This week, and Someday. Tasks are saved in OpenCode by a small OpenCodex plugin, so agents can add and update them when you ask."
      )
      .foregroundStyle(palette.color("text-secondary"))
      switch status.state {
      case .unavailable, .failed:
        Text(status.message ?? "The tasks plugin couldn’t load.")
          .foregroundStyle(palette.color("error"))
          .accessibilityIdentifier("tasks.setup.error")
      case .loading:
        Text(
          stalled
            ? "OpenCode hasn’t loaded the plugin yet. Restart it with opencode service restart."
            : "Starting Tasks…"
        )
        .foregroundStyle(palette.color("text-secondary"))
      default:
        Text("Turn on Tasks from OpenCodex on your computer: open Tasks there and choose Turn on Tasks.")
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
    .frame(maxWidth: 440)
    .padding(.horizontal, 24)
    .padding(.top, 72)
    .frame(maxWidth: .infinity)
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
  @State private var editing: String?

  var body: some View {
    let groups = model.groups
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 12) {
        header(groups)
        if model.status?.state == .outdated {
          banner(
            "A newer version of the Tasks plugin is available. Update it from OpenCodex on your computer.",
            tone: "text-secondary")
        }
        if let error = model.editError {
          banner(error, tone: "error")
        }
        ForEach(TaskBoardLogic.columns, id: \.bucket) { column in
          TaskColumn(
            model: model, bucket: column.bucket, label: column.label,
            items: groups[column.bucket] ?? [], adding: $adding, editing: $editing,
            onOpenSession: onOpenSession)
        }
      }
      .padding(.horizontal, 12)
      .padding(.top, 8)
      .padding(.bottom, 24)
    }
    .scrollDismissesKeyboard(.interactively)
    .refreshable {
      await model.loadStatus()
      await model.loadTasks()
    }
  }

  private func header(_ groups: [BoardTask.Bucket: [BoardTask]]) -> some View {
    let open = (groups[.today]?.count ?? 0) + (groups[.week]?.count ?? 0) + (groups[.someday]?.count ?? 0)
    let delayed = (groups[.today] ?? []).filter { TaskBoardLogic.delayedDays($0, now: model.now) > 0 }.count
    return VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Tasks")
          .font(.title2.weight(.semibold))
          .foregroundStyle(palette.color("text"))
        Text(
          model.tasks != nil
            ? "\(open) open\(delayed > 0 ? " · \(delayed) delayed" : "")"
            : (model.tasksError ?? "Loading…")
        )
        .font(.footnote.monospacedDigit())
        .foregroundStyle(palette.color(model.tasksError != nil && model.tasks == nil ? "error" : "text-tertiary"))
        .accessibilityIdentifier("tasks.summary")
      }
      ProjectFilterMenu(model: model)
    }
    .padding(.horizontal, 4)
    .padding(.bottom, 4)
  }

  private func banner(_ text: String, tone: String) -> some View {
    Text(text)
      .font(.footnote)
      .foregroundStyle(palette.color(tone))
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(palette.color("surface-under"), in: .rect(cornerRadius: 10, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(palette.color("border")))
  }
}

/// The desktop's "Filter by project" select.
private struct ProjectFilterMenu: View {
  let model: TasksModel
  @Environment(\.palette) private var palette

  var body: some View {
    Menu {
      Picker("Filter by project", selection: Bindable(model).filter) {
        Text("All projects").tag("all")
        Text("No project").tag("none")
        ForEach(model.filterProjects) { project in
          Text(project.displayName).tag(project.canonical)
        }
      }
    } label: {
      HStack(spacing: 8) {
        if let project = model.project(model.filter) {
          ProjectIcon(badge: ProjectBadge(name: project.displayName, icon: project.icon), size: 16)
        }
        Text(model.filterLabel)
          .lineLimit(1)
          .foregroundStyle(palette.color("text"))
        Spacer(minLength: 4)
        Image(systemName: "chevron.up.chevron.down")
          .font(.caption2.weight(.medium))
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .font(.subheadline)
      .padding(.horizontal, 12)
      .frame(height: 40)
      .frame(maxWidth: 260)
      .background(palette.color("control"), in: .rect(cornerRadius: 10, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(palette.color("border")))
    }
    .accessibilityLabel("Filter by project")
    .accessibilityValue(model.filterLabel)
    .accessibilityIdentifier("tasks.filter")
  }
}

private struct TaskColumn: View {
  let model: TasksModel
  let bucket: BoardTask.Bucket
  let label: String
  let items: [BoardTask]
  @Binding var adding: BoardTask.Bucket?
  @Binding var editing: String?
  let onOpenSession: ((String) -> Void)?
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        Image(systemName: bucketIcons[bucket]!)
          .font(.system(size: 15))
          .foregroundStyle(palette.color(bucketTints[bucket]!))
        Text(label)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(palette.color("text"))
        Text("\(items.count)")
          .font(.caption2.weight(.medium).monospacedDigit())
          .foregroundStyle(palette.color("text-tertiary"))
          .padding(.horizontal, 6)
          .padding(.vertical, 1)
          .frame(minWidth: 20)
          .background(palette.color("secondary"), in: .capsule)
        Spacer(minLength: 0)
        if bucket != .done {
          Button("Add a task to \(label)", systemImage: "plus") { adding = bucket }
            .labelStyle(.iconOnly)
            .font(.system(size: 15))
            .foregroundStyle(palette.color("text-secondary"))
            .frame(width: 36, height: 36)
            .contentShape(.rect)
        }
      }
      .padding(.leading, 6)
      .frame(minHeight: 36)

      ForEach(items) { task in
        if editing == task.id {
          TaskEditor(model: model, task: task) { editing = nil }
        } else {
          TaskCard(
            model: model, task: task, items: items, onEdit: { editing = task.id },
            onOpenSession: onOpenSession)
        }
      }
      if adding == bucket {
        NewTaskField { model.create(title: $0, bucket: bucket) } onClose: { adding = nil }
      } else if items.isEmpty {
        Text(emptyNotes[bucket]!)
          .font(.footnote)
          .foregroundStyle(palette.color("text-tertiary"))
          .frame(maxWidth: .infinity)
          .padding(.top, 14)
          .padding(.bottom, 6)
          .padding(.horizontal, 8)
      }
      if bucket != .done && adding != bucket {
        Button {
          adding = bucket
        } label: {
          Label("New task", systemImage: "plus")
            .font(.subheadline)
            .foregroundStyle(palette.color("text-tertiary"))
            .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
            .padding(.horizontal, 10)
            .contentShape(.rect)
        }
        .buttonStyle(TaskRowButtonStyle())
        .accessibilityIdentifier("tasks.new.\(bucket.rawValue)")
      }
    }
    .padding(8)
    .background(palette.color("surface-under"), in: .rect(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(palette.color("border")))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(label)
    .accessibilityIdentifier("tasks.column.\(bucket.rawValue)")
  }
}

private struct TaskRowButtonStyle: ButtonStyle {
  @Environment(\.palette) private var palette
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(
        configuration.isPressed ? palette.color("hover") : .clear,
        in: .rect(cornerRadius: 8, style: .continuous))
  }
}

private struct TaskCard: View {
  let model: TasksModel
  let task: BoardTask
  let items: [BoardTask]
  let onEdit: () -> Void
  let onOpenSession: ((String) -> Void)?
  @Environment(\.palette) private var palette

  private var done: Bool { task.bucket == .done }

  var body: some View {
    let delayed = TaskBoardLogic.delayedDays(task, now: model.now)
    HStack(alignment: .top, spacing: 10) {
      Button {
        model.toggleDone(task)
      } label: {
        ZStack {
          Circle()
            .strokeBorder(palette.color(done ? "success" : "border-heavy"), lineWidth: 1.5)
            .background(Circle().fill(done ? palette.color("success") : .clear))
          if done {
            Image(systemName: "checkmark")
              .font(.system(size: 10, weight: .bold))
              .foregroundStyle(palette.color("on-accent"))
          }
        }
        .frame(width: 19, height: 19)
        .frame(width: 32, height: 32)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .padding(.leading, -6)
      .padding(.vertical, -6)
      .accessibilityLabel(done ? "Reopen “\(task.title)”" : "Complete “\(task.title)”")
      .accessibilityAddTraits(done ? .isSelected : [])

      VStack(alignment: .leading, spacing: 6) {
        Button(action: onEdit) {
          Text(task.title)
            .font(.subheadline)
            .strikethrough(done, color: palette.color("border-heavy"))
            .foregroundStyle(palette.color(done ? "text-tertiary" : "text"))
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Edit")

        if let notes = task.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
          Text(markdown(notes))
            .font(.footnote)
            .foregroundStyle(palette.color(done ? "text-tertiary" : "text-secondary"))
            .tint(palette.color("link"))
            .lineLimit(6)
            .onTapGesture(perform: onEdit)
        }
        if delayed > 0 || done || task.project != nil || task.sessionID != nil {
          meta(delayed: delayed)
        }
      }

      Button("Delete “\(task.title)”", systemImage: "trash") { model.delete(task) }
        .labelStyle(.iconOnly)
        .font(.system(size: 13))
        .foregroundStyle(palette.color("text-tertiary"))
        .frame(width: 32, height: 32)
        .contentShape(.rect)
        .padding(.vertical, -6)
        .padding(.trailing, -4)
    }
    .padding(EdgeInsets(top: 10, leading: 11, bottom: 10, trailing: 8))
    .background(palette.color("elevated"), in: .rect(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(palette.color("border")))
    .contentShape(.contextMenuPreview, .rect(cornerRadius: 10, style: .continuous))
    .contextMenu { menu }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("tasks.card")
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
    if let session = task.sessionID, let onOpenSession {
      Button("Open chat", systemImage: "bubble.left") { onOpenSession(session) }
    }
    Divider()
    Button("Delete", systemImage: "trash", role: .destructive) { model.delete(task) }
  }

  private func meta(delayed: Int) -> some View {
    TaskChipFlow(spacing: 4) {
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
      if let session = task.sessionID {
        Button {
          onOpenSession?(session)
        } label: {
          chip {
            Image(systemName: "bubble.left")
            Text("From chat")
          }
        }
        .buttonStyle(.plain)
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
    HStack(spacing: 10) {
      Circle()
        .strokeBorder(palette.color("border-heavy"), lineWidth: 1.5)
        .frame(width: 19, height: 19)
      TextField(
        "New task", text: $title,
        prompt: Text("New task").foregroundStyle(palette.color("text-tertiary"))
      )
      .font(.body)
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
    .padding(EdgeInsets(top: 10, leading: 11, bottom: 10, trailing: 8))
    .background(palette.color("elevated"), in: .rect(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(palette.color("border")))
    .onAppear { focused = true }
    .onChange(of: focused) { _, now in
      if !now && title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { onClose() }
    }
  }
}

/// The desktop's `TaskEditor`, in place of the card: title, notes, list and project, then
/// Delete, Cancel and Save.
private struct TaskEditor: View {
  let model: TasksModel
  let task: BoardTask
  let onClose: () -> Void
  @State private var title: String
  @State private var notes: String
  @State private var directory: String
  @State private var bucket: BoardTask.Bucket
  @FocusState private var titleFocused: Bool
  @Environment(\.palette) private var palette

  init(model: TasksModel, task: BoardTask, onClose: @escaping () -> Void) {
    self.model = model
    self.task = task
    self.onClose = onClose
    _title = State(initialValue: task.title)
    _notes = State(initialValue: task.notes ?? "")
    _directory = State(initialValue: task.project?.directory ?? "")
    _bucket = State(initialValue: task.bucket)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      TextField("Task title", text: $title, axis: .vertical)
        .font(.body)
        .foregroundStyle(palette.color("text"))
        .focused($titleFocused)
        .lineLimit(1...4)
        .accessibilityIdentifier("tasks.editor.title")
      TextField(
        "Notes", text: $notes, prompt: Text("Notes").foregroundStyle(palette.color("text-tertiary")),
        axis: .vertical
      )
      .font(.subheadline)
      .foregroundStyle(palette.color("text-secondary"))
      .lineLimit(3...10)
      HStack(spacing: 8) {
        field("List") {
          Picker("List", selection: $bucket) {
            ForEach(TaskBoardLogic.columns, id: \.bucket) { Text($0.label).tag($0.bucket) }
          }
        } label: {
          Text(TaskBoardLogic.label(bucket))
        }
        .accessibilityIdentifier("tasks.editor.list")
        field("Project") {
          Picker("Project", selection: $directory) {
            Text("No project").tag("")
            ForEach(model.projects) { Text($0.displayName).tag($0.canonical) }
            if let project = task.project, model.project(project.directory) == nil {
              // Keep a project that's no longer listed, so saving other fields doesn't drop it.
              Text(folderName(project.directory)).tag(project.directory)
            }
          }
        } label: {
          if let project = model.project(directory) {
            ProjectIcon(badge: ProjectBadge(name: project.displayName, icon: project.icon), size: 14)
            Text(project.displayName)
          } else {
            Text(directory.isEmpty ? "No project" : folderName(directory))
          }
        }
      }
      HStack(spacing: 4) {
        Button("Delete", role: .destructive) {
          model.delete(task)
          onClose()
        }
        .foregroundStyle(palette.color("error"))
        Spacer()
        Button("Cancel", action: onClose)
          .foregroundStyle(palette.color("text-secondary"))
          .padding(.horizontal, 8)
        Button("Save", action: save)
          .fontWeight(.medium)
          .foregroundStyle(palette.color("on-primary"))
          .padding(.horizontal, 14)
          .frame(height: 32)
          .background(palette.gradient("primary"), in: .capsule)
          .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          .accessibilityIdentifier("tasks.editor.save")
      }
      .font(.subheadline)
      .buttonStyle(.plain)
      .frame(minHeight: 40)
    }
    .padding(EdgeInsets(top: 10, leading: 11, bottom: 6, trailing: 10))
    .background(palette.color("elevated"), in: .rect(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(palette.color("border-heavy")))
    .onAppear { titleFocused = true }
  }

  private func field(
    _ name: String, @ViewBuilder picker: () -> some View, @ViewBuilder label: () -> some View
  ) -> some View {
    Menu {
      picker()
    } label: {
      HStack(spacing: 6) {
        label().lineLimit(1)
        Spacer(minLength: 2)
        Image(systemName: "chevron.up.chevron.down")
          .font(.caption2)
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .font(.footnote)
      .foregroundStyle(palette.color("text"))
      .padding(.horizontal, 10)
      .frame(maxWidth: .infinity, minHeight: 36)
      .background(palette.color("control"), in: .rect(cornerRadius: 8, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(palette.color("border")))
    }
    .accessibilityLabel(name)
  }

  private func save() {
    var input = TaskUpdate()
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty && trimmed != task.title { input.title = String(trimmed.prefix(500)) }
    if notes.trimmingCharacters(in: .whitespacesAndNewlines) != (task.notes ?? "") { input.notes = notes }
    if directory != (task.project?.directory ?? "") {
      input.project = .some(model.project(directory).map { .init(id: $0.id, directory: $0.canonical) })
    }
    if bucket != task.bucket { input.bucket = bucket }
    onClose()
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
