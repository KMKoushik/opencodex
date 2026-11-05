import Foundation

/// The workspace's view of the shared `SyntaxHighlighter`: the grammar for a file path, and
/// token spans for every line of a file or diff. Call `spans` off the main thread.
nonisolated struct CodeHighlighter: Sendable {
  let grammar: SyntaxHighlighter.Grammar?
  var enabled: Bool { grammar != nil }

  init(path: String) { grammar = .for(path: path) }

  /// Spans per line. Like the desktop's diff renderer, a diff's old side (context and removals)
  /// and new side (context and additions) are tokenized separately, each hunk as one source, so
  /// comments and strings that span lines stay right; a file is one source.
  func spans(_ lines: [CodeLine]) -> [[SyntaxHighlighter.Span]] {
    var out = [[SyntaxHighlighter.Span]](repeating: [], count: lines.count)
    guard let grammar else { return out }
    var hunk: [Int] = []
    func flush() {
      guard !hunk.isEmpty else { return }
      let new = hunk.filter { lines[$0].kind != .removed }
      for (index, spans) in zip(new, SyntaxHighlighter.lineTokens(new.map { lines[$0].text }, grammar)) {
        out[index] = spans
      }
      if hunk.contains(where: { lines[$0].kind == .removed }) {
        let old = hunk.filter { lines[$0].kind != .added }
        for (index, spans) in zip(old, SyntaxHighlighter.lineTokens(old.map { lines[$0].text }, grammar))
        where lines[index].kind == .removed {
          out[index] = spans
        }
      }
      hunk = []
    }
    for (index, line) in lines.enumerated() {
      if case .separator = line.kind { flush() } else { hunk.append(index) }
    }
    flush()
    return out
  }
}
