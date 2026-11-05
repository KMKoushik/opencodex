import SwiftUI

/// The `/` and `@` menus that float above the composer. Port of the desktop `.slash-menu`.
struct ComposerMenu<Footer: View>: View {
  struct Item: Identifiable {
    var id: String
    var icon: String?
    var title: String
    var detail: String?
    var action: () -> Void
  }

  let label: String
  var maxHeight: CGFloat = 320
  let items: [Item]
  @ViewBuilder var footer: Footer

  @Environment(\.palette) private var palette
  @State private var contentHeight: CGFloat = 0

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
          Button(action: item.action) {
            HStack(spacing: 10) {
              if let icon = item.icon {
                Image(systemName: icon)
                  .font(.system(size: 15))
                  .foregroundStyle(palette.color(index == 0 ? "text-secondary" : "text-tertiary"))
                  .frame(width: 18)
              }
              Text(item.title)
                .font(.subheadline)
                .foregroundStyle(palette.color(index == 0 ? "text" : "text-secondary"))
                .lineLimit(1)
                .layoutPriority(1)
              if let detail = item.detail, !detail.isEmpty {
                Text(detail)
                  .font(.footnote)
                  .foregroundStyle(palette.color("text-tertiary"))
                  .lineLimit(1)
              }
              Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            // The first match is the one Return would choose on the desktop.
            .background(index == 0 ? palette.color("selected") : .clear, in: .rect(cornerRadius: 6))
            .contentShape(.rect)
          }
          .buttonStyle(GhostButtonStyle(radius: 6))
          .accessibilityLabel(item.title)
          .accessibilityHint(item.detail ?? "")
          .accessibilityIdentifier("menu.\(item.id)")
        }
        footer
      }
      .padding(6)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(height: min(maxHeight, contentHeight))
    .background(palette.color("elevated"), in: .rect(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(palette.color("border-heavy")))
    .shadow(color: .black.opacity(palette.dark ? 0.45 : 0.1), radius: 16, y: 12)
    .shadow(color: .black.opacity(palette.dark ? 0.25 : 0.05), radius: 3, y: 2)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(label)
    .accessibilityIdentifier("composer.menu")
  }
}

/// A status or retry line at the bottom of a composer menu.
struct ComposerMenuNote: View {
  let text: String
  var retry: (() -> Void)?

  @Environment(\.palette) private var palette

  var body: some View {
    if let retry {
      Button(text, action: retry)
        .font(.footnote)
        .foregroundStyle(palette.color("text-secondary"))
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(.rect)
        .buttonStyle(GhostButtonStyle(radius: 6))
    } else {
      Text(text)
        .font(.footnote)
        .foregroundStyle(palette.color("text-tertiary"))
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
    }
  }
}
