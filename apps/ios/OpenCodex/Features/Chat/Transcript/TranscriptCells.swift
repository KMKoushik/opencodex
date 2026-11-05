import UIKit

/// Base cell: manual layout in a centered, readable column, sized by `measure(width:)`.
/// Manual sizing keeps self-sizing cheap enough to run every frame for a streaming row.
class TranscriptCell: UICollectionViewCell {
  /// `.timeline-row` side padding on phones (16px).
  static let side: CGFloat = 18
  /// `--thread-width` (768px) less its padding.
  static let maxColumn: CGFloat = 720
  /// `.activity-entries`: 8px margin + 12px padding.
  static let indentStep: CGFloat = 23

  var indent = 0

  /// The readable column for a cell width: x and width.
  func column(_ width: CGFloat) -> (x: CGFloat, width: CGFloat) {
    let column = min(width - Self.side * 2, Self.maxColumn)
    let x = ((width - column) / 2).rounded()
    let inset = CGFloat(indent) * Self.indentStep
    return (x + inset, column - inset)
  }

  func measure(width: CGFloat) -> CGFloat { 44 }

  override func preferredLayoutAttributesFitting(
    _ layoutAttributes: UICollectionViewLayoutAttributes
  ) -> UICollectionViewLayoutAttributes {
    let attributes = layoutAttributes.copy() as! UICollectionViewLayoutAttributes
    let scale = traitCollection.displayScale > 0 ? traitCollection.displayScale : 3
    attributes.size.height = (measure(width: layoutAttributes.size.width) * scale).rounded(.up) / scale
    return attributes
  }
}

/// Symbols matching the desktop's Hugeicons.
enum Symbol {
  static func image(_ name: String, _ size: CGFloat, _ weight: UIImage.SymbolWeight = .regular) -> UIImage? {
    UIImage(systemName: name, withConfiguration: UIImage.SymbolConfiguration(pointSize: size, weight: weight))
  }
  /// `ArrowRight01Icon`.
  static let chevron = "chevron.right"
  /// `Copy01Icon` / `Tick02Icon`.
  static let copy = "square.on.square"
  static let copied = "checkmark"
  static let share = "square.and.arrow.up"
}

// MARK: Prose

/// A UITextView for read-only selectable text that opens web links in Safari and workspace
/// file links through `onOpenFile`.
final class ProseTextView: UITextView, UITextViewDelegate {
  /// Opens a local file link's `href`; nil leaves file links inert.
  var onOpenFile: ((String) -> Void)?

  init() {
    // TextKit 1 lays out and measures static text faster and more predictably in cells.
    let storage = NSTextStorage()
    let layout = ProseLayoutManager()
    storage.addLayoutManager(layout)
    let container = NSTextContainer(size: CGSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
    container.widthTracksTextView = true
    layout.addTextContainer(container)
    super.init(frame: .zero, textContainer: container)
    isEditable = false
    isSelectable = true
    isScrollEnabled = false
    backgroundColor = .clear
    textContainerInset = .zero
    textContainer.lineFragmentPadding = 0
    dataDetectorTypes = []
    // Links carry their own color and `link-underline` underline.
    linkTextAttributes = [:]
    adjustsFontForContentSizeCategory = false
    delegate = self
  }

  required init?(coder: NSCoder) { fatalError() }

  func height(for width: CGFloat) -> CGFloat {
    guard attributedText.length > 0 else { return 0 }
    return sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
  }

  func textView(
    _ textView: UITextView, primaryActionFor textItem: UITextItem,
    defaultAction: UIAction
  ) -> UIAction? {
    guard case .link(let url) = textItem.content else { return defaultAction }
    let scheme = url.scheme?.lowercased()
    if scheme == "http" || scheme == "https" || scheme == "mailto" {
      return UIAction { _ in UIApplication.shared.open(url) }
    }
    // Workspace paths and `file:` URLs open the file, like the desktop's file links.
    if scheme == nil || scheme == "file", let open = onOpenFile {
      let href = url.absoluteString
      return UIAction { _ in open(href) }
    }
    return nil
  }
}

/// Draws inline code and mention backgrounds as rounded rects that hug the glyphs on each line.
nonisolated final class ProseLayoutManager: NSLayoutManager {
  override func drawBackground(forGlyphRange glyphsToShow: NSRange, at origin: CGPoint) {
    super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
    guard textStorage != nil, textContainers.first != nil, UIGraphicsGetCurrentContext() != nil else { return }
    // `padding: 1px 5px; border-radius: 5px`.
    fill(.codeBackground, glyphsToShow, origin, outset: CGSize(width: 0, height: 1), radius: 5)
    // `.mention`: `border-radius: 4px; box-shadow: 0 0 0 2px`.
    fill(.mentionBackground, glyphsToShow, origin, outset: CGSize(width: 2, height: 2), radius: 6)
  }

  private func fill(_ key: NSAttributedString.Key, _ glyphsToShow: NSRange, _ origin: CGPoint, outset: CGSize, radius: CGFloat) {
    guard let storage = textStorage, let container = textContainers.first else { return }
    let characters = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
    storage.enumerateAttribute(key, in: characters) { value, range, _ in
      guard let color = value as? UIColor else { return }
      color.setFill()
      let font = storage.attribute(.font, at: range.location, effectiveRange: nil) as? UIFont
      let ascender = font?.ascender ?? 12
      let descender = font?.descender ?? -3
      let glyphs = glyphRange(forCharacterRange: range, actualCharacterRange: nil)
      enumerateLineFragments(forGlyphRange: glyphs) { fragment, _, _, lineGlyphs, _ in
        var line = NSIntersectionRange(lineGlyphs, glyphs)
        // Trailing spaces where the text wraps get no background.
        while line.length > 0,
          let scalar = (storage.string as NSString).substring(
            with: self.characterRange(forGlyphRange: NSRange(location: NSMaxRange(line) - 1, length: 1), actualGlyphRange: nil)
          ).unicodeScalars.first,
          CharacterSet.whitespacesAndNewlines.contains(scalar), scalar != "\u{202F}"
        {
          line.length -= 1
        }
        guard line.length > 0 else { return }
        let bounds = self.boundingRect(forGlyphRange: line, in: container)
        let baseline = fragment.minY + self.location(forGlyphAt: line.location).y
        let rect = CGRect(
          x: bounds.minX + origin.x - outset.width, y: baseline - ascender - outset.height + origin.y,
          width: bounds.width + outset.width * 2, height: ascender - descender + outset.height * 2)
        UIBezierPath(roundedRect: rect, cornerRadius: radius).fill()
      }
    }
  }
}

final class TextBlockCell: TranscriptCell {
  private let textView = ProseTextView()
  private let bar = UIView()
  private let panelView = UIView()
  private var quote = false
  private var panel: TranscriptItem.Panel?
  private var rendered: NSAttributedString?
  private var measured: (width: CGFloat, text: NSAttributedString, height: CGFloat)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    bar.layer.cornerRadius = 1
    panelView.layer.cornerRadius = 9
    panelView.layer.cornerCurve = .continuous
    contentView.addSubview(panelView)
    contentView.addSubview(bar)
    contentView.addSubview(textView)
  }

  required init?(coder: NSCoder) { fatalError() }

  /// Opens a workspace file link.
  var onOpenFile: ((String) -> Void)? {
    get { textView.onOpenFile }
    set { textView.onOpenFile = newValue }
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    onOpenFile = nil
  }

  func configure(_ text: NSAttributedString, quote: Bool, panel: TranscriptItem.Panel?, theme: TranscriptTheme) {
    self.quote = quote
    bar.isHidden = !quote
    bar.backgroundColor = theme.borderHeavy
    panelView.isHidden = panel == nil
    panelView.backgroundColor = theme.panel
    if panel != self.panel {
      self.panel = panel
      measured = nil
      setNeedsLayout()
    }
    guard text !== rendered else { return }
    rendered = text
    textView.attributedText = text
    setNeedsLayout()
  }

