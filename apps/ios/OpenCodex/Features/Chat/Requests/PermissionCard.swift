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

/// One pending approval, as the desktop's `request-card`: the action, its message and
/// resources (a diff for edits), then Allow once, Always allow, Reject and Enable full access….
struct PermissionCard: View {
  let model: ChatModel
  let request: PermissionRequest
  /// Like the desktop: Always allow only when the request names patterns to save.
  private var canAlways: Bool { !(request.save ?? []).isEmpty }

  @Environment(\.palette) private var palette
  @State private var busy: PermissionDecision?
  @State private var error: String?

  var body: some View {
    let summary = PermissionSummary(request)
    let resources = (request.resources ?? []).filter { !$0.isEmpty }
    VStack(alignment: .leading, spacing: 0) {
      Text(request.action)
        .font(.callout.weight(.semibold))
        .foregroundStyle(palette.color("text"))
        .padding(.bottom, 8)
        .accessibilityAddTraits(.isHeader)
      if let message = request.message, !message.isEmpty {
        Text(message)
          .font(.subheadline)
          .foregroundStyle(palette.color("text"))
          .fixedSize(horizontal: false, vertical: true)
          .padding(.bottom, 8)
      }
      if summary.files.isEmpty {
        let code = summary.code ?? resources.joined(separator: "\n")
        if !code.isEmpty {
          Text(code)
            .font(.footnote.monospaced())
            .foregroundStyle(palette.color("text"))
            .lineLimit(8)
            .textSelection(.enabled)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            // The desktop's `<pre>`.
            .background(palette.color("code-bg"), in: .rect(cornerRadius: 8))
        }
      } else {
        VStack(spacing: 8) {
          ForEach(summary.files) { file in
            DiffPreview(file: file, showsName: true)
          }
        }
      }

      FlowLayout(spacing: 8) {
        decision(.once, "Allow once", .primary)
        if canAlways { decision(.always, "Always allow", .secondary) }
        decision(.reject, "Reject", .plain)
        PermissionControl(model: model, disabled: busy != nil)
      }
      .padding(.top, 12)
      .disabled(busy != nil)

      if let error {
        Text(error)
          .font(.footnote)
          .foregroundStyle(palette.color("error"))
          .padding(.top, 4)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    // The composer's corner, so the card and the capsule under it read as one dock.
    .background(palette.color("surface"), in: .rect(cornerRadius: 20, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(palette.color("border-heavy")))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Permission request")
    .accessibilityIdentifier("request.permission")
  }

  private func decision(
    _ decision: PermissionDecision, _ title: String, _ variant: Variant
  ) -> some View {
    Button {
      Task { await reply(decision) }
    } label: {
      ZStack {
        Text(title).opacity(busy == decision ? 0 : 1)
        if busy == decision {
          ProgressView().controlSize(.small)
            .tint(palette.color(variant == .primary ? "on-primary" : "text"))
        }
      }
      .font(.subheadline.weight(variant == .primary ? .semibold : .medium))
    }
    .modifier(DecisionStyle(variant: variant))
    .accessibilityIdentifier("permission.\(decision.rawValue)")
  }

  enum Variant { case primary, secondary, plain }

  /// Native capsule buttons in the theme's colors: filled, tinted, then borderless.
  private struct DecisionStyle: ViewModifier {
    var variant: Variant
    @Environment(\.palette) private var palette

    func body(content: Content) -> some View {
      switch variant {
      case .primary:
        content.buttonStyle(.borderedProminent)
          .tint(palette.color("primary"))
          .foregroundStyle(palette.color("on-primary"))
          .buttonBorderShape(.capsule)
      case .secondary:
        content.buttonStyle(.bordered)
          .tint(palette.color("text"))
          .foregroundStyle(palette.color("text"))
          .buttonBorderShape(.capsule)
      case .plain:
        content.buttonStyle(.borderless)
          .foregroundStyle(palette.color("text-secondary"))
      }
    }
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

/// Wraps its children onto more rows when they don't fit, like CSS `flex-wrap`.
struct FlowLayout: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(width: proposal.width ?? .infinity, subviews)
    let width = rows.map { row in row.reduce(0) { $0 + $1.width } + spacing * CGFloat(max(0, row.count - 1)) }.max() ?? 0
    let height = rows.map { $0.map(\.height).max() ?? 0 }.reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
    return CGSize(width: min(width, proposal.width ?? width), height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    var index = 0
    for row in arrange(width: bounds.width, subviews) {
      var x = bounds.minX
      let height = row.map(\.height).max() ?? 0
      for size in row {
        subviews[index].place(at: CGPoint(x: x, y: y + (height - size.height) / 2), proposal: ProposedViewSize(size))
        x += size.width + spacing
        index += 1
      }
      y += height + spacing
    }
  }

  private func arrange(width: CGFloat, _ subviews: Subviews) -> [[CGSize]] {
    var rows: [[CGSize]] = [[]]
    var x: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        rows.append([])
        x = 0
      }
      rows[rows.count - 1].append(size)
      x += size.width + spacing
    }
    return rows
  }
}

/// A compact unified diff: +/- lines tinted, collapsed to eight lines.
struct DiffPreview: View {
  let file: PermissionSummary.FileChange
  var showsName = false

  @Environment(\.palette) private var palette

  @State private var expanded = false
  @State private var width: CGFloat = 0

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
          Text("+\(additions)").foregroundStyle(palette.color("success"))
        }
        if let deletions = file.deletions {
          Text("−\(deletions)").foregroundStyle(palette.color("error"))
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
                // At least as wide as the card, so a line's tint spans it, not just its text.
                .frame(minWidth: width, maxWidth: .infinity, alignment: .leading)
                .background(background(line.kind))
            }
          }
          .padding(.bottom, 6)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
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
        .buttonStyle(.borderless)
        .foregroundStyle(palette.color("text-secondary"))
        .overlay(alignment: .top) { Rectangle().fill(palette.color("border")).frame(height: 1) }
      }
    }
    .foregroundStyle(palette.color("text"))
    .background(palette.color("code-bg"), in: .rect(cornerRadius: 8))
    .clipShape(.rect(cornerRadius: 8))
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
  }

  private var accessibilitySummary: String {
    let name = (file.file as NSString).lastPathComponent
    return "Changes to \(name): \(file.additions ?? 0) lines added, \(file.deletions ?? 0) removed"
  }

  private func color(_ kind: Line.Kind) -> Color {
    switch kind {
    case .added: palette.color("success")
    case .removed: palette.color("error")
    case .hunk: palette.color("text-tertiary")
    case .context: palette.color("text")
    }
  }

  private func background(_ kind: Line.Kind) -> Color {
    switch kind {
    case .added: palette.color("success").opacity(0.12)
    case .removed: palette.color("error").opacity(0.12)
    case .hunk, .context: .clear
    }
  }
}
