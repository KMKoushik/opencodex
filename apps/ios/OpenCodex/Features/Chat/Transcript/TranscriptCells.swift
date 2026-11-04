import UIKit

/// Base cell: manual layout in a centered, readable column, sized by `measure(width:)`.
/// Manual sizing keeps self-sizing cheap enough to run every frame for a streaming row.
class TranscriptCell: UICollectionViewCell {
  static let side: CGFloat = 18
  static let maxColumn: CGFloat = 700
  static let indentStep: CGFloat = 12

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

// MARK: Prose

/// A UITextView for read-only selectable text that opens web links in Safari.
final class ProseTextView: UITextView, UITextViewDelegate {
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
    linkTextAttributes = [.foregroundColor: UIColor.tintColor]
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
    guard scheme == "http" || scheme == "https" || scheme == "mailto" else { return nil }
    return UIAction { _ in UIApplication.shared.open(url) }
  }
}

/// Draws inline code backgrounds as rounded rects that hug the glyphs on each line.
nonisolated final class ProseLayoutManager: NSLayoutManager {
  override func drawBackground(forGlyphRange glyphsToShow: NSRange, at origin: CGPoint) {
    super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
    guard let storage = textStorage, let container = textContainers.first,
      let context = UIGraphicsGetCurrentContext()
    else { return }
    let characters = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
    context.saveGState()
    TranscriptColors.inlineCode.setFill()
    storage.enumerateAttribute(.codeBackground, in: characters) { value, range, _ in
      guard value != nil else { return }
      let font = storage.attribute(.font, at: range.location, effectiveRange: nil) as? UIFont
      let ascender = font?.ascender ?? 12
      let descender = font?.descender ?? -3
      let glyphs = glyphRange(forCharacterRange: range, actualCharacterRange: nil)
      enumerateLineFragments(forGlyphRange: glyphs) { fragment, _, _, lineGlyphs, _ in
        var line = NSIntersectionRange(lineGlyphs, glyphs)
        // Trailing spaces where the code wraps get no background.
        while line.length > 0,
          let scalar = (storage.string as NSString).substring(
            with: self.characterRange(forGlyphRange: NSRange(location: NSMaxRange(line) - 1, length: 1), actualGlyphRange: nil)
          ).unicodeScalars.first,
          CharacterSet.whitespacesAndNewlines.contains(scalar)
        {
          line.length -= 1
        }
        guard line.length > 0 else { return }
        let bounds = self.boundingRect(forGlyphRange: line, in: container)
        let baseline = fragment.minY + self.location(forGlyphAt: line.location).y
        let rect = CGRect(
          x: bounds.minX + origin.x, y: baseline - ascender - 1.5 + origin.y,
          width: bounds.width, height: ascender - descender + 3)
        UIBezierPath(roundedRect: rect, cornerRadius: 4).fill()
      }
    }
    context.restoreGState()
  }
}

final class TextBlockCell: TranscriptCell {
  private let textView = ProseTextView()
  private let bar = UIView()
  private var quote = false
  private var rendered: NSAttributedString?
  private var measured: (width: CGFloat, text: NSAttributedString, height: CGFloat)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    bar.backgroundColor = .tertiaryLabel
    bar.layer.cornerRadius = 1.5
    contentView.addSubview(bar)
    contentView.addSubview(textView)
  }

  required init?(coder: NSCoder) { fatalError() }

  func configure(_ text: NSAttributedString, quote: Bool, indent: Int) {
    self.indent = indent
    self.quote = quote
    bar.isHidden = !quote
    guard text !== rendered else { return }
    rendered = text
    textView.attributedText = text
    setNeedsLayout()
  }

  private var textInset: CGFloat { quote ? 15 : 0 }

  override func measure(width: CGFloat) -> CGFloat {
    let column = column(width)
    let textWidth = column.width - textInset
    if let measured, measured.width == textWidth, measured.text === rendered { return measured.height }
    let height = textView.height(for: textWidth)
    if let rendered { measured = (textWidth, rendered, height) }
    return height
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    textView.frame = CGRect(
      x: column.x + textInset, y: 0, width: column.width - textInset, height: bounds.height)
    bar.frame = CGRect(x: column.x + 1, y: 2, width: 3, height: max(0, bounds.height - 4))
  }
}

