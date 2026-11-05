import Foundation
import Observation
import QuartzCore
import SwiftTerm
import UIKit

/// One visible terminal tab: a SwiftTerm view wired to the gateway's WebSocket relay, ported
/// from the desktop's `TerminalView` (`apps/web/src/features/terminal/terminal-view.tsx`).
///
/// Protocol (OpenCode's `PtyProtocol`): text frames carry UTF-8 output, and one binary frame,
/// `0x00` + JSON `{cursor}`, marks the end of the replayed history with the absolute output
/// cursor. Reconnects resume from that cursor, and replies the emulator makes while replaying
/// history are dropped. Input goes up as text frames of at most 16 KiB. Closing the session
/// only drops the socket; the PTY keeps running until its tab is closed.
@Observable
final class TerminalSession {
  /// The desktop's status line: "Connecting…", "Reconnecting…", "Shell exited", or empty.
  private(set) var status = "Connecting…"
  private(set) var error: String?

  @ObservationIgnored let view: GatewayTerminalView
  @ObservationIgnored private let client: GatewayClient
  @ObservationIgnored private let directory: String
  @ObservationIgnored private let id: String
  /// The PTY has exited: show its output, accept no input.
  @ObservationIgnored var exited = false
  /// Called when the socket closes, so the list can refetch the PTY's status.
  @ObservationIgnored var onDisconnect: (() -> Void)?

  @ObservationIgnored private var socket: URLSessionWebSocketTask?
  @ObservationIgnored private var urlSession: URLSession?
  /// Bumped for every connection; callbacks from an older one are ignored.
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var open = false
  @ObservationIgnored private var running = false
  @ObservationIgnored private var cursor = 0
  @ObservationIgnored private var failures = 0
  @ObservationIgnored private var replay = true
  @ObservationIgnored private var writingReplay = false
  @ObservationIgnored private var retry: Task<Void, Never>?
  @ObservationIgnored private var receiver: Task<Void, Never>?
  @ObservationIgnored private var queue: [(bytes: [UInt8], length: Int, replay: Bool)] = []
  @ObservationIgnored private var offset = 0
  @ObservationIgnored private var queuedLength = 0
  @ObservationIgnored private var pumping = false
  @ObservationIgnored private var unsentBytes = 0
  @ObservationIgnored private var pendingSize: GatewayClient.TerminalSize?
  @ObservationIgnored private var sentSize: GatewayClient.TerminalSize?
  @ObservationIgnored private var sizeTimer: Task<Void, Never>?
  @ObservationIgnored private var resizing = false
  @ObservationIgnored private var observers: [NSObjectProtocol] = []

  init(client: GatewayClient, directory: String, terminal: Pty, palette: Palette) {
    self.client = client
    self.directory = directory
    id = terminal.id
    exited = terminal.exited
    view = GatewayTerminalView(palette: palette)
    view.terminalDelegate = self
  }

  /// Attaches: opens the socket and follows the app to the background and back.
  func start() {
    guard !running else { return }
    running = true
    let center = NotificationCenter.default
    observers = [
      // iOS kills sockets in the background; detach cleanly and resume from the cursor.
      center.addObserver(
        forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
      ) { [weak self] _ in MainActor.assumeIsolated { self?.disconnect() } },
      center.addObserver(
        forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
      ) { [weak self] _ in MainActor.assumeIsolated { self?.reconnect() } },
    ]
    connect()
  }

  /// Detaches without ending the shell, like hiding the desktop panel.
  func stop() {
    running = false
    observers.forEach(NotificationCenter.default.removeObserver)
    observers = []
    disconnect()
    sizeTimer?.cancel()
  }

  /// The error row's Reconnect, and the return to the foreground.
  func reconnect() {
    guard running else { return }
    disconnect()
    failures = 0
    error = nil
    status = "Connecting…"
    connect()
  }

  // MARK: Socket

  private func disconnect() {
    generation += 1
    retry?.cancel()
    retry = nil
    receiver?.cancel()
    receiver = nil
    open = false
    socket?.cancel(with: .normalClosure, reason: nil)
    socket = nil
    urlSession?.invalidateAndCancel()
    urlSession = nil
    unsentBytes = 0
  }

