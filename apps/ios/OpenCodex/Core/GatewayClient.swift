import Foundation

nonisolated struct GatewayError: LocalizedError, Sendable {
  var status: Int
  var message: String
  var errorDescription: String? { message }

  /// The device was revoked or never paired; the app should return to pairing.
  var unpaired: Bool { status == 401 }
}

/// A decoded response and the JSON it came from.
nonisolated struct Fetched<T: Sendable>: Sendable {
  var value: T
  var data: Data
}

/// Talks to an OpenCodex gateway's `/api`, the same routes the desktop and web UI use.
/// Remote gateways need the device's bearer token; a loopback gateway (simulator) needs none.
nonisolated struct GatewayClient: Sendable {
  let base: URL
  let token: String?

  static let userAgent = "OpenCodex iOS (iPhone)"

  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = 30
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.waitsForConnectivity = false
    return URLSession(configuration: configuration)
  }()

  func url(_ path: String, _ query: [String: String?] = [:]) -> URL {
    var components = URLComponents(
      url: base.appending(path: "api" + path), resolvingAgainstBaseURL: false)!
    let items = query.compactMap { key, value in value.map { URLQueryItem(name: key, value: $0) } }
    if !items.isEmpty { components.queryItems = items.sorted { $0.name < $1.name } }
    return components.url!
  }

  func request(_ url: URL, method: String = "GET", body: Data? = nil) -> URLRequest {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.httpBody = body
    request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
    if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    return request
  }

  func get<T: Decodable & Sendable>(
    _ path: String, _ query: [String: String?] = [:], as type: T.Type = T.self
  ) async throws -> T {
    try await send(request(url(path, query)))
  }

  func post<T: Decodable & Sendable>(
    _ path: String, _ body: some Encodable = [String: String](), as type: T.Type = T.self
  ) async throws -> T {
    try await send(request(url(path), method: "POST", body: JSONEncoder().encode(body)))
  }

  func delete<T: Decodable & Sendable>(_ path: String, as type: T.Type = T.self) async throws -> T {
    try await send(request(url(path), method: "DELETE"))
  }

  @concurrent func send<T: Decodable & Sendable>(_ request: URLRequest) async throws -> T {
    try await fetch(request).value
  }

  /// The decoded response plus its raw JSON, for responses the app also caches on disk.
  @concurrent func fetch<T: Decodable & Sendable>(_ request: URLRequest) async throws -> Fetched<T> {
    #if DEBUG
      // `-gatewayDelay <seconds>` simulates a slow tunnel, for the cache tests.
      let delay = UserDefaults.standard.double(forKey: "gatewayDelay")
      if delay > 0 { try await Task.sleep(for: .seconds(delay)) }
    #endif
    let (data, response) = try await Self.session.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else {
      let message = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
      throw GatewayError(
        status: status, message: message ?? "The gateway could not complete this request.")
    }
    return Fetched(value: try JSONDecoder().decode(T.self, from: data), data: data)
  }

  /// Opens the server-sent event stream. The caller owns reconnection.
  func events() async throws -> URLSession.AsyncBytes {
    var request = request(url("/events"))
    request.timeoutInterval = .infinity
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    let (bytes, response) = try await Self.session.bytes(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      throw GatewayError(status: status, message: "Couldn’t open the live event stream.")
    }
    return bytes
  }
}

// MARK: - Routes