  /// `.reasoning-text`: `margin: 4px 8px 12px 22px; padding: 10px 12px`.
  private var panelInsets: UIEdgeInsets {
    guard let panel else { return .zero }
    let first = panel == .first || panel == .only
    let last = panel == .last || panel == .only
    return UIEdgeInsets(top: first ? 5 : 0, left: 25, bottom: last ? 14 : 0, right: 9)
  }

  private var textInsets: UIEdgeInsets {
    if quote { return UIEdgeInsets(top: 0, left: 18, bottom: 0, right: 0) }
    guard let panel else { return .zero }
    let outer = panelInsets
    let first = panel == .first || panel == .only
    let last = panel == .last || panel == .only
    // Blocks inside one reasoning panel sit a line apart, like its pre-wrap newlines.
    return UIEdgeInsets(
      top: outer.top + (first ? 11 : 10), left: outer.left + 14, bottom: outer.bottom + (last ? 11 : 0),
      right: outer.right + 14)
  }

  override func measure(width: CGFloat) -> CGFloat {
    let column = column(width)
    let insets = textInsets
    let textWidth = column.width - insets.left - insets.right
    if let measured, measured.width == textWidth, measured.text === rendered {
      return measured.height + insets.top + insets.bottom
    }
    let height = textView.height(for: textWidth)
    if let rendered { measured = (textWidth, rendered, height) }
    return height + insets.top + insets.bottom
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    let insets = textInsets
    textView.frame = CGRect(
      x: column.x + insets.left, y: insets.top, width: column.width - insets.left - insets.right,
      height: max(0, bounds.height - insets.top - insets.bottom))
    // `border-left: 2px solid var(--border-heavy); padding-left: 16px`.
    bar.frame = CGRect(x: column.x, y: 0, width: 2, height: bounds.height)
    if let panel {
      let outer = panelInsets
      panelView.frame = CGRect(
        x: column.x + outer.left, y: outer.top, width: column.width - outer.left - outer.right,
        height: bounds.height - outer.top - outer.bottom)
      var corners: CACornerMask = []
      if panel == .first || panel == .only { corners.formUnion([.layerMinXMinYCorner, .layerMaxXMinYCorner]) }
      if panel == .last || panel == .only { corners.formUnion([.layerMinXMaxYCorner, .layerMaxXMaxYCorner]) }
      panelView.layer.maskedCorners = corners
    }
  }
}

// MARK: Code

/// A fenced code block: `.markdown pre` on `surface-under` with a hairline border, highlighted
/// with the theme's syntax tokens. Copy sits in the corner (the desktop copies by selection).
final class CodeBlockCell: TranscriptCell, UIContextMenuInteractionDelegate {
  /// Shares the block's code from a view, the share sheet's anchor.
  var onShare: ((String, UIView) -> Void)?

  nonisolated private static let maxLines = 400
  nonisolated private static let maxLineLength = 400

  private let box = UIView()
  private let copy = UIButton(type: .system)
  private let scroll = UIScrollView()
  private let code = UILabel()
  private var source = ""
  private var shown = ""
  private var language = ""
  private var styleKey = ""
  private var style: SyntaxHighlighter.Style?
  private var codeSize = CGSize.zero
  /// While text streams, at most one highlight is in flight; the latest source follows it.
  private var highlightInFlight = false
  private var lastHighlight: (source: String, text: NSAttributedString)?
  /// `padding: 14px 16px`.
  private let padding = UIEdgeInsets(top: 16, left: 18, bottom: 16, right: 18)

  override init(frame: CGRect) {
    super.init(frame: frame)
    box.layer.cornerRadius = 11
    box.layer.cornerCurve = .continuous
    box.layer.borderWidth = 1
    box.clipsToBounds = true
    var configuration = UIButton.Configuration.plain()
    configuration.image = Symbol.image(Symbol.copy, 14)
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8)
    copy.configuration = configuration
    copy.layer.cornerRadius = 8
    copy.accessibilityLabel = "Copy code"
    copy.accessibilityIdentifier = "transcript.copy-code"
    copy.addAction(UIAction { [weak self] _ in self?.copyCode() }, for: .primaryActionTriggered)
    scroll.showsHorizontalScrollIndicator = false
    scroll.showsVerticalScrollIndicator = false
    scroll.alwaysBounceHorizontal = false
    scroll.scrollsToTop = false
    code.numberOfLines = 0
    code.lineBreakMode = .byClipping
    code.accessibilityIdentifier = "transcript.code"
    contentView.addSubview(box)
    box.addSubview(scroll)
    scroll.addSubview(code)
    box.addSubview(copy)
    box.addInteraction(UIContextMenuInteraction(delegate: self))
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    onShare = nil
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    let source = source
    return UIContextMenuConfiguration(actionProvider: { [weak self] _ in
      UIMenu(children: [
        UIAction(title: "Copy code", image: UIImage(systemName: "doc.on.doc")) { _ in
          UIPasteboard.general.string = source
        },
        UIAction(title: "Share", image: UIImage(systemName: Symbol.share)) { _ in
          guard let self else { return }
          self.onShare?(source, self.box)
        },
      ])
    })
  }

  required init?(coder: NSCoder) { fatalError() }

  func configure(language name: String, code text: String, typography: Typography, theme: TranscriptTheme) {
    box.backgroundColor = theme.codeBlock
    box.layer.borderColor = theme.border.cgColor
    copy.configuration?.baseForegroundColor = theme.textTertiary
    copy.backgroundColor = theme.codeBlock
    let key = "\(theme.id)|\(typography.key)"
    guard text != source || key != styleKey || name != language else { return }
    let style = SyntaxHighlighter.Style(typography: typography, theme: theme)
    if key != styleKey { lastHighlight = nil }
    source = text
    language = name
    styleKey = key
    self.style = style
    shown = Self.displayed(text)
    code.attributedText = attributed(shown, style)
    codeSize = code.sizeThatFits(CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude))
    codeSize.width = codeSize.width.rounded(.up)
    codeSize.height = codeSize.height.rounded(.up)
    setNeedsLayout()
    requestHighlight()
  }

  /// The cached highlight, else the last highlight plus the new tail in plain color, so a
  /// streaming block never flashes back to plain while the next highlight runs.
  private func attributed(_ text: String, _ style: SyntaxHighlighter.Style) -> NSAttributedString {
    if let cached = SyntaxHighlighter.shared.cached(text, language: language, style: style) {
      lastHighlight = (text, cached)
      return cached
    }
    if let highlighted = lastHighlight, text.hasPrefix(highlighted.source) {
      let out = NSMutableAttributedString(attributedString: highlighted.text)
      let tail = String(text.utf16.dropFirst(highlighted.source.utf16.count)) ?? ""
      out.append(SyntaxHighlighter.plain(tail, style: style))
      return out
    }
    return SyntaxHighlighter.plain(text, style: style)
  }

  private func requestHighlight() {
    guard !highlightInFlight, let style, lastHighlight?.source != shown else { return }
    highlightInFlight = true
    let text = shown
    let key = styleKey
    SyntaxHighlighter.shared.highlight(text, language: language, style: style) { [weak self] result in
      guard let self else { return }
      self.highlightInFlight = false
      guard key == self.styleKey else { return self.requestHighlight() }
      self.lastHighlight = (text, result)
      if text == self.shown {
        // Same font and glyph advances: no remeasure.
        self.code.attributedText = result
      } else {
        // The block grew meanwhile: catch up, at most one highlight at a time.
        self.code.attributedText = self.attributed(self.shown, style)
        self.requestHighlight()
      }
    }
  }

  /// What the block shows: at most 400 lines of 400 characters; Copy takes everything.
  nonisolated static func displayed(_ text: String) -> String {
    var lines = text.split(separator: "\n", omittingEmptySubsequences: false)
    var note = ""
    if lines.count > maxLines {
      note = "\n… \(lines.count - maxLines) more lines (Copy for all)"
      lines = Array(lines.prefix(maxLines))
    }
    let shown =
      lines.map { $0.count > maxLineLength ? $0.prefix(maxLineLength) + "…" : $0 }
      .joined(separator: "\n") + note
    return shown.isEmpty ? " " : shown
  }

  private func copyCode() {
    UIPasteboard.general.string = source
    flashCopied(copy)
  }

  override func measure(width: CGFloat) -> CGFloat {
    codeSize.height + padding.top + padding.bottom + 2
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    box.frame = CGRect(x: column.x, y: 0, width: column.width, height: bounds.height)
    copy.frame = CGRect(x: column.width - 40, y: 6, width: 34, height: 34)
    scroll.frame = box.bounds
    code.frame = CGRect(x: padding.left, y: padding.top + 1, width: codeSize.width, height: codeSize.height)
    scroll.contentSize = CGSize(width: codeSize.width + padding.left + padding.right, height: box.bounds.height)
  }
}

