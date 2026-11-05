import Observation
import SwiftUI
import UIKit

/// One shell command's status and live output while its sheet is open. Port of the desktop
/// `shell-output.tsx`: output is read incrementally by byte cursor once a second while the
/// command runs, jumping to the recent tail if it falls behind, and the buffer is bounded.
@Observable
final class ShellOutputModel {
  static let limit = 65_536

  let client: GatewayClient
  let events: EventHub
  let directory: String
  let id: String

  private(set) var shell: ShellInfo?
  private(set) var shellError: String?
  private(set) var output = ""
  private(set) var outputLoaded = false
  private(set) var outputError: String?
  private(set) var truncated = false
  private(set) var stopping = false
  var stopError: String?

  @ObservationIgnored private var cursor: Int?
  @ObservationIgnored private var subscriptions: [Subscription] = []
  @ObservationIgnored private var infoTask: Task<Void, Never>?

  init(client: GatewayClient, events: EventHub, directory: String, id: String) {
    self.client = client
    self.events = events
    self.directory = directory
    self.id = id
  }

  /// Loads the command, then follows its output until it ends or the sheet closes.
  func run() async {
    subscriptions = [
      events.subscribe { [weak self] event in
        if event.type.hasPrefix("shell.") { self?.scheduleInfo() }
      },
      events.onReconnect { [weak self] in self?.scheduleInfo() },
    ]
    defer {
      subscriptions = []
      infoTask?.cancel()
    }
    await loadInfo()
    var tick = 0
    while !Task.isCancelled {
      if shell != nil { await readOutput() }
      // A finished command needs one last read, then nothing more.
      if let shell, !shell.running, outputLoaded, outputError == nil { break }
      try? await Task.sleep(for: .seconds(1))
      tick += 1
      // Without live events, re-read the status like the desktop's recovery polling.
      if !events.live && tick % 5 == 0 || shell == nil { await loadInfo() }
    }
  }

  func retryInfo() { scheduleInfo() }

  private func scheduleInfo() {
    infoTask?.cancel()
    infoTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(250))
      guard !Task.isCancelled else { return }
      await self?.loadInfo()
    }
  }

  private func loadInfo() async {
    do {
      shell = try await client.shell(id, directory: directory)
      shellError = nil
    } catch let error as GatewayError {
      shellError = error.message
    } catch is CancellationError {
    } catch {
      shellError = error.localizedDescription
    }
  }

  private func readOutput() async {
    do {
      let next = try await client.shellOutput(id, directory: directory, cursor: cursor)
      // Catch up with noisy processes without replaying their entire log.
      if next.size > next.cursor {
        let start = max(0, next.size - Self.limit)
        let tail = try await client.shellOutput(id, directory: directory, cursor: start)
        output = String(tail.output.suffix(Self.limit))
        cursor = tail.cursor
        // A log that grew during the read is behind by a few bytes, not missing its start.
        truncated = truncated || start > 0
      } else if !next.output.isEmpty || !outputLoaded {
        let text = output + next.output
        output = text.count > Self.limit ? String(text.suffix(Self.limit)) : text
        cursor = next.cursor
        truncated = truncated || next.truncated == true || text.count > Self.limit
      }
      outputLoaded = true
      outputError = nil
    } catch let error as GatewayError {
      outputError = error.message
    } catch {
      if !(error is CancellationError) { outputError = error.localizedDescription }
    }
  }

  /// Stops the command (never the session). Returns true when it stopped.
  func stop() async -> Bool {
    stopping = true
    defer { stopping = false }
    do {
      _ = try await client.stopShell(id, directory: directory)
      stopError = nil
      return true
    } catch {
      stopError = (error as? GatewayError)?.message ?? error.localizedDescription
      return false
    }
  }
}

/// The "Shell output" sheet: command, working directory, status and live log, with Stop.
struct ShellOutputSheet: View {
  @State private var model: ShellOutputModel
  @State private var confirm = false
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss

  init(client: GatewayClient, events: EventHub, directory: String, id: String) {
    _model = State(
      initialValue: ShellOutputModel(client: client, events: events, directory: directory, id: id))
  }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 12) {
        view
        footer
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 12)
      .background(palette.color("surface"))
      .navigationTitle("Shell output")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Close", systemImage: "xmark") { dismiss() }
            .disabled(model.stopping)
            .accessibilityIdentifier("shell.close")
        }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .interactiveDismissDisabled(model.stopping)
    .task { await model.run() }
  }

  private var view: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let message = model.shellError {
        ShellError(message: message) { model.retryInfo() }
      } else if let shell = model.shell {
        Text(shell.command)
          .font(.footnote.monospaced())
          .foregroundStyle(palette.color("text"))
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("shell.command")
        if let cwd = shell.cwd {
          Text(cwd)
            .font(.caption2.monospaced())
            .foregroundStyle(palette.color("text-tertiary"))
            .lineLimit(2)
            .truncationMode(.middle)
        }
        ShellStatus(shell: shell)
      } else {
        Text("Loading command…")
          .font(.caption)
          .foregroundStyle(palette.color("text-tertiary"))
      }
      if let message = model.outputError {
        ShellError(message: message) {}
      }
      if model.truncated {
        Text("Showing recent output. Earlier output is omitted.")
          .font(.caption)
          .foregroundStyle(palette.color("text-tertiary"))
      }
      ShellLog(
        text: model.output.isEmpty
          ? (model.outputLoaded ? "No output yet." : "Loading output…") : model.output,
        placeholder: model.output.isEmpty
      )
      .padding(.top, 8)
      .frame(maxHeight: .infinity)
    }
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(palette.color("surface-under"), in: .rect(cornerRadius: 10))
    .overlay {
      RoundedRectangle(cornerRadius: 10).strokeBorder(palette.color("border"), lineWidth: 1)
    }
  }

  @ViewBuilder private var footer: some View {
    if let message = model.stopError {
      Text(message)
        .font(.footnote)
        .foregroundStyle(palette.color("error"))
    }
    if model.shell?.running == true {
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        Button(model.stopping ? "Stopping…" : "Stop command…", role: .destructive) { confirm = true }
          .buttonStyle(.bordered)
          .tint(palette.color("error"))
          .disabled(model.stopping)
          .accessibilityIdentifier("shell.stop")
          // The desktop asks inline; the phone asks with the native confirmation.
          .confirmationDialog("Stop this command?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Stop command", role: .destructive) {
              Task { if await model.stop() { dismiss() } }
            }
            .accessibilityIdentifier("shell.stop.confirm")
            Button("Cancel", role: .cancel) {}
              .accessibilityIdentifier("shell.stop.cancel")
          } message: {
            Text("It stops this command only, not the chat.")
          }
      }
    }
  }
}

