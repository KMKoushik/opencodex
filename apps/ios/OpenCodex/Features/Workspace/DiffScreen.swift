import SwiftUI

/// One changed file's unified diff, like the desktop's diff tab: a header with the status, path
/// and counts, then the virtualized lines. Tapping "N unmodified lines" loads the whole file's
/// context (the desktop's `fullDiff`).
struct DiffScreen: View {
  let model: WorkspaceModel
  let path: String
  let mode: CompareMode
  let openFile: () -> Void

  @State private var phase: Phase = .loading
  @State private var full = false
  @Environment(\.palette) private var palette

  enum Phase {
    case loading
    case failed(String)
    case missing
    case loaded(FileDiff, CodeDocument)
  }

  var body: some View {
    VStack(spacing: 0) {
      switch phase {
      case .loading:
        WorkspaceEmpty(message: "Loading diff…")
      case .failed(let message):
        WorkspaceError(message: message) { Task { await load() } }
      case .missing:
        WorkspaceEmpty(symbol: "doc.text.magnifyingglass", message: "No text diff available.")
      case .loaded(let diff, let document):
        header(diff)
        if document.lines.isEmpty {
          WorkspaceEmpty(symbol: "doc.text.magnifyingglass", message: "No text diff available.")
        } else {
          CodeLines(
            document: document, highlighter: CodeHighlighter(path: path),
            expand: full ? nil : { Task { await expand() } }, identifier: "diff-lines")
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(palette.color("surface"))
    .navigationTitle((path as NSString).lastPathComponent)
    .navigationSubtitle(mode == .working ? "diff" : "base diff")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if case .loaded(let diff, _) = phase, !diff.patch.isEmpty {
        ToolbarItem(placement: .topBarTrailing) {
          ShareLink(item: diff.patch, subject: Text((path as NSString).lastPathComponent + ".diff")) {
            Label("Share diff", systemImage: "square.and.arrow.up")
          }
          .accessibilityIdentifier("diff-share")
        }
      }
      if case .loaded(let diff, _) = phase, diff.status != .deleted {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Open file", systemImage: "doc.text", action: openFile)
            .accessibilityIdentifier("diff-open-file")
        }
      }
    }
    .task(id: model.revision) { await load() }
  }

  private func header(_ diff: FileDiff) -> some View {
    HStack(spacing: 8) {
      ChangeStatusIcon(status: diff.status)
      Text(path)
        .font(.footnote)
        .foregroundStyle(palette.color("text"))
        .lineLimit(1)
        .truncationMode(.head)
      Spacer(minLength: 8)
      Text("+\(diff.additions.formatted())").foregroundStyle(palette.color("success"))
      Text("−\(diff.deletions.formatted())").foregroundStyle(palette.color("error"))
    }
    .font(.system(.footnote, design: .monospaced))
    .monospacedDigit()
    .padding(.horizontal, 14)
    .frame(minHeight: 40)
    .background(palette.color("secondary"))
    .overlay(alignment: .bottom) {
      Rectangle().fill(palette.color("border")).frame(height: 1 / 3)
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("diff-header")
  }

  /// Loads the patch and parses it off the main thread. Refetches keep the current lines on
  /// screen until the new ones are ready.
  private func load() async {
    do {
      guard
        let diff = try await model.client.workspaceDiff(
          directory: model.directory, mode: mode, path: path, full: full)
      else {
        phase = .missing
        return
      }
      if case .loaded(let current, let document) = phase, current == diff {
        phase = .loaded(diff, document)
        return
      }
      let document = await Self.parse(diff, full: full)
      guard !Task.isCancelled else { return }
      phase = .loaded(diff, document)
    } catch is CancellationError {
    } catch {
      if case .loaded = phase { return }
      phase = .failed(error.localizedDescription)
    }
  }

  private func expand() async {
    full = true
    await load()
  }

  @concurrent private static func parse(_ diff: FileDiff, full: Bool) async -> CodeDocument {
    DiffParser.parse(diff.patch, trailingContext: !full && diff.status == .modified)
  }
}
