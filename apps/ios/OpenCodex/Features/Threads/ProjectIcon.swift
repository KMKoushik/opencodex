import SwiftUI

/// What a project avatar shows: a name for the letter, plus the project's color or image.
nonisolated struct ProjectBadge: Hashable, Sendable {
  var name: String
  var icon: ThreadProject.Icon?
}

/// The desktop's `ProjectIcon`, 1:1: the project's own image (`icon.override`, or `icon.url`
/// when no color was chosen), else its first letter on the `project-*` color.
struct ProjectIcon: View {
  let badge: ProjectBadge
  var size: CGFloat = 20
  @Environment(\.palette) private var palette
  @State private var failed: String?

  private var source: String? {
    let icon = badge.icon
    if let override = icon?.override, !override.isEmpty { return override }
    if icon?.color?.isEmpty ?? true, let url = icon?.url, !url.isEmpty { return url }
    return nil
  }

  private var letter: String {
    badge.name.trimmingCharacters(in: .whitespacesAndNewlines).first.map {
      String($0).localizedUppercase
    } ?? "?"
  }

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: size / 4, style: .continuous)
    Group {
      if let source, source != failed, let url = URL(string: source) {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let image):
            image.resizable().scaledToFill()
          case .failure:
            letterView.onAppear { failed = source }
          default:
            letterView
          }
        }
      } else {
        letterView
      }
    }
    .frame(width: size, height: size)
    .clipShape(shape)
    .accessibilityHidden(true)
  }

  /// `projectColors` on the desktop; anything else draws gray, as its CSS does.
  static let colors: Set<String> = ["gray", "blue", "green", "orange", "pink", "purple"]

  private var letterView: some View {
    let color = badge.icon?.color.flatMap { Self.colors.contains($0) ? $0 : nil } ?? "gray"
    return ZStack {
      palette.color("project-\(color)")
      Text(letter)
        .font(.system(size: size * 0.62, weight: .medium))
        .foregroundStyle(palette.color("on-project"))
    }
    .overlay {
      RoundedRectangle(cornerRadius: size / 4, style: .continuous)
        .strokeBorder(palette.color("border-heavy"), lineWidth: 1)
    }
  }
}
