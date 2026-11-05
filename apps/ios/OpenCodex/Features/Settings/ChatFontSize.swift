import SwiftUI
import UIKit

/// The desktop's chat font size (`settings/chat-font-size.ts`): 12–20 px, 14 by default, for
/// messages and the prompt input only. The phone keeps the same number in `chatFontSize` and
/// scales its own default body size by it, so 14 means the usual text size and Dynamic Type
/// still applies on top.
///
/// Readers: `@AppStorage(ChatFontSize.key) var size = ChatFontSize.standard`, then
/// `ChatFontSize.font(size)` (UIKit) or `ChatFontSize.pointSize(size)`.
nonisolated enum ChatFontSize {
  static let key = "chatFontSize"
  static let standard = 14
  static let range = 12...20

  /// The saved size, or the default when missing or out of range.
  static var current: Int {
    let saved = UserDefaults.standard.integer(forKey: key)
    return range.contains(saved) ? saved : standard
  }

  /// The body size before Dynamic Type: 17 pt at the default 14, in proportion otherwise.
  static func pointSize(_ size: Int) -> CGFloat {
    let size = range.contains(size) ? size : standard
    return (17 * CGFloat(size) / CGFloat(standard)).rounded()
  }

  /// The transcript's body font at this size, scaled by Dynamic Type.
  static func font(_ size: Int, weight: UIFont.Weight = .regular) -> UIFont {
    UIFontMetrics(forTextStyle: .body).scaledFont(
      for: .systemFont(ofSize: pointSize(size), weight: weight))
  }
}
