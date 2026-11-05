import SwiftUI

/// The chat's model choice as the composer sees it: its draft and the project's catalog.
private struct ModelChoice {
  let chat: ChatModel

  var draft: Draft {
    DraftStore.shared.draft(DraftStore.key(sessionID: chat.sessionID, directory: chat.directory))
  }
  var entry: ModelCatalogStore.Entry? {
    chat.projectDirectory.flatMap { ModelCatalogStore.shared.entries[$0] }
  }
  var current: ModelRef? { chat.currentModel(draft: draft, catalog: entry?.catalog) }
  var info: ModelCatalog.Model? {
    guard let current else { return nil }
    return entry?.catalog?.data.first { $0.ref.key == current.key }
  }

  func select(_ next: ModelRef) { chat.select(next, draft: draft, catalog: entry?.catalog) }

  func load(force: Bool = false) async {
    guard let directory = chat.projectDirectory else { return }
    await ModelCatalogStore.shared.load(chat.client, directory: directory, force: force)
  }
}

/// The sheet's Model row: the provider logo, the model and its thinking level. It shows and
/// changes the same selection as the composer's model chip.
struct ThreadSheetModelRow: View {
  let chat: ChatModel
  let open: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    let choice = ModelChoice(chat: chat)
    let current = choice.current
    let name = choice.info?.name ?? current?.id ?? "Choose model"
    let thinking = choice.info?.variants?.isEmpty == false ? thinkingLabel(current?.thinking) : nil
    Button(action: open) {
      HStack(spacing: 12) {
        Group {
          if let current {
            ProviderLogo(
              providerID: current.providerID, canonical: choice.entry?.canonical[current.providerID],
              size: 20)
          } else {
            Image(systemName: "cpu")
          }
        }
        .foregroundStyle(palette.color("text"))
        .frame(width: 28)
        Text(name)
          .foregroundStyle(palette.color("text"))
          .lineLimit(1)
        Spacer(minLength: 8)
        if let thinking {
          Text(thinking).foregroundStyle(palette.color("text-secondary"))
        }
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .contentShape(.rect)
    }
    .accessibilityLabel("Model")
    .accessibilityValue([name, thinking].compactMap { $0 }.joined(separator: ", "))
    .accessibilityIdentifier("sheet.model")
    .task(id: chat.projectDirectory) { await choice.load() }
  }
}

/// The composer's model picker, opened from the sheet, with the thinking level under the list.
struct ThreadSheetModelPicker: View {
  let chat: ChatModel
  @Environment(\.palette) private var palette

  var body: some View {
    let choice = ModelChoice(chat: chat)
    let current = choice.current
    ModelPicker(
      catalog: choice.entry?.catalog,
      canonical: choice.entry?.canonical ?? [:],
      loading: choice.entry?.loading ?? true,
      error: choice.entry?.error,
      current: current,
      onSelect: { choice.select($0) },
      onRetry: { Task { await choice.load(force: true) } }
    )
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if let variants = choice.info?.variants?.map(\.id), !variants.isEmpty {
        HStack {
          Text("Thinking").foregroundStyle(palette.color("text-secondary"))
          Spacer()
          ThinkingControl(variants: variants, selected: current?.thinking) { variant in
            if let current { choice.select(current.with(variant: variant)) }
          }
        }
        .padding(.horizontal, 20)
        .background(.bar)
      }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }
}
