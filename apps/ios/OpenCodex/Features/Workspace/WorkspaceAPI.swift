import Foundation

/// One `file.list` / `file.find` entry. Folder paths end with `/`.
nonisolated struct WorkspaceEntry: Codable, Hashable, Sendable {
  var path: String
  var type: String

  var isFolder: Bool { type == "directory" }
  /// The path without a folder's trailing slash.
  var trimmed: String { path.hasSuffix("/") ? String(path.dropLast()) : path }
}

/// What `/api/workspace/file` returns: text up to the 2 MiB preview bound, or a media kind.
nonisolated enum WorkspaceFile: Decodable, Sendable, Equatable {
  case text(text: String, version: String, bytes: Int)
  case image(uri: String, bytes: Int)
  case video(mime: String, bytes: Int)
  case pdf(bytes: Int)
  case docx(data: String, version: String, bytes: Int)
  case binary(bytes: Int)

  private enum Keys: String, CodingKey { case kind, text, version, bytes, uri, mime, data }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: Keys.self)
    let bytes = try c.decodeIfPresent(Int.self, forKey: .bytes) ?? 0
    switch try c.decode(String.self, forKey: .kind) {
    case "text":
      self = .text(
        text: try c.decode(String.self, forKey: .text),
        version: try c.decode(String.self, forKey: .version), bytes: bytes)
    case "image": self = .image(uri: try c.decode(String.self, forKey: .uri), bytes: bytes)
    case "video":
      self = .video(mime: try c.decodeIfPresent(String.self, forKey: .mime) ?? "", bytes: bytes)
    case "pdf": self = .pdf(bytes: bytes)
    case "docx":
      self = .docx(
        data: try c.decode(String.self, forKey: .data),
        version: try c.decodeIfPresent(String.self, forKey: .version) ?? "", bytes: bytes)
    default: self = .binary(bytes: bytes)
    }
  }

  /// Changes when the content does, so a refetch only re-renders real edits.
  var identity: String {
    switch self {
    case .text(_, let version, _), .docx(_, let version, _): version
    case .image(let uri, let bytes): "\(bytes):\(uri.count):\(uri.suffix(32))"
    case .video(_, let bytes), .pdf(let bytes), .binary(let bytes): "\(bytes)"
    }
  }
}

/// Native `vcs.diff` status. Untracked files are `added`.
nonisolated enum ChangeStatus: String, Codable, Hashable, Sendable {
  case added, deleted, modified

  /// The tree's status letter, as on the desktop.
  var letter: String {
    switch self {
    case .added: "A"
    case .deleted: "D"
    case .modified: "M"
    }
  }

  /// The theme token the desktop colors it with.
  var token: String {
    switch self {
    case .added: "success"
    case .deleted: "error"
    case .modified: "warning"
    }
  }
}

/// One changed file, without its patch.
nonisolated struct ChangedFile: Codable, Hashable, Sendable {
  var file: String
  var additions: Int
  var deletions: Int
  var status: ChangeStatus
}

/// One changed file with its unified patch.
nonisolated struct FileDiff: Codable, Hashable, Sendable {
  var file: String
  var patch: String
  var additions: Int
  var deletions: Int
  var status: ChangeStatus
}

/// What the Changes view compares against: `working` is uncommitted, `branch` the base branch.
nonisolated enum CompareMode: String, Codable, Hashable, Sendable, CaseIterable {
  case working, branch

  var label: String { self == .working ? "Uncommitted" : "Base branch" }
}

nonisolated extension GatewayClient {
  /// A folder's children (`""` is the project root), or up to 200 files matching `query`.
  func workspaceFiles(directory: String, path: String = "", query: String = "") async throws
    -> [WorkspaceEntry]
  {
    try await get(
      "/workspace/files",
      ["directory": directory, "path": path.isEmpty ? nil : path, "query": query.isEmpty ? nil : query])
  }

  func workspaceFile(directory: String, path: String) async throws -> WorkspaceFile {
    try await get("/workspace/file", ["directory": directory, "path": path])
  }

  func workspaceChanges(directory: String, mode: CompareMode) async throws -> [ChangedFile] {
    try await get("/workspace/diff", ["directory": directory, "mode": mode.rawValue])
  }

  /// One file's patch with 3 lines of context, or with the whole file when `full`.
  func workspaceDiff(directory: String, mode: CompareMode, path: String, full: Bool = false)
    async throws -> FileDiff?
  {
    try await get(
      "/workspace/diff",
      ["directory": directory, "mode": mode.rawValue, "path": path, "full": full ? "1" : nil])
  }

  /// Ranged, streaming bytes for PDFs and video (local OpenCode services only).
  func workspaceMediaURL(directory: String, path: String) -> URL {
    url("/workspace/media", ["directory": directory, "path": path])
  }

  /// Headers the media route needs outside `URLRequest`, e.g. for AVPlayer.
  var authorizationHeaders: [String: String] {
    var headers = ["User-Agent": Self.userAgent]
    if let token { headers["Authorization"] = "Bearer \(token)" }
    return headers
  }

  /// Downloads a media file to a temporary file, throwing the gateway's message on failure.
  @concurrent func downloadMedia(directory: String, path: String) async throws -> URL {
    let request = request(workspaceMediaURL(directory: directory, path: path))
    let (location, response) = try await URLSession.shared.download(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else {
      let data = (try? Data(contentsOf: location)) ?? Data()
      try? FileManager.default.removeItem(at: location)
      let message = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
      throw GatewayError(
        status: status, message: message ?? "The gateway could not complete this request.")
    }
    let name = (path as NSString).lastPathComponent
    let folder = FileManager.default.temporaryDirectory.appending(path: "workspace-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let target = folder.appending(path: name.isEmpty ? "file" : name)
    try FileManager.default.moveItem(at: location, to: target)
    return target
  }
}
