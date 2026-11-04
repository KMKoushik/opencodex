import Foundation
import Markdown

/// One top-level Markdown block's source. Each renders as its own transcript row, so a growing
/// answer re-renders only its tail and long answers stay virtualized.
nonisolated struct MarkdownBlock: Hashable, Sendable {
  enum Kind: String, Sendable { case text, quote, code, table, rule, image }
  var kind: Kind
  var source: String
  /// Link reference definitions from the whole text: they resolve across blocks.
  var definitions: String?
}

nonisolated enum MarkdownBlocks {
  // Reference definitions resolve across the whole document, like the web's splitter.
  private static let definition = try! NSRegularExpression(
    pattern: #"^ {0,3}\[[^\]\n]+\]:.*$"#, options: [.anchorsMatchLines])

  /// Splits finished text into top-level blocks. Empty code blocks (a stray fence) are dropped.
  static func split(_ text: String) -> [MarkdownBlock] {
    let definitions = Self.definitions(in: text)
    return parse(text, dropEmptyCode: true).map {
      MarkdownBlock(kind: $0.kind, source: $0.source, definitions: definitions)
    }
  }

  /// A paragraph that is only an image renders as the image itself, like `.markdown-image`.
  static func soleImage(_ paragraph: Paragraph) -> Markdown.Image? {
    var image: Markdown.Image?
    for child in paragraph.children {
      if let candidate = child as? Markdown.Image, image == nil {
        image = candidate
      } else if let text = child as? Markdown.Text, text.string.allSatisfy(\.isWhitespace) {
        continue
      } else if child is SoftBreak || child is LineBreak {
        continue
      } else {
        return nil
      }
    }
    return image
  }

  /// A link into the workspace rather than to a site: no scheme and not an anchor.
  static func isLocal(_ href: String) -> Bool {
    guard !href.isEmpty, !href.hasPrefix("#") else { return false }
    return href.range(of: #"^[a-zA-Z][a-zA-Z\d+.-]*:"#, options: .regularExpression) == nil
  }

  static func definitions(in text: String) -> String? {
    guard text.contains("]:") else { return nil }
    let range = NSRange(text.startIndex..., in: text)
    let matches = definition.matches(in: text, range: range)
    guard !matches.isEmpty else { return nil }
    let ns = text as NSString
    return matches.map { ns.substring(with: $0.range) }.joined(separator: "\n")
  }

  /// Top-level children with their source slices: each block runs to the next one's start.
  static func parse(_ text: String, dropEmptyCode: Bool = false) -> [(
    kind: MarkdownBlock.Kind, source: String, start: Int
  )] {
    guard !text.isEmpty else { return [] }
    let document = Document(parsing: text, options: [.disableSmartOpts])
    var lineStarts = [0]
    let utf8 = text.utf8
    var offset = 0
    for byte in utf8 {
      offset += 1
      if byte == 0x0A { lineStarts.append(offset) }
    }
    var starts: [(Int, MarkdownBlock.Kind)] = []
    var empty = Set<Int>()
    for child in document.children {
      guard let location = child.range?.lowerBound, location.line - 1 < lineStarts.count else {
        continue
      }
      let start = min(utf8.count, lineStarts[location.line - 1] + location.column - 1)
      let kind: MarkdownBlock.Kind =
        switch child {
        case is CodeBlock: .code
        case is Table: .table
        case is ThematicBreak: .rule
        case is BlockQuote: .quote
        case let paragraph as Paragraph where soleImage(paragraph) != nil: .image
        default: .text
        }
      if let last = starts.last, last.0 >= start { continue }
      if dropEmptyCode, let code = child as? CodeBlock,
        code.code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        empty.insert(starts.count)
      }
      starts.append((start, kind))
    }
    var blocks: [(MarkdownBlock.Kind, String, Int)] = []
    for (index, (start, kind)) in starts.enumerated() where !empty.contains(index) {
      let end = index + 1 < starts.count ? starts[index + 1].0 : utf8.count
      let lower = utf8.index(utf8.startIndex, offsetBy: start)
      let upper = utf8.index(utf8.startIndex, offsetBy: end)
      blocks.append((kind, String(text[lower..<upper]), start))
    }
    return blocks
  }
}

/// Splits streamed Markdown so only the growing tail re-parses. A block followed by two later
/// blocks can no longer change (a list can still absorb the next item until something else
/// follows it), so it is kept and never parsed again. A port of the web's `markdown-blocks.ts`.
nonisolated final class BlockSplitter {
  private var settled: [MarkdownBlock] = []
  /// The settled prefix, in UTF-8 bytes of the source.
  private var source = ""
  private var lastText = ""
  private var lastBlocks: [MarkdownBlock] = []
  /// Once text has reference definitions, it stays whole-document.
  private var whole = false

  init() {}

  func split(_ text: String) -> [MarkdownBlock] {
    if text == lastText { return lastBlocks }
    defer { lastText = text }
    if !text.hasPrefix(source) {
      settled = []
      source = ""
      whole = false
    }
    // Only the unsettled tail can bring new definitions; settled text was checked already.
    if !whole, MarkdownBlocks.definitions(in: String(decoding: text.utf8.dropFirst(source.utf8.count), as: UTF8.self)) != nil {
      whole = true
    }
    if whole, let definitions = MarkdownBlocks.definitions(in: text) {
      settled = []
      source = ""
      lastBlocks = MarkdownBlocks.parse(text).map {
        MarkdownBlock(kind: $0.kind, source: $0.source, definitions: definitions)
      }
      return lastBlocks
    }
    let rest = String(decoding: text.utf8.dropFirst(source.utf8.count), as: UTF8.self)
    let parsed = MarkdownBlocks.parse(rest)
    let blocks = parsed.map { MarkdownBlock(kind: $0.kind, source: $0.source) }
    let settle = max(0, blocks.count - 2)
    if settle > 0 {
      settled += blocks[..<settle]
      let consumed = source.utf8.count + parsed[settle].start
      source = String(decoding: text.utf8.prefix(consumed), as: UTF8.self)
    }
    lastBlocks = settled + blocks[settle...]
    return lastBlocks
  }
}
