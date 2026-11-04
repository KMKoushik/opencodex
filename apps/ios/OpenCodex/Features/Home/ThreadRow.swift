import SwiftUI

/// One thread: title and time, then project and status, then a search excerpt.
struct ThreadRow: View {
  let item: ThreadItem
  /// The list's minute tick, so rows hold no timers of their own.
  let now: Date
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    // Accessibility sizes give the title the full width and move the time under it.
    let stacked = typeSize.isAccessibilitySize
    let time = Text(RelativeTime.short(item.activity.date, now: now)).monospacedDigit()
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(item.title)
          .font(.body.weight(.semibold))
          .lineLimit(stacked ? 4 : 2)
          .frame(maxWidth: .infinity, alignment: .leading)
        if !stacked {
          time
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
      }
      HStack(alignment: .center, spacing: 8) {
        Group {
          if stacked { Text("\(item.project) · \(time)") } else { Text(item.project) }
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .lineLimit(stacked ? 2 : 1)
        .frame(maxWidth: .infinity, alignment: .leading)
        StatusBadge(status: item.status)
      }
      if let excerpt = item.excerpt {
        Text(excerpt)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .combine)
    .accessibilityValue(item.status.map(StatusBadge.label) ?? "")
  }
}

/// Running, an unread reply, or waiting on the user; at most one per row.
struct StatusBadge: View {
  let status: ThreadItem.Status?

  var body: some View {
    Group {
      switch status {
      case .running:
        ProgressView().controlSize(.small)
      case .unread:
        Circle().fill(.tint).frame(width: 10, height: 10)
      case .permission:
        Image(systemName: "exclamationmark.shield.fill").foregroundStyle(.orange)
      case .question:
        Image(systemName: "questionmark.bubble.fill").foregroundStyle(.orange)
      case nil:
        EmptyView()
      }
    }
    .font(.subheadline)
    .accessibilityHidden(true)
  }

  static func label(_ status: ThreadItem.Status) -> String {
    switch status {
    case .running: "Running"
    case .unread: "Unread reply"
    case .permission: "Needs approval"
    case .question: "Has a question"
    }
  }
}

/// Compact relative times like Mail: "now", "5m", "3h", "Yesterday", a weekday, then a date.
enum RelativeTime {
  static func short(_ date: Date, now: Date) -> String {
    let seconds = now.timeIntervalSince(date)
    if seconds < 60 { return "now" }
    if seconds < 3600 { return "\(Int(seconds / 60))m" }
    let calendar = Calendar.current
    if calendar.isDate(date, inSameDayAs: now) || seconds < 6 * 3600 {
      return "\(Int(seconds / 3600))h"
    }
    if calendar.isDateInYesterday(date) { return "Yesterday" }
    if seconds < 6 * 86400 { return date.formatted(.dateTime.weekday(.abbreviated)) }
    if calendar.isDate(date, equalTo: now, toGranularity: .year) {
      return date.formatted(.dateTime.month(.abbreviated).day())
    }
    return date.formatted(.dateTime.year().month(.abbreviated).day())
  }
}
