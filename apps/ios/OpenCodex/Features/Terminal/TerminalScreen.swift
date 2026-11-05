import SwiftUI

/// The desktop's Terminal panel as a full-screen view: the project's terminal tabs, + for a new
/// shell, and the selected tab's emulator. Closing a tab ends its shell; leaving the screen only
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
        TerminalTabs(model: model)
        Rectangle().fill(palette.color("border")).frame(height: 0.5)
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
      .background(palette.color("surface"))
      .navigationTitle("Terminal")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
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

/// "Terminal 1", "Terminal 2"… with an Exited badge and a close button, like the desktop tabs.
private struct TerminalTabs: View {
  let model: TerminalModel
  @Environment(\.palette) private var palette

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView(.horizontal) {
        HStack(spacing: 4) {
          ForEach(Array(model.terminals.enumerated()), id: \.element.id) { index, terminal in
            tab(terminal, number: index + 1).id(terminal.id)
          }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
      }
      .scrollIndicators(.hidden)
      .frame(minHeight: 44)
      .onChange(of: model.current?.id) { _, id in
        guard let id else { return }
        withAnimation(.snappy) { proxy.scrollTo(id) }
      }
    }
  }

  private func tab(_ terminal: Pty, number: Int) -> some View {
    let active = model.current?.id == terminal.id
    return HStack(spacing: 0) {
      Button {
        model.selectedID = terminal.id
      } label: {
        HStack(spacing: 7) {
          Image(systemName: "apple.terminal")
            .font(.system(size: 13))
          Text("Terminal \(number)")
            .lineLimit(1)
          if terminal.exited {
            Text("Exited")
              .font(.system(size: 10))
              .foregroundStyle(palette.color("text-tertiary"))
          }
        }
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .frame(minHeight: 36)
        .contentShape(.rect)
      }
      .accessibilityIdentifier("terminal-tab-\(number)")
      .accessibilityAddTraits(active ? .isSelected : [])
      Button {
        Task { await model.remove(terminal.id) }
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(palette.color("text-tertiary"))
          .frame(width: 32, height: 36)
          .contentShape(.rect)
      }
      .disabled(model.removing == terminal.id)
      .accessibilityLabel("Close Terminal \(number)")
      .accessibilityHint("Ends the shell")
      .accessibilityIdentifier("terminal-tab-close-\(number)")
    }
    .buttonStyle(.plain)
    .font(.footnote)
    .foregroundStyle(palette.color(active ? "text" : "text-tertiary"))
    .background {
      if active {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(palette.gradient("glaze"))
          .workspaceShadow(palette.shadows("glaze-shadow"))
      }
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
      HStack(spacing: 12) {
        Text(terminal.cwd)
          .lineLimit(1)
        Spacer(minLength: 0)
        Text(statusText)
          .fixedSize()
          .accessibilityIdentifier("terminal-status")
      }
      .font(.caption2)
      .foregroundStyle(palette.color("text-tertiary"))
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
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
