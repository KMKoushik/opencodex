import Observation
import SwiftUI

/// Search results for the search sheet: titles and message text, every project.
@Observable
final class ThreadSearchModel {
  let client: GatewayClient
  var text = ""
  private(set) var results: [ThreadSession] = []
  private(set) var notice: String?
  private(set) var searching = true
  private(set) var error: String?
  private(set) var hasMore = false
  private(set) var loadingMore = false
  @ObservationIgnored private var query: String?
  @ObservationIgnored private var cursor: String?

  init(client: GatewayClient) {
    self.client = client
  }

  /// Runs the current text if it changed since the last search.
  func run() async {
    let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard query != self.query else { return }
    self.query = query
    searching = true
    error = nil
    do {
      let page = try await client.threadSearch(String(query.prefix(256)))
      guard query == self.query else { return }
      results = page.sessions
      notice = page.searchNotice
      cursor = page.nextCursor
      hasMore = page.hasMore
    } catch {
      guard query == self.query, !(error is CancellationError) else { return }
      if (error as? URLError)?.code == .cancelled { return }
      self.error = error.localizedDescription
      results = []
    }
    searching = false
  }

  func retry() async {
    query = nil
    await run()
  }

  func loadMore() async {
    guard hasMore, !loadingMore, let cursor, let query else { return }
    loadingMore = true
    defer { loadingMore = false }
    guard let page = try? await client.threadSearch(query, cursor: cursor), query == self.query
    else { return }
    let seen = Set(results.map(\.id))
    results += page.sessions.filter { !seen.contains($0.id) }
    self.cursor = page.nextCursor
    hasMore = page.hasMore
  }
}

/// The desktop's "Search threads" dialog: a field, then title, excerpt and folder per result.
struct ThreadSearchSheet: View {
  let client: GatewayClient
  let open: (String) -> Void
  @State private var model: ThreadSearchModel
  @FocusState private var focused: Bool
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss

  init(client: GatewayClient, open: @escaping (String) -> Void) {
    self.client = client
    self.open = open
    _model = State(initialValue: ThreadSearchModel(client: client))
  }

  var body: some View {
    NavigationStack {
      List {
        Group {
          if let notice = model.notice { note(notice) }
          if let error = model.error {
            VStack(alignment: .leading, spacing: 8) {
              Text(error).foregroundStyle(palette.color("error"))
              SecondaryButton(title: "Retry") { Task { await model.retry() } }
            }
            .font(.subheadline)
            .padding(.vertical, 6)
          } else if model.searching, model.results.isEmpty {
            note("Searching…")
          } else if model.results.isEmpty {
            note("No threads match your search.")
          }
          ForEach(model.results) { session in
            Button {
              open(session.id)
            } label: {
              result(session)
            }
            .buttonStyle(NavRowStyle())
            .accessibilityIdentifier("search-\(session.id)")
          }
          if model.hasMore {
            Button(model.loadingMore ? "Loading…" : "Show more") {
              Task { await model.loadMore() }
            }
            .buttonStyle(NavRowStyle())
            .font(.subheadline)
            .foregroundStyle(palette.color("text-tertiary"))
            .frame(minHeight: 44)
            .disabled(model.loadingMore)
          }
        }
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(palette.color("surface"))
      .safeAreaInset(edge: .top, spacing: 0) { field }
      .navigationTitle("Search threads")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close", systemImage: "xmark", role: .cancel) { dismiss() }
        }
      }
      .task(id: model.text) {
        // Typing settles for a moment before each search.
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        await model.run()
      }
      .onAppear { focused = true }
    }
  }

  private var field: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(palette.color("text-tertiary"))
      TextField("Search titles and messages…", text: $model.text)
        .focused($focused)
        .submitLabel(.search)
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .accessibilityLabel("Search threads")
        .accessibilityIdentifier("thread-search-field")
    }
    .padding(.horizontal, 12)
    .frame(minHeight: 44)
    .background(palette.color("elevated"), in: .rect(cornerRadius: 10, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .strokeBorder(palette.color("border-heavy"))
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .background(palette.color("surface"))
  }

  private func result(_ session: ThreadSession) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(session.title.isEmpty ? "Untitled session" : session.title)
        .font(.body)
        .foregroundStyle(palette.color("text"))
        .lineLimit(1)
      if let excerpt = session.match?.excerpt {
        Text(excerpt)
          .font(.subheadline)
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(2)
      }
      Label(NewChatSheet.abbreviated(session.directory), systemImage: "folder")
        .font(.caption)
        .foregroundStyle(palette.color("text-tertiary"))
        .lineLimit(1)
        .truncationMode(.head)
    }
    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
    .padding(.vertical, 6)
    .contentShape(.rect)
  }

  private func note(_ text: String) -> some View {
    Text(text)
      .font(.subheadline)
      .foregroundStyle(palette.color("text-tertiary"))
      .padding(.horizontal, 8)
      .padding(.vertical, 6)
  }
}

/// The desktop's small secondary button (`variant="secondary" size="sm"`).
struct SecondaryButton: View {
  let title: String
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Button(title, action: action)
      .font(.subheadline.weight(.medium))
      .foregroundStyle(palette.color("text"))
      .padding(.horizontal, 14)
      .frame(minHeight: 36)
      .background(palette.color("secondary"), in: .rect(cornerRadius: 8, style: .continuous))
      .buttonStyle(.plain)
      .contentShape(.rect)
  }
}
