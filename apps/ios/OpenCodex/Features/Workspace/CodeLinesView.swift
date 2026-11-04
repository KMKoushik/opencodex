import SwiftUI
import UIKit

/// A virtualized, monospaced line view for diffs and code: fixed-height rows in a collection
/// view that scrolls both ways, with the line-number gutter pinned while scrolling sideways.
/// Rows are styled as they appear, so a 20,000-line diff costs the same as a short one.
struct CodeLines: UIViewRepresentable {
  let document: CodeDocument
  let highlighter: CodeHighlighter
  /// Tapping a separator ("N unmodified lines") calls this, when set.
  var expand: (() -> Void)?
  var identifier = "code-lines"
  @Environment(\.palette) private var palette

  func makeUIView(context: Context) -> CodeLinesView {
    let view = CodeLinesView()
    view.accessibilityIdentifier = identifier
    return view
  }

  func updateUIView(_ view: CodeLinesView, context: Context) {
    view.update(document: document, highlighter: highlighter, palette: palette, expand: expand)
  }
}

final class CodeLinesView: UIView, UICollectionViewDataSource, UICollectionViewDelegate {
  private let layout = LinesLayout()
  private lazy var collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
  private var document = CodeDocument(lines: [], columns: 0, maxNumber: 0)
  private var highlighter = CodeHighlighter(path: "")
  private var palette: Palette?
  private var expand: (() -> Void)?
  private var style = LineStyle()
  private let cache = NSCache<NSNumber, NSAttributedString>()
  private var documentID = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    cache.countLimit = 600
    collection.dataSource = self
    collection.delegate = self
    collection.register(LineCell.self, forCellWithReuseIdentifier: "line")
    collection.isDirectionalLockEnabled = true
    collection.alwaysBounceVertical = true
    collection.contentInsetAdjustmentBehavior = .always
    collection.backgroundColor = .clear
    addSubview(collection)
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (self: CodeLinesView, _: UITraitCollection) in
      self.restyle()
    }
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    collection.frame = bounds
  }

  func update(
    document: CodeDocument, highlighter: CodeHighlighter, palette: Palette, expand: (() -> Void)?
  ) {
    self.expand = expand
    let newPalette = self.palette?.id != palette.id
    let newDocument = document.lines != self.document.lines
    guard newPalette || newDocument else { return }
    self.palette = palette
    self.highlighter = highlighter
    if newDocument {
      self.document = document
      documentID += 1
    }
    restyle()
  }

  private func restyle() {
    guard let palette else { return }
    style = LineStyle(palette: palette, traits: traitCollection, maxNumber: document.maxNumber)
    backgroundColor = style.surface
    cache.removeAllObjects()
    layout.rowHeight = style.rowHeight
    layout.count = document.lines.count
    layout.contentWidth =
      style.textX + CGFloat(document.columns) * style.charWidth + 24
    layout.invalidateLayout()
    collection.reloadData()
  }

  // MARK: Data source

  func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    document.lines.count
  }

  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath)
    -> UICollectionViewCell
  {
    let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "line", for: indexPath) as! LineCell
    let line = document.lines[indexPath.item]
    cell.configure(line, text: text(for: indexPath.item, line), style: style)
    cell.pin(collectionView.contentOffset.x + collectionView.adjustedContentInset.left)
    return cell
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let x = scrollView.contentOffset.x + scrollView.adjustedContentInset.left
    for case let cell as LineCell in collection.visibleCells { cell.pin(x) }
  }

  func collectionView(_ collectionView: UICollectionView, shouldHighlightItemAt indexPath: IndexPath)
    -> Bool
  {
    if case .separator = document.lines[indexPath.item].kind { return expand != nil }
    return false
  }

  func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
    collectionView.deselectItem(at: indexPath, animated: false)
    if case .separator = document.lines[indexPath.item].kind { expand?() }
  }

  func collectionView(
    _ collectionView: UICollectionView, contextMenuConfigurationForItemsAt indexPaths: [IndexPath],
    point: CGPoint
  ) -> UIContextMenuConfiguration? {
    guard let index = indexPaths.first?.item else { return nil }
    let line = document.lines[index]
    if case .separator = line.kind { return nil }
    let all = document.lines.compactMap { line -> String? in
      if case .separator = line.kind { return nil }
      return line.text
    }
    return UIContextMenuConfiguration(actionProvider: { _ in
      UIMenu(children: [
        UIAction(title: "Copy Line", image: UIImage(systemName: "doc.on.doc")) { _ in
          UIPasteboard.general.string = line.text
        },
        UIAction(title: "Copy All", image: UIImage(systemName: "doc.on.clipboard")) { _ in
          UIPasteboard.general.string = all.joined(separator: "\n")
        },
      ])
    })
  }

  // MARK: Styling

  /// A row's attributed text: syntax roles, then the changed span of a paired edit.
  private func text(for index: Int, _ line: CodeLine) -> NSAttributedString {
    let key = NSNumber(value: index)
    if let hit = cache.object(forKey: key) { return hit }
    let text: NSAttributedString
    switch line.kind {
    case .separator(let count):
      let label =
        count.map { $0 == 1 ? "1 unmodified line" : "\($0.formatted()) unmodified lines" }
        ?? "More unchanged context may be available"
      text = NSAttributedString(
        string: label, attributes: [.font: style.noteFont, .foregroundColor: style.tertiary])
    default:
      let string = NSMutableAttributedString(
        string: line.text, attributes: [.font: style.font, .foregroundColor: style.text])
      for span in highlighter.spans(line.text) {
        let range = NSRange(location: span.range.lowerBound, length: span.range.count)
        switch span.role {
        case .keyword:
          string.addAttributes([.foregroundColor: style.keyword, .font: style.keywordFont], range: range)
        case .string: string.addAttribute(.foregroundColor, value: style.string, range: range)
        case .comment: string.addAttribute(.foregroundColor, value: style.comment, range: range)
        case .punctuation: string.addAttribute(.foregroundColor, value: style.punctuation, range: range)
        }
      }
      if let changed = line.changed, changed.upperBound <= string.length {
        let color = line.kind == .added ? style.addedWord : style.removedWord
        string.addAttribute(
          .backgroundColor, value: color,
          range: NSRange(location: changed.lowerBound, length: changed.count))
      }
      text = string
    }
    cache.setObject(text, forKey: key)
    return text
  }
}

