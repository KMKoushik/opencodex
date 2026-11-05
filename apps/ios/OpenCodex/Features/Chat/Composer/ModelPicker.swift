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

/// The model menu: search, the most-used models, then collapsible provider groups with each
/// model's context size, and the thinking level in the bottom bar. Port of the desktop
/// `ModelMenu`, as a sheet.
struct ModelPicker: View {
  let catalog: ModelCatalog?
  var canonical: [String: String] = [:]
  let loading: Bool
  let error: String?
  let current: ModelRef?
  /// The current model's thinking levels; empty hides the bottom bar.
  var variants: [String] = []
  var onSelect: (ModelRef) -> Void
  var onThinking: (String?) -> Void = { _ in }
  var onRetry: () -> Void

  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette
  @State private var query = ""
  @State private var collapsed: Set<String> = []
  @State private var usage = ModelUsage.read()

  private struct Group: Identifiable {
    var id: String
    var name: String
    var canonical: String?
    var models: [ModelCatalog.Model]
    var frequent = false
  }

  private var groups: [Group] {
    let names = Dictionary(
      (catalog?.providers ?? []).map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
    var grouped: [String: [ModelCatalog.Model]] = [:]
    for model in catalog?.data ?? [] where model.enabled != false {
      grouped[model.providerID, default: []].append(model)
    }
    return grouped.map { id, models in
      Group(
        id: id, name: names[id] ?? id, canonical: canonical[id],
        models: models.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending })
    }
    .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
  }

  /// Most used (or the current model) first, then providers; each filtered by the search.
  private var sections: [Group] {
    let groups = self.groups
    let terms = query.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
    let all = groups.flatMap(\.models)
    var frequent = all.filter { usage[ModelUsage.key($0.ref)] != nil }
      .sorted { usage[ModelUsage.key($0.ref)]! > usage[ModelUsage.key($1.ref)]! }
    if frequent.isEmpty, let current, let model = all.first(where: { $0.ref.key == current.key }) {
      frequent = [model]
    }
    var sections = groups
    if !frequent.isEmpty, terms.isEmpty {
      sections.insert(
        Group(
          id: "most-used", name: usage.isEmpty ? "Current model" : "Most used",
          models: Array(frequent.prefix(5)), frequent: true), at: 0)
    }
    return sections.compactMap { group in
      var shown = group
      shown.models = group.models.filter { model in
        let search = "\(group.name) \(model.providerID) \(model.name) \(model.id)".lowercased()
        return terms.allSatisfy { search.contains($0) }
      }
      return shown.models.isEmpty ? nil : shown
    }
  }

  var body: some View {
    NavigationStack {
      content
        .navigationTitle("Model")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
          text: $query, placement: .navigationBarDrawer(displayMode: .always),
          prompt: "Search models…")
        .onChange(of: query) { collapsed = [] }
        .toolbar {
          if !variants.isEmpty {
            ToolbarItem(placement: .bottomBar) {
              Text("Thinking")
                .font(.subheadline)
                .foregroundStyle(palette.color("text-secondary"))
                .padding(.horizontal, 6)
            }
            .sharedBackgroundVisibility(.hidden)
            ToolbarSpacer(.flexible, placement: .bottomBar)
            ToolbarItem(placement: .bottomBar) {
              ThinkingControl(variants: variants, selected: current?.thinking, onChange: onThinking)
                .padding(.horizontal, 6)
            }
          }
        }
    }
    .tint(palette.color("text"))
    .presentationBackground(palette.color("elevated"))
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
      let sections = self.sections
      if sections.isEmpty {
        ContentUnavailableView.search(text: query)
          .foregroundStyle(palette.color("text-secondary"))
      } else {
        // Opens at the top, where Most used (or the current model) leads, as on the desktop.
        List {
          ForEach(sections) { group in
            let expanded = !collapsed.contains(group.id)
            Section {
              if expanded {
                ForEach(group.models) { model in row(model, group: group) }
              }
            } header: {
              header(group, expanded: expanded)
            }
          }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.immediately)
      }
    }
  }

  private func header(_ group: Group, expanded: Bool) -> some View {
    Button {
      if expanded { collapsed.insert(group.id) } else { collapsed.remove(group.id) }
    } label: {
      HStack(spacing: 8) {
        if !group.frequent {
          ProviderLogo(providerID: group.id, canonical: group.canonical)
        }
        Text(group.name).lineLimit(1)
        Spacer(minLength: 8)
        Text("\(group.models.count)")
          .font(.caption.monospacedDigit())
          .foregroundStyle(palette.color("text-tertiary"))
        Image(systemName: "chevron.down")
          .font(.system(size: 11, weight: .medium))
          .rotationEffect(.degrees(expanded ? 0 : -90))
          .frame(width: 14)
      }
      .font(.footnote.weight(.medium))
      .foregroundStyle(palette.color("text-secondary"))
      .frame(minHeight: 36)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(group.name)
    .accessibilityValue(expanded ? "Expanded" : "Collapsed")
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("model.group.\(group.id)")
  }

  private func row(_ model: ModelCatalog.Model, group: Group) -> some View {
    let selected = model.ref.key == current?.key
    return Button {
      ModelUsage.record(model.ref)
      onSelect(model.ref)
      dismiss()
    } label: {
      HStack(spacing: 10) {
        if group.frequent {
          ProviderLogo(providerID: model.providerID, canonical: canonical[model.providerID])
        }
        Text(model.name)
          .lineLimit(1)
          .foregroundStyle(palette.color("text"))
        Spacer(minLength: 8)
        if let context = model.limit?.context, context > 0 {
          Text(context.formatted(.number.notation(.compactName).precision(.fractionLength(0...1))))
            .font(.caption.monospacedDigit())
            .foregroundStyle(palette.color("text-tertiary"))
        }
        Image(systemName: "checkmark")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(palette.color("text-secondary"))
          .frame(width: 16)
          .opacity(selected ? 1 : 0)
      }
      .font(.subheadline)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .listRowBackground(selected ? palette.color("selected") : Color.clear)
    .listRowSeparator(.hidden)
    .accessibilityLabel("\(model.name), \(group.frequent ? model.providerID : group.name)")
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
