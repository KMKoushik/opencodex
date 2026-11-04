import Markdown
import UIKit

/// Transcript fonts for one Dynamic Type size. Built on the main thread, used anywhere.
nonisolated struct Typography: @unchecked Sendable {
  let category: UIContentSizeCategory
  let body: UIFont
  let small: UIFont
  let caption: UIFont
  let mono: UIFont
  let monoSmall: UIFont
  let headings: [UIFont]
  let bodyLineSpacing: CGFloat

  init(_ traits: UITraitCollection) {
    category = traits.preferredContentSizeCategory
    func scaled(_ size: CGFloat, _ weight: UIFont.Weight = .regular, style: UIFont.TextStyle = .body)
      -> UIFont
    {
      UIFontMetrics(forTextStyle: style).scaledFont(
        for: .systemFont(ofSize: size, weight: weight), compatibleWith: traits)
    }
    body = scaled(16)
    small = scaled(14, style: .subheadline)
    caption = scaled(12.5, style: .footnote)
    mono = UIFontMetrics(forTextStyle: .body).scaledFont(
      for: .monospacedSystemFont(ofSize: 13.5, weight: .regular), compatibleWith: traits)
    monoSmall = UIFontMetrics(forTextStyle: .footnote).scaledFont(
      for: .monospacedSystemFont(ofSize: 12, weight: .regular), compatibleWith: traits)
    headings = [
      scaled(23, .bold), scaled(20, .bold), scaled(17.5, .semibold), scaled(16, .semibold),
    ]
    bodyLineSpacing = (body.pointSize * 0.32).rounded()
  }

  @MainActor static var current = Typography(UITraitCollection.current)
}

/// How a block reads: the answer's own prose, or muted reasoning.
nonisolated enum ProseStyle: String, Sendable { case answer, reasoning }

nonisolated enum RenderedBlock: @unchecked Sendable {
  case text(NSAttributedString)
  case code(language: String, code: String)
  case table(TableContent)
  case rule
}

nonisolated struct TableContent: @unchecked Sendable {
  var header: [NSAttributedString]
  var rows: [[NSAttributedString]]
  var alignments: [NSTextAlignment]
}

/// Renders Markdown blocks (swift-markdown) to attributed strings, with a bounded cache keyed by
/// content, style and Dynamic Type size. Thread-safe, so prefetching can render off the main thread.
nonisolated final class MarkdownRenderer: @unchecked Sendable {
  static let shared = MarkdownRenderer()

  private final class Box {
    let block: RenderedBlock
    init(_ block: RenderedBlock) { self.block = block }
  }
  private let cache: NSCache<NSString, Box> = {
    let cache = NSCache<NSString, Box>()
    cache.countLimit = 1500
    // Roughly characters held: a few megabytes of attributed text at most.
    cache.totalCostLimit = 4_000_000
    return cache
  }()

  func render(_ block: MarkdownBlock, style: ProseStyle, typography: Typography) -> RenderedBlock {
    let key = key(block, style, typography)
    if let hit = cache.object(forKey: key) { return hit.block }
    let rendered = Self.make(block, style: style, typography: typography)
    cache.setObject(Box(rendered), forKey: key, cost: block.source.utf8.count)
    return rendered
  }

  private func key(_ block: MarkdownBlock, _ style: ProseStyle, _ typography: Typography) -> NSString {
    "\(typography.category.rawValue)|\(style.rawValue)|\(block.kind.rawValue)|\(block.definitions ?? "")|\(block.source)"
      as NSString
  }

  private static func make(_ block: MarkdownBlock, style: ProseStyle, typography: Typography)
    -> RenderedBlock
  {
    let source = block.definitions.map { block.source + "\n\n" + $0 } ?? block.source
    let document = Document(parsing: source)
    let builder = AttributedBuilder(typography: typography, style: style)
    guard let node = document.child(at: 0) else { return .text(NSAttributedString()) }
    switch node {
    case let code as CodeBlock:
      var text = code.code
      if text.hasSuffix("\n") { text.removeLast() }
      return .code(language: code.language ?? "", code: text)
    case let table as Table:
      let alignments = table.columnAlignments.map { alignment -> NSTextAlignment in
        switch alignment {
        case .center: .center
        case .right: .right
        default: .natural
        }
      }
      let header = table.head.cells.map { builder.inline($0, bold: true) }
      let rows: [[NSAttributedString]] = table.body.rows.map { row in row.cells.map { builder.inline($0, bold: false) } }
      return .table(TableContent(header: Array(header), rows: rows, alignments: alignments))
    case is ThematicBreak:
      return .rule
    default:
      return .text(builder.blocks(Array(document.children)))
    }
  }
}