// MARK: Table

/// Draws a Markdown table like `.markdown table`: full width, a heavier rule under the header
/// and a hairline under each row, no outer box. No subviews, so even wide tables stay cheap.
final class TableGridView: UIView {
  /// Opens a link tapped in a cell.
  var onOpenLink: ((URL) -> Void)?

  private var content: TableContent?
  private var widths: [CGFloat] = []
  private var heights: [CGFloat] = []
  /// True when some cell holds a link: taps and accessibility then look for them.
  private var hasLinks = false
  private var linkElements: [UIAccessibilityElement]?
  /// `padding: 10px 12px`.
  private let pad = UIEdgeInsets(top: 11, left: 14, bottom: 11, right: 14)
  private(set) var size = CGSize.zero
  private var laidOutFor: CGFloat = -1

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    contentMode = .redraw
    isOpaque = false
    addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ content: TableContent) {
    self.content = content
    let label = ([content.header] + content.rows).map { $0.map(\.string).joined(separator: ", ") }
      .joined(separator: "; ")
    hasLinks = ([content.header] + content.rows).contains { row in
      row.contains { cell in
        var found = false
        cell.enumerateAttribute(.tableLink, in: NSRange(location: 0, length: cell.length)) { value, _, stop in
          if value != nil {
            found = true
            stop.pointee = true
          }
        }
        return found
      }
    }
    // With links the table is a container: its summary, then each link, so VoiceOver (and UI
    // tests) can reach and open them.
    isAccessibilityElement = !hasLinks
    accessibilityIdentifier = hasLinks ? nil : "transcript.table"
    accessibilityLabel = label
    linkElements = nil
    laidOutFor = -1
    setNeedsDisplay()
  }

  // MARK: Links

  /// Where a cell's text is drawn, inside its padding.
  private func textRect(row: Int, column: Int) -> CGRect {
    let x = widths.prefix(column).reduce(0, +)
    let y = heights.prefix(row).reduce(0, +)
    return CGRect(
      x: x + pad.left, y: y + pad.top, width: widths[column] - pad.left - pad.right,
      height: heights[row] - pad.top - pad.bottom)
  }

  private func cellText(row: Int, column: Int) -> NSAttributedString? {
    guard let content else { return nil }
    let all = [content.header] + content.rows
    guard row < all.count, column < all[row].count else { return nil }
    let cell = NSMutableAttributedString(attributedString: all[row][column])
    let alignment = column < content.alignments.count ? content.alignments[column] : .natural
    if alignment != .natural {
      let paragraph = NSMutableParagraphStyle()
      paragraph.alignment = alignment
      cell.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: cell.length))
    }
    return cell
  }

  /// TextKit for one cell, laid out as `draw` lays it out. The storage owns the layout
  /// manager (not the reverse), so callers keep it alive while they measure.
  private static func layout(_ text: NSAttributedString, width: CGFloat)
    -> (NSLayoutManager, NSTextContainer, NSTextStorage)
  {
    let storage = NSTextStorage(attributedString: text)
    let manager = NSLayoutManager()
    let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
    container.lineFragmentPadding = 0
    manager.addTextContainer(container)
    storage.addLayoutManager(manager)
    manager.ensureLayout(for: container)
    return (manager, container, storage)
  }

  private func link(at point: CGPoint) -> URL? {
    guard hasLinks else { return nil }
    for row in heights.indices {
      for column in widths.indices {
        let rect = textRect(row: row, column: column)
        guard rect.insetBy(dx: -pad.left, dy: -pad.top).contains(point),
          let text = cellText(row: row, column: column), text.length > 0
        else { continue }
        let (manager, container, storage) = Self.layout(text, width: rect.width)
        defer { withExtendedLifetime(storage) {} }
        let local = CGPoint(x: point.x - rect.minX, y: point.y - rect.minY)
        let glyph = manager.glyphIndex(for: local, in: container)
        let bounds = manager.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container)
        guard bounds.insetBy(dx: -8, dy: -8).contains(local) else { return nil }
        let index = manager.characterIndexForGlyph(at: glyph)
        return text.attribute(.tableLink, at: index, effectiveRange: nil) as? URL
      }
    }
    return nil
  }

  @objc private func tapped(_ gesture: UITapGestureRecognizer) {
    guard let url = link(at: gesture.location(in: self)) else { return }
    onOpenLink?(url)
  }

  override var accessibilityElements: [Any]? {
    get {
      guard hasLinks, let content else { return nil }
      if let linkElements { return linkElements }
      let summary = UIAccessibilityElement(accessibilityContainer: self)
      summary.accessibilityLabel = accessibilityLabel
      summary.accessibilityIdentifier = "transcript.table"
      summary.accessibilityFrameInContainerSpace = bounds
      var elements = [summary]
      let all = [content.header] + content.rows
      for row in all.indices where row < heights.count {
        for column in all[row].indices where column < widths.count {
          guard let text = cellText(row: row, column: column) else { continue }
          let rect = textRect(row: row, column: column)
          var layout: (NSLayoutManager, NSTextContainer, NSTextStorage)?
          text.enumerateAttribute(.tableLink, in: NSRange(location: 0, length: text.length)) { value, range, _ in
            guard let url = value as? URL else { return }
            let built = layout ?? Self.layout(text, width: rect.width)
            layout = built
            let (manager, container, _) = built
            let glyphs = manager.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
            let bounds = manager.boundingRect(forGlyphRange: glyphs, in: container)
            let element = TableLinkElement(accessibilityContainer: self)
            element.accessibilityLabel = (text.string as NSString).substring(with: range)
              .replacingOccurrences(of: "\u{FFFC}", with: "").trimmingCharacters(in: .whitespaces)
            element.accessibilityTraits = .link
            element.accessibilityFrameInContainerSpace = bounds.offsetBy(dx: rect.minX, dy: rect.minY)
            element.activate = { [weak self] in self?.onOpenLink?(url) }
            elements.append(element)
          }
        }
      }
      linkElements = elements
      return elements
    }
    set {}
  }

  /// Column widths fit their content up to a cap; rows wrap within them.
  @discardableResult
  func layout(for available: CGFloat) -> CGSize {
    guard let content, laidOutFor != available else { return size }
    laidOutFor = available
    linkElements = nil
    let columns = max(content.header.count, content.rows.map(\.count).max() ?? 0)
    let all = [content.header] + content.rows
    let horizontal = pad.left + pad.right
    // CSS automatic table layout: max-content widths when they fit, else each column shrinks
    // toward its longest word in proportion to its slack; past that, the table scrolls.
    var natural = [CGFloat](repeating: 0, count: columns)
    var minimum = [CGFloat](repeating: 0, count: columns)
    for row in all {
      for (column, cell) in row.enumerated() where column < columns {
        natural[column] = max(natural[column], Self.width(cell) + horizontal)
        minimum[column] = max(minimum[column], Self.longestWord(cell) + horizontal)
      }
    }
    let totalNatural = natural.reduce(0, +)
    let totalMinimum = minimum.reduce(0, +)
    if totalNatural <= available {
      // `width: 100%`: narrow tables stretch to the column.
      widths = natural.map { totalNatural > 0 ? ($0 * available / totalNatural).rounded(.down) : 0 }
    } else if totalMinimum >= available {
      widths = minimum
    } else {
      let share = (available - totalMinimum) / max(1, totalNatural - totalMinimum)
      widths = zip(minimum, natural).map { ($0 + ($1 - $0) * share).rounded(.down) }
    }
    heights = all.map { row in
      var height: CGFloat = 0
      for (column, cell) in row.enumerated() where column < widths.count {
        let rect = cell.boundingRect(
          with: CGSize(width: widths[column] - pad.left - pad.right, height: .greatestFiniteMagnitude),
          options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        height = max(height, rect.height.rounded(.up))
      }
      return height + pad.top + pad.bottom
    }
    size = CGSize(width: widths.reduce(0, +), height: heights.reduce(0, +))
    return size
  }

  private static func width(_ text: NSAttributedString) -> CGFloat {
    text.boundingRect(
      with: CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil
    ).width.rounded(.up)
  }

  /// The widest unbreakable run (min-content): text between ordinary spaces and line breaks.
  private static func longestWord(_ text: NSAttributedString) -> CGFloat {
    let string = text.string as NSString
    var longest: CGFloat = 0
    var start = 0
    for index in 0...string.length {
      let breaks =
        index == string.length || [0x20, 0x0A, 0x09, 0x2028].contains(Int(string.character(at: index)))
      guard breaks else { continue }
      if index > start {
        longest = max(longest, width(text.attributedSubstring(from: NSRange(location: start, length: index - start))))
      }
      start = index + 1
    }
    return longest
  }

  override func draw(_ rect: CGRect) {
    guard let content, let context = UIGraphicsGetCurrentContext() else { return }
    let all = [content.header] + content.rows
    let hairline = 1 / max(1, traitCollection.displayScale)
    var y: CGFloat = 0
    for (index, row) in all.enumerated() {
      let height = heights[index]
      var x: CGFloat = 0
      for (column, width) in widths.enumerated() {
        if column < row.count {
          let alignment = column < content.alignments.count ? content.alignments[column] : .natural
          let cell = NSMutableAttributedString(attributedString: row[column])
          if alignment != .natural {
            let paragraph = NSMutableParagraphStyle()
            paragraph.alignment = alignment
            cell.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: cell.length))
          }
          cell.draw(
            with: CGRect(x: x + pad.left, y: y + pad.top, width: width - pad.left - pad.right, height: height),
            options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        }
        x += width
      }
      y += height
      // After the text: drawing attributed strings changes the fill color.
      (index == 0 ? content.borderHeavy : content.border).setFill()
      context.fill(CGRect(x: 0, y: y - max(hairline, 1), width: size.width, height: max(hairline, 1)))
    }
  }
}

