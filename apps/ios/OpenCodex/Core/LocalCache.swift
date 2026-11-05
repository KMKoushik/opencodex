import CryptoKit
import Foundation
import Network
import os
import Synchronization

/// What the phone keeps on disk so screens draw at once, before the tunnel answers, like
/// T3 Code's mobile cache (`cached → live`). Entries are the gateway's raw JSON responses, so the
/// app's `Decodable` types read them unchanged; live snapshots always replace them.
///
/// Layout: `Library/Caches/opencodex/v1-<gateway hash>/home/<name>.json` and
/// `…/threads/<session id>/{session,messages}.json`. The schema version is in the folder name;
/// an entry that no longer decodes is deleted and read as a miss. Writes are coalesced per key
/// and happen off the main thread. Thread entries are kept for the 40 most recently used
/// threads and about 30 MB in total.
actor LocalCache {
  enum Key: Hashable, Sendable {
    /// The newest threads across projects (`/session-search`).
    case threadSearch
    case projects
    /// A project's first page of threads.
    case projectPage(String)
    case session(String)
    /// A thread's newest page of messages.
    case messages(String)

    var thread: String? {
      switch self {
      case .session(let id), .messages(let id): id
      default: nil
      }
    }
  }

  static let schema = 1
  static let threadLimit = 40
  static let byteLimit = 30 * 1024 * 1024
  private static let flushDelay = Duration.milliseconds(500)

  let folder: URL
  private var pending: [Key: Data] = [:]
  private var flushTask: Task<Void, Never>?

  init(folder: URL) {
    self.folder = folder
  }

  // MARK: Shared instances

  private static let instances = Mutex<[URL: LocalCache]>([:])

  /// One cache per gateway, so a different computer never shows another's threads.
  static func shared(for gateway: URL) -> LocalCache {
    instances.withLock { caches in
      if let cache = caches[gateway] { return cache }
      let cache = LocalCache(folder: folder(for: gateway))
      caches[gateway] = cache
      return cache
    }
  }

  static func folder(for gateway: URL) -> URL {
    let digest = SHA256.hash(data: Data(gateway.absoluteString.utf8))
    let hash = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    return root.appending(path: "v\(schema)-\(hash)", directoryHint: .isDirectory)
  }

  static var root: URL {
    URL.cachesDirectory.appending(path: "opencodex", directoryHint: .isDirectory)
  }

  // MARK: Reading and writing

  /// The entry decoded off the main thread, or nil. An entry that fails to decode is deleted.
  func read<T: Decodable & Sendable>(_ key: Key, as type: T.Type = T.self) -> T? {
    let url = url(key)
    guard let data = pending[key] ?? (try? Data(contentsOf: url)) else { return nil }
    do {
      let value = try JSONDecoder().decode(T.self, from: data)
      if let id = key.thread { touch(thread: id) }
      return value
    } catch {
      pending[key] = nil
      try? FileManager.default.removeItem(at: url)
      return nil
    }
  }

  /// Saves an entry after a short pause; a newer write for the same key replaces it.
  func write(_ key: Key, _ data: Data) {
    pending[key] = data
    guard flushTask == nil else { return }
    flushTask = Task {
      try? await Task.sleep(for: Self.flushDelay)
      flush()
    }
  }

  /// Writes everything pending now, then trims the thread entries.
  func flush() {
    flushTask = nil
    guard !pending.isEmpty else { return }
    let manager = FileManager.default
    var wroteThread = false
    for (key, data) in pending {
      let url = url(key)
      try? manager.createDirectory(
        at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try? data.write(to: url, options: .atomic)
      if let id = key.thread {
        wroteThread = true
        touch(thread: id)
      }
    }
    pending = [:]
    if wroteThread { prune() }
  }

  func removeThread(_ id: String) {
    pending = pending.filter { $0.key.thread != id }
    try? FileManager.default.removeItem(at: threads.appending(path: Self.safe(id)))
  }

  /// Forgets everything for this gateway.
  func clear() {
    pending = [:]
    flushTask?.cancel()
    flushTask = nil
    try? FileManager.default.removeItem(at: folder)
  }

  /// Every gateway's entries, e.g. for the `-clearLocalCache` test argument.
  static func clearAll() {
    try? FileManager.default.removeItem(at: root)
  }

  // MARK: Layout and bounds

  private var threads: URL { folder.appending(path: "threads", directoryHint: .isDirectory) }

  private func url(_ key: Key) -> URL {
    let home = folder.appending(path: "home", directoryHint: .isDirectory)
    switch key {
    case .threadSearch: return home.appending(path: "threads.json")
    case .projects: return home.appending(path: "projects.json")
    case .projectPage(let directory):
      let digest = SHA256.hash(data: Data(directory.utf8))
      return home.appending(path: "project-\(digest.prefix(8).map { String(format: "%02x", $0) }.joined()).json")
    case .session(let id): return threads.appending(path: Self.safe(id)).appending(path: "session.json")
    case .messages(let id): return threads.appending(path: Self.safe(id)).appending(path: "messages.json")
    }
  }

  /// Session IDs are OpenCode's `ses_…`; anything else can't escape the folder.
  private static func safe(_ id: String) -> String {
    String(id.map { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" ? $0 : "_" })
  }

  /// Marks a thread recently used: its folder's date orders pruning.
  private func touch(thread id: String) {
    try? FileManager.default.setAttributes(
      [.modificationDate: Date.now], ofItemAtPath: threads.appending(path: Self.safe(id)).path)
  }

  /// Keeps the most recently used threads, within the count and size limits.
  private func prune() {
    let manager = FileManager.default
    let keys: [URLResourceKey] = [.contentModificationDateKey]
    guard
      let folders = try? manager.contentsOfDirectory(
        at: threads, includingPropertiesForKeys: keys, options: .skipsHiddenFiles)
    else { return }
    let entries = folders.map { folder in
      let date = (try? folder.resourceValues(forKeys: [.contentModificationDateKey]))?
        .contentModificationDate ?? .distantPast
      let size = ((try? manager.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.fileSizeKey])) ?? [])
        .reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0) }
      return (folder: folder, date: date, size: size)
    }
    .sorted { $0.date > $1.date }
    var total = 0
    for (index, entry) in entries.enumerated() {
      total += entry.size
      if index >= Self.threadLimit || total > Self.byteLimit {
        try? manager.removeItem(at: entry.folder)
      }
    }
  }
}

