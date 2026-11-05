import SwiftUI

/// The desktop toolbar's breadcrumb ("📁 project / title"), stacked for a phone: the project
/// muted on top, the thread title below. While the event stream is down it says so, like the
/// desktop's "Live updates paused".
struct ChatTitle: View {
  let project: String?
  let title: String
  let live: Bool
  /// Shows the native spinner beside the title while the reply runs.
  var running = false
  @Environment(\.palette) private var palette

  var body: some View {
    // OpenCode's order: the thread title, with the project (or paused live updates) under it.
    VStack(spacing: 0) {
      HStack(spacing: 6) {
        if running { ProgressView().controlSize(.mini) }
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(palette.color("text"))
          .lineLimit(1)
      }
      if project != nil || !live {
        Text(live ? (project ?? "") : [project, "Live updates paused"].compactMap { $0 }.joined(separator: " · "))
          .font(.caption)
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(1)
      }
    }
    .frame(maxWidth: 260)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("chat.title")
  }
}