/// A table link for VoiceOver: activating it opens the link.
private final class TableLinkElement: UIAccessibilityElement {
  var activate: (() -> Void)?
  override func accessibilityActivate() -> Bool {
    activate?()
    return activate != nil
  }
}

final class TableCell: TranscriptCell {
  /// Opens a link tapped in the table.
  var onOpenLink: ((URL) -> Void)? {
    get { grid.onOpenLink }
    set { grid.onOpenLink = newValue }
  }

  private let scroll = UIScrollView()
  private let grid = TableGridView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    scroll.showsHorizontalScrollIndicator = true
    scroll.showsVerticalScrollIndicator = false
    scroll.scrollsToTop = false
    scroll.clipsToBounds = true
    contentView.addSubview(scroll)
    scroll.addSubview(grid)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func prepareForReuse() {
    super.prepareForReuse()
    onOpenLink = nil
  }

  func configure(_ content: TableContent) {
    grid.set(content)
    scroll.contentOffset = .zero
    setNeedsLayout()
  }

  override func measure(width: CGFloat) -> CGFloat {
    grid.layout(for: column(width).width).height
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    let size = grid.layout(for: column.width)
    scroll.frame = CGRect(x: column.x, y: 0, width: column.width, height: bounds.height)
    grid.frame = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    scroll.contentSize = CGSize(width: size.width, height: bounds.height)
  }
}

final class RuleCell: TranscriptCell {
  private let line = UIView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.addSubview(line)
  }

  required init?(coder: NSCoder) { fatalError() }

  func configure(theme: TranscriptTheme) { line.backgroundColor = theme.border }

  override func measure(width: CGFloat) -> CGFloat { 13 }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    line.frame = CGRect(x: column.x, y: 6, width: column.width, height: 1)
  }
}

// MARK: Images

/// `MarkdownImage`: a paragraph that is only an image shows it at its natural size up to the
/// column and 560px tall, rounded 8px; tap to enlarge. Failures offer Retry.
final class ImageBlockCell: TranscriptCell {
  var onOpen: ((UIImage?, ImageSource, String) -> Void)?
  /// The row's height changed after loading.
  var onResize: (() -> Void)?

  private let imageView = UIImageView()
  private let message = UILabel()
  private let retry = UIButton(type: .system)
  private var source: ImageSource?
  private var name = ""
  private var maxHeight: CGFloat = 640

  override init(frame: CGRect) {
    super.init(frame: frame)
    imageView.contentMode = .scaleAspectFit
    imageView.clipsToBounds = true
    imageView.layer.cornerRadius = 9
    imageView.layer.cornerCurve = .continuous
    imageView.isUserInteractionEnabled = true
    imageView.isAccessibilityElement = true
    imageView.accessibilityTraits = [.image, .button]
    imageView.accessibilityIdentifier = "transcript.image"
    imageView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(open)))
    message.numberOfLines = 0
    var configuration = UIButton.Configuration.plain()
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8)
    retry.configuration = configuration
    retry.addAction(UIAction { [weak self] _ in self?.load() }, for: .primaryActionTriggered)
    contentView.addSubview(imageView)
    contentView.addSubview(message)
    contentView.addSubview(retry)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func prepareForReuse() {
    super.prepareForReuse()
    onOpen = nil
    onResize = nil
  }

  func configure(source: ImageSource?, alt: String, typography: Typography, theme: TranscriptTheme) {
    name = alt.isEmpty ? "Image" : alt
    maxHeight = typography.px(560)
    imageView.backgroundColor = theme.panel
    imageView.accessibilityLabel = "Preview \(name)"
    message.font = typography.label
    message.textColor = theme.textTertiary
    retry.configuration?.attributedTitle = AttributedString(
      "Retry", attributes: AttributeContainer([
        .font: typography.label, .foregroundColor: theme.text,
        .underlineStyle: NSUnderlineStyle.single.rawValue,
      ]))
    let changed = source != self.source
    self.source = source
    if changed || imageView.image == nil { show() }
    if changed { load() }
  }

  private func show() {
    guard let source else {
      imageView.image = nil
      message.text = "Image unavailable: \(name)"
      return setNeedsLayout()
    }
    switch TranscriptImages.shared.state(source) {
    case .loaded(let image):
      imageView.image = image
      message.text = nil
    case .failed:
      imageView.image = nil
      message.text = "Could not load image: \(name)"
    case .loading:
      imageView.image = nil
      message.text = nil
    }
    setNeedsLayout()
  }

  private func load() {
    guard let source else { return }
    let scale = max(2, traitCollection.displayScale)
    TranscriptImages.shared.load(source, maxPixels: 720 * scale) { [weak self] _ in
      guard let self, self.source == source else { return }
      let before = self.bounds.height
      self.show()
      if abs(self.measure(width: self.bounds.width) - before) > 0.5 { self.onResize?() }
    }
    show()
  }

  @objc private func open() {
    guard let source, let image = imageView.image else { return }
    onOpen?(image, source, name)
  }

  private func imageSize(_ width: CGFloat) -> CGSize? {
    guard let source, imageView.image != nil, let natural = TranscriptImages.shared.size(source),
      natural.width > 0, natural.height > 0
    else { return nil }
    let column = column(width).width
    let scale = min(1, column / natural.width, maxHeight / natural.height)
    return CGSize(width: (natural.width * scale).rounded(), height: (natural.height * scale).rounded())
  }

  override func measure(width: CGFloat) -> CGFloat {
    if let size = imageSize(width) { return size.height }
    if message.text != nil { return 44 }
    return 180
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    let failed = message.text != nil
    imageView.isHidden = failed
    message.isHidden = !failed
    let canRetry = failed && source != nil
    retry.isHidden = !canRetry
    if let size = imageSize(bounds.width) {
      imageView.frame = CGRect(x: column.x, y: 0, width: size.width, height: size.height)
    } else {
      imageView.frame = CGRect(x: column.x, y: 0, width: min(column.width, 280), height: bounds.height)
    }
    let retryWidth: CGFloat = canRetry ? retry.sizeThatFits(CGSize(width: 120, height: 44)).width : 0
    let text = message.sizeThatFits(CGSize(width: column.width - retryWidth - 8, height: 44))
    message.frame = CGRect(x: column.x, y: 0, width: min(text.width, column.width - retryWidth - 8), height: 44)
    retry.frame = CGRect(x: message.frame.maxX + 4, y: 0, width: retryWidth, height: 44)
  }
}