// MARK: Code

final class CodeBlockCell: TranscriptCell {
  private static let maxLines = 400
  private static let maxLineLength = 400

  private let box = UIView()
  private let header = UIView()
  private let language = UILabel()
  private let copy = UIButton(type: .system)
  private let scroll = UIScrollView()
  private let code = UILabel()
  private var source = ""
  private var codeSize = CGSize.zero
  private let headerHeight: CGFloat = 32
  private let padding: CGFloat = 14

  override init(frame: CGRect) {
    super.init(frame: frame)
    box.backgroundColor = TranscriptColors.codeBackground
    box.layer.cornerRadius = 12
    box.layer.cornerCurve = .continuous
    box.layer.borderWidth = 1 / 3
    box.layer.borderColor = TranscriptColors.border.resolvedColor(with: traitCollection).cgColor
    registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: CodeBlockCell, _: UITraitCollection) in
      self.box.layer.borderColor = TranscriptColors.border.resolvedColor(with: self.traitCollection).cgColor
    }
    box.clipsToBounds = true
    header.backgroundColor = TranscriptColors.codeHeader
    language.textColor = .secondaryLabel
    var configuration = UIButton.Configuration.plain()
    configuration.image = UIImage(systemName: "doc.on.doc")
    configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 12, weight: .medium)
    configuration.baseForegroundColor = .secondaryLabel
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 10, bottom: 6, trailing: 12)
    copy.configuration = configuration
    copy.accessibilityLabel = "Copy code"
    copy.addAction(UIAction { [weak self] _ in self?.copyCode() }, for: .primaryActionTriggered)
    scroll.showsHorizontalScrollIndicator = false
    scroll.showsVerticalScrollIndicator = false
    scroll.alwaysBounceHorizontal = false
    scroll.scrollsToTop = false
    code.numberOfLines = 0
    code.lineBreakMode = .byClipping
    code.accessibilityIdentifier = "transcript.code"
    contentView.addSubview(box)
    box.addSubview(header)
    header.addSubview(language)
    header.addSubview(copy)
    box.addSubview(scroll)
    scroll.addSubview(code)
  }

  required init?(coder: NSCoder) { fatalError() }

  func configure(language name: String, code text: String, typography: Typography) {
    language.font = typography.caption
    language.text = name.isEmpty ? "code" : name
    guard text != source || code.font != typography.mono else { return }
    source = text
    var lines = text.split(separator: "\n", omittingEmptySubsequences: false)
    var note = ""
    if lines.count > Self.maxLines {
      note = "\n… \(lines.count - Self.maxLines) more lines (Copy for all)"
      lines = Array(lines.prefix(Self.maxLines))
    }
    let shown =
      lines.map { $0.count > Self.maxLineLength ? $0.prefix(Self.maxLineLength) + "…" : $0 }
      .joined(separator: "\n") + note
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = 3
    code.attributedText = NSAttributedString(
      string: shown.isEmpty ? " " : shown,
      attributes: [.font: typography.mono, .foregroundColor: UIColor.label, .paragraphStyle: paragraph])
    codeSize = code.sizeThatFits(CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude))
    codeSize.width = codeSize.width.rounded(.up)
    codeSize.height = codeSize.height.rounded(.up)
    scroll.contentOffset = .zero
    setNeedsLayout()
  }

  private func copyCode() {
    UIPasteboard.general.string = source
    flashCopied(copy)
  }

  override func measure(width: CGFloat) -> CGFloat {
    headerHeight + codeSize.height + padding * 2 - 4
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    box.frame = CGRect(x: column.x, y: 0, width: column.width, height: bounds.height)
    header.frame = CGRect(x: 0, y: 0, width: column.width, height: headerHeight)
    let copySize = copy.sizeThatFits(CGSize(width: 80, height: headerHeight))
    copy.frame = CGRect(
      x: column.width - copySize.width, y: (headerHeight - copySize.height) / 2,
      width: copySize.width, height: copySize.height)
    language.frame = CGRect(x: padding, y: 0, width: copy.frame.minX - padding, height: headerHeight)
    scroll.frame = CGRect(x: 0, y: headerHeight, width: column.width, height: bounds.height - headerHeight)
    code.frame = CGRect(x: padding, y: padding - 2, width: codeSize.width, height: codeSize.height)
    scroll.contentSize = CGSize(width: codeSize.width + padding * 2, height: scroll.frame.height)
  }

}

