import SwiftUI

/// Session details: the desktop session panel (`session-panel.tsx`) as a sheet. Context usage,
/// the project's checkout and changes, subagents, usage and cost, MCP servers and skills.
struct SessionDetailsSheet: View {
  let chat: ChatModel
  let projectName: String?
  /// Opens a workspace panel (`changes`, `subagents`), when the screen has one.
  var open: ((String) -> Void)?

  @State private var details: SessionDetailsModel
  @State private var reconnect: Subscription?
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss

  init(
    chat: ChatModel, sessionID: String, projectName: String?, open: ((String) -> Void)? = nil
  ) {
    self.chat = chat
    self.projectName = projectName
    self.open = open
    _details = State(initialValue: SessionDetailsModel(client: chat.client, sessionID: sessionID))
  }

  private var directory: String? { chat.session?.location.directory ?? chat.directory }

  var body: some View {
    List {
      Section {
        header
          .listRowInsets(EdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4))
      }
      .listRowBackground(Color.clear)
      .listRowSeparator(.hidden)
      ContextSection(
        reading: ContextUsage.reading(
          messages: chat.messages, fallback: nil, models: details.models.value),
        loaded: chat.loaded, error: details.models.error, retry: retry)
      ProjectSection(
        details: details, retry: retry, open: open.map { open in { open("changes") } })
      SubagentsSummary(
        details: details, retry: retry, open: open.map { open in { open("subagents") } })
      Section {
        UsageSection(details: details, retry: retry)
        McpSection(details: details, retry: retry)
        SkillsSection(details: details, retry: retry)
      }
    }
    .listStyle(.insetGrouped)
    .tint(palette.color("accent"))
    .refreshable { await details.refresh() }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .accessibilityIdentifier("session.details")
    .task(id: directory) {
      guard let directory else { return }
      await details.load(directory: directory, projectID: chat.session?.projectID)
    }
    // A finished run changes cost, tokens, subagents and the working tree.
    .onChange(of: chat.running) { _, running in
      if !running { Task { await details.refresh() } }
    }
    // The stream has no replay; refetch after it reconnects.
    .onAppear {
      let details = details
      reconnect = chat.events.onReconnect { Task { await details.refresh() } }
    }
    .onDisappear { reconnect = nil }
  }

  /// Like the thread sheet: a large title, then the project and its shortened folder.
  private var header: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Session details")
        .font(.title2.bold())
        .foregroundStyle(palette.color("text"))
      if let subtitle {
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(1)
          .truncationMode(.middle)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("details.header")
  }

  private var subtitle: String? {
    let name =
      details.project.value??.displayName ?? projectName
      ?? directory.map { ($0 as NSString).lastPathComponent }
    let parts = [name, directory.map(Self.shortPath)].compactMap { $0 }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }

  /// The home folder as `~`, as the thread sheet shows folders.
  static func shortPath(_ path: String) -> String {
    for prefix in ["/Users/", "/home/"] where path.hasPrefix(prefix) {
      let rest = path.dropFirst(prefix.count)
      guard let slash = rest.firstIndex(of: "/") else { return "~" }
      return "~" + rest[slash...]
    }
    return path
  }

  private func retry() { Task { await details.retry() } }
}

// MARK: - Sections

private struct ContextSection: View {
  let reading: ContextUsage.Reading
  let loaded: Bool
  let error: String?
  let retry: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Section {
      LabeledContent {
        HStack(spacing: 6) {
          ContextRing(ratio: reading.ratio, size: 18)
          Text(reading.ratio.map(DetailsFormat.percent) ?? "—")
            .foregroundStyle(palette.color("text-secondary"))
        }
      } label: {
        Label("Context", systemImage: "chart.pie")
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("details.context")
      LabeledContent {
        Text(tokens).foregroundStyle(palette.color("text-secondary"))
      } label: {
        Label("Tokens", systemImage: "number")
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("details.tokens")
      if let error { SectionError(message: error, retry: retry) }
    }
  }

  private var tokens: String {
    if let tokens = reading.tokens {
      let limit = reading.limit.map { " / \(DetailsFormat.number($0))" } ?? ""
      return "\(DetailsFormat.number(tokens))\(limit)"
    }
    return loaded ? "After the first response" : "Loading…"
  }
}

/// The checkout, its branch and its working-tree changes. The project is in the header.
private struct ProjectSection: View {
  let details: SessionDetailsModel
  let retry: () -> Void
  let open: (() -> Void)?
  @Environment(\.palette) private var palette

