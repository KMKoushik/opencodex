import Foundation
import Observation

/// The task board's server state, like the desktop's `TaskBoard` queries: the plugin status,
/// the task list and the projects list. Edits apply at once and the server's copy replaces
/// them; a failure refetches. Board changes from anywhere (an agent, the TUI, another device)
/// arrive as `rpc.opencodex.tasks.changed` and are coalesced into one refetch.
@Observable
final class TasksModel {
  let client: GatewayClient
  let events: EventHub

  private(set) var status: PluginStatus?
  private(set) var statusError: String?
  /// How many times the status was read while the plugin was loading.
  private(set) var loadingPolls = 0
  private(set) var tasks: [BoardTask]?
  private(set) var tasksError: String?
  private(set) var projects: [ThreadProject] = []
  /// The last failed edit, shown in the banner until the next one succeeds.
  var editError: String?
  /// `all`, `none` (tasks without a project), or a project's canonical directory.
  var filter = "all"
  /// Whose tasks show: `all`, `user` or `agent`, remembered like the desktop's `taskAssignee`.
  var assignee = UserDefaults.standard.string(forKey: "taskAssignee") ?? "all" {
    didSet { UserDefaults.standard.set(assignee == "all" ? nil : assignee, forKey: "taskAssignee") }
  }
  /// The task an agent is being started on.
  private(set) var starting: String?
  /// Delayed labels change at midnight; a minute's lag is fine.
  private(set) var now = Date()

  /// DEBUG `-tasksDemo YES`: a fixed board with local-only edits, for screenshots against a
  /// gateway without the tasks plugin.
  let demo: Bool

  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var refreshTask: Task<Void, Never>?

  init(client: GatewayClient, events: EventHub) {
    self.client = client
    self.events = events
    #if DEBUG
      demo = UserDefaults.standard.bool(forKey: "tasksDemo")
    #else
      demo = false
    #endif
  }

  var ready: Bool { status?.state == .active || status?.state == .outdated }

  /// Loads and listens until cancelled. Call from the screen's `.task`.
  func run() async {
    subscriptions = [
      events.subscribe { [weak self] event in
        if event.type.hasPrefix("rpc.opencodex.tasks.") { self?.scheduleRefresh() }
      },
      events.onReconnect { [weak self] in
        Task { await self?.loadStatus() }
        self?.scheduleRefresh()
      },
    ]
    defer { subscriptions = [] }
    if demo {
      status = PluginStatus(state: .active)
      tasks = Self.demoTasks(now: Date())
    } else {
      await loadStatus()
    }
    async let projects: Void = loadProjects()
    if ready && !demo { await loadTasks() }
    await projects
    // One tick for the whole board, and the desktop's brief follow of a loading plugin.
    while !Task.isCancelled {
      try? await Task.sleep(for: status?.state == .loading ? .seconds(2) : .seconds(60))
      guard !Task.isCancelled else { return }
      now = Date()
      if status?.state == .loading, loadingPolls < 30 {
        await loadStatus()
        if ready { await loadTasks() }
      }
    }
  }

  func loadStatus() async {
    guard !demo else { return }
    do {
      let next = try await client.tasksPlugin()
      if next.state == .loading { loadingPolls += 1 }
      let wasReady = ready
      status = next
      statusError = nil
      if ready && !wasReady && tasks == nil { await loadTasks() }
    } catch {
      statusError = error.localizedDescription
    }
  }

  func loadTasks() async {
    guard !demo else { return }
    do {
      tasks = try await client.tasks()
      tasksError = nil
    } catch {
      tasksError = error.localizedDescription
    }
  }

  private func loadProjects() async {
    guard let list = try? await client.get("/projects", as: [ThreadProject].self) else { return }
    // One per folder in the service's recency order, like the desktop's `projectFolders`.
    var seen = Set<String>()
    projects = list.filter { seen.insert($0.canonical).inserted }
  }