// MARK: Table

/// Draws a Markdown table: no subviews, so even wide tables stay cheap.
final class TableGridView: UIView {
  private var content: TableContent?
  private var widths: [CGFloat] = []
  private var heights: [CGFloat] = []
  private let pad = UIEdgeInsets(top: 8, left: 10, bottom: 8, right: 10)
  private(set) var size = CGSize.zero
  private var laidOutFor: CGFloat = -1

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    contentMode = .redraw
    isOpaque = false
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ content: TableContent) {
    self.content = content
    isAccessibilityElement = true
    accessibilityIdentifier = "transcript.table"
    accessibilityLabel = ([content.header] + content.rows).map { $0.map(\.string).joined(separator: ", ") }
      .joined(separator: "; ")
    laidOutFor = -1
    setNeedsDisplay()
  }

  /// Column widths fit their content up to a cap; rows wrap within them.
  @discardableResult
  func layout(for available: CGFloat) -> CGSize {
    guard let content, laidOutFor != available else { return size }
    laidOutFor = available
    let columns = max(content.header.count, content.rows.map(\.count).max() ?? 0)
    let cap = max(150, available * 0.62)
    let all = [content.header] + content.rows
    widths = (0..<columns).map { column in
      let natural = all.map { row -> CGFloat in
        guard column < row.count else { return 0 }
        return row[column].boundingRect(
          with: CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude),
          options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil
        ).width.rounded(.up)
      }.max() ?? 0
      return min(cap, max(44, natural)) + pad.left + pad.right
    }
    // Narrow tables stretch to the column.
    let total = widths.reduce(0, +)
    if total < available, total > 0 {
      widths = widths.map { ($0 * available / total).rounded(.down) }
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

  override func draw(_ rect: CGRect) {
    guard let content, let context = UIGraphicsGetCurrentContext() else { return }
    let all = [content.header] + content.rows
    let bounds = CGRect(origin: .zero, size: size).insetBy(dx: 0.5, dy: 0.5)
    let outline = UIBezierPath(roundedRect: bounds, cornerRadius: 10)
    context.saveGState()
    outline.addClip()
    TranscriptColors.tableHeader.setFill()
    context.fill(CGRect(x: 0, y: 0, width: size.width, height: heights.first ?? 0))
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
    }
    // After the text: drawing attributed strings changes the fill color.
    TranscriptColors.border.setFill()
    var lineX: CGFloat = 0
    for width in widths.dropLast() {
      lineX += width
      context.fill(CGRect(x: lineX, y: 0, width: hairline, height: size.height))
    }
    var lineY: CGFloat = 0
    for height in heights.dropLast() {
      lineY += height
      context.fill(CGRect(x: 0, y: lineY, width: size.width, height: hairline))
    }
    context.restoreGState()
    TranscriptColors.border.setStroke()
    outline.lineWidth = hairline * 2
    outline.stroke()
  }
}