  private func connect() {
    guard running else { return }
    disconnect()
    replay = true
    let generation = generation
    let events = SocketEvents()
    events.opened = { [weak self] in
      guard let self, self.generation == generation else { return }
      self.opened()
    }
    events.closed = { [weak self] code in
      guard let self, self.generation == generation else { return }
      self.closed(code: code)
    }
    let session = URLSession(configuration: .ephemeral, delegate: events, delegateQueue: .main)
    let task = session.webSocketTask(
      with: client.terminalSocket(directory: directory, id: id, cursor: cursor))
    // OpenCode's replay frames are 64 KiB; the relay allows up to 4 MiB.
    task.maximumMessageSize = 4 * 1024 * 1024
    urlSession = session
    socket = task
    task.resume()
    receive(task, generation: generation)
  }

  private func receive(_ task: URLSessionWebSocketTask, generation: Int) {
    receiver = Task { [weak self] in
      // A failed receive means the socket closed; the delegate reports how.
      while let message = try? await task.receive() {
        guard let self, self.generation == generation else { return }
        self.received(message)
      }
    }
  }

  private func opened() {
    open = true
    status = ""
    error = nil
    scheduleSize()
  }

  private func received(_ message: URLSessionWebSocketTask.Message) {
    switch message {
    case .data(let data):
      guard data.first == 0 else { return }
      struct Meta: Decodable { var cursor: Int }
      if let meta = try? JSONDecoder().decode(Meta.self, from: data.dropFirst()) {
        guard meta.cursor >= 0 else { return }
        cursor = meta.cursor
        replay = false
        failures = 0
      } else {
        error = "Invalid terminal replay data. Reconnect to retry."
        closed(code: 1005)
      }
    case .string(let text):
      // OpenCode counts the cursor in UTF-16 code units (JavaScript string length).
      let length = text.utf16.count
      if queuedLength + length > 4 * 1024 * 1024 {
        status = "Output paused while the terminal catches up…"
        closed(code: 1013)
        return
      }
      queue.append((Array(text.utf8), length, replay))
      queuedLength += length
      cursor += length
      pump()
    @unknown default:
      break
    }
  }

  private func closed(code: Int) {
    disconnect()
    onDisconnect?()
    if code == 1000 {
      status = "Shell exited"
      _ = view.resignFirstResponder()
      return
    }
    failures += 1
    if failures > 3 {
      status = "Disconnected"
      error = "Terminal connection lost. Reconnect to continue."
      return
    }
    status = "Reconnecting…"
    let delay = min(1000 * (1 << (failures - 1)), 4000)
    retry = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(delay))
      guard !Task.isCancelled else { return }
      self?.connect()
    }
  }

  // MARK: Output

  /// Feeds queued output for at most 6 ms per main-loop turn, so a 2 MiB replay never
  /// freezes scrolling or typing.
  private func pump() {
    guard !pumping else { return }
    pumping = true
    DispatchQueue.main.async { [weak self] in self?.write() }
  }

  private func write() {
    pumping = false
    let start = CACurrentMediaTime()
    while offset < queue.count, CACurrentMediaTime() - start < 0.006 {
      let chunk = queue[offset]
      writingReplay = chunk.replay
      view.feed(byteArray: chunk.bytes[...])
      writingReplay = false
      queuedLength -= chunk.length
      offset += 1
    }
    if offset == queue.count {
      queue = []
      offset = 0
      queuedLength = 0
    } else {
      if offset >= 64 {
        queue.removeFirst(offset)
        offset = 0
      }
      pump()
    }
  }

  // MARK: Input

  fileprivate func input(_ bytes: ArraySlice<UInt8>) {
    guard !writingReplay, !exited, open, let socket else { return }
    if unsentBytes + bytes.count > 1024 * 1024 {
      error = "Paste is too large or the terminal is busy. Try a smaller selection."
      return
    }
    // Keep each frame within the gateway's 16 KiB input bound without splitting a character.
    let text = String(decoding: bytes, as: UTF8.self)
    var chunk = ""
    var chunks: [String] = []
    for character in text {
      if chunk.utf16.count + character.utf16.count > 16_384 {
        chunks.append(chunk)
        chunk = ""
      }
      chunk.append(character)
    }
    if !chunk.isEmpty { chunks.append(chunk) }
    for chunk in chunks {
      let size = chunk.utf8.count
      unsentBytes += size
      let generation = generation
      // The completion form keeps frames in order.
      socket.send(.string(chunk)) { [weak self] _ in
        Task { @MainActor in
          guard let self, self.generation == generation else { return }
          self.unsentBytes -= size
        }
      }
    }
  }

  // MARK: Size

  fileprivate func scheduleSize() {
    guard open, !exited else { return }
    let terminal = view.getTerminal()
    let size = GatewayClient.TerminalSize(cols: terminal.cols, rows: terminal.rows)
    guard size.cols >= 2, size.rows >= 1, size != sentSize || pendingSize != nil else { return }
    pendingSize = size
    sizeTimer?.cancel()
    sizeTimer = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(100))
      guard !Task.isCancelled else { return }
      await self?.sendSize()
    }
  }

  /// One resize in flight; a newer size waiting behind it replaces older ones.
  private func sendSize() async {
    guard !resizing else { return }
    resizing = true
    while running, let size = pendingSize {
      pendingSize = nil
      do {
        try await client.resizeTerminal(directory: directory, id: id, size: size)
        sentSize = size
      } catch {
        if running { self.error = "Could not resize terminal. Reconnect to retry." }
      }
    }
    resizing = false
  }
}

