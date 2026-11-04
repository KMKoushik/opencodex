import SwiftUI

/// The glazed model chip in the composer: provider logo, model name, chevron.
/// Port of the desktop `model-picker.tsx` trigger.
struct ModelChip: View {
  let name: String
  let providerID: String?
  var canonical: String?
  var disabled = false
  var action: () -> Void

  @Environment(\.palette) private var palette

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if let providerID {
          ProviderLogo(providerID: providerID, canonical: canonical, size: 18)
        }
        Text(name)
          .lineLimit(1)
          .truncationMode(.tail)
        Image(systemName: "chevron.down")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .font(.subheadline.weight(.medium))
      .foregroundStyle(palette.color(disabled ? "text-tertiary" : "text"))
      .padding(.leading, providerID == nil ? 10 : 7)
      .padding(.trailing, 10)
      .frame(height: 34)
      .ceramic("chip", shadow: "chip-shadow", border: "chip-border", radius: 9)
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .accessibilityShowsLargeContentViewer()
    .accessibilityIdentifier("composer.model")
    .accessibilityLabel("Model")
    .accessibilityValue(name)
  }
}

/// The quiet "Default" thinking-level control beside the model chip.
struct ThinkingControl: View {
  let variants: [String]
  let selected: String?
  var disabled = false
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
      HStack(spacing: 8) {
        Text(variants.isEmpty ? "No thinking options" : thinkingLabel(selected))
          .lineLimit(1)
        if !variants.isEmpty {
          Image(systemName: "chevron.down")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(palette.color("text-tertiary"))
        }
      }
      .font(.subheadline.weight(.medium))
      .foregroundStyle(palette.color(variants.isEmpty || disabled ? "text-tertiary" : "text-secondary"))
      .padding(.horizontal, 8)
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .disabled(disabled || variants.isEmpty)
    .fixedSize()
    .accessibilityIdentifier("composer.thinking")
    .accessibilityLabel("Thinking level")
    .accessibilityValue(variants.isEmpty ? "No thinking options" : thinkingLabel(selected))
  }
}

/// The model menu: search, the most-used models, then collapsible provider groups with each
/// model's context size. Port of the desktop `ModelMenu`, as a sheet.
struct ModelPicker: View {
  let catalog: ModelCatalog?
  var canonical: [String: String] = [:]
  let loading: Bool
  let error: String?
  let current: ModelRef?
  var onSelect: (ModelRef) -> Void
  var onRetry: () -> Void

  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette
  @State private var query = ""
  @State private var collapsed: Set<String> = []
  @State private var usage = ModelUsage.read()
  @FocusState private var searching: Bool

  private struct Group: Identifiable {
    var id: String
    var name: String
    var canonical: String?
    var models: [ModelCatalog.Model]
    var frequent = false
  }

  private enum Row: Identifiable {
    case provider(Group, expanded: Bool)
    case model(ModelCatalog.Model, group: Group)
    var id: String {
      switch self {
      case .provider(let group, _): "provider:\(group.id)"
      case .model(let model, let group): "\(group.frequent ? "frequent:" : "")\(model.ref.key)"
      }
    }
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

  private var rows: [Row] {
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
    var rows: [Row] = []
    for group in sections {
      let models = group.models.filter { model in
        let search = "\(group.name) \(model.providerID) \(model.name) \(model.id)".lowercased()
        return terms.allSatisfy { search.contains($0) }
      }
      guard !models.isEmpty else { continue }
      var shown = group
      shown.models = models
      let expanded = !collapsed.contains(group.id)
      rows.append(.provider(shown, expanded: expanded))
      if expanded { rows += models.map { .model($0, group: shown) } }
    }
    return rows
  }

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 15))
          .foregroundStyle(palette.color("text-tertiary"))
        TextField(
          "", text: $query,
          prompt: Text("Search models…").foregroundStyle(palette.color("text-tertiary"))
        )
        .focused($searching)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .foregroundStyle(palette.color("text"))
        .accessibilityLabel("Search model")
        .onChange(of: query) { collapsed = [] }
      }
      .padding(.horizontal, 16)
      .frame(minHeight: 52)
      .overlay(alignment: .bottom) {
        Rectangle()
          .fill(palette.color(searching ? "accent" : "border"))
          .frame(height: 1)
      }

      content
    }
    .background(palette.color("elevated"))
    .presentationBackground(palette.color("elevated"))
  }

  @ViewBuilder private var content: some View {
    if catalog == nil {
      VStack(spacing: 12) {
        if loading {
          ProgressView().tint(palette.color("text-secondary"))
          Text("Loading models…")
        } else {
          Text(error ?? "Models unavailable")
          Button("Retry", action: onRetry)
            .buttonStyle(DesktopButtonStyle(variant: .secondary, small: true))
        }
      }
      .font(.subheadline)
      .foregroundStyle(palette.color("text-secondary"))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      let rows = self.rows
      if rows.isEmpty {
        Text("No matching models")
          .font(.subheadline)
          .foregroundStyle(palette.color("text-secondary"))
          .padding(.vertical, 24)
          .padding(.horizontal, 16)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      } else {
        // Opens at the top, where Most used (or the current model) leads, as on the desktop.
        ScrollView {
          LazyVStack(spacing: 0) {
            ForEach(rows) { row in
              rowView(row)
            }
          }
          .padding(.vertical, 6)
        }
        .scrollDismissesKeyboard(.immediately)
      }
    }
  }

  @ViewBuilder private func rowView(_ row: Row) -> some View {
    switch row {
    case .provider(let group, let expanded):
      Button {
        if collapsed.contains(group.id) { collapsed.remove(group.id) } else { collapsed.insert(group.id) }
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
          Image(systemName: expanded ? "chevron.down" : "chevron.right")
            .font(.system(size: 11, weight: .medium))
            .frame(width: 14)
        }
        .font(.footnote.weight(.medium))
        .foregroundStyle(palette.color("text-secondary"))
        .padding(.horizontal, 10)
        .frame(minHeight: 44)
        .contentShape(.rect)
      }
      .buttonStyle(GhostButtonStyle(radius: 8))
      .padding(.horizontal, 6)
      .accessibilityLabel(group.name)
      .accessibilityValue(expanded ? "Expanded" : "Collapsed")
      .accessibilityAddTraits(.isHeader)
    case .model(let model, let group):
      let selected = model.ref.key == current?.key
      Button {
        ModelUsage.record(model.ref)
        onSelect(model.ref)
        dismiss()
      } label: {
        HStack(spacing: 8) {
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
        .padding(.leading, group.frequent ? 10 : 36)
        .padding(.trailing, 10)
        .frame(minHeight: 44)
        .background(selected ? palette.color("selected") : .clear, in: .rect(cornerRadius: 8))
        .contentShape(.rect)
      }
      .buttonStyle(GhostButtonStyle(radius: 8))
      .padding(.horizontal, 6)
      .accessibilityLabel("\(model.name), \(group.frequent ? model.providerID : group.name)")
      .accessibilityAddTraits(selected ? .isSelected : [])
    }
  }
}