// MARK: User

/// Static text drawn by its own TextKit 1 stack, so mention pills sit exactly behind their
/// glyphs and the bubble can shrink to the longest line.
final class PromptTextView: UIView {
  private let storage = NSTextStorage()
  private let layout = ProseLayoutManager()
  private let container = NSTextContainer(size: .zero)

  override init(frame: CGRect) {
    super.init(frame: frame)
    storage.addLayoutManager(layout)
    layout.addTextContainer(container)
    container.lineFragmentPadding = 0
    isOpaque = false
    contentMode = .redraw
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) { fatalError() }

  var attributedText = NSAttributedString() {
    didSet {
      guard attributedText != oldValue else { return }
      storage.setAttributedString(attributedText)
      setNeedsDisplay()
    }
  }

  /// The laid-out text's size within `width`.
  func size(maxWidth width: CGFloat) -> CGSize {
    guard storage.length > 0 else { return .zero }
    container.size = CGSize(width: width, height: .greatestFiniteMagnitude)
    let used = layout.usedRect(for: container)
    return CGSize(width: used.width.rounded(.up), height: used.height.rounded(.up))
  }

  override func draw(_ rect: CGRect) {
    // A hair wider than measured, so rounding never rewraps the last word.
    container.size = CGSize(width: bounds.width + 0.5, height: .greatestFiniteMagnitude)
    let glyphs = layout.glyphRange(for: container)
    layout.drawBackground(forGlyphRange: glyphs, at: .zero)
    layout.drawGlyphs(forGlyphRange: glyphs, at: .zero)
  }
}

/// A sent prompt: its review comments as one chip, the `user-message` bubble with mention
/// pills, then its attachments, right-aligned.
final class BubbleCell: TranscriptCell, UIContextMenuInteractionDelegate {
  var onOpen: ((UIImage?, ImageSource, String) -> Void)?
  /// Opens the annotations list from the chip.
  var onAnnotations: ((UIView) -> Void)?
  /// Shares the prompt's text from the bubble.
  var onShare: ((String, UIView) -> Void)?

  private let chip = UIButton(type: .custom)
  private let bubble = UIView()
  private let label = PromptTextView()
  private let note = UILabel()
  private var tiles: [AttachmentTile] = []
  private var prompt: SentPrompt?
  private var files: [Attachment] = []
  /// `padding: 8px 12px; border-radius: 16px`.
  private let padding = UIEdgeInsets(top: 9, left: 14, bottom: 9, right: 14)
  /// `gap: 8px` between the chip, the bubble, attachments and the pending note.
  private let gap: CGFloat = 9
  private var typography = Typography.current
  private var theme = TranscriptTheme.fallback

  override init(frame: CGRect) {
    super.init(frame: frame)
    bubble.layer.cornerRadius = 18
    bubble.layer.cornerCurve = .continuous
    note.textAlignment = .right
    note.text = "Pending in OpenCode"
    var configuration = UIButton.Configuration.plain()
    configuration.imagePadding = 7
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 14, bottom: 0, trailing: 14)
    configuration.titleLineBreakMode = .byTruncatingTail
    chip.configuration = configuration
    chip.layer.borderWidth = 1
    chip.layer.cornerCurve = .continuous
    chip.accessibilityIdentifier = "transcript.annotations"
    chip.accessibilityHint = "Shows the comments sent with this message."
    chip.addAction(UIAction { [weak self] _ in self.map { $0.onAnnotations?($0.chip) } }, for: .primaryActionTriggered)
    contentView.addSubview(chip)
    contentView.addSubview(bubble)
    bubble.addSubview(label)
    contentView.addSubview(note)
    bubble.addInteraction(UIContextMenuInteraction(delegate: self))
    bubble.isAccessibilityElement = true
    bubble.accessibilityTraits = .staticText
  }

  required init?(coder: NSCoder) { fatalError() }

  override func prepareForReuse() {
    super.prepareForReuse()
    onOpen = nil
    onAnnotations = nil
    onShare = nil
  }

  func configure(_ prompt: SentPrompt, typography: Typography, theme: TranscriptTheme) {
    self.prompt = prompt
    self.typography = typography
    self.theme = theme
    bubble.backgroundColor = theme.userMessage
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = typography.spacing(typography.body)
    let text = NSMutableAttributedString(
      string: prompt.text,
      attributes: [.font: typography.body, .foregroundColor: theme.text, .paragraphStyle: paragraph])
    // `.user-message-bubble .mention`: `accent-soft` behind `accent-text`.
    for mention in prompt.mentions {
      text.addAttributes(
        [.mentionBackground: theme.accentSoft, .foregroundColor: theme.accentText],
        range: NSRange(location: mention.start, length: mention.end - mention.start))
    }
    label.attributedText = text
    note.font = typography.small
    note.textColor = theme.textTertiary
    note.isHidden = !prompt.pending
    bubble.isHidden = prompt.text.isEmpty
    bubble.accessibilityLabel = prompt.text
    bubble.accessibilityIdentifier = prompt.pending ? "transcript.pending" : "transcript.user"
    chip.isHidden = prompt.annotations.isEmpty
    if !prompt.annotations.isEmpty {
      // `.message-annotations-chip`: a pill in the bubble's color with a hairline border.
      chip.configuration?.attributedTitle = AttributedString(
        prompt.annotationSummary, attributes: AttributeContainer([.font: typography.body, .foregroundColor: theme.text]))
      chip.configuration?.image = Symbol.image("text.bubble", typography.body.pointSize * 0.95)
      chip.configuration?.baseForegroundColor = theme.textSecondary
      chip.backgroundColor = theme.userMessage
      chip.layer.borderColor = theme.border.cgColor
      chip.accessibilityLabel = prompt.annotationSummary
    }
    if prompt.files != files {
      files = prompt.files
      tiles.forEach { $0.removeFromSuperview() }
      tiles = files.map { file in
        let tile = AttachmentTile(file)
        tile.onOpen = { [weak self] image, source, name in self?.onOpen?(image, source, name) }
        contentView.addSubview(tile)
        return tile
      }
    }
    for tile in tiles { tile.apply(typography: typography, theme: theme) }
    setNeedsLayout()
  }

  private struct Frames {
    var chip: CGRect
    var bubble: CGRect
    var label: CGRect
    var tiles: [CGRect]
    var note: CGRect
    var height: CGFloat
  }

  private func frames(_ width: CGFloat) -> Frames {
    let column = column(width)
    let right = column.x + column.width
    var y: CGFloat = 0
    var chipFrame = CGRect.zero
    if let prompt, !prompt.annotations.isEmpty {
      // `height: 30px`, as wide as its label.
      let height = typography.px(30)
      let fitted = chip.sizeThatFits(CGSize(width: column.width, height: height)).width.rounded(.up)
      let chipWidth = min(column.width, fitted)
      chipFrame = CGRect(x: right - chipWidth, y: 0, width: chipWidth, height: height)
      y = height
    }
    var bubbleFrame = CGRect.zero
    var labelFrame = CGRect.zero
    if let prompt, !prompt.text.isEmpty {
      if y > 0 { y += gap }
      // `max-width: 90%` on phones.
      let maxBubble = (column.width * 0.9).rounded()
      let size = label.size(maxWidth: maxBubble - padding.left - padding.right)
      let bubbleWidth = (size.width + padding.left + padding.right).rounded(.up)
      let bubbleHeight = (size.height + padding.top + padding.bottom).rounded(.up)
      bubbleFrame = CGRect(x: right - bubbleWidth, y: y, width: bubbleWidth, height: bubbleHeight)
      labelFrame = CGRect(x: padding.left, y: padding.top, width: size.width, height: size.height)
      y += bubbleHeight
    }
    // `flex-wrap: wrap; justify-content: flex-end`.
    var tileFrames: [CGRect] = []
    if !tiles.isEmpty {
      if y > 0 { y += gap }
      var rows: [[CGSize]] = [[]]
      var rowWidth: CGFloat = 0
      for tile in tiles {
        let size = tile.size(maxWidth: column.width)
        if rowWidth > 0 && rowWidth + gap + size.width > column.width {
          rows.append([])
          rowWidth = 0
        }
        rowWidth += (rowWidth > 0 ? gap : 0) + size.width
        rows[rows.count - 1].append(size)
      }
      for (index, row) in rows.enumerated() {
        let total = row.reduce(0) { $0 + $1.width } + gap * CGFloat(max(0, row.count - 1))
        var x = right - total
        let height = row.map(\.height).max() ?? 0
        for size in row {
          tileFrames.append(CGRect(x: x, y: y, width: size.width, height: size.height))
          x += size.width + gap
        }
        y += height + (index < rows.count - 1 ? gap : 0)
      }
    }
    var noteFrame = CGRect.zero
    if prompt?.pending == true {
      if y > 0 { y += gap }
      let height = note.font.lineHeight.rounded(.up)
      noteFrame = CGRect(x: column.x, y: y, width: column.width, height: height)
      y += height
    }
    return Frames(
      chip: chipFrame, bubble: bubbleFrame, label: labelFrame, tiles: tileFrames, note: noteFrame, height: y)
  }

  override func measure(width: CGFloat) -> CGFloat { frames(width).height }

  override func layoutSubviews() {
    super.layoutSubviews()
    let frames = frames(bounds.width)
    chip.frame = frames.chip
    chip.layer.cornerRadius = frames.chip.height / 2
    bubble.frame = frames.bubble
    label.frame = frames.label
    for (tile, frame) in zip(tiles, frames.tiles) { tile.frame = frame }
    note.frame = frames.note
  }

  /// The chip is shorter than a touch target; it takes taps 7pt above and below.
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    if !chip.isHidden, chip.frame.insetBy(dx: 0, dy: -7).contains(point) { return chip }
    return super.hitTest(point, with: event)
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    let text = prompt?.text ?? ""
    guard !text.isEmpty else { return nil }
    return UIContextMenuConfiguration(actionProvider: { [weak self] _ in
      UIMenu(children: [
        UIAction(title: "Copy", image: UIImage(systemName: "doc.on.doc")) { _ in
          UIPasteboard.general.string = text
        },
        UIAction(title: "Share", image: UIImage(systemName: Symbol.share)) { _ in
          guard let self else { return }
          self.onShare?(text, self.bubble)
        },
      ])
    })
  }

  /// The menu lifts the bubble alone, not the whole row.
  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction, previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? {
    let parameters = UIPreviewParameters()
    parameters.visiblePath = UIBezierPath(roundedRect: bubble.bounds, cornerRadius: bubble.layer.cornerRadius)
    return UITargetedPreview(view: bubble, parameters: parameters)
  }
}

