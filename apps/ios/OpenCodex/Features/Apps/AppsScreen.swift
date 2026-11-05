import Observation
import SwiftUI

/// `/api/apps`, refetched on `canvas` list and app events (coalesced) and after reconnects.
@Observable
final class AppsModel {
  let client: GatewayClient
  let events: EventHub
  private(set) var apps: [AppInfo]?
  private(set) var error: String?
  private(set) var projects: [ThreadProject] = []

  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var refreshTask: Task<Void, Never>?

  init(client: GatewayClient, events: EventHub) {
    self.client = client
    self.events = events
  }

  func run() async {
    subscriptions = [
      events.subscribe { [weak self] event in
        if event.type == "canvas", ["list", "app"].contains(event.data?["type"]?.string) {
          self?.schedule()
        }
      },
      events.onReconnect { [weak self] in self?.schedule() },
    ]
    defer { subscriptions = [] }
    async let list: Void = load()
    if let projects = try? await client.get("/projects", as: [ThreadProject].self) {
      self.projects = projects
    }
    await list
    // Stay subscribed while the page is open; poll while the event stream is down.
    await events.follow { [weak self] in await self?.load() }
  }

  func load() async {
    do {
      apps = try await client.apps()
      error = nil
    } catch {
      self.error = error.localizedDescription
    }
  }

  func schedule() {
    guard refreshTask == nil else { return }
    refreshTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      guard let self else { return }
      self.refreshTask = nil
      await self.load()
    }
  }

  func project(_ id: String?) -> ThreadProject? {
    guard let id else { return nil }
    return projects.first { $0.id == id }
  }

  func removeLocally(_ id: String) { apps?.removeAll { $0.id == id } }
}

/// The desktop's Apps page (`apps-page.tsx`): every app at a glance, and one app full-size
/// with its view, code and runs.
struct AppsScreen: View {
  @State private var model: AppsModel
  @State private var opened: AppRoute?
  private let onOpenSession: ((String) -> Void)?
  @Environment(\.palette) private var palette

  /// `app` opens one app at once, like the desktop sidebar's app entries.
  init(
    client: GatewayClient, events: EventHub? = nil, app: String? = nil,
    onOpenSession: ((String) -> Void)? = nil
  ) {
    // Without the shared hub (e.g. a standalone preview), a stopped one simply never fires.
    _model = State(initialValue: AppsModel(client: client, events: events ?? EventHub()))
    _opened = State(initialValue: app.map(AppRoute.init))
    self.onOpenSession = onOpenSession
  }

  var body: some View {
    Group {
      if let apps = model.apps {
        if apps.isEmpty { empty } else { index(apps) }
      } else if let error = model.error {
        PanelUnavailable(
          "Couldn’t load apps", systemImage: "exclamationmark.triangle", message: error,
          tone: "error"
        ) {
          Button("Retry") { Task { await model.load() } }.buttonStyle(.bordered)
        }
      } else {
        PanelLoading("Loading apps…")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(palette.color("surface").ignoresSafeArea())
    .navigationTitle("Apps")
    .navigationSubtitle(subtitle)
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(item: $opened) { route in
      AppDetail(model: model, id: route.id, onOpenSession: onOpenSession)
    }
    .task { await model.run() }
  }

  /// "3 apps · 1 running · 1 failing", the page header's count.
  private var subtitle: String {
    guard let apps = model.apps, !apps.isEmpty else { return "" }
    let running = apps.filter { !$0.running.isEmpty }.count
    let failing = apps.filter(\.failing).count
    return "\(apps.count) \(apps.count == 1 ? "app" : "apps")\(running > 0 ? " · \(running) running" : "")\(failing > 0 ? " · \(failing) failing" : "")"
  }

  private var empty: some View {
    PanelUnavailable(
      "No apps yet", systemImage: "square.grid.2x2",
      message:
        "An app is a canvas with code behind it that can call OpenCode. Ask for one in any chat, for example: “Every day, check open PRs and issues in my repo, fix the easy ones, and show me a dashboard of what needs my decision.”"
    )
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("apps.empty")
  }

  private func index(_ apps: [AppInfo]) -> some View {
    List {
      Section {
        ForEach(apps) { app in
          Button {
            opened = AppRoute(id: app.id)
          } label: {
            AppTile(app: app, project: model.project(app.projectID))
          }
          .tint(palette.color("text"))
          .panelRow(palette)
          .accessibilityIdentifier("apps.tile")
        }
      }
    }
    .panelList(palette)
    .refreshable { await model.load() }
  }
}

private struct AppRoute: Hashable { var id: String }

private struct AppTile: View {
  let app: AppInfo
  let project: ThreadProject?
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 12) {
      AppIcon(id: app.id, title: app.title, icon: app.icon, size: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(app.title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(palette.color("text"))
          .lineLimit(1)
        AppStatusLine(app: app, schedule: false)
          .font(.footnote)
          .foregroundStyle(palette.color(app.failing && app.running.isEmpty ? "error" : "text-secondary"))
          .lineLimit(1)
        HStack(spacing: 10) {
          Text(app.schedule.isEmpty ? "On demand" : app.schedule.prefix(1).uppercased() + app.schedule.dropFirst())
            .lineLimit(1)
          if let project {
            HStack(spacing: 5) {
              ProjectIcon(badge: ProjectBadge(name: project.displayName, icon: project.icon), size: 13)
              Text(project.displayName).lineLimit(1)
            }
          }
        }
        .font(.caption)
        .foregroundStyle(palette.color("text-tertiary"))
        .padding(.top, 2)
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(palette.color("text-tertiary"))
    }
    .padding(.vertical, 6)
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(.rect)
  }
}

/// The desktop's `AppStatus`.
private struct AppStatusLine: View {
  let app: AppInfo
  var schedule = true
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 5) {
      if app.error != nil {
        Image(systemName: "exclamationmark.triangle")
          .foregroundStyle(palette.color("error"))
        Text("server.ts failed")
      } else if !app.running.isEmpty {
        ProgressView().controlSize(.mini)
        Text("Running \(app.running.joined(separator: ", "))")
      } else {
        Text(text)
      }
    }
  }