/// "Running · 1m 5s", "Exited with code 0 · 4m", ticking only while it runs.
private struct ShellStatus: View {
  let shell: ShellInfo
  @Environment(\.palette) private var palette

  var body: some View {
    if shell.running {
      TimelineView(.periodic(from: .now, by: 1)) { context in label(nowMillis(context.date)) }
    } else {
      label(nowMillis())
    }
  }

  private func label(_ now: Millis) -> some View {
    let status: String
    switch shell.status {
    case "running": status = "Running"
    case "killed": status = "Stopped"
    case "timeout": status = "Timed out"
    default: status = "Exited" + (shell.exit.map { " with code \(Int($0))" } ?? "")
    }
    return Text("\(status) · \(formatDuration((shell.time.completed ?? now) - shell.time.started))")
      .font(.caption.monospacedDigit())
      .foregroundStyle(palette.color("text-tertiary"))
      .accessibilityIdentifier("shell.status")
  }
}

private struct ShellError: View {
  let message: String
  let retry: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 8) {
      Text(message)
        .font(.caption)
        .foregroundStyle(palette.color("error"))
      Button("Retry", action: retry)
        .buttonStyle(ActivityButtonStyle(kind: .ghost))
    }
  }
}

/// The desktop's `Button` variants used here: `secondary` (raised) and `ghost`.
struct ActivityButtonStyle: ButtonStyle {
  enum Kind { case secondary, ghost }
  let kind: Kind
  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.footnote.weight(.medium))
      .foregroundStyle(palette.color("text"))
      .padding(.horizontal, 12)
      .frame(minHeight: 36)
      .background {
        if kind == .secondary {
          RoundedRectangle(cornerRadius: 10).fill(palette.color("elevated"))
          RoundedRectangle(cornerRadius: 10).strokeBorder(palette.color("border"), lineWidth: 1)
        }
        if configuration.isPressed {
          RoundedRectangle(cornerRadius: 10).fill(palette.color("hover"))
        }
      }
      .frame(minHeight: 44)
      .contentShape(.rect)
      .opacity(enabled ? 1 : 0.5)
  }
}

/// The monospaced log: a read-only text view that follows the tail unless the user scrolled
/// away. New output is appended to the text storage instead of re-laying out the whole log.
private struct ShellLog: UIViewRepresentable {
  let text: String
  let placeholder: Bool
  @Environment(\.palette) private var palette

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context: Context) -> UITextView {
    let view = UITextView()
    view.isEditable = false
    view.isSelectable = true
    view.backgroundColor = .clear
    view.textContainerInset = .zero
    view.textContainer.lineFragmentPadding = 0
    view.alwaysBounceVertical = true
    view.delegate = context.coordinator
    view.accessibilityLabel = "Command output"
    view.accessibilityIdentifier = "shell.log"
    return view
  }

  func updateUIView(_ view: UITextView, context: Context) {
    let coordinator = context.coordinator
    let color = palette.ui(placeholder ? "text-tertiary" : "text")
    let font = UIFontMetrics(forTextStyle: .footnote).scaledFont(
      for: .monospacedSystemFont(ofSize: 12, weight: .regular))
    let attributes: [NSAttributedString.Key: Any] = [
      .font: font, .foregroundColor: color, .paragraphStyle: Self.paragraph,
    ]
    let storage = view.textStorage
    if coordinator.text == text, coordinator.color == color { return }
    if !placeholder, !coordinator.placeholder, coordinator.color == color,
      text.hasPrefix(coordinator.text)
    {
      storage.append(
        NSAttributedString(string: String(text.dropFirst(coordinator.text.count)), attributes: attributes))
    } else {
      storage.setAttributedString(NSAttributedString(string: text, attributes: attributes))
    }
    coordinator.text = text
    coordinator.color = color
    coordinator.placeholder = placeholder
    if coordinator.following {
      view.layoutIfNeeded()
      let bottom = max(0, view.contentSize.height - view.bounds.height)
      view.setContentOffset(CGPoint(x: 0, y: bottom), animated: false)
    }
  }

  private static let paragraph: NSParagraphStyle = {
    let style = NSMutableParagraphStyle()
    style.lineHeightMultiple = 1.15
    style.lineBreakMode = .byCharWrapping
    return style
  }()

  final class Coordinator: NSObject, UITextViewDelegate {
    var text = ""
    var color: UIColor?
    var placeholder = true
    var following = true

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
      guard scrollView.isTracking || scrollView.isDecelerating else { return }
      let distance = scrollView.contentSize.height - scrollView.contentOffset.y - scrollView.bounds.height
      following = distance < 32
    }
  }
}
