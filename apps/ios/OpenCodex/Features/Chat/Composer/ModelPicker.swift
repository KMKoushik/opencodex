import SwiftUI

/// The model and thinking chip in the composer's toolbar.
struct ModelChip: View {
  let name: String
  /// nil when the model has no thinking levels.
  let thinking: String?
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 4) {
        Text(name)
          .foregroundStyle(.primary)
          .lineLimit(1)
        if let thinking {
          Text(thinking)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .fixedSize()
        }
        Image(systemName: "chevron.down")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(.secondary)
      }
      .font(.subheadline.weight(.medium))
      .padding(.horizontal, 10)
      .frame(minHeight: 34)
      .contentShape(.capsule)
    }
    .buttonStyle(.plain)
    .accessibilityShowsLargeContentViewer()
    .accessibilityIdentifier("composer.model")
    .accessibilityLabel("Model")
    .accessibilityValue(thinking.map { "\(name), thinking \($0)" } ?? name)
  }
}

/// A searchable model list grouped by provider, with the current model's thinking levels on top.
struct ModelPicker: View {
  let catalog: ModelCatalog?
  let loading: Bool
  let error: String?
  let current: ModelRef?
  var onSelect: (ModelRef) -> Void
  var onRetry: () -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var query = ""

  private struct Group: Identifiable {
    var id: String
    var name: String
    var models: [ModelCatalog.Model]
  }

  private var enabled: [ModelCatalog.Model] {
    (catalog?.data ?? []).filter { $0.enabled != false }
  }

  private var currentModel: ModelCatalog.Model? {
    enabled.first { $0.ref.key == current?.key }
  }

  private var groups: [Group] {
    let names = Dictionary(
      (catalog?.providers ?? []).map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
    let terms = query.lowercased().split(whereSeparator: \.isWhitespace)
    var grouped: [String: [ModelCatalog.Model]] = [:]
    for model in enabled {
      let provider = names[model.providerID] ?? model.providerID
      let search = "\(provider) \(model.providerID) \(model.name) \(model.id)".lowercased()
      guard terms.allSatisfy({ search.contains($0) }) else { continue }
      grouped[model.providerID, default: []].append(model)
    }
    return grouped.map { id, models in
      Group(
        id: id, name: names[id] ?? id,
        models: models.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending })
    }
    .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
  }

  var body: some View {
    NavigationStack {
      ScrollViewReader { proxy in
      List {
        ForEach(groups) { group in
          Section(group.name) {
            ForEach(group.models) { model in
              row(model).id(model.ref.key)
            }
          }
        }
      }
      .listStyle(.insetGrouped)
      .onAppear {
        if let key = current?.key { proxy.scrollTo(key, anchor: .center) }
      }
      }
      .overlay { placeholder }
      .searchable(
        text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search models")
      .navigationTitle("Model")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", systemImage: "checkmark") { dismiss() }
        }
        if let model = currentModel, let variants = model.variants, !variants.isEmpty {
          ToolbarItem(placement: .bottomBar) {
            Menu {
              Picker("Thinking", selection: thinkingBinding) {
                Text("Default").tag(String?.none)
                ForEach(variants, id: \.id) { variant in
                  Text(thinkingLabel(variant.id)).tag(Optional(variant.id))
                }
              }
            } label: {
              HStack(spacing: 6) {
                Image(systemName: "brain")
                Text("Thinking")
                Text(thinkingLabel(current?.thinking)).foregroundStyle(.secondary)
                Image(systemName: "chevron.up.chevron.down")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(.secondary)
              }
              .padding(.horizontal, 6)
            }
            .accessibilityIdentifier("model.thinking")
            .accessibilityLabel("Thinking level")
            .accessibilityValue(thinkingLabel(current?.thinking))
          }
        }
      }
    }
  }

  @ViewBuilder private var placeholder: some View {
    if catalog == nil {
      if loading {
        ProgressView("Loading models…")
      } else if let error {
        ContentUnavailableView {
          Label("Models unavailable", systemImage: "exclamationmark.triangle")
        } description: {
          Text(error)
        } actions: {
          Button("Try Again", action: onRetry)
        }
      }
    } else if groups.isEmpty {
      if query.isEmpty {
        ContentUnavailableView("No models available", systemImage: "cpu")
      } else {
        ContentUnavailableView.search(text: query)
      }
    }
  }

  private func row(_ model: ModelCatalog.Model) -> some View {
    let selected = model.ref.key == current?.key
    return Button {
      onSelect(model.ref)
      dismiss()
    } label: {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text(model.name).foregroundStyle(.primary)
          if let context = model.limit?.context, context > 0 {
            Text("\(context.formatted(.number.notation(.compactName))) context")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        Spacer(minLength: 8)
        if selected {
          Image(systemName: "checkmark")
            .font(.body.weight(.semibold))
            .foregroundStyle(.tint)
        }
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  private var thinkingBinding: Binding<String?> {
    Binding {
      current?.thinking
    } set: { variant in
      if let current { onSelect(current.with(variant: variant)) }
    }
  }
}