/// Resolved fonts, metrics and colors for one theme and text size.
struct LineStyle {
  var font = UIFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)
  var keywordFont = UIFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)
  var noteFont = UIFont.systemFont(ofSize: 11.5)
  var numberFont = UIFont.monospacedDigitSystemFont(ofSize: 12, weight: .regular)
  var rowHeight: CGFloat = 20
  var charWidth: CGFloat = 7.5
  var gutterWidth: CGFloat = 44
  var textX: CGFloat { gutterWidth + 10 }
  var surface = UIColor.clear
  var text = UIColor.clear
  var tertiary = UIColor.clear
  var keyword = UIColor.clear
  var string = UIColor.clear
  var comment = UIColor.clear
  var punctuation = UIColor.clear
  var added = UIColor.clear
  var removed = UIColor.clear
  var addedRow = UIColor.clear
  var removedRow = UIColor.clear
  var addedWord = UIColor.clear
  var removedWord = UIColor.clear
  var separatorRow = UIColor.clear

  init() {}

  init(palette: Palette, traits: UITraitCollection, maxNumber: Int) {
    let metrics = UIFontMetrics(forTextStyle: .footnote)
    font = metrics.scaledFont(for: .monospacedSystemFont(ofSize: 12.5, weight: .regular), compatibleWith: traits)
    let weight = Double(palette.raw("syntax-keyword-weight") ?? "400") ?? 400
    keywordFont = metrics.scaledFont(
      for: .monospacedSystemFont(ofSize: 12.5, weight: weight >= 600 ? .semibold : .regular),
      compatibleWith: traits)
    noteFont = metrics.scaledFont(for: .systemFont(ofSize: 11.5), compatibleWith: traits)
    numberFont = metrics.scaledFont(for: .monospacedDigitSystemFont(ofSize: 12, weight: .regular), compatibleWith: traits)
    rowHeight = (font.pointSize * 1.6).rounded()
    charWidth = ("0" as NSString).size(withAttributes: [.font: font]).width
    let digits = max(2, String(maxNumber).count)
    let numberWidth = ("0" as NSString).size(withAttributes: [.font: numberFont]).width
    gutterWidth = (CGFloat(digits) * numberWidth + 22).rounded(.up)
    surface = palette.ui("surface")
    text = palette.ui("text")
    tertiary = palette.ui("text-tertiary")
    keyword = palette.ui("syntax-keyword")
    string = palette.ui("syntax-string")
    comment = palette.ui("syntax-comment")
    punctuation = palette.ui("syntax-punctuation")
    added = palette.ui("success")
    removed = palette.ui("error")
    // Opaque tints, so the pinned gutter covers text scrolled under it.
    addedRow = surface.blended(with: added, amount: palette.dark ? 0.14 : 0.11)
    removedRow = surface.blended(with: removed, amount: palette.dark ? 0.14 : 0.11)
    addedWord = added.withAlphaComponent(palette.dark ? 0.28 : 0.2)
    removedWord = removed.withAlphaComponent(palette.dark ? 0.28 : 0.2)
    separatorRow = surface.blended(with: palette.ui("secondary"))
  }
}