  /// Coalesces change events into one refetch, like the web app's debounce.
  private func scheduleRefresh() {
    guard refreshTask == nil, !demo else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      guard let self else { return }
      self.refreshTask = nil
      if self.ready { await self.loadTasks() } else { await self.loadStatus() }
    }
  }

  // MARK: Board

  func project(_ directory: String) -> ThreadProject? {
    projects.first { $0.canonical == directory }
  }

  var groups: [BoardTask.Bucket: [BoardTask]] {
    TaskBoardLogic.group(tasks ?? [], filter: filter, assignee: assignee)
  }

  /// Projects with tasks first, then the rest in recency order.
  var filterProjects: [ThreadProject] {
    let used = Set((tasks ?? []).compactMap(\.project?.directory))
    return projects.enumerated().sorted { a, b in
      let (ua, ub) = (used.contains(a.element.canonical), used.contains(b.element.canonical))
      return ua != ub ? ua : a.offset < b.offset
    }.map(\.element)
  }

  var filterLabel: String {
    switch filter {
    case "all": "All projects"
    case "none": "No project"
    default: project(filter)?.displayName ?? folderName(filter)
    }
  }

  // MARK: Edits

  func create(title: String, bucket: BoardTask.Bucket) {
    let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty, bucket != .done else { return }
    let project = project(filter).map { BoardTask.Project(id: $0.id, directory: $0.canonical) }
    if demo {
      let siblings = groups[bucket] ?? []
      let time = Date().timeIntervalSince1970 * 1000
      tasks?.append(
        BoardTask(
          id: UUID().uuidString, title: title, bucket: bucket,
          order: TaskBoardLogic.orderBetween(siblings.last, nil), project: project, source: "user",
          time: .init(created: time, updated: time, moved: time)))
      return
    }
    Task {
      do {
        replace(
          try await client.createTask(
            TaskCreate(
              title: title, bucket: bucket, project: project,
              assignee: assignee == "agent" ? .agent : nil)))
        editError = nil
      } catch { editError = error.localizedDescription }
    }
  }

  func update(_ task: BoardTask, _ input: TaskUpdate) {
    guard !input.isEmpty else { return }
    tasks = tasks?.map { $0.id == task.id ? TaskBoardLogic.preview($0, input, now: Date()) : $0 }
    guard !demo else { return }
    Task {
      do {
        replace(try await client.updateTask(task.id, input))
        editError = nil
      } catch {
        editError = error.localizedDescription
        await loadTasks()
      }
    }
  }

  func toggleDone(_ task: BoardTask) {
    update(task, TaskUpdate(bucket: task.bucket == .done ? (task.reopen ?? .today) : .done))
  }

  /// Moves a task to the end of another list, like dropping it below the last card.
  func move(_ task: BoardTask, to bucket: BoardTask.Bucket) {
    guard bucket != task.bucket else { return }
    if bucket == .done { return update(task, TaskUpdate(bucket: .done)) }
    let siblings = (groups[bucket] ?? []).filter { $0.id != task.id }
    update(
      task, TaskUpdate(bucket: bucket, order: TaskBoardLogic.orderBetween(siblings.last, nil)))
  }

  /// Moves a task one place up or down within its list.
  func shift(_ task: BoardTask, by offset: Int) {
    guard task.bucket != .done else { return }
    let list = groups[task.bucket] ?? []
    guard let index = list.firstIndex(where: { $0.id == task.id }) else { return }
    let target = index + offset
    guard list.indices.contains(target) else { return }
    let siblings = list.filter { $0.id != task.id }
    let order = TaskBoardLogic.orderBetween(
      target > 0 ? siblings[target - 1] : nil, target < siblings.count ? siblings[target] : nil)
    update(task, TaskUpdate(order: order))
  }

  /// Starts an agent on the task: a new chat in its project, with the model last used there.
  /// Calls `opened` with the chat when it's ready.
  func start(_ task: BoardTask, opened: @escaping (String) -> Void) {
    guard starting == nil, let project = task.project, !demo else { return }
    starting = task.id
    Task {
      defer { starting = nil }
      do {
        let result = try await client.startTask(
          task.id, model: ModelPreferences.shared.model(directory: project.directory))
        replace(result.task)
        editError = nil
        opened(result.session.id)
      } catch {
        editError = error.localizedDescription
        await loadTasks()
      }
    }
  }

  func delete(_ task: BoardTask) {
    tasks?.removeAll { $0.id == task.id }
    guard !demo else { return }
    Task {
      do {
        _ = try await client.deleteTask(task.id)
        editError = nil
      } catch {
        editError = error.localizedDescription
        await loadTasks()
      }
    }
  }

  private func replace(_ task: BoardTask) {
    guard var list = tasks else { return }
    if let index = list.firstIndex(where: { $0.id == task.id }) { list[index] = task } else {
      list.append(task)
    }
    tasks = list
  }

  private static func demoTasks(now: Date) -> [BoardTask] {
    let ms = now.timeIntervalSince1970 * 1000
    let day = 86_400_000.0
    let root = "/private/var/folders/vc/0tczn37n3wn7qz1g3g1933_40000gn/T/opencode/ocios"
    func task(
      _ title: String, _ bucket: BoardTask.Bucket, _ order: Double, moved: Double = 0,
      notes: String? = nil, project: String? = nil, session: String? = nil,
      completed: Double? = nil
    ) -> BoardTask {
      BoardTask(
        id: UUID().uuidString, title: title, notes: notes, bucket: bucket, order: order,
        project: project.map { .init(id: $0, directory: "\(root)/\($0)") },
        sessionID: session, source: session == nil ? "user" : "agent",
        reopen: bucket == .done ? .today : nil,
        time: .init(
          created: ms - moved, updated: ms - moved, moved: ms - moved,
          completed: completed.map { ms - $0 }))
    }
    return [
      task("Review the release checklist", .today, 1, moved: day * 2, project: "home-demo"),
      task("Reply to the design feedback", .today, 2, moved: day, notes: "Mostly about **spacing** on the phone."),
      task("Write the changelog", .today, 3, session: "ses_demo"),
      task("Profile transcript scrolling", .week, 1, project: "proj"),
      task("Try the new theme presets", .someday, 1),
      task("Fix the flaky pairing test", .done, 1, completed: 0),
      task("Rename the sidebar section", .done, 2, completed: day),
    ]
  }
}