  private var text: String {
    let every = schedule ? app.schedule : ""
    let last =
      app.lastRun.map { "\($0.status == "error" ? "Failed" : "Ran") \(AppTime.ago($0.ended ?? $0.started))" }
      ?? "Never run"
    return every.isEmpty ? last : "\(last) · \(every)"
  }
}

enum AppTime {
  /// `3 min ago`, `in 9 hr`, `yesterday`, like the desktop's short relative format.
  static func ago(_ time: Millis, now: Date = Date()) -> String {
    let seconds = (time - now.timeIntervalSince1970 * 1000) / 1000
    if abs(seconds) >= 86_400 {
      let formatter = RelativeDateTimeFormatter()
      formatter.dateTimeStyle = .named
      formatter.unitsStyle = .short
      let days = (seconds / 86_400).rounded()
      return formatter.localizedString(from: DateComponents(day: Int(days)))
    }
    for (unit, size) in [("hr", 3_600.0), ("min", 60.0)] where abs(seconds) >= size {
      let count = Int((abs(seconds) / size).rounded())
      return seconds < 0 ? "\(count) \(unit) ago" : "in \(count) \(unit)"
    }
    return "just now"
  }

  static func duration(_ started: Millis, _ ended: Millis?) -> String {
    let ms = (ended ?? Date().timeIntervalSince1970 * 1000) - started
    if ms < 1000 { return "\(Int(ms)) ms" }
    if ms < 60_000 { return String(format: "%.1f s", ms / 1000) }
    return "\(Int((ms / 60_000).rounded())) min"
  }
}

// MARK: - Detail

