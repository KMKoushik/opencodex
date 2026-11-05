import SwiftUI
import UIKit

/// Rendered Markdown for a workspace file, built from the chat's Markdown blocks and cells so
/// both read the same. Blocks render as they scroll in; very large documents keep the source
/// view, like the desktop's 200,000-character preview limit.
struct MarkdownPreview: View {
  let text: String
  let showSource: () -> Void

  static let limit = 200_000

  var body: some View {
    if text.count > Self.limit {
      PanelUnavailable(
        "This document is too large for rendered preview.", systemImage: "doc.richtext"
      ) {
        Button("View source", action: showSource)
          .buttonStyle(WorkspaceButtonStyle())
          .accessibilityIdentifier("markdown-view-source")
      }
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("markdown-too-large")
    } else {
      MarkdownBlocksView(text: text)
    }
  }
}

private struct MarkdownBlocksView: UIViewRepresentable {
  let text: String
  @Environment(\.palette) private var palette

  func makeUIView(context: Context) -> MarkdownCollection {
    let view = MarkdownCollection()
    view.accessibilityIdentifier = "markdown-preview"
    return view
  }

  func updateUIView(_ view: MarkdownCollection, context: Context) {
    view.update(text: text, palette: palette)
  }
}

final class MarkdownCollection: UIView, UICollectionViewDataSource {
  private var blocks: [MarkdownBlock] = []
  private var source = ""
  private var paletteID = ""
  private var palette: Palette?
  private lazy var collection: UICollectionView = {
    let size = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .estimated(44))
    let item = NSCollectionLayoutItem(layoutSize: size)
    let group = NSCollectionLayoutGroup.vertical(layoutSize: size, subitems: [item])
    let section = NSCollectionLayoutSection(group: group)
    section.interGroupSpacing = 12
    section.contentInsets = NSDirectionalEdgeInsets(top: 24, leading: 0, bottom: 48, trailing: 0)
    let view = UICollectionView(frame: .zero, collectionViewLayout: UICollectionViewCompositionalLayout(section: section))
    view.backgroundColor = .clear
    view.dataSource = self
    view.register(TextBlockCell.self, forCellWithReuseIdentifier: "text")
    view.register(CodeBlockCell.self, forCellWithReuseIdentifier: "code")
    view.register(TableCell.self, forCellWithReuseIdentifier: "table")
    view.register(RuleCell.self, forCellWithReuseIdentifier: "rule")
    view.register(ImageBlockCell.self, forCellWithReuseIdentifier: "image")
    view.accessibilityIdentifier = "markdown-preview"
    return view
  }()

  override init(frame: CGRect) {
    super.init(frame: frame)
    addSubview(collection)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    collection.frame = bounds
  }

  func update(text: String, palette: Palette) {
    guard text != source || palette.id != paletteID else { return }
    if text != source { blocks = MarkdownBlocks.split(text) }
    source = text
    paletteID = palette.id
    self.palette = palette
    // The chat's cells use dynamic system colors; resolve them in the theme's appearance.
    overrideUserInterfaceStyle = palette.dark ? .dark : .light
    tintColor = palette.ui("link")
    collection.reloadData()
  }

  func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    blocks.count
  }

  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath)
    -> UICollectionViewCell
  {
    let block = blocks[indexPath.item]
    let typography = Typography.current
    // The chat's renderer and cells, in this file's theme.
    let theme = palette.map(TranscriptTheme.init) ?? TranscriptTheme.fallback
    switch MarkdownRenderer.shared.render(block, style: .answer, typography: typography, theme: theme) {
    case .text(let text):
      let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "text", for: indexPath) as! TextBlockCell
      cell.configure(text, quote: block.kind == .quote, panel: nil, theme: theme)
      return cell
    case .code(let language, let code):
      let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "code", for: indexPath) as! CodeBlockCell
      cell.configure(language: language, code: code, typography: typography, theme: theme)
      return cell
    case .table(let content):
      let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "table", for: indexPath) as! TableCell
      cell.configure(content)
      return cell
    case .image(let source, let alt):
      // Remote images only; relative paths would need the file's folder.
      let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "image", for: indexPath) as! ImageBlockCell
      cell.configure(
        source: source.flatMap { TranscriptItemBuilder.source($0, key: $0) }, alt: alt,
        typography: typography, theme: theme)
      return cell
    case .rule:
      let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "rule", for: indexPath) as! RuleCell
      cell.configure(theme: theme)
      return cell
    }
  }
}