/// The desktop's `task-model.ts`, 1:1.
enum TaskBoardLogic {
  static let columns: [(bucket: BoardTask.Bucket, label: String)] = [
    (.today, "Today"), (.week, "This week"), (.someday, "Someday"), (.done, "Done"),
  ]

  static func label(_ bucket: BoardTask.Bucket) -> String {
    columns.first { $0.bucket == bucket }!.label
  }

  static func group(_ tasks: [BoardTask], filter: String, assignee: String = "all")
    -> [BoardTask.Bucket: [BoardTask]]
  {
    var groups: [BoardTask.Bucket: [BoardTask]] = [.today: [], .week: [], .someday: [], .done: []]
    for task in tasks {
      if filter == "none" ? task.project != nil : filter != "all" && task.project?.directory != filter {
        continue
      }
      if assignee != "all" && (task.assignee ?? .user).rawValue != assignee { continue }
      groups[task.bucket, default: []].append(task)
    }
    for (bucket, items) in groups {
      groups[bucket] =
        bucket == .done
        ? items.sorted { ($0.time.completed ?? 0) > ($1.time.completed ?? 0) }
        : items.sorted { $0.order < $1.order }
    }
    return groups
  }

  /// An order that places a task between its new neighbours without rewriting the others.
  static func orderBetween(_ before: BoardTask?, _ after: BoardTask?) -> Double {
    if let before, let after { return (before.order + after.order) / 2 }
    if let before { return before.order + 1 }
    if let after { return after.order - 1 }
    return 1
  }

  /// Whole days a Today task has been carried over from an earlier day.
  static func delayedDays(_ task: BoardTask, now: Date) -> Int {
    guard task.bucket == .today else { return 0 }
    let calendar = Calendar.current
    let days = calendar.dateComponents(
      [.day], from: calendar.startOfDay(for: task.time.moved.date),
      to: calendar.startOfDay(for: now)
    ).day ?? 0
    return max(0, days)
  }

  static func shortDate(_ time: Millis, now: Date) -> String {
    let calendar = Calendar.current
    let days =
      calendar.dateComponents(
        [.day], from: calendar.startOfDay(for: time.date), to: calendar.startOfDay(for: now)
      ).day ?? 0
    if days == 0 { return "Today" }
    if days == 1 { return "Yesterday" }
    return time.date.formatted(.dateTime.month(.abbreviated).day())
  }

  /// The desktop's optimistic `preview` of an edit.
  static func preview(_ task: BoardTask, _ input: TaskUpdate, now: Date) -> BoardTask {
    var next = task
    let time = now.timeIntervalSince1970 * 1000
    next.time.updated = time
    if let title = input.title { next.title = title.trimmingCharacters(in: .whitespacesAndNewlines) }
    if let notes = input.notes {
      let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
      next.notes = trimmed.isEmpty ? nil : trimmed
    }
    if let project = input.project { next.project = project }
    if let assignee = input.assignee { next.assignee = assignee == .agent ? .agent : nil }
    if let order = input.order { next.order = order }
    if let bucket = input.bucket, bucket != task.bucket {
      next.bucket = bucket
      next.time.moved = time
      next.time.completed = bucket == .done ? time : nil
      if bucket == .done { next.reopen = task.bucket }
    }
    return next
  }
}