extension TerminalSession: TerminalViewDelegate {
  func send(source: TerminalView, data: ArraySlice<UInt8>) { input(data) }
  func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) { scheduleSize() }
  func setTerminalTitle(source: TerminalView, title: String) {}
  func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
  func scrolled(source: TerminalView, position: Double) {}
  func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
    if let url = URL(string: link), ["http", "https"].contains(url.scheme) {
      UIApplication.shared.open(url)
    }
  }
  func bell(source: TerminalView) {}
  func clipboardCopy(source: TerminalView, content: Data) {
    if let text = String(data: content, encoding: .utf8) { UIPasteboard.general.string = text }
  }
  func clipboardRead(source: TerminalView) -> Data? { nil }
  func iTermContent(source: TerminalView, content: ArraySlice<UInt8>) {}
  func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
}

/// URLSession's WebSocket callbacks, delivered on the main queue.
@MainActor private final class SocketEvents: NSObject, URLSessionWebSocketDelegate {
  var opened: (() -> Void)?
  var closed: ((Int) -> Void)?
  private var done = false

  nonisolated func urlSession(
    _ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol: String?
  ) {
    MainActor.assumeIsolated { opened?() }
  }

  nonisolated func urlSession(
    _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?
  ) {
    MainActor.assumeIsolated { finish(closeCode.rawValue) }
  }

  nonisolated func urlSession(
    _ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?
  ) {
    let code = (task as? URLSessionWebSocketTask)?.closeCode.rawValue ?? 0
    MainActor.assumeIsolated { finish(code == 0 ? 1006 : code) }
  }

  private func finish(_ code: Int) {
    guard !done else { return }
    done = true
    closed?(code)
  }
}

/// SwiftTerm's view, themed from tokens, with the key bar, and the visible screen as its
/// accessibility value (VoiceOver and UI tests read it; it's computed only when asked).
final class GatewayTerminalView: TerminalView {
  private var keyBar: TerminalKeyBar!
  private var paletteID: String?

  init(palette: Palette) {
    let font = UIFont(name: "Menlo", size: 12) ?? .monospacedSystemFont(ofSize: 12, weight: .regular)
    super.init(frame: .zero, font: font, options: TerminalOptions(cursorStyle: .steadyBlock, scrollback: 5000))
    accessibilityIdentifier = "terminal-view"
    accessibilityLabel = "Terminal"
    optionAsMetaKey = true
    keyBar = TerminalKeyBar(terminal: self, palette: palette)
    inputAccessoryView = keyBar
    apply(palette)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  func apply(_ palette: Palette) {
    guard palette.id != paletteID else { return }
    paletteID = palette.id
    let theme = TerminalTheme(palette)
    installColors(theme.ansi)
    nativeForegroundColor = theme.foreground
    nativeBackgroundColor = theme.background
    backgroundColor = theme.background
    caretColor = theme.cursor
    caretTextColor = theme.cursorAccent
    selectedTextBackgroundColor = theme.selection
    selectedTextForegroundColor = theme.foreground
    keyboardAppearance = theme.dark ? .dark : .light
    indicatorStyle = theme.dark ? .white : .black
    keyBar.apply(palette)
  }

  override var accessibilityValue: String? {
    get {
      let terminal = getTerminal()
      return (0..<terminal.rows)
        .compactMap { terminal.getLine(row: $0)?.translateToString(trimRight: true) }
        .reversed().drop { $0.isEmpty }.reversed()
        .joined(separator: "\n")
    }
    set {}
  }
}
