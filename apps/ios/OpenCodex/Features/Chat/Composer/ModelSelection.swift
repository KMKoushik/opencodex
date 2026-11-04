import Foundation
import Observation

nonisolated extension ModelRef {
  /// Identifies the model regardless of thinking level.
  var key: String { "\(providerID)/\(id)" }
  /// OpenCode can return an explicit `default` sentinel after a selection is saved.
  var thinking: String? { variant == "default" ? nil : variant }

  func with(variant: String?) -> ModelRef {
    ModelRef(id: id, providerID: providerID, variant: variant == "default" ? nil : variant)
  }
}

/// Thinking-level label, as the desktop shows it ("high" → "High").
nonisolated func thinkingLabel(_ variant: String?) -> String {
  guard let variant, !variant.isEmpty else { return "Default" }
  return variant.prefix(1).uppercased() + variant.dropFirst()
}

/// The last model picked per project and the last thinking level per model, like the desktop's
/// `projectModels` and `modelVariants`. Each is bounded to the 64 most recent entries.
@MainActor
final class ModelPreferences {
  static let shared = ModelPreferences()

  private struct Entry<Value: Codable>: Codable {
    var key: String
    var value: Value
  }

  private let defaults = UserDefaults.standard
  private var projects: [Entry<ModelRef>]
  /// An empty string records Default.
  private var variants: [Entry<String>]

  private init() {
    projects = Self.read("projectModels")
    variants = Self.read("modelVariants")
  }

  func model(directory: String) -> ModelRef? { projects.last { $0.key == directory }?.value }

  func rememberModel(_ model: ModelRef, directory: String) {
    guard self.model(directory: directory) != model else { return }
    projects = Self.bounded(projects, Entry(key: directory, value: model))
    write(projects, "projectModels")
  }

  /// nil when nothing is saved, `.some(nil)` when Default was saved.
  func variant(for model: ModelRef) -> String?? {
    variants.last { $0.key == model.key }.map { $0.value.isEmpty ? nil : $0.value }
  }

  func rememberVariant(_ model: ModelRef) {
    let value = model.thinking ?? ""
    guard variants.last(where: { $0.key == model.key })?.value != value else { return }
    variants = Self.bounded(variants, Entry(key: model.key, value: value))
    write(variants, "modelVariants")
  }

  private static func bounded<V>(_ entries: [Entry<V>], _ entry: Entry<V>) -> [Entry<V>] {
    Array((entries.filter { $0.key != entry.key } + [entry]).suffix(64))
  }

  private static func read<V: Codable>(_ key: String) -> [Entry<V>] {
    guard let data = UserDefaults.standard.data(forKey: key),
      let entries = try? JSONDecoder().decode([Entry<V>].self, from: data)
    else { return [] }
    return Array(entries.suffix(64))
  }

  private func write<V: Codable>(_ entries: [Entry<V>], _ key: String) {
    if let data = try? JSONEncoder().encode(entries) { defaults.set(data, forKey: key) }
  }
}

/// Model catalogs per project directory, shared by every chat and kept for five minutes so
/// opening chats doesn't refetch them.
@Observable
final class ModelCatalogStore {
  static let shared = ModelCatalogStore()

  struct Entry {
    var catalog: ModelCatalog?
    var error: String?
    var loading = false
    var fetched: Date?
  }

  private(set) var entries: [String: Entry] = [:]

  func load(_ client: GatewayClient, directory: String, force: Bool = false) async {
    let entry = entries[directory] ?? Entry()
    if entry.loading { return }
    if !force, let fetched = entry.fetched, entry.catalog != nil,
      Date().timeIntervalSince(fetched) < 300
    {
      return
    }
    entries[directory, default: Entry()].loading = true
    do {
      let catalog = try await client.models(directory: directory)
      entries[directory] = Entry(catalog: catalog, fetched: Date())
    } catch {
      entries[directory, default: Entry()].loading = false
      entries[directory, default: Entry()].error = error.localizedDescription
    }
  }
}

extension ChatModel {
  /// The project the chat runs in, for its model catalog and preferences.
  var projectDirectory: String? { session?.location.directory ?? directory }

  /// Draft pick, else the session's model (or, for a new chat, the project's last pick), else
  /// the catalog's default.
  func currentModel(draft: Draft, catalog: ModelCatalog?) -> ModelRef? {
    if let model = draft.model { return model }
    if let model = session?.model { return model }
    if sessionID == nil, let directory, let model = ModelPreferences.shared.model(directory: directory) {
      return model
    }
    return catalog?.defaultModel
  }

  /// Port of the desktop `useModelSelection().select`: switching models restores the new
  /// model's remembered thinking level, never another model's.
  func select(_ next: ModelRef, draft: Draft, catalog: ModelCatalog?) {
    let preferences = ModelPreferences.shared
    let current = currentModel(draft: draft, catalog: catalog)
    let switching = current?.key != next.key
    if switching, let current { preferences.rememberVariant(current) }
    var selected = next.with(variant: next.variant)
    if switching, next.thinking == nil, case .some(.some(let saved)) = preferences.variant(for: next),
      let available = catalog?.data.first(where: { $0.ref.key == next.key }),
      available.variants?.contains(where: { $0.id == saved }) == true
    {
      selected.variant = saved
    }
    draft.model = selected
    preferences.rememberVariant(selected)
    if let directory = projectDirectory { preferences.rememberModel(selected, directory: directory) }
  }
}