/// One attachment under a prompt: a 96×76px image thumbnail or a 240×76px file card.
final class AttachmentTile: UIControl {
  var onOpen: ((UIImage?, ImageSource, String) -> Void)?

  private let file: Attachment
  private let imageView = UIImageView()
  private let name = UILabel()
  private let type = UILabel()

  init(_ file: Attachment) {
    self.file = file
    super.init(frame: .zero)
    layer.cornerRadius = 11
    layer.cornerCurve = .continuous
    layer.borderWidth = 1
    clipsToBounds = true
    isAccessibilityElement = true
    if file.isImage {
      imageView.contentMode = .scaleAspectFill
      imageView.clipsToBounds = true
      addSubview(imageView)
      accessibilityLabel = "Preview \(file.name.isEmpty ? "Attached image" : file.name)"
      accessibilityTraits = [.image, .button]
      accessibilityIdentifier = "transcript.attachment.image"
      // A plain UIControl never sends `.primaryActionTriggered`; only UIButton and friends do.
      addAction(UIAction { [weak self] _ in self?.open() }, for: .touchUpInside)
      if let source = file.source {
        TranscriptImages.shared.load(source, maxPixels: 330) { [weak self] state in
          if case .loaded(let image) = state { self?.imageView.image = image }
        }
      }
    } else {
      name.text = file.name.isEmpty ? file.mime : file.name
      name.lineBreakMode = .byTruncatingTail
      type.text = file.typeLabel
      addSubview(name)
      addSubview(type)
      accessibilityLabel = "\(name.text ?? ""), \(file.typeLabel)"
      accessibilityIdentifier = "transcript.attachment.file"
    }
  }

  required init?(coder: NSCoder) { fatalError() }

  func apply(typography: Typography, theme: TranscriptTheme) {
    layer.borderColor = theme.border.cgColor
    backgroundColor = theme.panel
    name.font = typography.body
    name.textColor = theme.text
    type.font = typography.small
    type.textColor = theme.textSecondary
  }

  func size(maxWidth: CGFloat) -> CGSize {
    file.isImage ? CGSize(width: 110, height: 87) : CGSize(width: min(274, maxWidth), height: 87)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = bounds
    // `padding: 10px 12px; gap: 4px`, centered vertically.
    let nameHeight = name.font.lineHeight.rounded(.up)
    let typeHeight = type.font.lineHeight.rounded(.up)
    let top = ((bounds.height - nameHeight - typeHeight - 5) / 2).rounded()
    name.frame = CGRect(x: 14, y: top, width: bounds.width - 28, height: nameHeight)
    type.frame = CGRect(x: 14, y: name.frame.maxY + 5, width: bounds.width - 28, height: typeHeight)
  }

  private func open() {
    guard let source = file.source else { return }
    onOpen?(imageView.image, source, file.name.isEmpty ? "Attached image" : file.name)
  }
}

// MARK: Disclosure rows

/// A tappable header that dims while pressed.
final class PressableView: UIControl {
  /// Extra touch area above and below, for rows shorter than 44pt.
  var touchOutset: CGFloat = 0

  override var isHighlighted: Bool {
    didSet {
      UIView.animate(withDuration: isHighlighted ? 0.05 : 0.2) {
        self.alpha = self.isHighlighted ? 0.55 : 1
      }
    }
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    bounds.insetBy(dx: 0, dy: -touchOutset).contains(point)
  }
}

/// Turn headers, activity groups, tools, reasoning, skills and shell commands, laid out like the
/// desktop's `.disclosure-trigger`: chevron, icon, label, target, status, left to right, with
/// optional details in a `secondary` panel below.
final class DisclosureCell: TranscriptCell {
  var onToggle: (() -> Void)?

  private let header = PressableView()
  private let chevron = UIImageView()
  private let icon = UIImageView()
  private let title = UILabel()
  private let detail = UILabel()
  private let trailing = UILabel()
  private let statusIcon = UIImageView()
  /// The native activity indicator for a running tool, in the status icon's slot.
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let body = UIView()
  private let bodyText = ProseTextView()
  private let footer = UILabel()
  private let below = UILabel()

  private var model = Model(title: "", accessibilityIdentifier: "")
  private var bodyContent: NSAttributedString?
  private var turn: TurnRow?