  var body: some View {
    Section {
      if let checkout = details.checkout, checkout.canonical != nil {
        LabeledContent {
          Text(
            checkout.local
              ? "Local" : "\(checkout.folderName)\(checkout.removed ? " (removed)" : "")"
          )
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(1)
        } label: {
          Label("Checkout", systemImage: checkout.local ? "laptopcomputer" : "square.stack")
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("details.checkout")
      }
      if let vcs = details.vcs.value {
        LabeledContent {
          Text(branch(vcs))
            .foregroundStyle(palette.color("text-secondary"))
            .lineLimit(1)
        } label: {
          Label("Branch", systemImage: "arrow.triangle.branch")
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("details.branch")
        if vcs.info.provider != nil {
          changes(vcs)
        }
      } else if details.vcs.isLoading {
        LabeledContent {
          ProgressView()
        } label: {
          Label("Branch", systemImage: "arrow.triangle.branch")
        }
      }
      if let error = details.usage.error { SectionError(message: error, retry: retry) }
      if let error = details.vcs.error { SectionError(message: error, retry: retry) }
    }
  }

  private func branch(_ vcs: SessionDetails.Vcs) -> String {
    if let current = vcs.info.branch.current, !current.isEmpty { return current }
    return vcs.info.provider != nil ? "Detached HEAD" : "No version control"
  }

  @ViewBuilder private func changes(_ vcs: SessionDetails.Vcs) -> some View {
    let count =
      vcs.files.count == 1
      ? "1 file changed" : "\(DetailsFormat.number(Double(vcs.files.count))) files changed"
    let row = LabeledContent {
      HStack(spacing: 4) {
        Text("+\(DetailsFormat.number(vcs.additions))").foregroundStyle(palette.color("success"))
        Text("−\(DetailsFormat.number(vcs.deletions))").foregroundStyle(palette.color("error"))
      }
      .lineLimit(1)
      .fixedSize()
    } label: {
      Label(count, systemImage: "doc.text")
    }
    let label =
      "\(count), \(DetailsFormat.number(vcs.additions)) added, \(DetailsFormat.number(vcs.deletions)) removed"
    if let open {
      Button(action: open) {
        HStack {
          row
          Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(palette.color("text-tertiary"))
        }
        .foregroundStyle(palette.color("text"))
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(label)
      .accessibilityAddTraits(.isButton)
      .accessibilityHint("Open working-tree changes")
      .accessibilityIdentifier("details.changes")
    } else {
      row
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityIdentifier("details.changes")
    }
  }
}

/// Hidden once loaded with no subagents, like the desktop.
private struct SubagentsSummary: View {
  let details: SessionDetailsModel
  let retry: () -> Void
  let open: (() -> Void)?
  @Environment(\.palette) private var palette

  var body: some View {
    if details.children.value?.isEmpty != true {
      Section {
        Group {
          if let open {
            Button(action: open) { summary.foregroundStyle(palette.color("text")) }
          } else {
            summary
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Subagents: \(label)")
        .accessibilityHint(open == nil ? "" : "Open subagents")
        .accessibilityIdentifier("details.subagents")
        if let error = details.children.error { SectionError(message: error, retry: retry) }
      }
    }
  }

  private var summary: some View {
    HStack {
      LabeledContent {
        if details.children.isLoading {
          ProgressView()
        } else {
          Text(label).foregroundStyle(palette.color("text-secondary"))
        }
      } label: {
        Label { Text("Subagents") } icon: { Image("Robot") }
      }
      if open != nil {
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(palette.color("text-tertiary"))
      }
    }
  }

  private var label: String {
    switch details.children {
    case .failed: return "Unavailable"
    case .loading: return "Loading…"
    case .loaded(let items):
      return items.isEmpty
        ? "None" : "\(DetailsFormat.number(Double(items.count)))\(details.moreChildren ? "+" : "")"
    }
  }
}

/// Cost for this session and every nested subagent, then this session's own token totals.
/// Hidden while the total is zero, like the desktop.
private struct UsageSection: View {
  let details: SessionDetailsModel
  let retry: () -> Void

  var body: some View {
    let own = details.usage.value?.cost
    let subagents = details.subagentCosts.value
    let subagentCost = subagents?.reduce(0) { $0 + $1.cost }
    let total = own.flatMap { own in subagentCost.map { own + $0 } }
    let failed = details.children.error != nil || details.subagentCosts.error != nil
    if total != 0 || failed {
      Disclosure(
        label: "Usage", icon: "dollarsign.circle",
        value: failed ? "Unavailable" : total.map(DetailsFormat.money) ?? "Loading…"
      ) {
        Note("Cost includes this session and all its subagents.")
        if let total, let own, let subagents, let subagentCost {
          Stats(rows: [
            ("This session", DetailsFormat.money(own)),
            ("Subagents (\(DetailsFormat.number(Double(subagents.count))))", DetailsFormat.money(subagentCost)),
            ("Total cost", DetailsFormat.money(total)),
          ])
        }
        if let error = details.subagentCosts.error { SectionError(message: error, retry: retry) }
        Note("Token totals for this session only.")
        if let tokens = details.usage.value?.tokens {
          Stats(rows: [
            ("Input", DetailsFormat.number(tokens.input)),
            ("Output", DetailsFormat.number(tokens.output)),
            ("Reasoning", DetailsFormat.number(tokens.reasoning)),
            ("Cache read", DetailsFormat.number(tokens.cache.read)),
            ("Cache write", DetailsFormat.number(tokens.cache.write)),
          ])
        } else {
          Note("No usage reported yet.")
        }
      }
    }
  }
}

private struct McpSection: View {
  let details: SessionDetailsModel
  let retry: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Disclosure(label: "MCP", icon: "link", value: value) {
      if let servers = details.mcp.value {
        if servers.isEmpty {
          Note("No MCP servers configured.")
        } else {
          ForEach(servers, id: \.name) { server in
            VStack(alignment: .leading, spacing: 2) {
              HStack(spacing: 8) {
                Text(server.name).foregroundStyle(palette.color("text")).lineLimit(1)
                Spacer(minLength: 8)
                Text(server.label)
                  .foregroundStyle(palette.color(server.connected ? "success" : "text-secondary"))
              }
              if let error = server.status.error {
                Text(error).font(.footnote).foregroundStyle(palette.color("error"))
              }
            }
            .accessibilityElement(children: .combine)
          }
        }
      }
      if let error = details.mcp.error { SectionError(message: error, retry: retry) }
    }
  }

  private var value: String {
    switch details.mcp {
    case .loaded(let servers):
      "\(servers.filter(\.connected).count)/\(servers.count)"
    case .failed: "Unavailable"
    case .loading: "Loading…"
    }
  }
}

private struct SkillsSection: View {
  let details: SessionDetailsModel
  let retry: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Disclosure(label: "Skills", icon: "square.stack.3d.up", value: value) {
      Note("Available to this project, not necessarily loaded into this conversation.")
      if let skills = details.skills.value {
        if skills.isEmpty {
          Note("No skills available.")
        } else {
          ForEach(skills, id: \.id) { skill in
            VStack(alignment: .leading, spacing: 2) {
              Text(skill.name).foregroundStyle(palette.color("text"))
              if let description = skill.description, !description.isEmpty { Note(description) }
            }
            .accessibilityElement(children: .combine)
          }
        }
      }
      if let error = details.skills.error { SectionError(message: error, retry: retry) }
    }
  }

  private var value: String {
    switch details.skills {
    case .loaded(let skills): "\(DetailsFormat.number(Double(skills.count))) available"
    case .failed: "Unavailable"
    case .loading: "Loading…"
    }
  }
}

// MARK: - Pieces

/// A native disclosure row, closed by default like the desktop's `<details>`; its rows join
/// the list when it opens.
private struct Disclosure<Content: View>: View {
  let label: String
  let icon: String
  let value: String?
  @ViewBuilder let content: Content
  @State private var expanded = false
  @Environment(\.palette) private var palette

  var body: some View {
    DisclosureGroup(isExpanded: $expanded) {
      content
    } label: {
      LabeledContent {
        if let value {
          Text(value).foregroundStyle(palette.color("text-secondary")).lineLimit(1)
        }
      } label: {
        Label(label, systemImage: icon).foregroundStyle(palette.color("text"))
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel(label)
      .accessibilityValue(value ?? "")
      .accessibilityIdentifier("details.\(label.lowercased())")
    }
  }
}



private struct Note: View {
  let text: String
  @Environment(\.palette) private var palette
  init(_ text: String) { self.text = text }

  var body: some View {
    Text(text)
      .font(.subheadline)
      .foregroundStyle(palette.color("text-tertiary"))
      .fixedSize(horizontal: false, vertical: true)
  }
}

/// Label/value rows, one list row each.
private struct Stats: View {
  let rows: [(String, String)]
  @Environment(\.palette) private var palette

  var body: some View {
    ForEach(rows, id: \.0) { label, value in
      LabeledContent {
        Text(value).foregroundStyle(palette.color("text-secondary"))
      } label: {
        Text(label).fontWeight(.medium).foregroundStyle(palette.color("text"))
      }
    }
  }
}

private struct SectionError: View {
  let message: String
  let retry: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Label(message, systemImage: "exclamationmark.triangle")
        .font(.subheadline)
        .foregroundStyle(palette.color("error"))
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 8)
      Button("Retry", action: retry)
        .font(.subheadline.weight(.medium))
        .buttonStyle(.bordered)
        .tint(palette.color("text"))
        .accessibilityIdentifier("details.retry")
    }
  }
}