/// The cached routes, with their raw JSON for the disk cache.
nonisolated extension GatewayClient {
  /// This gateway's disk cache.
  var cache: LocalCache { LocalCache.shared(for: base) }

  func fetch<T: Decodable & Sendable>(_ path: String, _ query: [String: String?] = [:])
    async throws -> Fetched<T>
  {
    try await fetch(request(url(path, query)))
  }

  func threadSearchFetched() async throws -> Fetched<ThreadPage> {
    try await fetch("/session-search", ["search": ""])
  }
  func threadProjectsFetched() async throws -> Fetched<[ThreadProject]> {
    try await fetch("/projects")
  }
  func threadSessionsFetched(directory: String) async throws -> Fetched<ThreadPage> {
    try await fetch("/sessions", ["directory": directory])
  }
  func sessionFetched(_ id: String) async throws -> Fetched<SessionInfo> {
    try await fetch("/sessions/\(id)")
  }
  func messagesFetched(_ id: String) async throws -> Fetched<MessagePage> {
    try await fetch("/sessions/\(id)/messages")
  }

  /// Saves a thread's session and newest messages for a fast first open, e.g. a likely next
  /// tap from the home list. A deleted thread's entry goes.
  func warm(_ id: String) async {
    do {
      async let session = sessionFetched(id)
      async let page = messagesFetched(id)
      let (info, first) = try await (session, page)
      await cache.write(.session(id), info.data)
      await cache.write(.messages(id), first.data)
    } catch let error as GatewayError where error.status == 404 {
      await cache.removeThread(id)
    } catch {}
  }
}

/// Whether background prefetching may use the network: not in Low Data Mode.
nonisolated final class NetworkPath: Sendable {
  static let shared = NetworkPath()
  private let monitor = NWPathMonitor()
  private let state = OSAllocatedUnfairLock(initialState: false)

  private init() {
    monitor.pathUpdateHandler = { [state] path in
      state.withLock { $0 = path.isConstrained }
    }
    monitor.start(queue: DispatchQueue(label: "opencodex.network-path", qos: .utility))
  }

  /// Low Data Mode is on for the current network.
  var constrained: Bool { state.withLock { $0 } }
}
