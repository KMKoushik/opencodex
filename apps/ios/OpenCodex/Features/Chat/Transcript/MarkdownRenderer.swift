import Markdown
import UIKit

/// Transcript fonts for one Dynamic Type size. Built on the main thread, used anywhere.
///
/// Sizes are the desktop's CSS pixels scaled by 16/14: its 14px chat prose is 16pt here, with
/// the same 1.625 line-height ratio, and every other size keeps its ratio to the prose.
nonisolated struct Typography: @unchecked Sendable {
  static let scale: CGFloat = 16.0 / 14.0

  let category: UIContentSizeCategory
  /// Settings → Appearance's chat font size (desktop px), for prose and headings only.
  let chatSize: Int
  /// Identifies these fonts in render caches.
  var key: String { "\(category.rawValue)|\(chatSize)" }
  /// Chat prose (14px by default).
  let body: UIFont
  /// Disclosure triggers and turn headers (13px).
  let label: UIFont
  /// Activity items, notes, skills, the copy status (12px).
  let small: UIFont
  /// History status and tool-section labels (11px).
  let caption: UIFont
  /// Code blocks and inline code (`chat-code-font-size`, 13px).
  let mono: UIFont
  let monoBold: UIFont
  /// Tool details and shell output (12px).
  let monoSmall: UIFont
  /// Tool targets (11px).
  let monoCaption: UIFont
  /// h1–h4: 1.75em, 1.5em, 1.25em, 1em, all weight 600.
  let headings: [UIFont]
  /// The chat line height (1.625 × prose).
  let lineHeight: CGFloat

  init(_ traits: UITraitCollection, chatSize: Int = ChatFontSize.current) {
    category = traits.preferredContentSizeCategory
    self.chatSize = chatSize
    let prose = CGFloat(chatSize)
    func px(_ size: CGFloat) -> CGFloat { size * Self.scale }
    func scaled(_ size: CGFloat, _ weight: UIFont.Weight = .regular) -> UIFont {
      UIFontMetrics(forTextStyle: .body).scaledFont(
        for: .systemFont(ofSize: px(size), weight: weight), compatibleWith: traits)
    }
    func mono(_ size: CGFloat, _ weight: UIFont.Weight = .regular) -> UIFont {
      UIFontMetrics(forTextStyle: .body).scaledFont(
        for: .monospacedSystemFont(ofSize: px(size), weight: weight), compatibleWith: traits)
    }
    body = scaled(prose)
    label = scaled(13)
    small = scaled(12)
    caption = scaled(11)
    self.mono = mono(13)
    monoBold = mono(13, .semibold)
    monoSmall = mono(12)
    monoCaption = mono(11)
    headings = [1.75, 1.5, 1.25, 1].map { scaled(prose * $0, .semibold) }
    lineHeight = (body.pointSize * 1.625).rounded()
  }

  /// Extra space below each line so a font's lines sit `ratio` × its size apart.
  func spacing(_ font: UIFont, ratio: CGFloat = 1.625) -> CGFloat {
    max(0, (font.pointSize * ratio).rounded() - font.lineHeight)
  }

  /// A scaled desktop length in points.
  func px(_ value: CGFloat) -> CGFloat { (value * body.pointSize / 14).rounded() }

  @MainActor static var current = Typography(UITraitCollection.current)
}

/// How a block reads: the answer's own prose, or muted reasoning.
nonisolated enum ProseStyle: String, Sendable { case answer, reasoning }

nonisolated enum RenderedBlock: @unchecked Sendable {
  case text(NSAttributedString)
  case code(language: String, code: String)
  case table(TableContent)
  case image(source: String?, alt: String)
  case rule
}

nonisolated struct TableContent: @unchecked Sendable {
  var header: [NSAttributedString]
  var rows: [[NSAttributedString]]
  var alignments: [NSTextAlignment]
  var border: UIColor
  var borderHeavy: UIColor
}

