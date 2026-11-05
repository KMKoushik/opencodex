import UIKit

/// The transcript's colors, resolved once per theme from the desktop's tokens. Fixed colors (not
/// dynamic): the palette already is the light or dark variant, and a theme change re-renders.
nonisolated struct TranscriptTheme: @unchecked Sendable {
  let id: String
  let dark: Bool

  let surface: UIColor
  let text: UIColor
  let textSecondary: UIColor
  let textTertiary: UIColor
  let border: UIColor
  let borderHeavy: UIColor
  /// `user-message`: the sent prompt's bubble.
  let userMessage: UIColor
  /// `secondary`: tool details, reasoning and shell output panels.
  let panel: UIColor
  /// `surface-under`: fenced code blocks.
  let codeBlock: UIColor
  /// `code-bg`: inline code.
  let inlineCode: UIColor
  let link: UIColor
  let linkUnderline: UIColor
  let error: UIColor
  let accentSoft: UIColor
  let accentText: UIColor
  let elevated: UIColor
  let activityEdit: UIColor
  let activitySearch: UIColor
  let activitySkill: UIColor
  let syntax: Syntax

  struct Syntax: Sendable {
    /// Identifiers and everything without a scope.
    var plain: UIColor
    var keyword: UIColor
    var keywordBold: Bool
    var string: UIColor
    var comment: UIColor
    var punctuation: UIColor
    /// Function names and types: a step brighter than plain in monochrome themes.
    var function: UIColor
    var type: UIColor
  }

  init(_ palette: Palette) {
    id = palette.id
    dark = palette.dark
    surface = palette.ui("surface")
    text = palette.ui("text")
    textSecondary = palette.ui("text-secondary")
    textTertiary = palette.ui("text-tertiary")
    border = palette.ui("border")
    borderHeavy = palette.ui("border-heavy")
    userMessage = palette.ui("user-message")
    panel = palette.ui("secondary")
    codeBlock = palette.ui("surface-under")
    inlineCode = palette.ui("code-bg")
    link = palette.ui("link")
    linkUnderline = palette.ui("link-underline")
    error = palette.ui("error")
    accentSoft = palette.ui("accent-soft")
    accentText = palette.ui("accent-text")
    elevated = palette.ui("elevated")
    activityEdit = palette.ui("activity-edit")
    activitySearch = palette.ui("activity-search")
    activitySkill = palette.ui("activity-skill")
    // The "ink" syntax (weight 600 keywords) is monochrome: brightness and weight, not hue, as
    // the desktop's `inkSyntaxTheme`. Hued themes keep plain code at full text color.
    let ink = palette.string("syntax-keyword-weight") == "600"
    let (paper, inkColor) = (palette.ui("surface"), palette.ui("text"))
    func tone(_ amount: CGFloat) -> UIColor { ink ? paper.mixed(with: inkColor, amount) : inkColor }
    syntax = Syntax(
      plain: tone(0.8), keyword: palette.ui("syntax-keyword"), keywordBold: ink,
      string: palette.ui("syntax-string"), comment: palette.ui("syntax-comment"),
      punctuation: palette.ui("syntax-punctuation"), function: tone(0.9), type: tone(0.95))
  }

  /// The theme for the default palette, before the environment provides one.
  @MainActor static var fallback = TranscriptTheme(
    ThemeCatalog.shared.palettes.first { $0.id == ThemeCatalog.shared.light }!)
}

extension UIColor {
  /// `color-mix` in sRGB: `amount` of `other` over self.
  nonisolated func mixed(with other: UIColor, _ amount: CGFloat) -> UIColor {
    var (r1, g1, b1, a1): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
    var (r2, g2, b2, a2): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
    getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
    other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
    func mix(_ a: CGFloat, _ b: CGFloat) -> CGFloat { a + (b - a) * amount }
    return UIColor(red: mix(r1, r2), green: mix(g1, g2), blue: mix(b1, b2), alpha: mix(a1, a2))
  }
}