private struct AppDetail: View {
  let model: AppsModel
  let id: String
  let onOpenSession: ((String) -> Void)?
  @State private var tab = "app"
  @State private var showRuns = false
  @State private var deleting = false
  @State private var deleteError: String?
  @State private var runError: String?
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    if let app = model.apps?.first(where: { $0.id == id }) {
      VStack(spacing: 0) {
        header(app)
        if let error = app.error ?? runError {
          Text(error)
            .font(.footnote.monospaced())
            .foregroundStyle(palette.color("error"))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(palette.color("error").opacity(0.08))
        }
        if tab == "app" {
          CanvasPanel(
            client: model.client, events: model.events, id: app.id, title: app.title,
            onOpenSession: onOpenSession)
        } else {
          AppCode(client: model.client, id: app.id)
        }
      }
      .background(palette.color("surface").ignoresSafeArea())
      .navigationTitle(app.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { toolbar(app) }
      .sheet(isPresented: $showRuns) {
        AppRunsSheet(client: model.client, app: app, onOpenSession: onOpenSession)
      }
      .alert("Delete app?", isPresented: $deleting) {
        Button("Cancel", role: .cancel) {}
        Button("Delete", role: .destructive) { Task { await delete(app) } }
      } message: {
        Text(
          deleteError
            ?? "“\(app.title)” stops running. Its code, data, run history, and the agent sessions it started are deleted. Pull requests and other changes it already made stay."
        )
      }
    } else {
      Group {
        if model.apps != nil {
          PanelUnavailable("This app was deleted.", systemImage: "square.grid.2x2")
        } else if let error = model.error {
          PanelUnavailable(
            "Couldn’t load apps", systemImage: "exclamationmark.triangle", message: error,
            tone: "error")
        } else {
          PanelLoading("Loading apps…")
        }
      }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.color("surface").ignoresSafeArea())
        // Opened straight from a link, before the index has loaded.
        .task { if model.apps == nil { await model.load() } }
    }
  }

  private func header(_ app: AppInfo) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 12) {
        AppIcon(id: app.id, title: app.title, icon: app.icon, size: 32)
        VStack(alignment: .leading, spacing: 1) {
          Text(app.title)
            .font(.headline)
            .foregroundStyle(palette.color("text"))
            .lineLimit(1)
          HStack(spacing: 5) {
            AppStatusLine(app: app)
            if let project = model.project(app.projectID) {
              Text("·")
              ProjectIcon(badge: ProjectBadge(name: project.displayName, icon: project.icon), size: 12)
              Text(project.displayName)
            }
          }
          .font(.caption)
          .foregroundStyle(palette.color("text-tertiary"))
          .lineLimit(1)
        }
        Spacer(minLength: 0)
      }
      Picker("Show", selection: $tab) {
        Text("App").tag("app")
        Text("Code").tag("code")
      }
      .pickerStyle(.segmented)
      .accessibilityIdentifier("apps.tab")
    }
    .padding(.horizontal, 16)
    .padding(.top, 8)
    .padding(.bottom, 10)
    .overlay(alignment: .bottom) { palette.color("border").frame(height: 1) }
  }

  @ToolbarContentBuilder private func toolbar(_ app: AppInfo) -> some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      Menu {
        if let session = app.sessionID, let onOpenSession {
          Button("Open chat", systemImage: "message") { onOpenSession(session) }
        }
        let runnable = app.triggers.keys.sorted()
        if !runnable.isEmpty {
          Section {
            ForEach(runnable, id: \.self) { name in
              Button("Run \(name)", systemImage: "play") { run(app, name) }
                .disabled(app.running.contains(name))
            }
          }
        }
        Button("Runs (\(app.runCount))", systemImage: "list.bullet.rectangle") { showRuns = true }
          .accessibilityIdentifier("apps.runs")
        Divider()
        Button("Delete app…", systemImage: "trash", role: .destructive) {
          deleteError = nil
          deleting = true
        }
      } label: {
        Label("App actions", systemImage: "ellipsis")
      }
      .accessibilityIdentifier("apps.actions")
    }
  }

  private func run(_ app: AppInfo, _ name: String) {
    runError = nil
    model.schedule()
    Task {
      do { _ = try await model.client.callCanvasFunction(app.id, name: name, args: []) } catch {
        runError = error.localizedDescription
      }
      model.schedule()
    }
  }

  private func delete(_ app: AppInfo) async {
    do {
      _ = try await model.client.deleteCanvas(app.id)
      model.removeLocally(app.id)
      model.schedule()
      dismiss()
    } catch {
      deleteError = error.localizedDescription
      deleting = true
    }
  }
}

