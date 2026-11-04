import Foundation
import Observation

/// Which gateway this iPhone uses, and the device token it paired with.
///
/// Pairing spends a one-time code from the computer's Settings → Remote access. The gateway URL
/// lives in UserDefaults and the token in the Keychain. For simulator tests, the `-gateway <url>`
/// launch argument connects straight to a loopback gateway, which needs no token.
@Observable
final class ConnectionStore {
  enum State: Equatable {
    case unpaired
    case paired(URL)
  }

  private(set) var state: State
  private(set) var client: GatewayClient?
  let events = EventHub()

  private static let hostKey = "gatewayURL"

  init() {
    let arguments = UserDefaults.standard
    if CommandLine.arguments.contains("-reset") {
      arguments.removeObject(forKey: Self.hostKey)
      Keychain.remove(Self.hostKey)
    }
    if let override = arguments.string(forKey: "gateway"), let url = URL(string: override) {
      state = .paired(url)
      client = GatewayClient(base: url, token: nil)
    } else if let saved = arguments.string(forKey: Self.hostKey), let url = URL(string: saved),
      let token = Keychain.read(Self.hostKey)
    {
      state = .paired(url)
      client = GatewayClient(base: url, token: token)
    } else {
      state = .unpaired
    }
    events.onUnpaired = { [weak self] in self?.forget() }
    if let client { events.start(client) }
  }

  /// A scanned or pasted pairing link (`https://host/#pair=CODE`), or a host plus a typed code.
  struct PairingInput: Equatable {
    var host: URL
    var code: String

    init?(link: String) {
      guard let url = URL(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
        url.scheme == "https", let host = url.host(), let fragment = url.fragment,
        fragment.hasPrefix("pair=")
      else { return nil }
      self.host = URL(string: "https://\(host)\(url.port.map { ":\($0)" } ?? "")")!
      self.code = String(fragment.dropFirst(5))
    }

    init?(host: String, code: String) {
      var text = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if !text.contains("://") { text = "https://" + text }
      guard let url = URL(string: text), let name = url.host(), !code.isEmpty else { return nil }
      let local = url.scheme == "http" && ["127.0.0.1", "localhost"].contains(name)
      guard url.scheme == "https" || local else { return nil }
      self.host = URL(string: "\(url.scheme!)://\(name)\(url.port.map { ":\($0)" } ?? "")")!
      self.code = code
    }
  }

  /// Spends the code and saves the device token. Throws the gateway's message on failure.
  func pair(_ input: PairingInput) async throws {
    let token = try await GatewayClient(base: input.host, token: nil).pair(code: input.code)
    UserDefaults.standard.set(input.host.absoluteString, forKey: Self.hostKey)
    Keychain.write(Self.hostKey, token)
    let client = GatewayClient(base: input.host, token: token)
    self.client = client
    state = .paired(input.host)
    events.start(client)
  }

  /// Forgets this gateway. The computer still lists the device until it's revoked there.
  func forget() {
    events.stop()
    UserDefaults.standard.removeObject(forKey: Self.hostKey)
    Keychain.remove(Self.hostKey)
    client = nil
    state = .unpaired
  }
}