final class TableCell: TranscriptCell {
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
    registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: TableCell, _: UITraitCollection) in
      self.grid.setNeedsDisplay()
    }
  }

  required init?(coder: NSCoder) { fatalError() }

  func configure(_ content: TableContent) {
    grid.set(content)
    scroll.contentOffset = .zero
    setNeedsLayout()
  }

  override func measure(width: CGFloat) -> CGFloat {
    grid.layout(for: column(width).width).height + 2
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    let size = grid.layout(for: column.width)
    scroll.frame = CGRect(x: column.x, y: 0, width: column.width, height: bounds.height)
    grid.frame = CGRect(x: 0, y: 1, width: size.width, height: size.height)
    scroll.contentSize = CGSize(width: size.width, height: bounds.height)
  }
}

final class RuleCell: TranscriptCell {
  private let line = UIView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    line.backgroundColor = .separator
    contentView.addSubview(line)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func measure(width: CGFloat) -> CGFloat { 13 }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    let hairline = 1 / max(1, traitCollection.displayScale)
    line.frame = CGRect(x: column.x, y: 6, width: column.width, height: hairline)
  }
}

// MARK: User

final class BubbleCell: TranscriptCell, UIContextMenuInteractionDelegate {
  private let bubble = UIView()
  private let label = UILabel()
  private let footer = UILabel()
  private var text = ""
  private let padding = UIEdgeInsets(top: 9, left: 14, bottom: 9, right: 14)

  override init(frame: CGRect) {
    super.init(frame: frame)
    bubble.backgroundColor = TranscriptColors.bubble
    bubble.layer.cornerRadius = 20
    bubble.layer.cornerCurve = .continuous
    label.numberOfLines = 0
    label.textColor = .label
    footer.textColor = .secondaryLabel
    footer.textAlignment = .right
    footer.numberOfLines = 0
    contentView.addSubview(bubble)
    bubble.addSubview(label)
    contentView.addSubview(footer)
    bubble.addInteraction(UIContextMenuInteraction(delegate: self))
    bubble.isAccessibilityElement = true
    bubble.accessibilityTraits = .staticText
  }

  required init?(coder: NSCoder) { fatalError() }

  func configure(text: String, files: [String], pending: Bool, typography: Typography) {
    self.text = text
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = 2
    label.attributedText = NSAttributedString(
      string: text, attributes: [.font: typography.body, .foregroundColor: UIColor.label, .paragraphStyle: paragraph])
    var notes = files.map { "📎 \($0)" }
    if pending { notes.append("Pending") }
    footer.font = typography.caption
    footer.text = notes.joined(separator: "\n")
    footer.isHidden = notes.isEmpty
    bubble.isHidden = text.isEmpty
    contentView.alpha = pending ? 0.55 : 1
    bubble.accessibilityLabel = pending ? "Pending: \(text)" : text
    bubble.accessibilityIdentifier = pending ? "transcript.pending" : "transcript.user"
    setNeedsLayout()
  }

  private func sizes(_ width: CGFloat) -> (bubble: CGSize, footer: CGFloat) {
    let column = column(width)
    let maxBubble = (column.width * 0.84).rounded()
    let labelSize = text.isEmpty
      ? .zero
      : label.sizeThatFits(CGSize(width: maxBubble - padding.left - padding.right, height: .greatestFiniteMagnitude))
    let bubble = text.isEmpty
      ? .zero
      : CGSize(
        width: (labelSize.width + padding.left + padding.right).rounded(.up),
        height: (labelSize.height + padding.top + padding.bottom).rounded(.up))
    let footer = footer.isHidden ? 0 : footer.sizeThatFits(CGSize(width: column.width, height: .greatestFiniteMagnitude)).height + 4
    return (bubble, footer)
  }

  override func measure(width: CGFloat) -> CGFloat {
    let sizes = sizes(width)
    return sizes.bubble.height + sizes.footer
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    let sizes = sizes(bounds.width)
    bubble.frame = CGRect(
      x: column.x + column.width - sizes.bubble.width, y: 0, width: sizes.bubble.width, height: sizes.bubble.height)
    label.frame = bubble.bounds.inset(by: padding)
    footer.frame = CGRect(x: column.x, y: sizes.bubble.height + 4, width: column.width, height: max(0, sizes.footer - 4))
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    let text = text
    return UIContextMenuConfiguration(actionProvider: { _ in
      UIMenu(children: [
        UIAction(title: "Copy", image: UIImage(systemName: "doc.on.doc")) { _ in
          UIPasteboard.general.string = text
        }
      ])
    })
  }
}

