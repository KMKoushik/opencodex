import SwiftUI

/// A provider's monochrome mark in the current text color, or a chip icon for unknown
/// providers. Port of the desktop `provider-logo.tsx`; the marks are in `ProviderLogos.xcassets`.
struct ProviderLogo: View {
  let providerID: String
  var canonical: String?
  var size: CGFloat = 18

  private static let assets: Set<String> = [
    "alibaba", "amazon-bedrock", "anthropic", "azure", "deepseek", "github-copilot", "google",
    "groq", "mistral", "moonshotai", "ollama", "openai", "opencode", "openrouter", "xai",
  ]
  private static let aliases: [String: String] = [
    "codex": "openai",
    "chatgpt": "openai",
    "claude": "anthropic",
    "gemini": "google",
    "google-vertex": "google",
    "copilot": "github-copilot",
    "github-copilot-enterprise": "github-copilot",
    "ollama-cloud": "ollama",
    "azure-cognitive-services": "azure",
  ]

  /// The asset for a provider, if it has one.
  nonisolated static func asset(providerID: String, canonical: String?) -> String? {
    let id = ((canonical?.isEmpty == false ? canonical : nil) ?? providerID).lowercased()
    let name = aliases[id] ?? id
    return assets.contains(name) ? "Provider-\(name)" : nil
  }

  var body: some View {
    Group {
      if let asset = Self.asset(providerID: providerID, canonical: canonical) {
        Image(asset)
          .resizable()
          .renderingMode(.template)
          .scaledToFit()
      } else {
        Image(systemName: "cpu")
          .resizable()
          .scaledToFit()
          .fontWeight(.light)
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/// How often each model was picked, for the picker's Most used section. Port of the desktop
/// `model-usage.ts`: the 64 most-used entries, in UserDefaults.
@MainActor
enum ModelUsage {
  private struct Entry: Codable {
    var key: String
    var count: Int
  }
  private static let storageKey = "modelUsage"

  static func key(_ model: ModelRef) -> String { key(providerID: model.providerID, id: model.id) }
  static func key(providerID: String, id: String) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .withoutEscapingSlashes
    let data = (try? encoder.encode([providerID, id])) ?? Data()
    return String(decoding: data, as: UTF8.self)
  }

  static func read() -> [String: Int] {
    guard let data = UserDefaults.standard.data(forKey: storageKey),
      let entries = try? JSONDecoder().decode([Entry].self, from: data)
    else { return [:] }
    return Dictionary(entries.prefix(64).map { ($0.key, $0.count) }, uniquingKeysWith: max)
  }

  static func record(_ model: ModelRef) {
    var usage = read()
    usage[key(model), default: 0] += 1
    let entries = usage.map { Entry(key: $0.key, count: $0.value) }
      .sorted { $0.count > $1.count }
      .prefix(64)
    if let data = try? JSONEncoder().encode(Array(entries)) {
      UserDefaults.standard.set(data, forKey: storageKey)
    }
  }
}

/// Provider metadata the phone's `ModelCatalog` doesn't decode: each provider's canonical id,
/// which picks its logo (an OpenCode-hosted Anthropic model shows Anthropic's mark).
nonisolated struct CatalogResponse: Decodable, Sendable {
  private struct Providers: Decodable {
    struct Provider: Decodable {
      var id: String
      var canonical: String?
    }
    var providers: [Provider]
  }
  var catalog: ModelCatalog
  var canonical: [String: String]

  init(from decoder: Decoder) throws {
    catalog = try ModelCatalog(from: decoder)
    let providers = (try? Providers(from: decoder))?.providers ?? []
    canonical = Dictionary(
      providers.compactMap { provider in provider.canonical.map { (provider.id, $0) } },
      uniquingKeysWith: { a, _ in a })
  }
}
