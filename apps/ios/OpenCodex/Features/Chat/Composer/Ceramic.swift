import SwiftUI

/// The desktop's glazed "ceramic" surfaces: a gradient token, its `box-shadow` token and an
/// optional hairline token, drawn behind the content in a rounded rectangle.
///
/// Shadow layers map as CSS draws them: drop layers become shadows, `0 0 0 1px` rings become a
/// hairline outside the edge, and inset layers become a highlight (or shade) along the inner
/// top (or bottom) edge.
struct Ceramic: ViewModifier {
  var fill: String
  var shadow: String
  var border: String?
  var radius: CGFloat

  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content.background { surface }
  }

  private var surface: some View {
    let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
    let layers = palette.shadows(shadow)
    let drops = layers.filter { !$0.inset && !($0.x == 0 && $0.y == 0 && $0.blur == 0) }
    let rings = layers.filter { !$0.inset && $0.x == 0 && $0.y == 0 && $0.blur == 0 }
    let insets = layers.filter(\.inset)
    let fill = palette.gradient(fill)
    return ZStack {
      if drops.isEmpty {
        shape.fill(fill)
      } else {
        ForEach(Array(drops.enumerated()), id: \.offset) { _, layer in
          shape.fill(fill)
            .shadow(color: Color(uiColor: layer.color), radius: layer.blur / 2, x: layer.x, y: layer.y)
        }
      }
      ForEach(Array(insets.enumerated()), id: \.offset) { _, layer in
        let color = Color(uiColor: layer.color)
        let top = layer.y >= 0
        let depth = max(1, abs(layer.y) + layer.blur / 2)
        shape.inset(by: depth / 2)
          .stroke(
            LinearGradient(
              stops: [
                .init(color: top ? color : .clear, location: 0),
                .init(color: .clear, location: top ? min(0.5, 4 / 30) : 1 - min(0.5, 6 / 30)),
                .init(color: top ? .clear : color, location: 1),
              ], startPoint: .top, endPoint: .bottom),
            lineWidth: depth)
          .clipShape(shape)
      }
      ForEach(Array(rings.enumerated()), id: \.offset) { _, layer in
        shape.inset(by: -0.5).stroke(Color(uiColor: layer.color), lineWidth: 1)
      }
      if let border {
        shape.strokeBorder(palette.color(border), lineWidth: 1)
      }
    }
  }
}

extension View {
  func ceramic(_ fill: String, shadow: String, border: String? = nil, radius: CGFloat) -> some View {
    modifier(Ceramic(fill: fill, shadow: shadow, border: border, radius: radius))
  }
}

/// A chip-style press state: `hover` while pressed, like the desktop's ghost buttons.
struct GhostButtonStyle: ButtonStyle {
  var radius: CGFloat = 9
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(
        configuration.isPressed ? palette.color("hover") : .clear,
        in: .rect(cornerRadius: radius, style: .continuous))
  }
}

/// The desktop `.button` variants, at phone touch sizes.
struct DesktopButtonStyle: ButtonStyle {
  enum Variant { case primary, secondary, ghost }
  var variant: Variant
  var small = false

  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    let label = configuration.label
      .font(.subheadline.weight(variant == .primary ? .semibold : .medium))
      .lineLimit(1)
      .padding(.horizontal, small ? 12 : 16)
      .frame(minHeight: 36)
      .contentShape(.rect)
    Group {
      switch variant {
      case .primary:
        label
          .foregroundStyle(palette.color("on-primary"))
          .ceramic("primary-glaze", shadow: "primary-shadow", radius: 9)
      case .secondary:
        label
          .foregroundStyle(palette.color("text"))
          .ceramic("chip", shadow: "chip-shadow", border: "chip-border", radius: 9)
      case .ghost:
        label
          .foregroundStyle(palette.color("text-secondary"))
          .background(
            configuration.isPressed ? palette.color("hover") : .clear,
            in: .rect(cornerRadius: 9, style: .continuous))
      }
    }
    .opacity(enabled ? (configuration.isPressed && variant != .ghost ? 0.85 : 1) : 0.5)
    .frame(minHeight: 44)
    .contentShape(.rect)
  }
}
