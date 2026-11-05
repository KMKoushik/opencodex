import SwiftTerm
import UIKit

/// The desktop's `terminalTheme` (`apps/web/src/features/terminal/ghostty.ts`): page colors and
/// the 16 ANSI colors from theme tokens, so every preset gets a matching terminal.
struct TerminalTheme {
  let background: UIColor
  let foreground: UIColor
  let cursor: UIColor
  let cursorAccent: UIColor
  let selection: UIColor
  let ansi: [SwiftTerm.Color]
  let dark: Bool

  /// ANSI order: black, red, green, yellow, blue, magenta, cyan, white, then the bright ones.
  static let ansiTokens = [
    "surface-under", "error", "success", "project-orange", "accent-text", "project-purple",
    "project-blue", "text-secondary",
    "text-tertiary", "error", "success", "project-orange", "accent-text", "project-purple",
    "project-blue", "text",
  ]

  init(_ palette: Palette) {
    let surface = palette.ui("surface")
    func solid(_ token: String) -> UIColor { palette.ui(token).flattened(over: surface) }
    background = surface
    foreground = solid("text")
    cursor = foreground
    cursorAccent = surface
    selection = solid("selected")
    ansi = Self.ansiTokens.map { solid($0).terminalColor }
    dark = palette.dark
  }
}

extension UIColor {
  /// The color composited over `base`, since SwiftTerm draws opaque cells.
  fileprivate func flattened(over base: UIColor) -> UIColor {
    var (r, g, b, a): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
    var (br, bg, bb, ba): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
    getRed(&r, green: &g, blue: &b, alpha: &a)
    base.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
    return UIColor(
      red: r * a + br * (1 - a), green: g * a + bg * (1 - a), blue: b * a + bb * (1 - a), alpha: 1)
  }

  fileprivate var terminalColor: SwiftTerm.Color {
    var (r, g, b, a): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
    getRed(&r, green: &g, blue: &b, alpha: &a)
    func channel(_ value: CGFloat) -> UInt16 { UInt16(max(0, min(1, value)) * 65535) }
    return SwiftTerm.Color(red: channel(r), green: channel(g), blue: channel(b))
  }
}
