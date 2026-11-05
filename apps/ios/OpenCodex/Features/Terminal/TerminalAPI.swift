import Foundation

/// A native OpenCode PTY, as `/api/terminals` returns it.
nonisolated struct Pty: Codable, Hashable, Identifiable, Sendable {
  var id: String
  var title: String?
  var command: String?
  var cwd: String
  /// `running` or `exited`.
  var status: String
  var pid: Int?
  var exitCode: Int?

  var exited: Bool { status == "exited" }
}

/// The desktop's `terminals`, `createTerminal`, `removeTerminal` and `resizeTerminal`
/// (`apps/web/src/lib/api.ts`), plus the WebSocket upgrade the gateway relays to OpenCode.
nonisolated extension GatewayClient {
  func terminals(directory: String) async throws -> [Pty] {
    try await get("/terminals", ["directory": directory])
  }

  func createTerminal(directory: String) async throws -> Pty {
    try await send(request(url("/terminals", ["directory": directory]), method: "POST"))
  }

  func removeTerminal(directory: String, id: String) async throws {
    let _: OK = try await send(
      request(url("/terminals/\(id)", ["directory": directory]), method: "DELETE"))
  }

  struct TerminalSize: Codable, Hashable, Sendable {
    var cols: Int
    var rows: Int
  }
  func resizeTerminal(directory: String, id: String, size: TerminalSize) async throws {
    let body = try JSONEncoder().encode(["size": size])
    let _: Pty = try await send(
      request(url("/terminals/\(id)", ["directory": directory]), method: "PATCH", body: body))
  }

  /// `ws(s)://…/api/terminals/<id>/connect?directory=…&cursor=…`. Remote gateways need the
  /// device's bearer token on the upgrade; native clients skip the browser's Origin check.
  func terminalSocket(directory: String, id: String, cursor: Int) -> URLRequest {
    var components = URLComponents(
      url: url("/terminals/\(id)/connect", ["directory": directory, "cursor": String(cursor)]),
      resolvingAgainstBaseURL: false)!
    components.scheme = components.scheme == "https" ? "wss" : "ws"
    var request = request(components.url!)
    request.timeoutInterval = 15
    // The loopback listener admits upgrades only from its own origin (the web UI's rule);
    // URLSession sends none, so send the gateway's, which is where this client talks to.
    if let scheme = base.scheme, let host = base.host() {
      request.setValue(
        "\(scheme)://\(host)\(base.port.map { ":\($0)" } ?? "")", forHTTPHeaderField: "Origin")
    }
    return request
  }
}