/// Builds one attributed string from block nodes. Paragraph spacing lives in paragraph styles,
/// so a whole block (a list with nested items, say) is one selectable text.
nonisolated private struct AttributedBuilder {
  let typography: Typography
  let style: ProseStyle

  private var baseFont: UIFont { style == .reasoning ? typography.small : typography.body }
  private var color: UIColor { style == .reasoning ? .secondaryLabel : .label }

  private struct Line {
    var text: NSMutableAttributedString
    var paragraph: NSMutableParagraphStyle
  }

  func blocks(_ nodes: [Markup]) -> NSAttributedString {
    var lines: [Line] = []
    for (index, node) in nodes.enumerated() {
      append(node, indent: 0, quote: 0, first: index == 0, into: &lines)
    }
    let out = NSMutableAttributedString()
    for (index, line) in lines.enumerated() {
      let start = out.length
      out.append(line.text)
      // The separator newline belongs to this paragraph.
      if index + 1 < lines.count {
        out.append(NSAttributedString(string: "\n", attributes: [.font: baseFont]))
      }
      out.addAttribute(
        .paragraphStyle, value: line.paragraph,
        range: NSRange(location: start, length: out.length - start))
    }
    return out
  }

  private func paragraph(indent: CGFloat, spacing: CGFloat) -> NSMutableParagraphStyle {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = style == .reasoning ? 3 : typography.bodyLineSpacing
    paragraph.paragraphSpacingBefore = spacing
    paragraph.headIndent = indent
    paragraph.firstLineHeadIndent = indent
    paragraph.lineBreakStrategy = .standard
    return paragraph
  }

  private var blockGap: CGFloat { (baseFont.pointSize * 0.75).rounded() }

  private func append(_ node: Markup, indent: CGFloat, quote: Int, first: Bool, into lines: inout [Line]) {
    let gap = first ? 0 : blockGap
    switch node {
    case let heading as Heading:
      let font = typography.headings[min(max(heading.level, 1), 4) - 1]
      let text = inlineChildren(heading, font: font, quote: quote)
      let paragraph = paragraph(indent: indent, spacing: first ? 0 : blockGap * 1.4)
      paragraph.lineSpacing = 2
      lines.append(Line(text: text, paragraph: paragraph))
    case let paragraph_ as Paragraph:
      lines.append(
        Line(text: inlineChildren(paragraph_, font: baseFont, quote: quote), paragraph: paragraph(indent: indent, spacing: gap)))
    case let list as UnorderedList:
      appendList(Array(list.listItems), ordered: nil, indent: indent, quote: quote, first: first, into: &lines)
    case let list as OrderedList:
      appendList(Array(list.listItems), ordered: Int(list.startIndex), indent: indent, quote: quote, first: first, into: &lines)
    case let blockQuote as BlockQuote:
      for (index, child) in blockQuote.children.enumerated() {
        append(child, indent: indent + (indent > 0 ? 14 : 0), quote: quote + 1, first: first && index == 0, into: &lines)
      }
    case let code as CodeBlock:
      var source = code.code
      if source.hasSuffix("\n") { source.removeLast() }
      let text = NSMutableAttributedString(
        string: source,
        attributes: [.font: typography.mono, .foregroundColor: UIColor.label, .codeBackground: true])
      let paragraph = paragraph(indent: indent + 8, spacing: gap)
      paragraph.lineSpacing = 2
      lines.append(Line(text: text, paragraph: paragraph))
    case let table as Table:
      let rows = [Array(table.head.cells)] + table.body.rows.map { Array($0.cells) }
      for (index, row) in rows.enumerated() {
        let text = NSMutableAttributedString()
        for (column, cell) in row.enumerated() {
          if column > 0 { text.append(NSAttributedString(string: "  |  ", attributes: [.font: baseFont, .foregroundColor: UIColor.tertiaryLabel])) }
          text.append(inline(cell, bold: index == 0))
        }
        lines.append(Line(text: text, paragraph: paragraph(indent: indent, spacing: index == 0 ? gap : 2)))
      }
    case is ThematicBreak:
      lines.append(
        Line(
          text: NSMutableAttributedString(string: "———", attributes: [.font: baseFont, .foregroundColor: UIColor.tertiaryLabel]),
          paragraph: paragraph(indent: indent, spacing: gap)))
    case let html as HTMLBlock:
      lines.append(
        Line(
          text: NSMutableAttributedString(
            string: html.rawHTML.trimmingCharacters(in: .newlines),
            attributes: [.font: typography.mono, .foregroundColor: color]),
          paragraph: paragraph(indent: indent, spacing: gap)))
    default:
      let text = node.format().trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { return }
      lines.append(
        Line(
          text: NSMutableAttributedString(string: text, attributes: [.font: baseFont, .foregroundColor: color]),
          paragraph: paragraph(indent: indent, spacing: gap)))
    }
  }

  private func appendList(
    _ items: [ListItem], ordered start: Int?, indent: CGFloat, quote: Int, first: Bool,
    into lines: inout [Line]
  ) {
    let depth = Int(indent / 22)
    let markerWidth: CGFloat = start == nil ? 18 : max(22, CGFloat("\(((start ?? 1) + items.count - 1)).".count) * baseFont.pointSize * 0.55 + 6)
    let itemIndent = indent + markerWidth
    let bullets = ["•", "◦", "▪︎"]
    for (index, item) in items.enumerated() {
      var marker = start.map { "\($0 + index)." } ?? bullets[depth % bullets.count]
      if let checkbox = item.checkbox { marker = checkbox == .checked ? "☑︎" : "☐" }
      let children = Array(item.children)
      for (childIndex, child) in children.enumerated() {
        let isFirstLine = childIndex == 0
        let itemGap: CGFloat = (first && index == 0 && isFirstLine) ? 0 : (isFirstLine ? (index == 0 ? blockGap : 5) : 4)
        if isFirstLine, let paragraph_ = child as? Paragraph {
          let text = NSMutableAttributedString(
            string: marker + "\t",
            attributes: [
              .font: start == nil ? baseFont : baseFont.withMonospacedDigits(),
              .foregroundColor: quote > 0 ? UIColor.secondaryLabel : (start == nil ? UIColor.secondaryLabel : color),
            ])
          text.append(inlineChildren(paragraph_, font: baseFont, quote: quote))
          let paragraph = paragraph(indent: itemIndent, spacing: itemGap)
          paragraph.firstLineHeadIndent = indent
          paragraph.tabStops = [NSTextTab(textAlignment: .natural, location: itemIndent)]
          paragraph.defaultTabInterval = markerWidth
          lines.append(Line(text: text, paragraph: paragraph))
        } else {
          var nested: [Line] = []
          append(child, indent: itemIndent, quote: quote, first: false, into: &nested)
          // Paragraph styles are mutable references.
          nested.first?.paragraph.paragraphSpacingBefore = itemGap
          lines += nested
        }
      }
    }
  }

  private func inlineChildren(_ node: Markup, font: UIFont, quote: Int) -> NSMutableAttributedString {
    let out = NSMutableAttributedString()
    let traits = Traits(font: font, color: quote > 0 ? .secondaryLabel : color)
    for child in node.children { appendInline(child, traits, into: out) }
    return out
  }

  func inline(_ node: Markup, bold: Bool) -> NSAttributedString {
    let out = NSMutableAttributedString()
    var traits = Traits(font: baseFont, color: color)
    traits.bold = bold
    for child in node.children { appendInline(child, traits, into: out) }
    return out
  }

  private struct Traits {
    var font: UIFont
    var color: UIColor
    var bold = false
    var italic = false
    var strike = false
    var link: URL?
  }

  private func attributes(_ traits: Traits) -> [NSAttributedString.Key: Any] {
    var symbolic = traits.font.fontDescriptor.symbolicTraits
    if traits.bold { symbolic.insert(.traitBold) }
    if traits.italic { symbolic.insert(.traitItalic) }
    let descriptor = traits.font.fontDescriptor.withSymbolicTraits(symbolic) ?? traits.font.fontDescriptor
    var attributes: [NSAttributedString.Key: Any] = [
      .font: UIFont(descriptor: descriptor, size: traits.font.pointSize),
      .foregroundColor: traits.color,
    ]
    if traits.strike { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
    if let link = traits.link { attributes[.link] = link }
    return attributes
  }

  private func appendInline(_ node: Markup, _ traits: Traits, into out: NSMutableAttributedString) {
    var traits = traits
    switch node {
    case let text as Markdown.Text:
      out.append(NSAttributedString(string: text.string, attributes: attributes(traits)))
    case is SoftBreak:
      out.append(NSAttributedString(string: " ", attributes: attributes(traits)))
    case is LineBreak:
      out.append(NSAttributedString(string: "\u{2028}", attributes: attributes(traits)))
    case let code as InlineCode:
      var attributes = attributes(traits)
      let size = traits.font.pointSize * 0.9
      attributes[.font] = UIFont.monospacedSystemFont(ofSize: size, weight: traits.bold ? .semibold : .regular)
      attributes[.codeBackground] = true
      // Thin padding: a hair space each side keeps the background off neighbours.
      out.append(NSAttributedString(string: "\u{200A}\(code.code)\u{200A}", attributes: attributes))
    case let html as InlineHTML:
      out.append(NSAttributedString(string: html.rawHTML, attributes: attributes(traits)))
    case let image as Markdown.Image:
      traits.link = image.source.flatMap(URL.init(string:))
      let alt = image.plainText.isEmpty ? "Image" : image.plainText
      out.append(NSAttributedString(string: "🖼 \(alt)", attributes: attributes(traits)))
    default:
      if node is Strong { traits.bold = true }
      if node is Emphasis { traits.italic = true }
      if node is Strikethrough { traits.strike = true }
      if let link = node as? Markdown.Link {
        traits.link = link.destination.flatMap { URL(string: $0) ?? URL(string: $0.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed) ?? "") }
      }
      if let link = node as? SymbolLink {
        out.append(NSAttributedString(string: link.destination ?? "", attributes: attributes(traits)))
        return
      }
      for child in node.children { appendInline(child, traits, into: out) }
    }
  }
}

