import SwiftUI

/// What a permission request wants to do, read from its action, resources and metadata.
nonisolated struct PermissionSummary {
  struct FileChange: Identifiable {
    var id: String { file }
    var file: String
    var patch: String?
    var additions: Int?
    var deletions: Int?
  }

  var title: String
  var icon: String
  /// A shell command or other resources, shown as code.
  var code: String?
  var files: [FileChange] = []

  init(_ request: PermissionRequest) {
    let resources = (request.resources ?? []).filter { !$0.isEmpty }
    let files: [FileChange] = (request.metadata?["files"]?.array ?? []).compactMap { item in
      guard let file = item["file"]?.string ?? item["path"]?.string else { return nil }
      return FileChange(
        file: file, patch: item["patch"]?.string,
        additions: item["additions"]?.number.map { Int($0) },
        deletions: item["deletions"]?.number.map { Int($0) })
    }
    let names = files.isEmpty ? resources : files.map(\.file)
    let target =
      names.count == 1
      ? (names[0] as NSString).lastPathComponent : names.isEmpty ? "" : "\(names.count) files"

    switch request.action {
    case "edit", "write", "patch", "apply_patch":
      title = target.isEmpty ? "Edit files" : "Edit \(target)"
      icon = "pencil"
      self.files = files
      if files.isEmpty, names.count > 1 { code = names.joined(separator: "\n") }
    case "shell", "bash":
      title = "Run a command"
      icon = "terminal"
      code = request.metadata?["command"]?.string ?? resources.joined(separator: "\n")
    default:
      let verbs: [String: (String, String)] = [
        "read": ("Read", "doc.text"),
        "list": ("List", "folder"),
        "glob": ("Search files in", "magnifyingglass"),
        "grep": ("Search", "magnifyingglass"),
        "webfetch": ("Fetch", "globe"),
        "websearch": ("Search the web for", "globe"),
        "external_directory": ("Access", "folder.badge.questionmark"),
        "task": ("Start a subagent", "person.2"),
        "subagent": ("Start a subagent", "person.2"),
      ]
      let (verb, symbol) =
        verbs[request.action]
        ?? (request.action.replacingOccurrences(of: "_", with: " ").capitalized, "hand.raised")
      icon = symbol
      if resources.count == 1, resources[0] != "*", resources[0].count <= 48, !resources[0].contains("\n") {
        title = "\(verb) \(resources[0])"
      } else {
        title = verb
        let shown = resources.filter { $0 != "*" }
        if !shown.isEmpty { code = shown.joined(separator: "\n") }
      }
    }
  }
}

/// One pending approval: what the agent wants to do, a diff for edits, and the decisions.
struct PermissionCard: View {
  let model: ChatModel
  let request: PermissionRequest
  /// Like the desktop: Always allow only when the request names patterns to save.
  private var canAlways: Bool { !(request.save ?? []).isEmpty }

  @State private var busy: PermissionDecision?
  @State private var error: String?

  var body: some View {
    let summary = PermissionSummary(request)
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Image(systemName: summary.icon)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.orange)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 1) {
          Text("Approval needed")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
          Text(summary.title)
            .font(.headline)
            .lineLimit(2)
        }
      }
      .accessibilityElement(children: .combine)

      if let code = summary.code {
        Text(code)
          .font(.callout.monospaced())
          .lineLimit(6)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(10)
          .background(.fill.tertiary, in: .rect(cornerRadius: 12))
      }
      ForEach(summary.files) { file in
        DiffPreview(file: file, showsName: summary.files.count > 1)
      }

      if let error {
        Label(error, systemImage: "exclamationmark.triangle.fill")
          .font(.footnote)
          .foregroundStyle(.red)
      }

      ViewThatFits(in: .horizontal) {
        HStack(spacing: 8) {
          decision(.reject, "Reject", role: .destructive)
          if canAlways { decision(.always, "Always allow") }
          decision(.once, "Allow once", prominent: true)
        }
        .controlSize(.regular)
        VStack(spacing: 8) {
          decision(.once, "Allow once", prominent: true)
          if canAlways { decision(.always, "Always allow") }
          decision(.reject, "Reject", role: .destructive)
        }
        .controlSize(.large)
      }
      .disabled(busy != nil)
    }
    .padding(14)
    .glassEffect(.regular, in: .rect(cornerRadius: 22))
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("request.permission")
  }

  private func decision(
    _ decision: PermissionDecision, _ title: String, role: ButtonRole? = nil, prominent: Bool = false
  ) -> some View {
    Button(role: role) {
      Task { await reply(decision) }
    } label: {
      ZStack {
        Text(title).opacity(busy == decision ? 0 : 1)
        if busy == decision { ProgressView().controlSize(.small) }
      }
      .font(.subheadline.weight(.semibold))
      .lineLimit(1)
      .fixedSize()
      .frame(maxWidth: .infinity, minHeight: 28)
    }
    .buttonStyle(prominent ? AnyPrimitiveButtonStyle(.glassProminent) : AnyPrimitiveButtonStyle(.glass))
    .tint(role == .destructive ? .red : nil)
    .accessibilityIdentifier("permission.\(decision.rawValue)")
  }

  private func reply(_ decision: PermissionDecision) async {
    guard busy == nil else { return }
    busy = decision
    error = nil
    await model.reply(request, decision)
    busy = nil
    // The reply failed if the request is still pending; keep its error on the card.
    if model.permissions.contains(where: { $0.id == request.id }), let failure = model.error {
      error = failure
      model.error = nil
    }
  }
}