// MARK: Disclosure rows

/// A tappable header that dims while pressed.
final class PressableView: UIControl {
  override var isHighlighted: Bool {
    didSet {
      UIView.animate(withDuration: isHighlighted ? 0.05 : 0.2) {
        self.alpha = self.isHighlighted ? 0.45 : 1
      }
    }
  }
}

/// Turn headers, activity groups, tools, reasoning, skills and shell commands: a one-line
/// header that toggles, with optional monospaced details below.
final class DisclosureCell: TranscriptCell {
  enum Status { case none, running, done, failed }

  var onToggle: (() -> Void)?

  private let header = PressableView()
  private let icon = UIImageView()
  private let title = UILabel()
  private let detail = UILabel()
  private let trailing = UILabel()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let statusIcon = UIImageView()
  private let chevron = UIImageView()
  private let rule = UIView()
  private let body = UIView()
  private let bodyText = ProseTextView()

  private var hasIcon = false
  private var hasRule = false
  private var showsChevron = true
  private var open = false
  private var bodyContent: NSAttributedString?
  private var rowHeight: CGFloat = 34
  private var timer: Timer?
  private var turn: TurnRow?

  override init(frame: CGRect) {
    super.init(frame: frame)
    icon.contentMode = .center
    icon.tintColor = .secondaryLabel
    title.textColor = .secondaryLabel
    detail.textColor = .secondaryLabel
    detail.lineBreakMode = .byTruncatingMiddle
    trailing.textColor = .systemRed
    spinner.hidesWhenStopped = true
    spinner.transform = CGAffineTransform(scaleX: 0.75, y: 0.75)
    statusIcon.contentMode = .center
    chevron.contentMode = .center
    chevron.tintColor = .tertiaryLabel
    chevron.image = UIImage(
      systemName: "chevron.right",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold))
    rule.backgroundColor = .separator
    body.backgroundColor = TranscriptColors.codeBackground
    body.layer.cornerRadius = 10
    body.layer.cornerCurve = .continuous
    body.clipsToBounds = true
    for view in [icon, title, detail, trailing, spinner, statusIcon, chevron, rule] {
      view.isUserInteractionEnabled = false
      header.addSubview(view)
    }
    header.addAction(UIAction { [weak self] _ in self?.onToggle?() }, for: .touchUpInside)
    header.isAccessibilityElement = true
    header.accessibilityTraits = .button
    contentView.addSubview(header)
    contentView.addSubview(body)
    body.addSubview(bodyText)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func prepareForReuse() {
    super.prepareForReuse()
    timer?.invalidate()
    timer = nil
    turn = nil
    onToggle = nil
  }

  struct Model {
    var icon: String?
    var iconTint: UIColor = .secondaryLabel
    var title: String
    var titleColor: UIColor = .secondaryLabel
    var titleMono = false
    var detail: String?
    var detailMono = false
    var trailing: String?
    var status: Status = .none
    var open = false
    var chevron = true
    var rule = false
    var body: NSAttributedString?
    var accessibilityIdentifier: String
  }