/// The app's source files, read-only (`app-code.tsx`); edits go through the app's chat.
private struct AppCode: View {
  let client: GatewayClient
  let id: String
  @State private var files: [CanvasFiles.File]?
  @State private var error: String?
  @State private var selected: String?
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      if let files {
        if files.isEmpty {
          PanelUnavailable("No source files", systemImage: "doc.text")
        } else if let current {
          HStack(spacing: 8) {
            Menu {
              Picker("Source file", selection: selection) {
                ForEach(files, id: \.name) { file in
                  Label(file.name, systemImage: "doc.text").tag(file.name)
                }
              }
            } label: {
              HStack(spacing: 6) {
                Image(systemName: "doc.text")
                Text(current.name).lineLimit(1)
                Image(systemName: "chevron.up.chevron.down").font(.caption2)
              }
              .font(.footnote.monospaced())
              .foregroundStyle(palette.color("text"))
              .frame(minHeight: 44)
              .contentShape(.rect)
            }
            .accessibilityLabel("Source file")
            .accessibilityValue(current.name)
            .accessibilityIdentifier("apps.code.file")
            Spacer(minLength: 8)
            Text("\(current.text.split(separator: "\n", omittingEmptySubsequences: false).count) lines")
              .font(.caption.monospacedDigit())
              .foregroundStyle(palette.color("text-tertiary"))
            ShareLink(item: current.text, subject: Text(current.name)) {
              Image(systemName: "square.and.arrow.up")
                .frame(width: 44, height: 44)
                .contentShape(.rect)
            }
            .foregroundStyle(palette.color("text-secondary"))
            .accessibilityLabel("Share \(current.name)")
            .accessibilityIdentifier("apps.code.share")
          }
          .padding(.leading, 16)
          .padding(.trailing, 6)
          .overlay(alignment: .bottom) { palette.color("border").frame(height: 1 / 3) }
          ScrollView([.vertical, .horizontal]) {
            Text(current.text)
              .font(.caption.monospaced())
              .foregroundStyle(palette.color("text"))
              .textSelection(.enabled)
              .padding(16)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          .background(palette.color("code-bg"))
          .accessibilityIdentifier("apps.code.text")
        }
      } else if let error {
        PanelUnavailable(
          "Couldn’t load the code", systemImage: "exclamationmark.triangle", message: error,
          tone: "error")
      } else {
        PanelLoading("Loading…")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .task {
      do { files = try await client.canvasFiles(id).files } catch {
        self.error = error.localizedDescription
      }
    }
  }

  private var current: CanvasFiles.File? {
    files?.first { $0.name == selected } ?? files?.first
  }

  private var selection: Binding<String> {
    Binding { current?.name ?? "" } set: { selected = $0 }
  }
}

/// The desktop's Runs list, loaded only while open.
private struct AppRunsSheet: View {
  let client: GatewayClient
  let app: AppInfo
  let onOpenSession: ((String) -> Void)?
  @State private var runs: [AppRun]?
  @State private var error: String?
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Group {
        if let runs, runs.isEmpty {
          PanelUnavailable("No runs yet", systemImage: "list.bullet.rectangle")
        } else if let runs {
          List {
            ForEach(runs) { run in
              RunRow(run: run) { session in
                dismiss()
                onOpenSession?(session)
              }
              .panelRow(palette)
            }
          }
          .panelList(palette)
        } else if let error {
          PanelUnavailable(
            "Couldn’t load runs", systemImage: "exclamationmark.triangle", message: error,
            tone: "error")
        } else {
          PanelLoading("Loading runs…")
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(palette.color("surface"))
      .navigationTitle("Runs")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done", role: .confirm) { dismiss() } }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .presentationBackground(palette.color("surface"))
    .task {
      do { runs = try await client.appRuns(app.id) } catch { self.error = error.localizedDescription }
    }
  }
}

private struct RunRow: View {
  let run: AppRun
  let openSession: (String) -> Void
  @State private var open: Bool
  @Environment(\.palette) private var palette

  init(run: AppRun, openSession: @escaping (String) -> Void) {
    self.run = run
    self.openSession = openSession
    _open = State(initialValue: run.status == "error")
  }

  private var detail: Bool {
    run.error != nil || !(run.logs ?? []).isEmpty || !(run.sessions ?? []).isEmpty
      || !(run.calls ?? []).isEmpty
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Button {
        open.toggle()
      } label: {
        HStack(spacing: 8) {
          Circle().fill(palette.color(dot)).frame(width: 7, height: 7)
          Text("\(run.fn)()")
            .font(.footnote.monospaced())
            .foregroundStyle(palette.color("text"))
          Text(
            "\(run.status) · \(run.source) · \(AppTime.ago(run.started)) · \(AppTime.duration(run.started, run.ended))"
          )
          .font(.caption)
          .foregroundStyle(palette.color("text-tertiary"))
          .lineLimit(1)
        }
      }
      .buttonStyle(.plain)
      .disabled(!detail)
      if open && detail {
        ForEach(run.sessions ?? [], id: \.id) { session in
          Button {
            openSession(session.id)
          } label: {
            Label(session.title, systemImage: "arrow.up.right")
              .font(.footnote)
              .foregroundStyle(palette.color("link"))
          }
          .buttonStyle(.plain)
        }
        ForEach(Array((run.calls ?? []).enumerated()), id: \.offset) { _, call in
          HStack(spacing: 6) {
            Text("oc.\(call.kind)").font(.caption.monospaced())
            Text(call.model ?? "choosing model…").lineLimit(1)
            Text(call.ended == nil ? "running" : AppTime.duration(call.started, call.ended))
              .foregroundStyle(palette.color("text-tertiary"))
          }
          .font(.caption)
          .foregroundStyle(palette.color(call.error == nil ? "text-secondary" : "error"))
        }
        if let error = run.error {
          Text(error).font(.caption.monospaced()).foregroundStyle(palette.color("error"))
        }
        if let logs = run.logs, !logs.isEmpty {
          Text(logs.joined(separator: "\n"))
            .font(.caption2.monospaced())
            .foregroundStyle(palette.color("text-secondary"))
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(palette.color("code-bg"), in: .rect(cornerRadius: 8))
        }
      }
    }
  }

  private var dot: String {
    switch run.status {
    case "error": "error"
    case "running": "accent"
    case "ok": "success"
    default: "text-tertiary"
    }
  }
}
