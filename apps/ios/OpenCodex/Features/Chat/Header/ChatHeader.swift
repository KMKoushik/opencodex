import SwiftUI

/// The desktop toolbar's breadcrumb ("📁 project / title"), stacked for a phone: the project
/// muted on top, the thread title below. While the event stream is down it says so, like the
/// desktop's "Live updates paused".
struct ChatTitle: View {
  let project: String?
  let title: String
  let live: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 1) {
      if project != nil || !live {
        HStack(spacing: 4) {
          if let project {
            Image(systemName: "folder")
              .imageScale(.small)
            Text(project)
              .lineLimit(1)
          }
          if !live {
            if project != nil { Text("·") }
            Text("Live updates paused").lineLimit(1).layoutPriority(1)
          }
        }
        .font(.caption)
        .foregroundStyle(palette.color("text-secondary"))
      }
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(palette.color("text"))
        .lineLimit(1)
    }
    .frame(maxWidth: 260)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("chat.title")
  }
}
