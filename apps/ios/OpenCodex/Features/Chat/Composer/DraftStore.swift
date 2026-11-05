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
    didSet {
      guard text != oldValue else { return }
      revision += 1
      // An edit that deletes a token drops its mention.
      if !mentions.isEmpty {
        let live = Mentions.live(text, mentions)
        if live.count != mentions.count { mentions = live }
      }
    }
  }
  var attachments: [DraftAttachment] = [] {
    didSet { if attachments != oldValue { revision += 1 } }
  }
  /// Referents picked from the `@` menu; each one's token is in `text`.
  private(set) var mentions: [DraftMention] = []
  /// The model picked in this chat; nil follows the session or project default.
  var model: ModelRef?
  /// An unsent thread's Full access choice, applied once its first message creates it.
  var fullAccess = false
  /// Set to ask the composer showing this draft to focus its input, caret at the end; the
  /// composer clears it when it does, including one that appears after the request.
  var wantsFocus = false

  /// Asks the composer to focus its input with the caret at the end, e.g. after filling the
  /// draft from a starter.
  func requestFocus() { wantsFocus = true }

  /// Bumped by every edit, so a send acknowledges only the content it captured.
  @ObservationIgnored private(set) var revision = 0

  var hasContent: Bool {
    !attachments.isEmpty || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
  var isEmpty: Bool { text.isEmpty && attachments.isEmpty && model == nil }

  struct Snapshot {
    var text: String
    var attachments: [DraftAttachment]
    var mentions: [DraftMention]
    var revision: Int
  }

  func capture() -> Snapshot {
    Snapshot(text: text, attachments: attachments, mentions: mentions, revision: revision)
  }

  /// Replaces the text and links the mention whose token it now contains, as one edit.
  func mention(_ text: String, _ mention: DraftMention) {
    self.text = text
    mentions = mentions.filter { $0.token != mention.token } + [mention]
  }

  /// Clears what was sent, unless the user edited the draft while it was sending.
  func acknowledge(_ snapshot: Snapshot) {
    guard revision == snapshot.revision else { return }
    text = ""
    attachments = []
    mentions = []
  }

  /// Puts an undone message back, unless the user edited the draft since the command was captured.
  @discardableResult
  func restore(
    _ snapshot: Snapshot, text: String, attachments: [DraftAttachment], mentions: [DraftMention]
  ) -> Bool {
    guard revision == snapshot.revision else { return false }
    self.mentions = []
    self.text = text
    self.attachments = attachments
    self.mentions = Mentions.live(text, mentions)
    return true
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

  /// Fills a chat's draft from outside the composer (a starter, say) and focuses its input with
  /// the caret at the end. `key` is `DraftStore.key(sessionID:directory:)`.
  func fill(_ key: String, text: String) {
    let draft = draft(key)
    draft.text = text
    draft.requestFocus()
  }

  /// Focuses the input of the composer showing this chat's draft, caret at the end.
  func requestFocus(_ key: String) { draft(key).requestFocus() }

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
