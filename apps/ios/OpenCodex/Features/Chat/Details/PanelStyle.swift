import SwiftUI

// Shared look for the native panels (Session details, Tasks, Apps): inset-grouped lists on the
// theme's `surface`, rows on `elevated`, like the desktop's settings groups.

extension View {
  /// An inset-grouped `List` on the theme's page color.
  func panelList(_ palette: Palette) -> some View {
    self
      .listStyle(.insetGrouped)
      .scrollContentBackground(.hidden)
      .background(palette.color("surface"))
      .environment(\.defaultMinListRowHeight, 44)
  }

  /// A row of a `panelList`: the card color, hairline separators in `border`.
  func panelRow(_ palette: Palette) -> some View {
    self
      .listRowBackground(palette.color("elevated"))
      .listRowSeparatorTint(palette.color("border"))
  }
}

/// The empty, setup and error states, as `ContentUnavailableView` in theme colors.
struct PanelUnavailable<Actions: View>: View {
  let title: String
  let symbol: String
  var message: String?
  var tone = "text-secondary"
  @ViewBuilder var actions: Actions
  @Environment(\.palette) private var palette

  init(
    _ title: String, systemImage symbol: String, message: String? = nil,
    tone: String = "text-secondary", @ViewBuilder actions: () -> Actions = { EmptyView() }
  ) {
    self.title = title
    self.symbol = symbol
    self.message = message
    self.tone = tone
    self.actions = actions()
  }

  var body: some View {
    ContentUnavailableView {
      Label {
        Text(title).foregroundStyle(palette.color("text"))
      } icon: {
        Image(systemName: symbol).foregroundStyle(palette.color("text-tertiary"))
      }
    } description: {
      if let message { Text(message).foregroundStyle(palette.color(tone)) }
    } actions: {
      actions
    }
  }
}

/// A loading state: the native spinner with the desktop's wording under it.
struct PanelLoading: View {
  let text: String
  @Environment(\.palette) private var palette

  init(_ text: String) { self.text = text }

  var body: some View {
    ProgressView {
      Text(text).font(.subheadline).foregroundStyle(palette.color("text-tertiary"))
    }
    .tint(palette.color("text-tertiary"))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

extension PanelUnavailable where Actions == EmptyView {
  /// No matches for a filter, like the system's search state, in theme colors.
  static func search(text: String) -> PanelUnavailable<EmptyView> {
    PanelUnavailable(
      "No Results", systemImage: "magnifyingglass", message: "No files match “\(text)”.")
  }
}

extension EventHub {
  /// Keeps a panel's `run()` alive (and with it, its subscriptions) until the view goes away,
  /// polling while the stream is down, like the desktop's refetch interval.
  func follow(poll: @escaping () async -> Void) async {
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(15))
      if !Task.isCancelled, !live { await poll() }
    }
  }
}
