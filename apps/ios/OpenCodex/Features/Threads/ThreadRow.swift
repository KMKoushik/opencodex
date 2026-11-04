import SwiftUI

/// One thread row as the list draws it: a small value, so unchanged rows skip re-rendering.
nonisolated struct ThreadItem: Hashable, Identifiable, Sendable {
  nonisolated enum Attention: Hashable, Sendable { case permission, question }

  var id: String
  var title: String
  var directory: String
  var project: ProjectBadge
  /// A pending approval or question, which outranks the other indicators.
  var attention: Attention?
  var responding: Bool
  /// The dot: marked unread, or a reply finished after it was last viewed.
  var unread: Bool
  var markedUnread: Bool
  var muted: Bool
  var forked: Bool
  var pinned: Bool
  /// Marked done with nothing newer.
  var done: Bool

  var target: ThreadActionTarget {
    ThreadActionTarget(
      id: id, title: title, pinned: pinned, done: done, muted: muted, running: responding)
  }

  /// What VoiceOver reads after the title.
  var statusLabel: String {
    var parts: [String] = []
    switch attention {
    case .permission: parts.append("Needs approval")
    case .question: parts.append("Has a question")
    case nil:
      if responding { parts.append("Responding") }
      if unread { parts.append(markedUnread ? "Unread thread" : "Unread reply") }
    }
    if muted { parts.append("Notifications muted") }
    if forked { parts.append("Forked thread") }
    return parts.joined(separator: ", ")
  }
}

/// The desktop's `SessionRow`: an optional project avatar, the title fading at the edge, the
/// muted and fork marks, then the status indicator. 32 px rows become 44 pt.
struct ThreadRow: View {
  let item: ThreadItem
  /// Rows from several projects share the list (Pinned, Focus), so each shows its project.
  var showsProject = true
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .body) private var avatar: CGFloat = 20

  var body: some View {
    HStack(spacing: 10) {
      if showsProject { ProjectIcon(badge: item.project, size: avatar) }
      FadingTitle(text: item.title)
        .foregroundStyle(palette.color("text-secondary"))
      if item.muted {
        Image(systemName: "bell.slash")
          .font(.footnote)
          .foregroundStyle(palette.color("text-tertiary"))
      }
      if item.forked {
        Image(systemName: "arrow.triangle.branch")
          .font(.footnote)
          .foregroundStyle(palette.color("text-tertiary"))
      }
      ThreadIndicators(item: item)
    }
    .frame(minHeight: 44)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(showsProject ? "\(item.title), \(item.project.name)" : item.title)
    .accessibilityValue(item.statusLabel)
  }
}

/// `.truncate-fade`: one line that fades out at the trailing edge instead of an ellipsis.
struct FadingTitle: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.body)
      .lineLimit(1)
      .fixedSize(horizontal: true, vertical: false)
      .frame(maxWidth: .infinity, alignment: .leading)
      .clipped()
      .mask {
        HStack(spacing: 0) {
          Rectangle()
          LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
            .frame(width: 24)
        }
      }
  }
}

/// Rows press to `hover` with 8 pt corners, like the sidebar's `.nav-row`.
struct NavRowStyle: ButtonStyle {
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .padding(.horizontal, 8)
      .background(
        configuration.isPressed ? palette.color("hover") : .clear,
        in: .rect(cornerRadius: 8, style: .continuous))
  }
}