/// Renders Markdown blocks (swift-markdown) to attributed strings, with a bounded cache keyed by
/// content, style, theme and Dynamic Type size. Thread-safe, so prefetching can render off the
/// main thread.
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

  func render(
    _ block: MarkdownBlock, style: ProseStyle, typography: Typography, theme: TranscriptTheme
  ) -> RenderedBlock {
    let key = key(block, style, typography, theme)
    if let hit = cache.object(forKey: key) { return hit.block }
    let rendered = Self.make(block, style: style, typography: typography, theme: theme)
    cache.setObject(Box(rendered), forKey: key, cost: block.source.utf8.count)
    return rendered
  }

  private func key(
    _ block: MarkdownBlock, _ style: ProseStyle, _ typography: Typography, _ theme: TranscriptTheme
  ) -> NSString {
    "\(theme.id)|\(typography.key)|\(style.rawValue)|\(block.kind.rawValue)|\(block.definitions ?? "")|\(block.source)"
      as NSString
  }

  private static func make(
    _ block: MarkdownBlock, style: ProseStyle, typography: Typography, theme: TranscriptTheme
  ) -> RenderedBlock {
    let source = block.definitions.map { block.source + "\n\n" + $0 } ?? block.source
    let document = Document(parsing: source, options: [.disableSmartOpts])
    let builder = AttributedBuilder(typography: typography, style: style, theme: theme)
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
      // Drawn, not a text view: `.link` would draw in the system link color, so the URL moves
      // to `.tableLink`, which the table hit-tests itself.
      func cell(_ markup: Markup, bold: Bool) -> NSAttributedString {
        let text = NSMutableAttributedString(attributedString: builder.inline(markup, bold: bold))
        let all = NSRange(location: 0, length: text.length)
        text.enumerateAttribute(.link, in: all) { value, range, _ in
          if let value { text.addAttribute(.tableLink, value: value, range: range) }
        }
        text.removeAttribute(.link, range: all)
        return text
      }
      let header = table.head.cells.map { cell($0, bold: true) }
      let rows: [[NSAttributedString]] = table.body.rows.map { row in row.cells.map { cell($0, bold: false) } }
      return .table(
        TableContent(
          header: Array(header), rows: rows, alignments: alignments, border: theme.border,
          borderHeavy: theme.borderHeavy))
    case is ThematicBreak:
      return .rule
    case let paragraph as Paragraph:
      if let image = MarkdownBlocks.soleImage(paragraph) {
        return .image(source: image.source, alt: image.plainText)
      }
      return .text(builder.blocks(Array(document.children)))
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
  let theme: TranscriptTheme

  private var baseFont: UIFont { style == .reasoning ? typography.small : typography.body }
  private var color: UIColor { style == .reasoning ? theme.textSecondary : theme.text }
  /// Reasoning reads at 1.6 like the desktop's `.reasoning-text`; prose at 1.625.
  private var ratio: CGFloat { style == .reasoning ? 1.6 : 1.625 }

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

  private func paragraph(indent: CGFloat, spacing: CGFloat, font: UIFont? = nil)
    -> NSMutableParagraphStyle
  {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = typography.spacing(font ?? baseFont, ratio: ratio)
    paragraph.paragraphSpacingBefore = spacing
    paragraph.headIndent = indent
    paragraph.firstLineHeadIndent = indent
    paragraph.lineBreakStrategy = .standard
    return paragraph
  }

  /// `.markdown > * + *`: 16px between blocks; none inside reasoning, like `.reasoning-text`.
  private var blockGap: CGFloat { style == .reasoning ? 0 : typography.px(16) }

  private func append(_ node: Markup, indent: CGFloat, quote: Int, first: Bool, into lines: inout [Line]) {
    let gap = first ? 0 : blockGap
    switch node {
    case let heading as Heading:
      let font = typography.headings[min(max(heading.level, 1), 4) - 1]
      let text = inlineChildren(heading, font: font, quote: quote, weight: .semibold)
      let paragraph = paragraph(indent: indent, spacing: first ? 0 : typography.px(24), font: font)
      paragraph.lineSpacing = typography.spacing(font, ratio: 1.4)
      lines.append(Line(text: text, paragraph: paragraph))
    case let paragraph_ as Paragraph:
      lines.append(
        Line(
          text: inlineChildren(paragraph_, font: baseFont, quote: quote),
          paragraph: paragraph(indent: indent, spacing: gap)))
    case let list as UnorderedList:
      appendList(Array(list.listItems), ordered: nil, indent: indent, quote: quote, first: first, into: &lines)
    case let list as OrderedList:
      appendList(
        Array(list.listItems), ordered: Int(list.startIndex), indent: indent, quote: quote, first: first,
        into: &lines)
    case let blockQuote as BlockQuote:
      for (index, child) in blockQuote.children.enumerated() {
        append(
          child, indent: indent + (indent > 0 ? typography.px(16) : 0), quote: quote + 1,
          first: first && index == 0, into: &lines)
      }
    case let code as CodeBlock:
      // A fence nested in a list or quote: monospaced on the inline-code background.
      var source = code.code
      if source.hasSuffix("\n") { source.removeLast() }
      let text = NSMutableAttributedString(
        string: source,
        attributes: [
          .font: typography.mono, .foregroundColor: theme.syntax.plain, .codeBackground: theme.inlineCode,
        ])
      let paragraph = paragraph(indent: indent + 8, spacing: gap, font: typography.mono)
      lines.append(Line(text: text, paragraph: paragraph))
    case let table as Table:
      let rows = [Array(table.head.cells)] + table.body.rows.map { Array($0.cells) }
      for (index, row) in rows.enumerated() {
        let text = NSMutableAttributedString()
        for (column, cell) in row.enumerated() {
          if column > 0 {
            text.append(
              NSAttributedString(
                string: "  |  ", attributes: [.font: baseFont, .foregroundColor: theme.textTertiary]))
          }
          text.append(inline(cell, bold: index == 0))
        }
        lines.append(Line(text: text, paragraph: paragraph(indent: indent, spacing: index == 0 ? gap : 2)))
      }
    case is ThematicBreak:
      lines.append(
        Line(
          text: NSMutableAttributedString(
            string: "———", attributes: [.font: baseFont, .foregroundColor: theme.textTertiary]),
          paragraph: paragraph(indent: indent, spacing: gap)))
    case let html as HTMLBlock:
      lines.append(
        Line(
          text: NSMutableAttributedString(
            string: html.rawHTML.trimmingCharacters(in: .newlines),
            attributes: [.font: typography.mono, .foregroundColor: color]),
          paragraph: paragraph(indent: indent, spacing: gap, font: typography.mono)))
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
    // `padding-left: 24px`, with the marker hanging in it like `list-style-position: outside`.
    let pad = typography.px(24)
    let depth = Int((indent / pad).rounded())
    let itemIndent = indent + pad
    let bullets = ["•", "◦", "▪︎"]
    let markerColor = quote > 0 ? theme.textSecondary : color
    for (index, item) in items.enumerated() {
      var marker = start.map { "\($0 + index)." } ?? bullets[depth % bullets.count]
      if let checkbox = item.checkbox { marker = checkbox == .checked ? "☑︎" : "☐" }
      let children = Array(item.children)
      for (childIndex, child) in children.enumerated() {
        let isFirstLine = childIndex == 0
        // `li + li { margin-top: 6px }`; paragraphs inside one item keep the block gap.
        let itemGap: CGFloat =
          (first && index == 0 && isFirstLine)
          ? 0 : (isFirstLine ? (index == 0 ? blockGap : typography.px(6)) : blockGap)
        if isFirstLine, let paragraph_ = child as? Paragraph {
          let markerFont = start == nil ? baseFont : baseFont.withMonospacedDigits()
          let text = NSMutableAttributedString(
            string: marker + "\t", attributes: [.font: markerFont, .foregroundColor: markerColor])
          text.append(inlineChildren(paragraph_, font: baseFont, quote: quote))
          let paragraph = paragraph(indent: itemIndent, spacing: itemGap)
          // The marker sits right-aligned just before the text, like a browser's outside marker.
          let markerWidth = (marker as NSString).size(withAttributes: [.font: markerFont]).width
          paragraph.firstLineHeadIndent = max(indent, itemIndent - markerWidth - typography.px(8))
          paragraph.tabStops = [NSTextTab(textAlignment: .natural, location: itemIndent)]
          paragraph.defaultTabInterval = pad
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

  private func inlineChildren(
    _ node: Markup, font: UIFont, quote: Int, weight: UIFont.Weight = .regular
  ) -> NSMutableAttributedString {
    let out = NSMutableAttributedString()
    var traits = Traits(font: font, color: quote > 0 ? theme.textSecondary : color)
    traits.weight = weight
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
    var weight = UIFont.Weight.regular
    var bold = false
    var italic = false
    var strike = false
    var link: URL?
  }

  private func font(_ traits: Traits) -> UIFont {
    // `strong` is weight 600 on the desktop; links are 500.
    let weight: UIFont.Weight =
      traits.bold ? max(traits.weight, .semibold) : traits.link != nil ? max(traits.weight, .medium) : traits.weight
    var font = UIFont.systemFont(ofSize: traits.font.pointSize, weight: weight)
    if traits.italic, let italic = font.fontDescriptor.withSymbolicTraits(.traitItalic) {
      font = UIFont(descriptor: italic, size: traits.font.pointSize)
    }
    return font
  }

  private func attributes(_ traits: Traits) -> [NSAttributedString.Key: Any] {
    var attributes: [NSAttributedString.Key: Any] = [
      .font: font(traits),
      .foregroundColor: traits.link != nil ? theme.link : traits.color,
    ]
    if traits.strike { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
    if let link = traits.link {
      attributes[.link] = link
      attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
      attributes[.underlineColor] = theme.linkUnderline
    }
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
      // `chat-code-font-size` relative to the prose around it.
      let size = traits.font.pointSize * 13 / 14
      attributes[.font] = UIFont.monospacedSystemFont(ofSize: size, weight: traits.bold ? .semibold : .regular)
      if traits.link == nil { attributes[.foregroundColor] = traits.color }
      attributes[.codeBackground] = theme.inlineCode
      attributes[.underlineStyle] = nil
      // `padding: 1px 5px`: thin spaces each side carry the background past the glyphs.
      out.append(NSAttributedString(string: "\u{202F}\(code.code)\u{202F}", attributes: attributes))
    case let html as InlineHTML:
      out.append(NSAttributedString(string: html.rawHTML, attributes: attributes(traits)))
    case let image as Markdown.Image:
      traits.link = image.source.flatMap(URL.init(string:))
      let alt = image.plainText.isEmpty ? "Image" : image.plainText
      out.append(NSAttributedString(string: alt, attributes: attributes(traits)))
    default:
      if node is Strong { traits.bold = true }
      if node is Emphasis { traits.italic = true }
      if node is Strikethrough { traits.strike = true }
      if let link = node as? Markdown.Link {
        let destination = link.destination ?? ""
        traits.link =
          URL(string: destination)
          ?? URL(string: destination.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed) ?? "")
        // A workspace file: the desktop's `</>` before the name.
        if traits.link != nil, MarkdownBlocks.isLocal(destination) {
          out.append(fileIcon(traits))
        }
      }
      if let link = node as? SymbolLink {
        out.append(NSAttributedString(string: link.destination ?? "", attributes: attributes(traits)))
        return
      }
      for child in node.children { appendInline(child, traits, into: out) }
    }
  }

  /// The `SourceCodeIcon` (13px) before local file links.
  private func fileIcon(_ traits: Traits) -> NSAttributedString {
    let size = traits.font.pointSize * 13 / 14
    let configuration = UIImage.SymbolConfiguration(pointSize: size * 0.72, weight: .medium)
    guard
      let image = UIImage(systemName: "chevron.left.forwardslash.chevron.right", withConfiguration: configuration)?
        .withTintColor(theme.link, renderingMode: .alwaysOriginal)
    else { return NSAttributedString() }
    let attachment = NSTextAttachment(image: image)
    let font = font(traits)
    attachment.bounds = CGRect(
      x: 0, y: (font.capHeight - image.size.height) / 2, width: image.size.width, height: image.size.height)
    let icon = NSMutableAttributedString(attachment: attachment)
    // A no-break space keeps the icon with the name, like the desktop's inline svg.
    icon.append(NSAttributedString(string: "\u{202F}", attributes: [.font: font]))
    if let link = traits.link {
      icon.addAttribute(.link, value: link, range: NSRange(location: 0, length: icon.length))
    }
    return icon
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
  /// Inline code: drawn as a rounded background in this color by `ProseLayoutManager`.
  nonisolated static let codeBackground = NSAttributedString.Key("OpenCodexCodeBackground")
  /// A sent `@` mention: a pill in this color, 2pt wider than its glyphs on every side.
  nonisolated static let mentionBackground = NSAttributedString.Key("OpenCodexMentionBackground")
  /// A link inside a drawn table cell: its URL, opened by the table's own hit testing.
  nonisolated static let tableLink = NSAttributedString.Key("OpenCodexTableLink")
}
