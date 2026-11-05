import Observation
import SwiftUI

/// Search results for the threads screen's search field: titles and message text, every project.
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
      guard query == self.query else { return }
      if error is CancellationError || (error as? URLError)?.code == .cancelled {
        // Typing cancelled this search; the same text must run again when it comes back.
        self.query = nil
        return
      }
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

/// The desktop's "Search threads" results, shown in place of the list while the native search
/// field is active: title, excerpt and folder per result, newest first.
struct ThreadSearchResults: View {
  let model: ThreadSearchModel
  let open: (String) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    List {
      Group {
        if let notice = model.notice { note(notice) }
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
          Button {
            Task { await model.loadMore() }
          } label: {
            HStack(spacing: 8) {
              Text(model.loadingMore ? "Loading…" : "Show more")
              if model.loadingMore { ProgressView().controlSize(.small) }
            }
            .font(.subheadline)
            .foregroundStyle(palette.color("text-tertiary"))
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
          }
          .buttonStyle(NavRowStyle())
          .disabled(model.loadingMore)
        }
      }
      .listRowBackground(Color.clear)
      .listRowSeparator(.hidden)
      .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .scrollDismissesKeyboard(.immediately)
    .overlay { status }
    .accessibilityIdentifier("search-results")
  }

  @ViewBuilder private var status: some View {
    if let error = model.error {
      ContentUnavailableView {
        Label("Couldn’t Search", systemImage: "exclamationmark.triangle")
          .foregroundStyle(palette.color("text"))
      } description: {
        Text(error).foregroundStyle(palette.color("error"))
      } actions: {
        Button("Retry") { Task { await model.retry() } }
          .buttonStyle(.bordered)
      }
    } else if model.searching, model.results.isEmpty {
      ProgressView("Searching…")
        .foregroundStyle(palette.color("text-tertiary"))
    } else if model.results.isEmpty {
      ContentUnavailableView {
        Label("No Results", systemImage: "magnifyingglass")
          .foregroundStyle(palette.color("text"))
      } description: {
        Text("No threads match your search.")
          .foregroundStyle(palette.color("text-secondary"))
      }
    }
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