  func configure(_ model: Model, indent: Int, typography: Typography) {
    self.indent = indent
    hasIcon = model.icon != nil
    if let name = model.icon {
      icon.image = UIImage(
        systemName: name, withConfiguration: UIImage.SymbolConfiguration(pointSize: 12.5, weight: .medium))
      icon.tintColor = model.iconTint
    }
    icon.isHidden = !hasIcon
    title.font = model.titleMono ? typography.mono : typography.small
    title.textColor = model.titleColor
    title.text = model.title
    title.lineBreakMode = .byTruncatingTail
    detail.font = model.detailMono ? typography.monoSmall : typography.small
    detail.text = model.detail
    detail.isHidden = (model.detail ?? "").isEmpty
    trailing.font = typography.small
    trailing.text = model.trailing
    trailing.isHidden = (model.trailing ?? "").isEmpty
    switch model.status {
    case .running:
      spinner.startAnimating()
      statusIcon.isHidden = true
    case .done:
      spinner.stopAnimating()
      statusIcon.isHidden = false
      statusIcon.image = UIImage(
        systemName: "checkmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold))
      statusIcon.tintColor = .tertiaryLabel
    case .failed:
      spinner.stopAnimating()
      statusIcon.isHidden = false
      statusIcon.image = UIImage(
        systemName: "exclamationmark.circle.fill",
        withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .regular))
      statusIcon.tintColor = .systemRed
    case .none:
      spinner.stopAnimating()
      statusIcon.isHidden = true
    }
    showsChevron = model.chevron
    chevron.isHidden = !model.chevron
    hasRule = model.rule
    rule.isHidden = !model.rule
    open = model.open
    chevron.transform = open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
    if model.body !== bodyContent {
      bodyContent = model.body
      bodyText.attributedText = model.body ?? NSAttributedString()
    }
    body.isHidden = model.body == nil
    rowHeight = max(34, (typography.small.lineHeight + 16).rounded())
    header.accessibilityIdentifier = model.accessibilityIdentifier
    header.accessibilityLabel = [model.title, model.detail, model.trailing].compactMap { $0 }.joined(separator: ", ")
    header.accessibilityValue = model.chevron ? (model.open ? "Expanded" : "Collapsed") : nil
    setNeedsLayout()
  }

