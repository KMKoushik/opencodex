import Foundation

// `packages/contracts/src/canvas.ts`, trimmed to what the phone reads.

nonisolated struct CanvasIcon: Codable, Hashable, Sendable {
  var glyph: String?
  var color: String?
}

/// One `oc.ask` or `oc.run` inside a run.
nonisolated struct AppCall: Codable, Hashable, Sendable {
  var kind: String
  var model: String?
  var source: String?
  var started: Millis
  var ended: Millis?
  var error: String?
}

/// One invocation of an app's server function. `/api/apps` carries the newest without logs.
nonisolated struct AppRun: Codable, Hashable, Identifiable, Sendable {
  struct Session: Codable, Hashable, Sendable {
    var id: String
    var title: String
  }
  var id: String
  var fn: String
  /// `view`, `agent` or `trigger`.
  var source: String
  var started: Millis
  var ended: Millis?
  /// `running`, `ok`, `error` or `interrupted`.
  var status: String
  var error: String?
  var logs: [String]?
  var calls: [AppCall]?
  var sessions: [Session]?
}

/// A canvas with a `server.ts`: its functions, triggers and latest run.
nonisolated struct AppInfo: Codable, Hashable, Identifiable, Sendable {
  struct Trigger: Codable, Hashable, Sendable { var every: String }
  var id: String
  var title: String
  var path: String?
  var sessionID: String?
  var icon: CanvasIcon?
  var created: Millis?
  var updated: Millis?
  var functions: [String]
  var triggers: [String: Trigger]
  var error: String?
  var running: [String]
  var projectID: String?
  var lastRun: AppRun?
  var runCount: Int

  /// `daily`, `every 6h`; functions on the same schedule read once (`scheduleLabel`).
  var schedule: String {
    var seen = Set<String>()
    return triggers.keys.sorted().compactMap { name in
      let every = triggers[name]!.every
      guard seen.insert(every).inserted else { return nil }
      return ["1h": "hourly", "1d": "daily", "7d": "weekly"][every] ?? "every \(every)"
    }.joined(separator: ", ")
  }

  var failing: Bool { error != nil || lastRun?.status == "error" }
}

/// The view's transpiled files (`CanvasSource`).
nonisolated struct CanvasSource: Codable, Hashable, Sendable {
  var id: String
  var title: String
  var entry: String
  var modules: [String: String]
  var errors: [String]
  /// Changes whenever any view file changes, so hosts can rerun the view.
  var version: String
  var server: Bool?
}

nonisolated struct CanvasValue: Codable, Hashable, Sendable {
  var value: JSONValue
  var rev: String
}

nonisolated struct CanvasData: Codable, Hashable, Sendable {
  var values: [String: CanvasValue]
  var errors: [String]
}

nonisolated struct CanvasFiles: Codable, Hashable, Sendable {
  struct File: Codable, Hashable, Sendable {
    var name: String
    var text: String
  }
  var files: [File]
}

/// A compare-and-swap write's outcome: saved at `rev`, or a conflict with the stored value.
nonisolated enum CanvasWrite: Sendable {
  case saved(rev: String)
  case conflict(value: JSONValue?, rev: String?)
}

nonisolated extension GatewayClient {
  func apps() async throws -> [AppInfo] { try await get("/apps") }
  func appRuns(_ id: String) async throws -> [AppRun] { try await get("/apps/\(id)/runs") }
  func canvasSource(_ id: String) async throws -> CanvasSource { try await get("/canvases/\(id)") }
  func canvasData(_ id: String) async throws -> CanvasData { try await get("/canvases/\(id)/data") }
  func canvasFiles(_ id: String) async throws -> CanvasFiles {
    try await get("/canvases/\(id)/files")
  }
  func deleteCanvas(_ id: String) async throws -> OK { try await delete("/canvases/\(id)") }

  /// The page the canvas runtime runs in. Public, static and free of user data.
  var canvasFrameURL: URL { url("/canvas-runtime/frame.html") }

  private static let longSession: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    // Functions may run agent sessions; like the desktop, don't time them out.
    configuration.timeoutIntervalForRequest = 24 * 60 * 60
    configuration.timeoutIntervalForResource = 24 * 60 * 60
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    return URLSession(configuration: configuration)
  }()

  /// Runs a server.ts function with JSON arguments and returns its value.
  @concurrent func callCanvasFunction(_ id: String, name: String, args: [JSONValue]) async throws
    -> JSONValue
  {
    var request = request(
      url("/canvases/\(id)/functions/\(name)"), method: "POST",
      body: try JSONEncoder().encode(["args": args]))
    request.timeoutInterval = 24 * 60 * 60
    let (data, response) = try await Self.longSession.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else {
      let message = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
      throw GatewayError(status: status, message: message ?? "The function failed.")
    }
    return (try JSONDecoder().decode([String: JSONValue].self, from: data))["value"] ?? .null
  }

  /// Saves a value if it's still at `rev` (nil: it didn't exist); a 409 carries the stored one.
  @concurrent func writeCanvasValue(_ id: String, key: String, value: JSONValue, rev: String?)
    async throws -> CanvasWrite
  {
    struct Body: Encodable {
      var value: JSONValue
      var rev: String?
      func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(value, forKey: .value)
        try container.encode(rev, forKey: .rev)
      }
      enum CodingKeys: String, CodingKey { case value, rev }
    }
    let request = request(
      url("/canvases/\(id)/data/\(key)"), method: "PUT",
      body: try JSONEncoder().encode(Body(value: value, rev: rev)))
    let (data, response) = try await Self.longSession.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    let body = try? JSONDecoder().decode([String: JSONValue].self, from: data)
    if status == 409 { return .conflict(value: body?["value"], rev: body?["rev"]?.string) }
    guard (200..<300).contains(status), let saved = body?["rev"]?.string else {
      throw GatewayError(
        status: status, message: body?["message"]?.string ?? "The canvas value couldn’t be saved.")
    }
    return .saved(rev: saved)
  }
}