/// A compact unified diff: +/- lines tinted, collapsed to eight lines.
struct DiffPreview: View {
  let file: PermissionSummary.FileChange
  var showsName = false

  @State private var expanded = false

  private struct Line: Identifiable {
    enum Kind { case added, removed, hunk, context }
    var id: Int
    var text: String
    var kind: Kind
  }

  private static let collapsed = 8
  /// Bounds work and memory for very large patches.
  private static let limit = 400

  private var lines: [Line] {
    guard let patch = file.patch else { return [] }
    var lines: [Line] = []
    var header = true
    for raw in patch.prefix(64_000).split(separator: "\n", omittingEmptySubsequences: false) {
      if header {
        if raw.hasPrefix("@@") { header = false } else { continue }
      }
      if raw.hasPrefix("\\") { continue }
      let kind: Line.Kind =
        raw.hasPrefix("@@") ? .hunk : raw.hasPrefix("+") ? .added : raw.hasPrefix("-") ? .removed : .context
      lines.append(Line(id: lines.count, text: String(raw), kind: kind))
      if lines.count >= Self.limit { break }
    }
    while lines.last?.kind == .context, lines.last?.text.isEmpty == true { lines.removeLast() }
    // A single new-file hunk header says nothing the counts don't.
    if lines.first?.kind == .hunk, lines.dropFirst().allSatisfy({ $0.kind == .added }) {
      lines.removeFirst()
    }
    return lines
  }

  var body: some View {
    let lines = self.lines
    let shown = expanded ? lines : Array(lines.prefix(Self.collapsed))
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        if showsName {
          Text((file.file as NSString).lastPathComponent)
            .font(.caption.monospaced().weight(.semibold))
            .lineLimit(1)
            .truncationMode(.middle)
        }
        Spacer(minLength: 0)
        if let additions = file.additions {
          Text("+\(additions)").foregroundStyle(.green)
        }
        if let deletions = file.deletions {
          Text("−\(deletions)").foregroundStyle(.red)
        }
      }
      .font(.caption.monospacedDigit().weight(.semibold))
      .padding(.horizontal, 10)
      .padding(.vertical, 6)

      if !shown.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          VStack(alignment: .leading, spacing: 0) {
            ForEach(shown) { line in
              Text(line.text.isEmpty ? " " : line.text)
                .font(.caption.monospaced())
                .foregroundStyle(color(line.kind))
                .fixedSize()
                .padding(.horizontal, 10)
                .padding(.vertical, 1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(background(line.kind))
            }
          }
          .padding(.bottom, 6)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
      }

      if lines.count > Self.collapsed {
        Button {
          withAnimation(.snappy) { expanded.toggle() }
        } label: {
          Text(expanded ? "Show less" : "Show \(lines.count - Self.collapsed) more lines")
            .font(.caption.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 32)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.tint)
        .overlay(alignment: .top) { Divider() }
      }
    }
    .background(.fill.quaternary, in: .rect(cornerRadius: 12))
    .clipShape(.rect(cornerRadius: 12))
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
  }

  private var accessibilitySummary: String {
    let name = (file.file as NSString).lastPathComponent
    return "Changes to \(name): \(file.additions ?? 0) lines added, \(file.deletions ?? 0) removed"
  }

  private func color(_ kind: Line.Kind) -> Color {
    switch kind {
    case .added: .green
    case .removed: .red
    case .hunk: .secondary
    case .context: .primary
    }
  }

  private func background(_ kind: Line.Kind) -> Color {
    switch kind {
    case .added: .green.opacity(0.12)
    case .removed: .red.opacity(0.12)
    case .hunk, .context: .clear
    }
  }
}

/// Lets one call site pick between glass button styles.
struct AnyPrimitiveButtonStyle: PrimitiveButtonStyle {
  private let make: (Configuration) -> AnyView
  init<S: PrimitiveButtonStyle>(_ style: S) { make = { AnyView(style.makeBody(configuration: $0)) } }
  func makeBody(configuration: Configuration) -> some View { make(configuration) }
}