extension Palette {
  /// A token's raw CSS value, for non-color tokens like `syntax-keyword-weight`.
  nonisolated func raw(_ token: String) -> String? {
    Mirror(reflecting: self).children.first { $0.label == "tokens" }
      .flatMap { $0.value as? [String: String] }?[token]
  }
}

extension UIColor {
  /// This color with `other` composited on top at `amount` (and `other`'s own alpha).
  func blended(with other: UIColor, amount: CGFloat = 1) -> UIColor {
    var (r1, g1, b1, a1): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
    var (r2, g2, b2, a2): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
    getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
    other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
    let t = a2 * amount
    return UIColor(red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t, alpha: 1)
  }
}

/// Fixed-height rows as wide as the widest line.
final class LinesLayout: UICollectionViewLayout {
  var rowHeight: CGFloat = 20
  var count = 0
  var contentWidth: CGFloat = 0
  private let top: CGFloat = 4

  private var width: CGFloat {
    max(contentWidth, (collectionView?.bounds.width ?? 0) - (collectionView?.adjustedContentInset.left ?? 0) - (collectionView?.adjustedContentInset.right ?? 0))
  }

  override var collectionViewContentSize: CGSize {
    CGSize(width: width, height: top * 2 + CGFloat(count) * rowHeight)
  }

  override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
    guard count > 0 else { return [] }
    let first = max(0, Int((rect.minY - top) / rowHeight))
    let last = min(count - 1, Int((rect.maxY - top) / rowHeight))
    guard first <= last else { return [] }
    return (first...last).map { attributes(for: $0) }
  }

  override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    attributes(for: indexPath.item)
  }

  private func attributes(for index: Int) -> UICollectionViewLayoutAttributes {
    let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: index, section: 0))
    attributes.frame = CGRect(x: 0, y: top + CGFloat(index) * rowHeight, width: width, height: rowHeight)
    return attributes
  }

  override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    newBounds.width != collectionView?.bounds.width
  }
}

/// One line: tinted background, pinned gutter (bar and number), and the text.
final class LineCell: UICollectionViewCell {
  private let gutter = UIView()
  private let bar = UIView()
  private let number = UILabel()
  private let chevron = UIImageView(image: UIImage(systemName: "chevron.up.chevron.down"))
  private let label = UILabel()
  private var style = LineStyle()
  private var pinned: CGFloat = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    label.lineBreakMode = .byClipping
    number.textAlignment = .right
    chevron.contentMode = .scaleAspectFit
    chevron.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 10, weight: .medium)
    contentView.addSubview(label)
    contentView.addSubview(gutter)
    gutter.addSubview(bar)
    gutter.addSubview(number)
    gutter.addSubview(chevron)
    isAccessibilityElement = true
  }

  required init?(coder: NSCoder) { fatalError() }

  func configure(_ line: CodeLine, text: NSAttributedString, style: LineStyle) {
    self.style = style
    label.attributedText = text
    number.font = style.numberFont
    number.text = line.number.map(String.init)
    chevron.isHidden = true
    bar.isHidden = true
    let background: UIColor
    switch line.kind {
    case .context:
      background = style.surface
      number.textColor = style.tertiary
      accessibilityLabel = "Line \(line.number ?? 0): \(line.text)"
    case .added:
      background = style.addedRow
      number.textColor = style.added
      bar.backgroundColor = style.added
      bar.isHidden = false
      accessibilityLabel = "Added line \(line.number ?? 0): \(line.text)"
    case .removed:
      background = style.removedRow
      number.textColor = style.removed
      bar.backgroundColor = style.removed
      bar.isHidden = false
      accessibilityLabel = "Removed line \(line.number ?? 0): \(line.text)"
    case .separator:
      background = style.separatorRow
      chevron.isHidden = false
      chevron.tintColor = style.tertiary
      accessibilityLabel = text.string
    }
    contentView.backgroundColor = background
    gutter.backgroundColor = background
    if case .separator = line.kind {
      accessibilityTraits = .button
    } else {
      accessibilityTraits = .staticText
    }
    setNeedsLayout()
  }

  /// Keeps the gutter at the visible left edge while the text scrolls sideways.
  func pin(_ x: CGFloat) {
    pinned = max(0, x)
    gutter.frame.origin.x = pinned
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let height = bounds.height
    gutter.frame = CGRect(x: pinned, y: 0, width: style.gutterWidth, height: height)
    bar.frame = CGRect(x: 0, y: 0, width: 3, height: height)
    number.frame = CGRect(x: 0, y: 0, width: style.gutterWidth - 12, height: height)
    chevron.frame = CGRect(x: (style.gutterWidth - 16) / 2, y: 0, width: 16, height: height)
    let x = style.textX
    label.frame = CGRect(x: x, y: 0, width: max(0, bounds.width - x), height: height)
  }
}