extension UIFont {
  nonisolated func withMonospacedDigits() -> UIFont {
    let descriptor = fontDescriptor.addingAttributes([
      .featureSettings: [
        [
          UIFontDescriptor.FeatureKey.type: kNumberSpacingType,
          UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector,
        ]
      ]
    ])
    return UIFont(descriptor: descriptor, size: pointSize)
  }
}

extension NSAttributedString.Key {
  /// Inline code: drawn as a rounded background by `ProseLayoutManager`.
  nonisolated static let codeBackground = NSAttributedString.Key("OpenCodexCodeBackground")
}

/// Transcript colors, all dynamic so dark mode needs no re-render.
nonisolated enum TranscriptColors {
  static let inlineCode = UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(white: 1, alpha: 0.09) : UIColor(white: 0, alpha: 0.055)
  }
  static let codeBackground = UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(white: 1, alpha: 0.06) : UIColor(white: 0, alpha: 0.035)
  }
  static let codeHeader = UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(white: 1, alpha: 0.05) : UIColor(white: 0, alpha: 0.03)
  }
  static let bubble = UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(red: 0.17, green: 0.17, blue: 0.18, alpha: 1)
      : UIColor(red: 0.945, green: 0.945, blue: 0.95, alpha: 1)
  }
  static let border = UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(white: 1, alpha: 0.1) : UIColor(white: 0, alpha: 0.08)
  }
  static let tableHeader = UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(white: 1, alpha: 0.05) : UIColor(white: 0, alpha: 0.03)
  }
}
