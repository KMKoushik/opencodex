import SwiftUI

/// The ceramic calico app icon, wearing the active theme's coat, as on the desktop.
/// Decorative: pair it with text.
struct BrandIcon: View {
  @Environment(\.palette) private var palette
  var size: CGFloat = 28

  var body: some View {
    Image(Self.asset(palette.art))
      .resizable()
      .interpolation(.high)
      .scaledToFit()
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }

  static func asset(_ art: String) -> String {
    #if DEBUG
      "BrandDev"
    #else
      art == "catppuccin" ? "BrandCatppuccin" : "BrandCalico"
    #endif
  }
}

/// "opencodex" in Bricolage Grotesque ExtraBold: "open" in the muted tone, "codex" in ink,
/// so it follows every theme.
struct Wordmark: View {
  @Environment(\.palette) private var palette
  var height: CGFloat = 18

  var body: some View {
    // The two halves share one viewBox, so they overlay exactly.
    ZStack {
      Image("WordmarkOpen").resizable().scaledToFit()
        .foregroundStyle(palette.color("wordmark-muted"))
      Image("WordmarkCodex").resizable().scaledToFit()
        .foregroundStyle(palette.color("text"))
    }
    .frame(height: height)
    .accessibilityElement()
    .accessibilityLabel("OpenCodex")
  }
}
