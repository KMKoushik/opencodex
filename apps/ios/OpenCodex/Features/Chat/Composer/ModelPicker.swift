import SwiftUI

/// The thinking level for the chosen model: a native menu of the model's variants.
struct ThinkingControl: View {
  let variants: [String]
  let selected: String?
  var onChange: (String?) -> Void

  @Environment(\.palette) private var palette

  var body: some View {
    Menu {
      Picker("Thinking level", selection: Binding(get: { selected }, set: onChange)) {
        Text("Default").tag(String?.none)
        ForEach(variants, id: \.self) { variant in
          Text(thinkingLabel(variant)).tag(Optional(variant))
        }
      }
    } label: {
      HStack(spacing: 6) {
        Text(thinkingLabel(selected)).lineLimit(1)
        Image(systemName: "chevron.up.chevron.down")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .font(.subheadline.weight(.medium))
      .foregroundStyle(palette.color("text"))
    }
    .fixedSize()
    .accessibilityIdentifier("composer.thinking")
    .accessibilityLabel("Thinking level")
    .accessibilityValue(thinkingLabel(selected))
  }
}

/// The model picker, like OpenCode's iPhone app: Cancel, the title and the thinking level in
/// the bar, a search field, then one flat list (logo, model, provider). Models used most lead,
/// then the current model, then every other model by provider and name.
struct ModelPicker: View {
  let catalog: ModelCatalog?
  var canonical: [String: String] = [:]
  let loading: Bool
  let error: String?
  let current: ModelRef?
  /// The current model's thinking levels; empty hides the thinking control.
  var variants: [String] = []
  var onSelect: (ModelRef) -> Void
  var onThinking: (String?) -> Void = { _ in }
  var onRetry: () -> Void

  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette
  @State private var query = ""
  @State private var usage = ModelUsage.read()

  private struct Entry: Identifiable {
    var model: ModelCatalog.Model
    var provider: String
    var id: String { model.ref.key }
  }

  /// Every enabled model in picker order, filtered by the search.
  private var entries: [Entry] {
    let names = Dictionary(
      (catalog?.providers ?? []).map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
    let all = (catalog?.data ?? []).filter { $0.enabled != false }
      .map { Entry(model: $0, provider: names[$0.providerID] ?? $0.providerID) }
    func rank(_ entry: Entry) -> (Int, Int) {
      if let uses = usage[ModelUsage.key(entry.model.ref)] { return (0, -uses) }
      return entry.model.ref.key == current?.key ? (1, 0) : (2, 0)
    }
    let ordered = all.sorted { a, b in
      let (ra, rb) = (rank(a), rank(b))
      if ra != rb { return ra < rb }
      let provider = a.provider.localizedStandardCompare(b.provider)
      if provider != .orderedSame { return provider == .orderedAscending }
      return a.model.name.localizedStandardCompare(b.model.name) == .orderedAscending
    }
    let terms = query.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
    guard !terms.isEmpty else { return ordered }
    return ordered.filter { entry in
      let text = "\(entry.provider) \(entry.model.providerID) \(entry.model.name) \(entry.model.id)"
        .lowercased()
      return terms.allSatisfy { text.contains($0) }
    }
  }

  var body: some View {
    NavigationStack {
      content
        .navigationTitle("Model")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
          text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel", role: .cancel) { dismiss() }
              .accessibilityIdentifier("model.cancel")
          }
          if !variants.isEmpty {
            ToolbarItem(placement: .primaryAction) {
              ThinkingControl(variants: variants, selected: current?.thinking, onChange: onThinking)
                .padding(.horizontal, 4)
            }
          }
        }
    }
    .tint(palette.color("text"))
  }

  @ViewBuilder private var content: some View {
    if catalog == nil {
      if loading {
        ProgressView("Loading models…")
          .tint(palette.color("text-secondary"))
          .foregroundStyle(palette.color("text-secondary"))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        ContentUnavailableView {
          Label("Models unavailable", systemImage: "exclamationmark.triangle")
        } description: {
          Text(error ?? "The gateway didn’t return any models.")
        } actions: {
          Button("Retry", action: onRetry).buttonStyle(.bordered)
        }
        .foregroundStyle(palette.color("text-secondary"))
      }
    } else {
      let entries = self.entries
      if entries.isEmpty {
        ContentUnavailableView.search(text: query)
          .foregroundStyle(palette.color("text-secondary"))
      } else {
        List(entries) { row($0) }
          .listStyle(.plain)
          .scrollContentBackground(.hidden)
          .scrollDismissesKeyboard(.immediately)
      }
    }
  }

  private func row(_ entry: Entry) -> some View {
    let model = entry.model
    let selected = model.ref.key == current?.key
    return Button {
      ModelUsage.record(model.ref)
      onSelect(model.ref)
      dismiss()
    } label: {
      HStack(spacing: 14) {
        ProviderLogo(providerID: model.providerID, canonical: canonical[model.providerID])
          .foregroundStyle(palette.color("text-secondary"))
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(model.name)
            .foregroundStyle(palette.color("text"))
            .layoutPriority(1)
          Text(entry.provider)
            .foregroundStyle(palette.color("text-tertiary"))
        }
        .lineLimit(1)
        Spacer(minLength: 8)
        if selected {
          Image(systemName: "checkmark")
            .font(.body.weight(.semibold))
            .foregroundStyle(palette.color("accent"))
        }
      }
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden, edges: .top)
    .accessibilityLabel("\(model.name), \(entry.provider)")
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
