import SwiftUI
import UIKit

/// The running indicator everywhere in the app: the native iOS activity indicator, sized to fit
/// where the desktop draws its ring (thread rows, the activity pill, tool rows).
struct RingSpinner: View {
  var size: CGFloat = 14
  @Environment(\.palette) private var palette

  var body: some View {
    ProgressView()
      .progressViewStyle(.circular)
      .tint(palette.color("text-secondary"))
      // The small native indicator is 20pt; scale it to the slot.
      .scaleEffect(size / 20)
      .frame(width: size, height: size)
      .accessibilityLabel("Running")
  }
}

/// A row's trailing indicators, as `SessionRow` draws them: a pending approval or question
/// outranks everything; otherwise the running spinner and the unread dot.
struct ThreadIndicators: View {
  let item: ThreadItem
  @Environment(\.palette) private var palette

  var body: some View {
    if let attention = item.attention {
      AttentionBadge(kind: attention)
    } else if item.responding {
      RingSpinner()
        .overlay(alignment: .bottomTrailing) {
          // `.session-unread[data-responding]`: a smaller dot tucked beside the spinner.
          if item.unread {
            Circle().fill(palette.color("accent")).frame(width: 5, height: 5).offset(x: 6, y: 2)
          }
        }
    } else if item.unread {
      UnreadDot()
    }
  }
}

/// `.session-unread`: a small dot in the accent (ink in the OpenCodex themes).
struct UnreadDot: View {
  @Environment(\.palette) private var palette
  var body: some View {
    Circle().fill(palette.color("accent")).frame(width: 8, height: 8)
  }
}

/// `.session-attention`: "!" on `warning` for an approval, "?" on `accent` for a question.
struct AttentionBadge: View {
  let kind: ThreadItem.Attention
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .body) private var size: CGFloat = 18

  var body: some View {
    let permission = kind == .permission
    Image(systemName: permission ? "exclamationmark.circle.fill" : "questionmark.circle.fill")
      .symbolRenderingMode(.palette)
      .foregroundStyle(
        palette.color(permission ? "surface" : "on-accent"),
        palette.color(permission ? "warning" : "accent")
      )
      .font(.system(size: size, weight: .semibold))
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}