  /// A turn header: its label ticks each second only while the turn works.
  func configure(turn: TurnRow, typography: Typography) {
    self.turn = turn
    configure(
      Model(
        title: Self.label(turn), titleColor: .secondaryLabel, open: turn.open, rule: true,
        accessibilityIdentifier: "transcript.turn"),
      indent: 0, typography: typography)
    timer?.invalidate()
    timer = nil
    if turn.status == .working {
      timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, let turn = self.turn else { return }
          self.title.text = Self.label(turn)
          self.header.accessibilityLabel = self.title.text
          self.setNeedsLayout()
        }
      }
    }
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

  private var bodyInset: UIEdgeInsets { UIEdgeInsets(top: 10, left: 12, bottom: 10, right: 12) }

  override func measure(width: CGFloat) -> CGFloat {
    guard bodyContent != nil else { return rowHeight }
    let column = column(width)
    let text = bodyText.height(for: column.width - bodyInset.left - bodyInset.right)
    return rowHeight + text + bodyInset.top + bodyInset.bottom + 6
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    header.frame = CGRect(x: column.x, y: 0, width: column.width, height: rowHeight)
    let mid = rowHeight / 2
    var x: CGFloat = 0
    if hasIcon {
      icon.frame = CGRect(x: 0, y: mid - 10, width: 18, height: 20)
      x = 24
    }
    var right = column.width
    if showsChevron {
      chevron.frame = CGRect(x: right - 14, y: mid - 8, width: 14, height: 16)
      right -= 20
    }
    if spinner.isAnimating {
      spinner.center = CGPoint(x: right - 9, y: mid)
      right -= 24
    } else if !statusIcon.isHidden {
      statusIcon.frame = CGRect(x: right - 18, y: mid - 9, width: 18, height: 18)
      right -= 24
    }
    if !trailing.isHidden {
      let size = trailing.sizeThatFits(CGSize(width: 120, height: rowHeight))
      trailing.frame = CGRect(x: right - size.width, y: 0, width: size.width, height: rowHeight)
      right -= size.width + 8
    }
    let titleWidth = min(title.sizeThatFits(CGSize(width: .greatestFiniteMagnitude, height: rowHeight)).width.rounded(.up), right - x)
    title.frame = CGRect(x: x, y: 0, width: titleWidth, height: rowHeight)
    x += titleWidth + 8
    if !detail.isHidden {
      detail.frame = CGRect(x: x, y: 0, width: max(0, right - x), height: rowHeight)
      x = right
    }
    if hasRule {
      let hairline = 1 / max(1, traitCollection.displayScale)
      rule.frame = CGRect(x: x + 2, y: mid, width: max(0, right - x - 2), height: hairline)
    }
    if bodyContent != nil {
      body.frame = CGRect(x: column.x, y: rowHeight + 2, width: column.width, height: bounds.height - rowHeight - 6)
      bodyText.frame = body.bounds.inset(by: bodyInset)
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

/// Small rows: history status, notes, errors and the answer's Copy button.
final class NoteCell: TranscriptCell {
  enum Style { case note, failure, copy, history(loading: Bool) }

  var onCopy: (() -> Void)?

  private let label = UILabel()
  private let icon = UIImageView()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let button = UIButton(type: .system)
  private var style = Style.note

  override init(frame: CGRect) {
    super.init(frame: frame)
    label.numberOfLines = 0
    icon.contentMode = .center
    spinner.hidesWhenStopped = true
    var configuration = UIButton.Configuration.plain()
    configuration.image = UIImage(systemName: "doc.on.doc")
    configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 13, weight: .regular)
    configuration.baseForegroundColor = .secondaryLabel
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 8)
    button.configuration = configuration
    button.accessibilityLabel = "Copy answer"
    button.accessibilityIdentifier = "transcript.copy"
    button.addAction(UIAction { [weak self] _ in
      guard let self else { return }
      self.onCopy?()
      flashCopied(self.button)
    }, for: .primaryActionTriggered)
    contentView.addSubview(label)
    contentView.addSubview(icon)
    contentView.addSubview(spinner)
    contentView.addSubview(button)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func prepareForReuse() {
    super.prepareForReuse()
    onCopy = nil
  }

  func configure(_ style: Style, text: String, typography: Typography) {
    self.style = style
    label.text = text
    label.font = typography.caption
    label.textAlignment = .center
    label.textColor = .tertiaryLabel
    label.isHidden = false
    icon.isHidden = true
    button.isHidden = true
    spinner.stopAnimating()
    switch style {
    case .note: break
    case .failure:
      label.font = typography.small
      label.textAlignment = .natural
      label.textColor = .systemRed
      icon.isHidden = false
      icon.image = UIImage(
        systemName: "exclamationmark.triangle.fill",
        withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .regular))
      icon.tintColor = .systemRed
    case .copy:
      label.isHidden = true
      button.isHidden = false
    case .history(let loading):
      if loading { spinner.startAnimating() }
      label.isHidden = loading
    }
    setNeedsLayout()
  }

  private var iconWidth: CGFloat { icon.isHidden ? 0 : 22 }

  override func measure(width: CGFloat) -> CGFloat {
    switch style {
    case .copy: return 30
    case .history: return 32
    default:
      let column = column(width)
      return label.sizeThatFits(CGSize(width: column.width - iconWidth, height: .greatestFiniteMagnitude)).height + 4
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let column = column(bounds.width)
    icon.frame = CGRect(x: column.x, y: 2, width: 16, height: label.font.lineHeight)
    label.frame = CGRect(x: column.x + iconWidth, y: 2, width: column.width - iconWidth, height: bounds.height - 4)
    spinner.center = CGPoint(x: bounds.midX, y: bounds.midY)
    button.frame = CGRect(x: column.x - 2, y: 0, width: 44, height: 30)
  }
}

/// Swaps a button's image to a checkmark briefly after copying.
func flashCopied(_ button: UIButton) {
  let original = button.configuration?.image
  button.configuration?.image = UIImage(systemName: "checkmark")
  UIImpactFeedbackGenerator(style: .light).impactOccurred()
  Task { @MainActor [weak button] in
    try? await Task.sleep(for: .seconds(1.4))
    button?.configuration?.image = original
  }
}