nonisolated extension GatewayClient {
  func connection() async throws -> Connection { try await get("/connection") }
  /// Discovers or connects OpenCode, like the desktop app's Connect.
  func connect() async throws -> Connection { try await post("/connection") }

  func projects() async throws -> [Project] { try await get("/projects") }

  /// Every project's root threads, newest first; a search also matches message text.
  func searchSessions(_ search: String = "", cursor: String? = nil) async throws -> SessionPage {
    try await get("/session-search", ["search": search, "cursor": cursor])
  }
  func sessions(directory: String, cursor: String? = nil) async throws -> SessionPage {
    try await get("/sessions", ["directory": directory, "cursor": cursor])
  }
  func active() async throws -> ActiveSessions { try await get("/sessions/active") }
  func attention(directories: [String]) async throws -> SessionAttention {
    var components = URLComponents(url: url("/attention"), resolvingAgainstBaseURL: false)!
    components.queryItems = directories.prefix(32).map { URLQueryItem(name: "directory", value: $0) }
    return try await send(request(components.url!))
  }

  func session(_ id: String) async throws -> SessionInfo { try await get("/sessions/\(id)") }
  func messages(_ id: String, cursor: String? = nil) async throws -> MessagePage {
    try await get("/sessions/\(id)/messages", ["cursor": cursor])
  }
  func inbox(_ id: String) async throws -> [InboxItem] { try await get("/sessions/\(id)/inbox") }

  struct CreateSession: Encodable {
    var directory: String
    var model: ModelRef?
  }
  func createSession(directory: String, model: ModelRef?) async throws -> SessionInfo {
    try await post("/sessions", CreateSession(directory: directory, model: model))
  }

  struct Prompt: Encodable {
    struct File: Encodable {
      var name: String
      /// `data:<mime>;base64,…`
      var uri: String
    }
    var text: String
    var model: ModelRef?
    var files: [File]?
    var command: String?
  }
  func prompt(_ id: String, _ prompt: Prompt) async throws -> JSONValue {
    try await post("/sessions/\(id)/prompt", prompt)
  }
  /// Moves an unprompted chat into a new worktree from `branch` (nil: the current HEAD).
  struct StartWorktree: Encodable { var branch: String? }
  func startWorktree(_ id: String, branch: String?) async throws -> SessionInfo {
    // Synthesized encoding omits a nil branch, which the gateway reads as the current HEAD.
    try await post("/sessions/\(id)/worktree", StartWorktree(branch: branch))
  }
  func branches(directory: String, search: String = "") async throws -> [String] {
    try await get("/workspace/branches", ["directory": directory, "search": search])
  }
  func interrupt(_ id: String) async throws -> JSONValue {
    try await post("/sessions/\(id)/interrupt")
  }
  func background(_ id: String) async throws -> OK { try await post("/sessions/\(id)/background") }
  func view(_ id: String, idle: Millis) async throws -> OK {
    try await post("/sessions/\(id)/view", ["idle": idle])
  }
  func rename(_ id: String, title: String) async throws -> JSONValue {
    try await post("/sessions/\(id)/action", ["action": "rename", "title": title])
  }
  func setAccess(_ id: String, full: Bool) async throws -> OK {
    try await post("/sessions/\(id)/access", ["mode": full ? "full" : "default"])
  }

  func permissions(_ id: String) async throws -> [PermissionRequest] {
    try await get("/sessions/\(id)/permissions")
  }
  func reply(_ id: String, permission: String, _ decision: PermissionDecision) async throws
    -> JSONValue
  {
    try await post("/sessions/\(id)/permissions/\(permission)", ["decision": decision])
  }
  func forms(_ id: String) async throws -> [FormInfo] { try await get("/sessions/\(id)/forms") }
  func reply(_ id: String, form: String, answer: [String: JSONValue]) async throws -> JSONValue {
    try await post("/sessions/\(id)/forms/\(form)", ["answer": answer])
  }
  func cancel(_ id: String, form: String) async throws -> JSONValue {
    try await delete("/sessions/\(id)/forms/\(form)")
  }

  func models(directory: String) async throws -> ModelCatalog {
    try await get("/models", ["directory": directory])
  }

  struct Pair: Encodable {
    var code: String
    var client = "native"
  }
  struct Paired: Decodable, Sendable { var token: String }
  /// Spends a pairing code from the computer's Settings → Remote access.
  func pair(code: String) async throws -> String {
    try await post("/remote/pair", Pair(code: code), as: Paired.self).token
  }
}
