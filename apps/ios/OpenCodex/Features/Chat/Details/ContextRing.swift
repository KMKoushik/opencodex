import SwiftUI

/// The desktop's context ring: a track with the used share drawn clockwise from the top, in
/// `text-secondary`, `warning` from 75% and `error` from 90%. Reusable by the composer.
struct ContextRing: View {
  @Environment(\.palette) private var palette
  /// The share of the context window used, or nil when unknown.
  var ratio: Double?
  var size: CGFloat = 20

  var body: some View {
    // The desktop draws r=9 with a 2.5 stroke in a 24 box.
    let line = size * 2.5 / 24
    let inset = size * 3 / 24
    ZStack {
      Circle()
        .stroke(palette.color("border-heavy"), lineWidth: line)
      if let ratio {
        Circle()
          .trim(from: 0, to: min(max(ratio, 0), 1))
          .stroke(color(ratio), style: StrokeStyle(lineWidth: line, lineCap: .butt))
          .rotationEffect(.degrees(-90))
      }
    }
    .padding(inset)
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }

  private func color(_ ratio: Double) -> Color {
    palette.color(ratio >= 0.9 ? "error" : ratio >= 0.75 ? "warning" : "text-secondary")
  }
}

/// Number formats shared with the desktop's `Intl.NumberFormat` choices.
enum DetailsFormat {
  static func number(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(0)))
  }
  static func percent(_ value: Double) -> String {
    value.formatted(.percent.precision(.fractionLength(0...1)))
  }
  static func money(_ value: Double) -> String {
    value.formatted(.currency(code: "USD").precision(.fractionLength(2...4)))
  }
}
