import Foundation
import Observation
import UIKit

/// An image ready to send: encoded once when picked, so sending does no image work.
struct DraftAttachment: Identifiable, Equatable {
  let id = UUID()
  var name: String
  /// `data:image/jpeg;base64,…`
  var uri: String
  var bytes: Int
  var thumbnail: UIImage

  static func == (a: Self, b: Self) -> Bool { a.id == b.id }
}

/// One chat's unsent intent. Each chat observes only its own draft, so typing re-renders only
/// that composer.
@Observable
final class Draft {
  var text = "" {
    didSet { if text != oldValue { revision += 1 } }
  }
  var attachments: [DraftAttachment] = [] {
    didSet { if attachments != oldValue { revision += 1 } }
  }
  /// The model picked in this chat; nil follows the session or project default.
  var model: ModelRef?

  /// Bumped by every edit, so a send acknowledges only the content it captured.
  @ObservationIgnored private(set) var revision = 0

  var hasContent: Bool {
    !attachments.isEmpty || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
  var isEmpty: Bool { text.isEmpty && attachments.isEmpty && model == nil }

  struct Snapshot {
    var text: String
    var attachments: [DraftAttachment]
    var revision: Int
  }

  func capture() -> Snapshot { Snapshot(text: text, attachments: attachments, revision: revision) }

  /// Clears what was sent, unless the user edited the draft while it was sending.
  func acknowledge(_ snapshot: Snapshot) {
    guard revision == snapshot.revision else { return }
    text = ""
    attachments = []
  }
}

/// App-scoped, in-memory drafts keyed by session ID, or `new:<directory>` for an unsent chat,
/// so leaving a chat and coming back keeps what was typed.
@MainActor
final class DraftStore {
  static let shared = DraftStore()

  private var drafts: [String: Draft] = [:]

  static func key(sessionID: String?, directory: String?) -> String {
    sessionID ?? "new:\(directory ?? "")"
  }

  func draft(_ key: String) -> Draft {
    if let draft = drafts[key] { return draft }
    prune()
    let draft = Draft()
    drafts[key] = draft
    return draft
  }

  /// A new chat's draft follows it to the session its first send created.
  func move(from: String, to: String) {
    guard from != to, let draft = drafts[from], drafts[to]?.isEmpty ?? true else { return }
    drafts[to] = draft
    drafts[from] = nil
  }

  /// Bounds memory as chats are visited: empty drafts go first.
  private func prune() {
    guard drafts.count >= 64 else { return }
    for (key, draft) in drafts where draft.isEmpty { drafts[key] = nil }
  }
}
