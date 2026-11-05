import Foundation
import Testing

@testable import OpenCodex

/// The disk cache: raw responses round-trip, a corrupt entry reads as a miss and goes, and
/// only the most recently used threads stay.
struct LocalCacheTests {
  private let folder = FileManager.default.temporaryDirectory
    .appending(path: "cache-tests-\(UUID().uuidString)")

  private func page(_ title: String) -> Data {
    Data(
      """
      {"sessions":[{"id":"ses_1","title":"\(title)","directory":"/a","updatedAt":2,
        "time":{"created":1}}],"nextCursor":null}
      """.utf8)
  }

  @Test func readsWritesAndDropsCorruptEntries() async throws {
    let cache = LocalCache(folder: folder)
    defer { try? FileManager.default.removeItem(at: folder) }

    await cache.write(.threadSearch, page("old"))
    await cache.write(.threadSearch, page("new"))
    // Pending writes read back before they reach the disk.
    #expect(await cache.read(.threadSearch, as: ThreadPage.self)?.sessions.first?.title == "new")
    await cache.flush()
    #expect(await LocalCache(folder: folder).read(.threadSearch, as: ThreadPage.self)?.sessions.first?.title == "new")

    await cache.write(.session("ses_1"), Data("{not json".utf8))
    await cache.flush()
    #expect(await cache.read(.session("ses_1"), as: SessionInfo.self) == nil)
    let file = folder.appending(path: "threads/ses_1/session.json")
    #expect(!FileManager.default.fileExists(atPath: file.path))
  }

  @Test func keepsTheMostRecentlyUsedThreads() async throws {
    let cache = LocalCache(folder: folder)
    defer { try? FileManager.default.removeItem(at: folder) }

    await cache.write(.session("ses_oldest"), page("x"))
    await cache.flush()
    for index in 0..<LocalCache.threadLimit {
      await cache.write(.messages("ses_\(index)"), page("x"))
    }
    await cache.flush()
    let threads = try FileManager.default.contentsOfDirectory(atPath: folder.appending(path: "threads").path)
    #expect(threads.count == LocalCache.threadLimit)
    #expect(!threads.contains("ses_oldest"))

    await cache.removeThread("ses_0")
    #expect(await cache.read(.messages("ses_0"), as: ThreadPage.self) == nil)
  }
}