  struct Model {
    /// Leading chevron (a disclosure), trailing (a turn header) or none.
    enum Chevron { case leading, trailing, none }
    var chevron = Chevron.leading
    /// Toggles details, with or without a visible chevron.
    var expandable = true
    var open = false
    var icon: String?
    var iconTint: UIColor?
    var title: String
    var attributedTitle: NSAttributedString?
    var titleFont: UIFont?
    var titleColor: UIColor?
    /// Text after the title: a tool's target or a group's running summary.
    var detail: String?
    var detailFont: UIFont?
    var detailColor: UIColor?
    /// The detail takes the remaining width (`flex: 1`), pushing the status to the end.
    var detailFills = false
    var trailing: String?
    var trailingColor: UIColor?
    var trailingFont: UIFont?
    var statusIcon: String?
    var statusTint: UIColor?
    /// A running tool: the native spinner where the finished check goes.
    var spinning = false
    var height: CGFloat = 44
    var body: NSAttributedString?
    var footer: String?
    /// Error text under a row without a panel (a failed skill).
    var below: String?
    var accessibilityIdentifier: String
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    chevron.contentMode = .center
    icon.contentMode = .center
    statusIcon.contentMode = .center
    detail.lineBreakMode = .byTruncatingTail
    title.lineBreakMode = .byTruncatingTail
    body.layer.cornerRadius = 9
    body.layer.cornerCurve = .continuous
    body.clipsToBounds = true
    below.numberOfLines = 0
    spinner.hidesWhenStopped = true
    // The medium indicator is 20pt; the status slot is 16pt.
    spinner.transform = CGAffineTransform(scaleX: 0.7, y: 0.7)
    for view in [chevron, icon, title, detail, trailing, statusIcon, spinner] {
      view.isUserInteractionEnabled = false
      header.addSubview(view)
    }
    header.addAction(UIAction { [weak self] _ in self?.onToggle?() }, for: .touchUpInside)
    header.isAccessibilityElement = true
    header.accessibilityTraits = .button
    contentView.addSubview(header)
    contentView.addSubview(body)
    body.addSubview(bodyText)
    contentView.addSubview(footer)
    contentView.addSubview(below)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func prepareForReuse() {
    super.prepareForReuse()
    turn = nil
    onToggle = nil
  }

  func configure(_ model: Model, theme: TranscriptTheme, typography: Typography) {
    self.model = model
    let tint = model.titleColor ?? theme.textSecondary
    chevron.image = Symbol.image(Symbol.chevron, model.chevron == .trailing ? 11 : 12, .medium)
    chevron.tintColor = model.chevron == .trailing ? tint : theme.textTertiary
    chevron.isHidden = model.chevron == .none
    chevron.transform = model.open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
    icon.isHidden = model.icon == nil
    if let name = model.icon {
      icon.image = Symbol.image(name, 13.5)
      icon.tintColor = model.iconTint ?? tint
    }
    title.font = model.titleFont ?? typography.label
    title.textColor = tint
    if let attributed = model.attributedTitle {
      title.attributedText = attributed
    } else {
      title.text = model.title
    }
    detail.font = model.detailFont ?? typography.small
    detail.textColor = model.detailColor ?? theme.textTertiary
    detail.text = model.detail
    detail.isHidden = (model.detail ?? "").isEmpty
    trailing.font = model.trailingFont ?? typography.small
    trailing.textColor = model.trailingColor ?? theme.textTertiary
    trailing.text = model.trailing
    trailing.isHidden = (model.trailing ?? "").isEmpty
    statusIcon.isHidden = model.statusIcon == nil
    spinner.color = theme.textSecondary
    if model.spinning != spinner.isAnimating {
      if model.spinning { spinner.startAnimating() } else { spinner.stopAnimating() }
    }
    if let name = model.statusIcon {
      statusIcon.image = Symbol.image(name, 13)
      statusIcon.tintColor = model.statusTint ?? theme.textTertiary
    }
    if model.body !== bodyContent {
      bodyContent = model.body
      bodyText.attributedText = model.body ?? NSAttributedString()
    }
    body.isHidden = model.body == nil
    body.backgroundColor = theme.panel
    footer.text = model.footer
    footer.isHidden = model.footer == nil
    footer.font = typography.small
    footer.textColor = theme.textTertiary
    below.text = model.below
    below.isHidden = model.below == nil
    below.font = typography.small
    below.textColor = theme.error
    header.touchOutset = max(0, (44 - model.height) / 2)
    header.accessibilityIdentifier = model.accessibilityIdentifier
    header.accessibilityLabel =
      [model.attributedTitle?.string ?? model.title, model.detail, model.trailing].compactMap { $0 }
      .filter { !$0.isEmpty }.joined(separator: ", ")
    header.accessibilityValue = model.expandable ? (model.open ? "Expanded" : "Collapsed") : nil
    setNeedsLayout()
  }

  /// A turn header: "Working for 1m 4s" while it runs, then "Worked for …" or "Stopped after …".
  func configure(turn: TurnRow, theme: TranscriptTheme, typography: Typography) {
    self.turn = turn
    configure(
      Model(
        chevron: .trailing, open: turn.open, title: Self.label(turn),
        titleFont: typography.label.withMonospacedDigits(), titleColor: theme.textTertiary,
        height: typography.px(24), accessibilityIdentifier: "transcript.turn"),
      theme: theme, typography: typography)
  }

  /// Advances a working turn's elapsed label; the list's single ticker calls this each second.
  func tick() {
    guard let turn, turn.status == .working else { return }
    let label = Self.label(turn)
    guard label != title.text else { return }
    title.text = label
    header.accessibilityLabel = label
    setNeedsLayout()
  }

  static func label(_ turn: TurnRow) -> String {
    let now = Date().timeIntervalSince1970 * 1000
    let elapsed = (turn.end ?? now) - turn.start
    switch turn.status {
    case .working: return elapsed < 1000 ? "Working" : "Working for \(formatDuration(elapsed))"
    case .worked: return turn.end == nil ? "Worked" : "Worked for \(formatDuration(elapsed))"
    case .stopped: return turn.end == nil ? "Stopped" : "Stopped after \(formatDuration(elapsed))"
    }
  }

  /// `.tool-details`: `margin: 4px 8px 12px 22px; padding: 10px 12px`.
  private let panelOuter = UIEdgeInsets(top: 5, left: 25, bottom: 14, right: 9)
  private let panelInner = UIEdgeInsets(top: 11, left: 14, bottom: 11, right: 14)

