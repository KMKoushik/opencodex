import Foundation
import Observation

/// What the thread sheet hands back to the chat screen once it has closed: a panel to open, a
/// thread to show (a fork), or the deleted thread to leave.
enum ThreadSheetExit: Equatable {
  case panel(ThreadPanel)
  case open(String)
  case deleted
}

/// The chat's extra panels, which the phone opens from the thread sheet.
enum ThreadPanel: Equatable {
  case workspace, subagents, sideChat, terminal, details
}

/// The sheet's own snapshot: the thread plus subagents cost, like the desktop's Usage total.
/// Loaded when the sheet opens and after a run ends, so an idle sheet costs nothing.
@Observable
final class ThreadSheetModel {
  let client: GatewayClient
  let sessionID: String

  /// nil while loading.
  private(set) var cost: Loadable<Double> = .loading
  private(set) var compacting = false
  private(set) var deleting = false

  init(client: GatewayClient, sessionID: String) {
    self.client = client
    self.sessionID = sessionID
  }

  func loadCost() async {
    let client = client
    let id = sessionID
    do {
      async let own = client.sessionUsage(id)
      let subagents = try await SessionCost.subagents(of: id) { parent, cursor in
        try await client.subagentUsage(parent, cursor: cursor)
      }
      cost = .loaded(try await own.cost + subagents.reduce(0) { $0 + $1.cost })
    } catch is CancellationError {
    } catch {
      // Keep a loaded total through a transient failure.
      if cost.value == nil { cost = .failed(error.localizedDescription) }
    }
  }

  /// Starts compaction; the transcript shows its progress. Failures go to the chat's notices,
  /// since the sheet closes at once.
  func compact(_ chat: ChatModel) {
    guard !compacting else { return }
    compacting = true
    let client = client
    let id = sessionID
    Task {
      defer { compacting = false }
      do {
        _ = try await client.action(id, .init(action: "compact"))
      } catch {
        chat.error = "Could not compact this thread. \(error.localizedDescription)"
      }
    }
  }

  func delete() async throws {
    deleting = true
    defer { deleting = false }
    try await client.deleteSession(sessionID)
  }
}

/// Why a delete failed, worded for the alert.
nonisolated struct ThreadDeleteFailure: LocalizedError {
  var title: String
  var message: String
  var errorDescription: String? { message }

  /// Gateways from before the delete route answer 404 "Unknown API route.".
  static let outdated = ThreadDeleteFailure(
    title: "Update OpenCodex to delete threads",
    message:
      "The OpenCodex on your computer doesn’t support deleting threads from your phone yet. Update it, then try again."
  )
}

nonisolated extension GatewayClient {
  /// Deletes a thread with native `session.remove`.
  func deleteSession(_ id: String) async throws {
    do {
      _ = try await delete("/sessions/\(id)", as: OK.self)
    } catch let error as GatewayError where error.status == 404 {
      throw ThreadDeleteFailure.outdated
    }
  }

  /// Clears a manual unread mark, only if it's still the one shown (the desktop's `clear`).
  struct UnreadClear: Encodable {
    var action = "clear"
    var marker: String
  }
  func clearUnread(_ id: String, marker: String) async throws {
    _ = try await post("/sessions/\(id)/unread", UnreadClear(marker: marker), as: Unread.self)
  }
}

/// A folder path as the sheet shows it: the home folder as `~`.
nonisolated func shortPath(_ path: String) -> String {
  for prefix in ["/Users/", "/home/"] where path.hasPrefix(prefix) {
    let rest = path.dropFirst(prefix.count)
    guard let slash = rest.firstIndex(of: "/") else { return "~" }
    return "~" + rest[slash...]
  }
  return path
}
