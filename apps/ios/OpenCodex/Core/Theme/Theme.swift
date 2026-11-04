import Observation
import SwiftUI
import UIKit

/// The desktop app's themes, 1:1. `themes.json` holds the tokens the web UI derives for every
/// preset (`scripts/export-themes.ts` regenerates it), so the phone never re-derives colors.
nonisolated struct Palette: Sendable {
  /// A CSS `box-shadow` layer.
  struct Shadow: Sendable {
    var x: CGFloat
    var y: CGFloat
    var blur: CGFloat
    var color: UIColor
    var inset: Bool
  }

  let id: String
  let name: String
  let dark: Bool
  /// Which coat the calico brand art wears.
  let art: String
  private let tokens: [String: String]

  init(id: String, name: String, dark: Bool, art: String, tokens: [String: String]) {
    self.id = id
    self.name = name
    self.dark = dark
    self.art = art
    self.tokens = tokens
  }

  /// A token as a color: `#rgb`, `#rrggbb`, `#rrggbbaa` or `rgb(r g b / a)`. For gradients, the
  /// first stop.
  func ui(_ token: String) -> UIColor {
    guard let value = tokens[token] else { return .magenta }
    return Self.colors(in: value).first ?? .magenta
  }

  func color(_ token: String) -> Color { Color(uiColor: ui(token)) }

  /// A token's raw CSS value, for non-color tokens such as `syntax-keyword-weight`.
  func string(_ token: String) -> String? { tokens[token] }

  /// A `linear-gradient(...)` token's stops, top to bottom; a plain color is one stop.
  func gradient(_ token: String) -> LinearGradient {
    let stops = Self.colors(in: tokens[token] ?? "").map { Color(uiColor: $0) }
    return LinearGradient(
      colors: stops.isEmpty ? [.clear] : stops, startPoint: .top, endPoint: .bottom)
  }

  /// A `box-shadow` token's layers.
  func shadows(_ token: String) -> [Shadow] {
    Self.layers(tokens[token] ?? "").compactMap { layer in
      let inset = layer.hasPrefix("inset ")
      let body = inset ? String(layer.dropFirst(6)) : layer
      guard let colorStart = body.firstIndex(where: { $0 == "#" || $0 == "r" }) else { return nil }
      let lengths = body[..<colorStart].split(separator: " ").map {
        CGFloat(Double($0.replacingOccurrences(of: "px", with: "")) ?? 0)
      }
      guard lengths.count >= 2, let color = Self.colors(in: String(body[colorStart...])).first
      else { return nil }
      return Shadow(
        x: lengths[0], y: lengths[1], blur: lengths.count > 2 ? lengths[2] : 0, color: color,
        inset: inset)
    }
  }

  // MARK: Parsing

  private static func layers(_ value: String) -> [String] {
    var parts: [String] = []
    var depth = 0
    var current = ""
    for character in value {
      if character == "(" { depth += 1 }
      if character == ")" { depth -= 1 }
      if character == ",", depth == 0 {
        parts.append(current.trimmingCharacters(in: .whitespaces))
        current = ""
      } else {
        current.append(character)
      }
    }
    if !current.isEmpty { parts.append(current.trimmingCharacters(in: .whitespaces)) }
    return parts
  }

  private static let colorPattern = try! NSRegularExpression(
    pattern: #"#([0-9a-fA-F]{3,8})\b|rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)"#)

  static func colors(in value: String) -> [UIColor] {
    let range = NSRange(value.startIndex..., in: value)
    return colorPattern.matches(in: value, range: range).compactMap { match in
      func group(_ index: Int) -> String? {
        Range(match.range(at: index), in: value).map { String(value[$0]) }
      }
      if let hex = group(1) { return UIColor(hex: hex) }
      guard let r = group(2).flatMap(Double.init), let g = group(3).flatMap(Double.init),
        let b = group(4).flatMap(Double.init)
      else { return nil }
      var alpha = 1.0
      if let a = group(5) {
        alpha = a.hasSuffix("%") ? (Double(a.dropLast()) ?? 100) / 100 : Double(a) ?? 1
      }
      return UIColor(red: r / 255, green: g / 255, blue: b / 255, alpha: alpha)
    }
  }
}

extension UIColor {
  nonisolated convenience init?(hex: String) {
    var text = hex
    if text.count == 3 || text.count == 4 { text = text.map { "\($0)\($0)" }.joined() }
    guard text.count == 6 || text.count == 8, let value = UInt64(text, radix: 16) else {
      return nil
    }
    let hasAlpha = text.count == 8
    let r = Double((value >> (hasAlpha ? 24 : 16)) & 0xff) / 255
    let g = Double((value >> (hasAlpha ? 16 : 8)) & 0xff) / 255
    let b = Double((value >> (hasAlpha ? 8 : 0)) & 0xff) / 255
    let a = hasAlpha ? Double(value & 0xff) / 255 : 1
    self.init(red: r, green: g, blue: b, alpha: a)
  }
}

/// Every desktop theme, plus the user's choice for light and dark, like Settings → Appearance.
@Observable
final class ThemeStore {
  enum Mode: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String {
      switch self {
      case .system: "System"
      case .light: "Light"
      case .dark: "Dark"
      }
    }
  }

  let palettes: [Palette]
  var mode: Mode { didSet { save() } }
  var lightID: String { didSet { save() } }
  var darkID: String { didSet { save() } }

  private static let key = "theme"

  init() {
    let catalog = ThemeCatalog.shared
    palettes = catalog.palettes
    let saved = UserDefaults.standard.dictionary(forKey: Self.key) as? [String: String] ?? [:]
    mode = Mode(rawValue: saved["mode"] ?? "") ?? .system
    lightID = saved["light"] ?? catalog.light
    darkID = saved["dark"] ?? catalog.dark
  }

  func options(dark: Bool) -> [Palette] { palettes.filter { $0.dark == dark } }

  func palette(dark: Bool) -> Palette {
    let id = dark ? darkID : lightID
    return palettes.first { $0.id == id }
      ?? palettes.first { $0.dark == dark && $0.id.hasPrefix("opencodex") }!
  }

  /// The scheme to force, or nil to follow the system.
  var colorScheme: ColorScheme? {
    switch mode {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }

  private func save() {
    UserDefaults.standard.set(
      ["mode": mode.rawValue, "light": lightID, "dark": darkID], forKey: Self.key)
  }
}

/// The bundled `themes.json`, loaded once.
nonisolated struct ThemeCatalog: Sendable {
  let palettes: [Palette]
  let light: String
  let dark: String

  static let shared: ThemeCatalog = {
    let url = Bundle.main.url(forResource: "themes", withExtension: "json")!
    let file = try! JSONDecoder().decode(ThemeFile.self, from: Data(contentsOf: url))
    let palettes = file.themes.map { id, theme in
      Palette(
        id: id, name: theme.name, dark: theme.variant == "dark", art: theme.art,
        tokens: theme.tokens)
    }
    return ThemeCatalog(
      palettes: palettes.sorted { $0.name < $1.name }, light: file.defaults.light,
      dark: file.defaults.dark)
  }()

  private struct ThemeFile: Decodable {
    struct Defaults: Decodable {
      var light: String
      var dark: String
    }
    struct Theme: Decodable {
      var name: String
      var variant: String
      var art: String
      var tokens: [String: String]
    }
    var defaults: Defaults
    var themes: [String: Theme]
  }
}

extension EnvironmentValues {
  /// The active theme's tokens. Use these instead of system colors so screens match the desktop.
  @Entry var palette: Palette = ThemeCatalog.shared.palettes.first {
    $0.id == ThemeCatalog.shared.light
  }!
}

/// Applies the chosen theme to a view tree: palette, color scheme, tint and window background.
struct Themed: ViewModifier {
  @Environment(ThemeStore.self) private var themes
  @Environment(\.colorScheme) private var scheme

  func body(content: Content) -> some View {
    let palette = themes.palette(dark: (themes.colorScheme ?? scheme) == .dark)
    content
      .environment(\.palette, palette)
      .tint(palette.color("accent"))
      .preferredColorScheme(themes.colorScheme)
  }
}
