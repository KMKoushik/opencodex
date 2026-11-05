import ActivityKit
import Foundation

/// A running reply in a chat started from this iPhone, shown as a Live Activity.
/// Compiled into the app and the widget extension.
///
/// The gateway ends it with an APNs `liveactivity` push whose `content-state` is
/// `{"state":"finished"|"failed"|"stopped"}` (`packages/gateway/src/push.ts`), so every
/// other field in `ContentState` must stay optional.
nonisolated struct ReplyActivityAttributes: ActivityAttributes, Sendable {
  nonisolated struct ContentState: Codable, Hashable, Sendable {
    enum State: String, Codable, Hashable, Sendable {
      case running, finished, failed, stopped
    }
    var state: State
    /// The thread's latest title; OpenCode names a new chat after its first message.
    var title: String?
  }

  var sessionID: String
  /// The title when the reply started, until `ContentState.title` has a newer one.
  var title: String
  var project: String
  var started: Date
}
