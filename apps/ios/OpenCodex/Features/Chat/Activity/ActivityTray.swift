import Observation
import SwiftUI

/// The tray's open/collapsed state: one app-wide preference, collapsed by default, kept
/// across chats, screens and launches (the desktop's `activityTrayOpen`).
@Observable
final class ActivityTrayPreference {
  static let shared = ActivityTrayPreference()
  private static let key = "activityTrayOpen"

  var open: Bool { didSet { UserDefaults.standard.set(open, forKey: Self.key) } }

  private init() { open = UserDefaults.standard.bool(forKey: Self.key) }
}

/// Running shells and subagents above the composer, with tabs, "Move to background" and a
/// collapse chevron. Port of the desktop `activity-tray.tsx`. Ticking rows live inside it, so
/// neither the transcript nor the composer re-renders for them.
struct ActivityTray: View {
  let model: ChatModel
  /// Opens a subagent; by default the tray shows it read-only in a sheet.
  var onOpenSubagent: ((String) -> Void)?

  init(model: ChatModel, onOpenSubagent: ((String) -> Void)? = nil) {
    self.model = model
    self.onOpenSubagent = onOpenSubagent
  }

  private var activity: ActivityModel { .shared(for: model) }
  /// The open output sheet and reader live here, not in the tray body, so they stay open
  /// when the work finishes and the tray goes away: the final output is what you came for.
  @State private var shell: Identified?
  @State private var subagent: Identified?
  /// The reader opens tall: a transcript needs the room; drag down to peek at the chat.
  @State private var readerDetent: PresentationDetent = .large

