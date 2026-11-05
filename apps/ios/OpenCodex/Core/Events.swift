import Foundation
import Observation
import UIKit

/// One native OpenCode event forwarded by the gateway's `/api/events`.
nonisolated struct GatewayEvent: Decodable, Sendable {
  var id: String?
  var type: String
  var data: JSONValue?

  /// The session the event belongs to, when it has one.
  var sessionID: String? { data?["sessionID"]?.string }
}

/// Parses `text/event-stream` lines into (event name, data) pairs.
nonisolated struct SSEParser {
  private var name = "message"
  private var data: [String] = []

  /// Feeds one line; returns a complete event at each blank line.
  mutating func line(_ line: String) -> (name: String, data: String)? {
    if line.isEmpty {
      defer {
        name = "message"
        data = []
      }
      return data.isEmpty ? nil : (name, data.joined(separator: "\n"))
    }
    if line.hasPrefix(":") { return nil }
    let parts = line.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
    let field = parts[0]
    var value = parts.count > 1 ? String(parts[1]) : ""
    if value.hasPrefix(" ") { value.removeFirst() }
    if field == "event" { name = value } else if field == "data" { data.append(value) }
    return nil
  }
}

/// The app's single live connection to the gateway's event stream, shared by every screen
/// (like the web app's one `EventSource`). It reconnects with backoff, reopens when the app
/// returns to the foreground, and tells subscribers to refetch snapshots after each reconnect,
/// because OpenCode's stream has no replay cursor.
@Observable
final class EventHub {
  /// True while the stream is open; screens poll for recovery while it's false.
  private(set) var live = false

  @ObservationIgnored private var client: GatewayClient?
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var handlers: [UUID: (GatewayEvent) -> Void] = [:]
  @ObservationIgnored private var reconnectHandlers: [UUID: () -> Void] = [:]
  @ObservationIgnored private var observers: [NSObjectProtocol] = []
  /// Called when the gateway rejects this device, so the app can return to pairing.
  @ObservationIgnored var onUnpaired: (() -> Void)?

  init() {
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(
        forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
      ) { [weak self] _ in MainActor.assumeIsolated { self?.suspend() } })
    observers.append(
      center.addObserver(
        forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
      ) { [weak self] _ in MainActor.assumeIsolated { self?.resume() } })
  }

  func start(_ client: GatewayClient) {
    self.client = client
    restart()
  }

  func stop() {
    client = nil
    task?.cancel()
    task = nil
    live = false
  }

  /// Subscribe to every event; keep the token alive as long as you want events.
  func subscribe(_ handler: @escaping (GatewayEvent) -> Void) -> Subscription {
    let id = UUID()
    handlers[id] = handler
    return Subscription { [weak self] in self?.handlers[id] = nil }
  }

  /// Called after the stream reconnects, when cached snapshots may have missed events.
  func onReconnect(_ handler: @escaping () -> Void) -> Subscription {
    let id = UUID()
    reconnectHandlers[id] = handler
    return Subscription { [weak self] in self?.reconnectHandlers[id] = nil }
  }

  private func suspend() {
    // iOS kills sockets in the background without telling us; reopen on return instead.
    task?.cancel()
    task = nil
    live = false
  }

  private func resume() {
    // Events were missed while suspended, so screens must refetch once the stream is back.
    if client != nil { restart(refetch: true) }
  }

  /// `refetch` runs the reconnect handlers on the first `ready`, not only on later ones.
  private func restart(refetch: Bool = false) {
    task?.cancel()
    guard let client else { return }
    #if DEBUG
      // `-eventsOffline YES` never opens the stream, so UI tests can exercise the screens'
      // recovery polling, which otherwise runs only while the stream is down.
      if UserDefaults.standard.bool(forKey: "eventsOffline") { return }
    #endif
    task = Task { [weak self] in
      var delay: Duration = .milliseconds(500)
      var first = !refetch
      while !Task.isCancelled {
        do {
          let bytes = try await client.events()
          var parser = SSEParser()
          var buffer: [UInt8] = []
          // Not `bytes.lines`: it skips the blank lines that end each event.
          for try await byte in bytes {
            guard byte == 0x0A else {
              buffer.append(byte)
              continue
            }
            if buffer.last == 0x0D { buffer.removeLast() }
            let line = String(decoding: buffer, as: UTF8.self)
            buffer.removeAll(keepingCapacity: true)
            guard let event = parser.line(line) else { continue }
            guard let self else { return }
            switch event.name {
            case "ready":
              self.live = true
              delay = .milliseconds(500)
              if !first { self.reconnectHandlers.values.forEach { $0() } }
              first = false
            case "opencode":
              if let decoded = try? JSONDecoder().decode(
                GatewayEvent.self, from: Data(event.data.utf8))
              {
                self.handlers.values.forEach { $0(decoded) }
              }
            case "canvas":
              // Canvas folder changes (`{ type: source | data | list | app, id, … }`).
              if let data = try? JSONDecoder().decode(JSONValue.self, from: Data(event.data.utf8)) {
                let decoded = GatewayEvent(id: nil, type: "canvas", data: data)
                self.handlers.values.forEach { $0(decoded) }
              }
            case "unavailable":
              self.live = false
            default: break
            }
          }
        } catch let error as GatewayError where error.unpaired {
          self?.live = false
          self?.onUnpaired?()
          return
        } catch {}
        guard let self, !Task.isCancelled else { return }
        self.live = false
        first = false
        try? await Task.sleep(for: delay)
        delay = min(delay * 2, .seconds(30))
      }
    }
  }
}

/// Cancels a subscription when released.
final class Subscription {
  private let cancel: () -> Void
  init(_ cancel: @escaping () -> Void) { self.cancel = cancel }
  isolated deinit { cancel() }
}
