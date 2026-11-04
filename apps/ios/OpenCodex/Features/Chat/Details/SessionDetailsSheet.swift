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
    NavigationStack {
      ScrollView {
        VStack(spacing: 0) {
          ContextSection(
            reading: ContextUsage.reading(
              messages: chat.messages, fallback: nil, models: details.models.value),
            loaded: chat.loaded, error: details.models.error, retry: retry)
          Hairline()
          ProjectSection(
            details: details, name: projectName, directory: directory, retry: retry,
            open: open.map { open in { open("changes") } })
          SubagentsSummary(
            details: details, retry: retry, open: open.map { open in { open("subagents") } })
          UsageSection(details: details, retry: retry)
          McpSection(details: details, retry: retry)
          SkillsSection(details: details, retry: retry)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
        .monospacedDigit()
      }
      .scrollContentBackground(.hidden)
      .background(palette.color("surface"))
      .refreshable { await details.refresh() }
      .navigationTitle("Session")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button(role: .close) { dismiss() }
            .accessibilityLabel("Close session details")
        }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationContentInteraction(.resizes)
    .presentationBackground(palette.color("surface"))
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
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 8) {
        Text("Context")
        Spacer(minLength: 8)
        ContextRing(ratio: reading.ratio, size: 18)
        Text(reading.ratio.map(DetailsFormat.percent) ?? "—")
          .foregroundStyle(palette.color("text-secondary"))
      }
      Meter(value: reading.ratio.map { min($0, 1) } ?? 0)
        .padding(.vertical, 8)
        .accessibilityLabel("Context used")
        .accessibilityValue(reading.ratio.map(DetailsFormat.percent) ?? "No usage reported")
      Note(note)
      if let error { SectionError(message: error, retry: retry) }
    }
    .padding(.top, 4)
    .padding(.bottom, 12)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("details.context")
  }

  private var note: String {
    if let tokens = reading.tokens {
      let limit = reading.limit.map { " / \(DetailsFormat.number($0))" } ?? ""
      return "\(DetailsFormat.number(tokens))\(limit) tokens"
    }
    return loaded ? "Usage appears after the first response." : "Loading context…"
  }
}

private struct ProjectSection: View {
  let details: SessionDetailsModel
  let name: String?
  let directory: String?
  let retry: () -> Void
  let open: (() -> Void)?
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Row(icon: "folder") {
        Text(title).fontWeight(.semibold).lineLimit(1)
        Spacer(minLength: 0)
      }
      if let checkout = details.checkout, checkout.canonical != nil {
        Row(icon: checkout.local ? "laptopcomputer" : "square.stack") {
          Text(
            checkout.local
              ? "Local checkout" : "\(checkout.folderName)\(checkout.removed ? " (removed)" : "")"
          )
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(1)
          Spacer(minLength: 0)
        }
      }
      if let vcs = details.vcs.value {
        Row(icon: "arrow.triangle.branch") {
          Text(branch(vcs))
            .foregroundStyle(palette.color("text-secondary"))
            .lineLimit(1)
          Spacer(minLength: 0)
        }
        if vcs.info.provider != nil {
          changes(vcs)
        }
      }
      if details.vcs.isLoading { Note("Loading project…") }
      if let error = details.usage.error { SectionError(message: error, retry: retry) }
      if let error = details.vcs.error { SectionError(message: error, retry: retry) }
    }
    .padding(.vertical, 12)
  }

  private var title: String {
    if let name = details.project.value??.displayName ?? name, !name.isEmpty { return name }
    return directory.map { ($0 as NSString).lastPathComponent } ?? "Project"
  }

  private func branch(_ vcs: SessionDetails.Vcs) -> String {
    if let current = vcs.info.branch.current, !current.isEmpty { return current }
    return vcs.info.provider != nil ? "Detached HEAD" : "No version control"
  }

  @ViewBuilder private func changes(_ vcs: SessionDetails.Vcs) -> some View {
    let row = Row(icon: "doc.text") {
      Text(
        vcs.files.count == 1
          ? "1 file changed" : "\(DetailsFormat.number(Double(vcs.files.count))) files changed"
      )
      .foregroundStyle(palette.color("text-secondary"))
      Spacer(minLength: 8)
      HStack(spacing: 0) {
        Text("+\(DetailsFormat.number(vcs.additions))").foregroundStyle(palette.color("success"))
        Text(" / ").foregroundStyle(palette.color("text-secondary"))
        Text("−\(DetailsFormat.number(vcs.deletions))").foregroundStyle(palette.color("error"))
      }
      .lineLimit(1)
      .fixedSize()
    }
    .frame(minHeight: 44)
    if let open {
      Button(action: open) { row.contentShape(.rect) }
        .buttonStyle(.plain)
        .accessibilityHint("Open working-tree changes")
    } else {
      row
    }
  }
}

/// Hidden once loaded with no subagents, like the desktop.
private struct SubagentsSummary: View {
  let details: SessionDetailsModel
  let retry: () -> Void
  let open: (() -> Void)?
  @Environment(\.palette) private var palette

  private static let tints = ["project-pink", "project-orange", "project-purple"]