  var body: some View {
    VStack(spacing: 0) {
      if activity.visible {
        TrayBody(
          model: model, activity: activity, onOpenSubagent: onOpenSubagent, shell: $shell,
          subagent: $subagent
        )
        .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .frame(maxWidth: .infinity)
    .sheet(item: $shell) { item in
      if let directory = model.projectDirectory {
        ShellOutputSheet(client: model.client, events: model.events, directory: directory, id: item.id)
      }
    }
    .sheet(item: $subagent) { item in
      NavigationStack {
        SubagentReader(client: model.client, events: model.events, sessionID: item.id)
          .toolbar {
            ToolbarItem(placement: .topBarLeading) {
              Button("Close", systemImage: "xmark") { subagent = nil }
                .accessibilityIdentifier("subagent.close")
            }
          }
      }
      .presentationDetents([.medium, .large], selection: $readerDetent)
      .presentationDragIndicator(.visible)
      .presentationContentInteraction(.scrolls)
    }
    .animation(.snappy(duration: 0.25), value: activity.visible)
    .task(id: model.sessionID) { await activity.run() }
    // Shells are listed per project, which a chat knows once its session loads.
    .onChange(of: model.projectDirectory) { activity.retry(.shells) }
  }
}

private struct Identified: Identifiable, Hashable { let id: String }

private struct TrayBody: View {
  enum Tab { case subagents, shell }

  let model: ChatModel
  let activity: ActivityModel
  let onOpenSubagent: ((String) -> Void)?
  @Binding var shell: Identified?
  @Binding var subagent: Identified?

  @Environment(\.palette) private var palette
  @State private var selected: Tab?
  @State private var moving = false
  @State private var width: CGFloat = 400
  @Namespace private var glass
  private var preference: ActivityTrayPreference { .shared }

  private var blocking: BlockingWork { model.blockingWork }
  private var hasSubagents: Bool {
    activity.subagentStatus == .failed || !activity.subagents.isEmpty
  }
  private var tab: Tab { selected ?? (hasSubagents ? .subagents : .shell) }
  private var open: Bool { preference.open }
  private var blocked: Int { blocking.shells.count + blocking.subagents.count }
  private var approvals: Int { activity.attention.values.filter { $0 == .permission }.count }
  private var questions: Int { activity.attention.values.filter { $0 == .question }.count }
  private var requestErrors: Bool { activity.attention.values.contains(.error) }

  private var rows: Int {
    let failed = activity.subagentStatus == .failed || activity.shellStatus == .failed
    return min(4, max(failed ? 2 : 1, activity.subagents.count, activity.shells.count))
  }

  var body: some View {
    // One glass shape that morphs between OpenCode's "4 shells" pill and the open panel.
    GlassEffectContainer(spacing: 8) {
      if open {
        VStack(spacing: 0) {
          header
          panel
        }
        .padding(.horizontal, 6)
        .padding(.top, 2)
        .padding(.bottom, 2)
        .glassEffect(.regular, in: .rect(cornerRadius: 22))
        .glassEffectID("tray", in: glass)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
      } else {
        pill
      }
    }
    .padding(.horizontal, 14)
    .padding(.bottom, 6)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Running activity")
    .accessibilityValue(summary)
    .accessibilityIdentifier("activity.tray")
  }

  // MARK: Collapsed

  /// Collapsed, the tray is one small Liquid Glass pill above the composer, like OpenCode's
  /// "5 shells": what's running, a dot when something needs you, and Background while the
  /// reply waits.
  private var pill: some View {
    HStack(spacing: 8) {
      Button {
        withAnimation(.bouncy(duration: 0.4)) { preference.open = true }
      } label: {
        HStack(spacing: 7) {
          RingSpinner(size: 12)
          Text(pillText).lineLimit(1)
          if approvals > 0 || questions > 0 {
            Text(approvals > 0 ? "!" : "?")
              .font(.caption2.weight(.bold))
              .foregroundStyle(palette.color(approvals > 0 ? "on-accent" : "on-primary"))
              .frame(width: 15, height: 15)
              .background(palette.color(approvals > 0 ? "warning" : "accent"), in: .circle)
          }
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(palette.color("text-secondary"))
        .padding(.horizontal, 12)
        .frame(minHeight: 32)
        .glassEffect(.regular.interactive(), in: .capsule)
        .glassEffectID("tray", in: glass)
        .frame(minHeight: 44)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(pillText)
      .accessibilityValue(summary)
      .accessibilityHint("Shows the running shells and subagents.")
      .accessibilityIdentifier("activity.pill")

      if blocked > 0 {
        Button {
          Task { await model.moveToBackground() }
        } label: {
          Text("Background")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(palette.color("text-secondary"))
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .glassEffect(.regular.interactive(), in: .capsule)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Move to background")
        .accessibilityIdentifier("activity.background")
      }
      Spacer(minLength: 0)
    }
  }

  private var pillText: String {
    var parts: [String] = []
    let shells = activity.shells.count
    let subagents = activity.subagents.count
    if subagents > 0 { parts.append("\(subagents) \(subagents == 1 ? "subagent" : "subagents")") }
    if shells > 0 { parts.append("\(shells) \(shells == 1 ? "shell" : "shells")") }
    if activity.subagentStatus == .failed || activity.shellStatus == .failed {
      parts.append("couldn't check")
    }
    return parts.isEmpty ? "Running" : parts.joined(separator: " · ")
  }

  // MARK: Header

  private var header: some View {
    // Narrow phones drop the tab icons, then shorten the background action.
    ViewThatFits(in: .horizontal) {
      headerRow(icons: true, shortAction: false)
      headerRow(icons: false, shortAction: false)
      headerRow(icons: false, shortAction: true)
    }
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
  }

  private func headerRow(icons: Bool, shortAction: Bool) -> some View {
    HStack(spacing: 4) {
      tabButton(
        .subagents, icons: icons,
        count: activity.subagentStatus == .failed
          ? "?" : activity.subagentStatus == .pending ? "…" : "\(activity.subagents.count)",
        alert: activity.subagentStatus == .failed || requestErrors
          ? .error : approvals > 0 ? .approval : questions > 0 ? .question : nil,
        alertLabel: activity.subagentStatus == .failed
          ? "Could not check running subagents"
          : requestErrors
            ? "Could not check requests"
            : approvals > 0 ? "\(approvals) need approval" : "\(questions) have questions")
      tabButton(
        .shell, icons: icons,
        count: activity.shellStatus == .failed
          ? "?"
          : activity.shellStatus == .pending && model.projectDirectory != nil
            ? "…" : "\(activity.shells.count)",
        alert: activity.shellStatus == .failed ? .error : nil,
        alertLabel: "Could not check running shell commands")
      Spacer(minLength: 0)
      if blocked > 0 {
        Button {
          Task { await moveToBackground() }
        } label: {
          Text(moving ? "Moving…" : shortAction ? "Background" : "Move to background")
            .font(.caption.weight(.medium))
            .foregroundStyle(palette.color("text-secondary"))
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 8)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(TrayRowStyle())
        .disabled(moving)
        .accessibilityLabel(moving ? "Moving to background" : "Move to background")
        .accessibilityHint(
          "Lets the agent read your message without waiting for running commands and subagents.")
        .accessibilityIdentifier("activity.background")
      }
      Button {
        withAnimation(.bouncy(duration: 0.4)) { preference.open.toggle() }
      } label: {
        Image(systemName: ActivitySymbol.open)
          .font(.footnote.weight(.medium))
          .foregroundStyle(palette.color("text-tertiary"))
          .rotationEffect(.degrees(open ? 90 : 0))
          .frame(width: 44, height: 44)
          .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(open ? "Collapse running activity" : "Expand running activity")
      .accessibilityIdentifier("activity.toggle")
    }
  }

  private func tabButton(
    _ value: Tab, icons: Bool, count: String, alert: AttentionDot.Kind?, alertLabel: String
  ) -> some View {
    let isSelected = tab == value
    let name = value == .subagents ? "Subagents" : "Shell"
    return Button {
      selected = value
      withAnimation(.bouncy(duration: 0.4)) { preference.open = true }
    } label: {
      HStack(spacing: 6) {
        if icons {
          if value == .subagents {
            RobotIcon(size: 14)
          } else {
            Image(systemName: ActivitySymbol.shell).font(.caption)
          }
        }
        Text("\(name) \(Text("(\(count))").foregroundStyle(palette.color("text-tertiary")).monospacedDigit())")
          .lineLimit(1)
          .fixedSize()
        if let alert { AttentionDot(kind: alert) }
      }
      .font(.caption.weight(.medium))
      .foregroundStyle(palette.color(isSelected ? "text" : "text-tertiary"))
      .padding(.horizontal, 8)
      .frame(minHeight: 36)
      // Concentric with the 22 pt panel: a capsule hugging its rounded top corners.
      .background(isSelected ? palette.color("selected") : .clear, in: .capsule)
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(name) (\(count))\(alert == nil ? "" : " · \(alertLabel)")")
    .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    .accessibilityIdentifier(value == .subagents ? "activity.tab.subagents" : "activity.tab.shell")
  }

  // MARK: Panel

  private var panel: some View {
    ScrollView {
      Group {
        switch tab {
        case .subagents: subagentPanel
        case .shell: shellPanel
        }
      }
      .padding(.bottom, 4)
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(height: CGFloat(rows) * 44 + 4)
    .transition(.opacity)
  }

  @ViewBuilder private var subagentPanel: some View {
    if activity.subagentStatus == .failed {
      TrayError(message: "Could not check running subagents") { activity.retry(.subagents) }
    } else if activity.subagents.isEmpty {
      TrayEmpty(
        text: activity.subagentStatus == .pending
          ? "Checking running subagents…" : "No running subagents")
    } else {
      // One ticker for the list, and only while some row shows elapsed time.
      Ticker(enabled: activity.subagents.contains { $0.started != nil }) { now in
        VStack(spacing: 0) {
          ForEach(activity.subagents) { item in
            SubagentRow(
              item: item,
              attention: activity.attention[item.id],
              foreground: blocking.subagents.contains(item.id),
              showAgent: width > 400,
              now: now
            ) { open(subagent: item.id) }
          }
        }
      }
    }
  }

  @ViewBuilder private var shellPanel: some View {
    if activity.shellStatus == .failed {
      TrayError(message: "Could not check running shell commands") { activity.retry(.shells) }
    } else if activity.shells.isEmpty {
      TrayEmpty(
        text: activity.shellStatus == .pending && model.projectDirectory != nil
          ? "Checking running shell commands…" : "No running shell commands")
    } else {
      Ticker(enabled: true) { now in
        VStack(spacing: 0) {
          ForEach(activity.shells) { item in
            ShellRow(shell: item, foreground: blocks(item), now: now) {
              shell = Identified(id: item.id)
            }
          }
        }
      }
    }
  }

  // MARK: Actions

  private func open(subagent id: String) {
    if let onOpenSubagent { onOpenSubagent(id) } else { subagent = Identified(id: id) }
  }

  /// Port of `blocksReply`: the reply waits on this shell.
  private func blocks(_ shell: ShellInfo) -> Bool {
    blocking.shells.contains { item in
      if let id = item.id { return id == shell.id }
      return item.command != nil && item.command == shell.command
    }
  }

  private func moveToBackground() async {
    moving = true
    await model.moveToBackground()
    moving = false
  }

  private var summary: String {
    var parts: [String] = [
      activity.subagentStatus == .failed
        ? "Could not check running subagents" : "\(activity.subagents.count) running subagents",
      activity.shellStatus == .failed
        ? "Could not check running shell commands"
        : "\(activity.shells.count) running shell commands",
    ]
    if approvals > 0 { parts.append("\(approvals) need approval") }
    if questions > 0 { parts.append("\(questions) have questions") }
    if requestErrors { parts.append("Could not check subagent requests") }
    if blocked > 0 { parts.append("The reply is waiting on \(blocked) of them") }
    return parts.joined(separator: " · ")
  }
}

/// Wall-clock milliseconds that tick once a second while enabled, for one list of rows.
private struct Ticker<Content: View>: View {
  let enabled: Bool
  @ViewBuilder let content: (Millis) -> Content

  var body: some View {
    if enabled {
      TimelineView(.periodic(from: .now, by: 1)) { context in content(nowMillis(context.date)) }
    } else {
      content(nowMillis())
    }
  }
}

private struct TrayEmpty: View {
  let text: String
  @Environment(\.palette) private var palette

  var body: some View {
    Text(text)
      .font(.caption)
      .foregroundStyle(palette.color("text-tertiary"))
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 8)
      .padding(.vertical, 12)
  }
}

private struct TrayError: View {
  let message: String
  let retry: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 8) {
      Text(message)
        .font(.caption)
        .foregroundStyle(palette.color("error"))
        .frame(maxWidth: .infinity, alignment: .leading)
      Button("Retry", action: retry)
        .font(.footnote.weight(.medium))
        .foregroundStyle(palette.color("text-secondary"))
        .frame(minHeight: 44)
        .padding(.horizontal, 8)
        .buttonStyle(.plain)
    }
    .padding(.horizontal, 8)
    .accessibilityElement(children: .contain)
  }
}
