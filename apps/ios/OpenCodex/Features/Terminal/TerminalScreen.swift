import SwiftUI

/// The desktop's Terminal panel as a full-screen view: a glass title pill that switches between
/// the project's terminals, + for a new shell, and the selected terminal's emulator. Closing a tab ends its shell; leaving the screen only
/// detaches, so shells keep running and reopen with their recent output.
struct TerminalScreen: View {
  @State private var model: TerminalModel
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  init(client: GatewayClient, events: EventHub, directory: String) {
    _model = State(
      initialValue: TerminalModel(client: client, events: events, directory: directory))
  }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        if let error = model.actionError ?? model.listError {
          HStack(spacing: 8) {
            Text(error)
            if model.listError != nil, model.actionError == nil {
              Button("Retry") { Task { await model.refresh() } }
                .buttonStyle(.plain)
                .fontWeight(.medium)
            }
            Spacer(minLength: 0)
          }
          .font(.caption)
          .foregroundStyle(palette.color("error"))
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .accessibilityElement(children: .combine)
          .accessibilityIdentifier("terminal-list-error")
        }
        if let current = model.current {
          TerminalPane(model: model, terminal: current)
            .id(current.id)
        } else {
          TerminalEmpty(model: model)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(palette.color("surface"))
      // One surface, like the chat: the bar shows the terminal's own background.
      .toolbarBackground(.hidden, for: .navigationBar)
      .navigationTitle("Terminal")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) { TerminalSwitcher(model: model) }
        ToolbarItem(placement: .topBarLeading) {
          Button("Hide terminal", systemImage: "xmark") { dismiss() }
            .accessibilityIdentifier("terminal-close")
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button("New terminal", systemImage: "plus") { Task { await model.create() } }
            .disabled(model.creating)
            .accessibilityIdentifier("terminal-new")
        }
      }
    }
    .tint(palette.color("text"))
    .task { await model.run() }
  }
}

/// Like the chat's title pill: "Terminal 1" over its folder. Tapping it switches terminals,
/// opens a new one, or closes this one (ending its shell).
private struct TerminalSwitcher: View {
  let model: TerminalModel
  @Environment(\.palette) private var palette

  var body: some View {
    if let current = model.current,
      let index = model.terminals.firstIndex(where: { $0.id == current.id })
    {
      Menu {
        Section(current.cwd) {
          Picker(
            "Terminal",
            selection: Binding(get: { model.current?.id }, set: { model.selectedID = $0 })
          ) {
            ForEach(Array(model.terminals.enumerated()), id: \.element.id) { number, terminal in
              Text(terminal.exited ? "Terminal \(number + 1) · Exited" : "Terminal \(number + 1)")
                .tag(Optional(terminal.id))
            }
          }
        }
        Button("New terminal", systemImage: "plus") { Task { await model.create() } }
          .disabled(model.creating)
        Button("Close Terminal \(index + 1)", systemImage: "xmark", role: .destructive) {
          Task { await model.remove(current.id) }
        }
        .disabled(model.removing == current.id)
      } label: {
        VStack(spacing: 0) {
          HStack(spacing: 4) {
            Text("Terminal \(index + 1)")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(palette.color("text"))
            Image(systemName: "chevron.down")
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(palette.color("text-tertiary"))
          }
          Text((current.cwd as NSString).lastPathComponent)
            .font(.caption)
            .foregroundStyle(palette.color("text-secondary"))
            .lineLimit(1)
        }
        .frame(maxWidth: 200)
        .padding(.horizontal, 18)
        // Fits the toolbar's 44 pt slot, which clips the pill while the menu closes.
        .padding(.vertical, 2)
        .glassEffect(.regular.interactive(), in: .capsule)
        // The menu opens from and closes into this shape; without it, a rectangle.
        .contentShape(.contextMenuPreview, .capsule)
        .contentShape(.interaction, .capsule)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(
        "Terminal \(index + 1) of \(model.terminals.count)\(current.exited ? ", exited" : "")")
      .accessibilityValue((current.cwd as NSString).lastPathComponent)
      .accessibilityHint("Switches, opens or closes terminals")
      .accessibilityIdentifier("terminal-switcher")
    } else {
      Text("Terminal")
        .font(.headline)
        .foregroundStyle(palette.color("text"))
    }
  }
}

/// The desktop's empty panel: shown while loading, or after the last tab is closed.
private struct TerminalEmpty: View {
  let model: TerminalModel

  var body: some View {
    if model.loaded {
      PanelUnavailable(
        "Your project terminal", systemImage: "apple.terminal",
        message: "Open a shell in this project. Add tabs to run commands side by side."
      ) {
        Button(model.creating ? "Opening…" : "New terminal") {
          Task { await model.create() }
        }
        .buttonStyle(WorkspaceButtonStyle())
        .disabled(model.creating)
        .accessibilityIdentifier("terminal-empty-new")
      }
    } else {
      PanelLoading("Loading terminals…")
    }
  }
}

/// The selected tab: its folder and connection status, errors with Reconnect, and the emulator.
private struct TerminalPane: View {
  let model: TerminalModel
  let terminal: Pty
  /// Made on first appearance, not in `init`, which SwiftUI calls on every parent update.
  @State private var session: TerminalSession?
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      // The folder is in the title pill; only a status worth reading takes a line.
      if !statusText.isEmpty {
        Text(statusText)
          .font(.caption2)
          .foregroundStyle(palette.color("text-tertiary"))
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 12)
          .padding(.vertical, 6)
          .accessibilityIdentifier("terminal-status")
      }
      if let session, let error = session.error {
        HStack(spacing: 8) {
          Text(error)
          Spacer(minLength: 0)
          Button("Reconnect") { session.reconnect() }
            .buttonStyle(.plain)
            .fontWeight(.medium)
            .frame(minHeight: 32)
            .accessibilityIdentifier("terminal-reconnect")
        }
        .font(.caption)
        .foregroundStyle(palette.color("error"))
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("terminal-error")
      }
      Group {
        if let session {
          TerminalEmulator(session: session, palette: palette)
        } else {
          Color.clear
        }
      }
      .padding(.horizontal, 8)
      .padding(.top, 2)
      .padding(.bottom, 6)
    }
    .onAppear {
      let session =
        session
        ?? TerminalSession(
          client: model.client, directory: model.directory, terminal: terminal, palette: palette)
      self.session = session
      session.exited = terminal.exited
      session.onDisconnect = { [model] in model.scheduleRefresh() }
      session.start()
    }
    .onDisappear { session?.stop() }
    .onChange(of: terminal.exited) { _, exited in
      session?.exited = exited
      // An exited shell takes no input; put the keyboard and key bar away.
      if exited { _ = session?.view.resignFirstResponder() }
    }
  }

  private var statusText: String {
    guard terminal.exited else { return session?.status ?? "Connecting…" }
    return terminal.exitCode.map { "Exited (\($0))" } ?? "Exited"
  }
}

private struct TerminalEmulator: UIViewRepresentable {
  let session: TerminalSession
  let palette: Palette

  func makeUIView(context: Context) -> GatewayTerminalView {
    session.view.apply(palette)
    return session.view
  }

  func updateUIView(_ view: GatewayTerminalView, context: Context) {
    view.apply(palette)
  }
}