  override func measure(width: CGFloat) -> CGFloat {
    let column = column(width)
    var height = model.height
    if model.below != nil {
      height += below.sizeThatFits(CGSize(width: column.width - 4, height: .greatestFiniteMagnitude)).height + 4
    }
    guard bodyContent != nil else { return height }
    let textWidth = column.width - panelOuter.left - panelOuter.right - panelInner.left - panelInner.right
    height += panelOuter.top + panelInner.top + bodyText.height(for: textWidth) + panelInner.bottom
    if model.footer != nil { height += 9 + footer.font.lineHeight.rounded(.up) }
    return height + panelOuter.bottom
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    let height = model.height
    header.frame = CGRect(x: column.x, y: 0, width: column.width, height: height)
    let mid = height / 2
    // `padding: 4px 2px; gap: 8px`.
    var x: CGFloat = 2
    let gap: CGFloat = 9
    if model.chevron == .leading {
      chevron.frame = CGRect(x: x, y: mid - 8, width: 16, height: 16)
      x += 16 + gap
    }
    if model.icon != nil {
      icon.frame = CGRect(x: x, y: mid - 8, width: 16, height: 16)
      x += 16 + gap
    }
    // `.activity-item .disclosure-trigger { padding-right: 8px }`.
    var right = column.width - (indent > 0 ? 9 : 2)
    if model.statusIcon != nil || model.spinning {
      statusIcon.frame = CGRect(x: right - 16, y: mid - 8, width: 16, height: 16)
      spinner.center = CGPoint(x: right - 8, y: mid)
      right -= 16 + gap
    }
    if !trailing.isHidden && model.detailFills {
      let size = trailing.sizeThatFits(CGSize(width: 160, height: height))
      trailing.frame = CGRect(x: right - size.width, y: 0, width: size.width, height: height)
      right -= size.width + gap
    }
    let titleWidth = min(
      title.sizeThatFits(CGSize(width: .greatestFiniteMagnitude, height: height)).width.rounded(.up),
      max(0, right - x))
    title.frame = CGRect(x: x, y: 0, width: titleWidth, height: height)
    x += titleWidth
    if model.chevron == .trailing {
      x += 7
      chevron.frame = CGRect(x: x, y: mid - 7, width: 14, height: 14)
      x += 14
    }
    if !detail.isHidden {
      x += gap
      let natural = detail.sizeThatFits(CGSize(width: .greatestFiniteMagnitude, height: height)).width.rounded(.up)
      let width = model.detailFills ? max(0, right - x) : min(natural, max(0, right - x))
      detail.frame = CGRect(x: x, y: 0, width: width, height: height)
      x += width
    }
    if !trailing.isHidden && !model.detailFills {
      x += gap
      let size = trailing.sizeThatFits(CGSize(width: .greatestFiniteMagnitude, height: height))
      trailing.frame = CGRect(x: x, y: 0, width: min(size.width, max(0, right - x)), height: height)
    }
    var y = height
    if model.below != nil {
      let size = below.sizeThatFits(CGSize(width: column.width - 4, height: .greatestFiniteMagnitude))
      below.frame = CGRect(x: column.x + 2, y: y, width: column.width - 4, height: size.height)
      y += size.height + 4
    }
    if bodyContent != nil {
      let panelWidth = column.width - panelOuter.left - panelOuter.right
      let textWidth = panelWidth - panelInner.left - panelInner.right
      let textHeight = bodyText.height(for: textWidth)
      body.frame = CGRect(
        x: column.x + panelOuter.left, y: y + panelOuter.top, width: panelWidth,
        height: textHeight + panelInner.top + panelInner.bottom)
      bodyText.frame = CGRect(x: panelInner.left, y: panelInner.top, width: textWidth, height: textHeight)
      footer.frame = CGRect(
        x: column.x + panelOuter.left, y: body.frame.maxY + 9, width: panelWidth,
        height: footer.font.lineHeight.rounded(.up))
    }
  }
}

/// 45s, 2m 13s, 2m, 1h 5m: whole units, dropping zero parts.
nonisolated func formatDuration(_ ms: Double) -> String {
  let total = max(0, Int((ms / 1000).rounded()))
  let hours = total / 3600
  let minutes = (total % 3600) / 60
  let seconds = total % 60
  if hours > 0 { return minutes > 0 ? "\(hours)h \(minutes)m" : "\(hours)h" }
  if minutes > 0 { return seconds > 0 ? "\(minutes)m \(seconds)s" : "\(minutes)m" }
  return "\(seconds)s"
}

// MARK: Notes

/// Small rows: the history status, notes, errors and the answer's Copy button.
final class NoteCell: TranscriptCell {
  enum Style { case note, failure, copy, history }

  var onCopy: (() -> Void)?
  /// Shares the answer from the share button, the native share sheet's anchor.
  var onShare: ((UIView) -> Void)?

  private let label = UILabel()
  private let button = UIButton(type: .system)
  private let share = UIButton(type: .system)
  private let status = UILabel()
  private var style = Style.note
  private var reset: Task<Void, Never>?

  override init(frame: CGRect) {
    super.init(frame: frame)
    label.numberOfLines = 0
    var configuration = UIButton.Configuration.plain()
    configuration.image = Symbol.image(Symbol.copy, 15)
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8)
    button.configuration = configuration
    button.accessibilityLabel = "Copy response"
    button.accessibilityIdentifier = "transcript.copy"
    button.addAction(UIAction { [weak self] _ in self?.copied() }, for: .primaryActionTriggered)
    var shareConfiguration = UIButton.Configuration.plain()
    shareConfiguration.image = Symbol.image(Symbol.share, 15)
    shareConfiguration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8)
    share.configuration = shareConfiguration
    share.accessibilityLabel = "Share response"
    share.accessibilityIdentifier = "transcript.share"
    share.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        self.onShare?(self.share)
      }, for: .primaryActionTriggered)
    contentView.addSubview(label)
    contentView.addSubview(button)
    contentView.addSubview(share)
    contentView.addSubview(status)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func prepareForReuse() {
    super.prepareForReuse()
    onCopy = nil
    onShare = nil
    reset?.cancel()
    showCopied(false)
  }

  func configure(_ style: Style, text: String, typography: Typography, theme: TranscriptTheme) {
    self.style = style
    label.isHidden = style == .copy
    button.isHidden = style != .copy
    share.isHidden = style != .copy
    status.isHidden = style != .copy || status.text == nil
    label.textAlignment = .natural
    // Reused cells change style, so each style sets its own identifier.
    label.accessibilityIdentifier = nil
    switch style {
    case .note:
      label.attributedText = NSAttributedString(
        string: text, attributes: [.font: typography.small, .foregroundColor: theme.textTertiary])
    case .failure:
      let paragraph = NSMutableParagraphStyle()
      paragraph.lineSpacing = typography.spacing(typography.body)
      label.attributedText = NSAttributedString(
        string: text,
        attributes: [.font: typography.body, .foregroundColor: theme.error, .paragraphStyle: paragraph])
      label.accessibilityIdentifier = "transcript.failure"
    case .history:
      label.attributedText = NSAttributedString(
        string: text, attributes: [.font: typography.caption, .foregroundColor: theme.textTertiary])
      label.textAlignment = .center
      label.accessibilityIdentifier = "transcript.history"
    case .copy:
      button.configuration?.baseForegroundColor = theme.textTertiary
      share.configuration?.baseForegroundColor = theme.textTertiary
      status.font = typography.small
      status.textColor = theme.textTertiary
    }
    setNeedsLayout()
  }

  private func copied() {
    onCopy?()
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    showCopied(true)
    reset?.cancel()
    reset = Task { @MainActor [weak self] in
      try? await Task.sleep(for: .seconds(2))
      guard !Task.isCancelled else { return }
      self?.showCopied(false)
    }
  }

  private func showCopied(_ copied: Bool) {
    button.configuration?.image = Symbol.image(copied ? Symbol.copied : Symbol.copy, 15)
    button.isEnabled = !copied
    button.accessibilityLabel = copied ? "Copied" : "Copy response"
    status.text = copied ? "Copied" : nil
    status.isHidden = !copied
    setNeedsLayout()
  }

  override func measure(width: CGFloat) -> CGFloat {
    switch style {
    case .copy: return 32
    case .history: return 50
    default:
      let column = column(width)
      return label.sizeThatFits(CGSize(width: column.width, height: .greatestFiniteMagnitude)).height.rounded(.up)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    label.frame = CGRect(x: column.x, y: 0, width: column.width, height: bounds.height)
    // The ghost button's icon lines up with the text column.
    button.frame = CGRect(x: column.x - 8, y: (bounds.height - 32) / 2, width: 32, height: 32)
    share.frame = button.frame.offsetBy(dx: 34, dy: 0)
    status.frame = CGRect(x: share.frame.maxX + 2, y: 0, width: 120, height: bounds.height)
  }
}

/// Swaps a button's image to a checkmark briefly after copying.
func flashCopied(_ button: UIButton) {
  let original = button.configuration?.image
  let label = button.accessibilityLabel
  button.configuration?.image = Symbol.image(Symbol.copied, 14)
  button.accessibilityLabel = "Copied"
  UIImpactFeedbackGenerator(style: .light).impactOccurred()
  UIAccessibility.post(notification: .announcement, argument: "Copied")
  Task { @MainActor [weak button] in
    try? await Task.sleep(for: .seconds(2))
    button?.configuration?.image = original
    button?.accessibilityLabel = label
  }
}
