import Foundation

/// Runs async work for many items at once, returning results in input order.
///
/// Always use this instead of calling `withTaskGroup` from main-actor code: under the app's
/// MainActor-by-default isolation, a task group created there crashed optimized (Release)
/// builds in the concurrency runtime (`TaskGroup::offer` / `completeFuture`). Here the group
/// lives in a `@concurrent` function, off the main actor, with nonisolated child tasks.
nonisolated enum Concurrently {
  /// `limit` caps how many run at once, e.g. so a gateway isn't flooded.
  @concurrent
  static func map<Item: Sendable, Result: Sendable>(
    _ items: [Item], limit: Int = .max, _ work: @escaping @Sendable (Item) async -> Result
  ) async -> [Result] {
    await withTaskGroup(of: (Int, Result).self) { group in
      var next = 0
      func start() {
        guard next < items.count else { return }
        let index = next
        next += 1
        group.addTask { (index, await work(items[index])) }
      }
      for _ in 0..<min(max(limit, 1), items.count) { start() }
      var results = [Result?](repeating: nil, count: items.count)
      for await (index, result) in group {
        results[index] = result
        start()
      }
      return results.map { $0! }
    }
  }

  /// Like `map`, but the first error cancels the rest and is rethrown.
  @concurrent
  static func tryMap<Item: Sendable, Result: Sendable>(
    _ items: [Item], _ work: @escaping @Sendable (Item) async throws -> Result
  ) async throws -> [Result] {
    try await withThrowingTaskGroup(of: (Int, Result).self) { group in
      for (index, item) in items.enumerated() {
        group.addTask { (index, try await work(item)) }
      }
      var results = [Result?](repeating: nil, count: items.count)
      for try await (index, result) in group { results[index] = result }
      return results.map { $0! }
    }
  }
}