  var body: some View {
    let items = details.children.value ?? []
    if details.children.value?.isEmpty != true {
      VStack(alignment: .leading, spacing: 0) {
        Hairline()
        Group {
          if let open {
            Button(action: open) { summary(items) }
              .buttonStyle(.plain)
              .accessibilityHint("Open subagents")
          } else {
            summary(items)
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Subagents: \(label)")
        .accessibilityIdentifier("details.subagents")
        if let error = details.children.error { SectionError(message: error, retry: retry) }
      }
      .padding(.bottom, 4)
    }
  }

  private func summary(_ items: [SessionDetails.SessionUsage]) -> some View {
    HStack(spacing: 8) {
      Icon("cpu")
      Text("Subagents").fontWeight(.semibold).foregroundStyle(palette.color("text"))
      if open != nil {
        Image(systemName: "chevron.right")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(palette.color("text-secondary"))
      }
      Spacer(minLength: 8)
      if !items.isEmpty {
        HStack(spacing: 4) {
          ForEach(Array(items.prefix(3).enumerated()), id: \.element.id) { index, _ in
            Image(systemName: "cpu")
              .foregroundStyle(palette.color(Self.tints[index % 3]))
          }
          if items.count > 3 {
            Text("+\(DetailsFormat.number(Double(items.count - 3))) more")
              .font(.footnote)
              .foregroundStyle(palette.color("text-tertiary"))
          }
        }
      } else {
        Text(label).foregroundStyle(palette.color("text-secondary"))
      }
    }
    .frame(minHeight: 44)
    .contentShape(.rect)
  }

  private var label: String {
    switch details.children {
    case .failed: return "Unavailable"
    case .loading: return "Loading…"
    case .loaded(let items):
      return items.isEmpty
        ? "None" : "\(DetailsFormat.number(Double(items.count)))\(details.moreChildren ? "+" : "") subagents"
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
          ResourceList(items: servers, id: \.name) { server in
            HStack(spacing: 8) {
              Text(server.name).lineLimit(1)
              Spacer(minLength: 8)
              Text(server.label)
                .foregroundStyle(palette.color(server.connected ? "success" : "text-secondary"))
            }
            if let error = server.status.error {
              Note(error).foregroundStyle(palette.color("error"))
            }
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
          ResourceList(items: skills, id: \.id) { skill in
            Text(skill.name).foregroundStyle(palette.color("text"))
            if let description = skill.description, !description.isEmpty { Note(description) }
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

/// A collapsible section, closed by default like the desktop's `<details>`.
private struct Disclosure<Content: View>: View {
  let label: String
  let icon: String
  let value: String?
  @ViewBuilder let content: Content
  @State private var expanded = false
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Hairline()
      Button {
        withAnimation(.snappy(duration: 0.2)) { expanded.toggle() }
      } label: {
        HStack(spacing: 8) {
          Icon(icon)
          Text(label).fontWeight(.semibold).foregroundStyle(palette.color("text"))
          Image(systemName: "chevron.right")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(palette.color("text-secondary"))
            .rotationEffect(.degrees(expanded ? 90 : 0))
          Spacer(minLength: 8)
          if let value {
            Text(value).foregroundStyle(palette.color("text-secondary")).lineLimit(1)
          }
        }
        .frame(minHeight: 44)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityValue(value ?? "")
      .accessibilityHint(expanded ? "Collapse" : "Expand")
      .accessibilityIdentifier("details.\(label.lowercased())")
      if expanded {
        VStack(alignment: .leading, spacing: 12) { content }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, 6)
          .padding(.bottom, 12)
      }
    }
  }
}

private struct Row<Content: View>: View {
  let icon: String
  @ViewBuilder let content: Content

  var body: some View {
    HStack(spacing: 8) {
      Icon(icon)
      content
    }
  }
}

private struct Icon: View {
  let name: String
  @Environment(\.palette) private var palette
  init(_ name: String) { self.name = name }

  var body: some View {
    Image(systemName: name)
      .font(.body.weight(.light))
      .foregroundStyle(palette.color("text-secondary"))
      .frame(width: 22)
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

private struct Stats: View {
  let rows: [(String, String)]
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 6) {
      ForEach(rows, id: \.0) { label, value in
        HStack(spacing: 12) {
          Text(label).fontWeight(.medium)
          Spacer(minLength: 12)
          Text(value).foregroundStyle(palette.color("text-secondary"))
        }
        .accessibilityElement(children: .combine)
      }
    }
  }
}

/// Separated rows. Unlike the desktop's 240px scroller, the sheet itself scrolls, so a phone
/// never nests one scroll view in another.
private struct ResourceList<Item, ID: Hashable, Row: View>: View {
  let items: [Item]
  let id: KeyPath<Item, ID>
  @ViewBuilder let row: (Item) -> Row

  var body: some View {
    LazyVStack(alignment: .leading, spacing: 10) {
      ForEach(Array(items.enumerated()), id: \.offset) { index, item in
        if index > 0 { Hairline() }
        VStack(alignment: .leading, spacing: 2) { row(item) }
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

private struct Meter: View {
  let value: Double
  @Environment(\.palette) private var palette

  var body: some View {
    Capsule()
      .fill(palette.color("secondary-hover"))
      .frame(height: 4)
      .overlay(alignment: .leading) {
        GeometryReader { proxy in
          Capsule()
            .fill(palette.color("success"))
            .frame(width: proxy.size.width * value)
        }
      }
  }
}

private struct Hairline: View {
  @Environment(\.palette) private var palette
  var body: some View {
    Rectangle().fill(palette.color("border")).frame(height: 0.5)
  }
}

private struct SectionError: View {
  let message: String
  let retry: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(message)
        .font(.subheadline)
        .foregroundStyle(palette.color("error"))
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 8)
      Button("Retry", action: retry)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(palette.color("text"))
    }
  }
}
