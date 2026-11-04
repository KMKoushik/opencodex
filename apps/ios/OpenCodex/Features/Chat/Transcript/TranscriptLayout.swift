import UIKit

/// A single-column list layout for the transcript. It keeps measured heights by item ID, so
/// reconfigured rows and refreshed snapshots keep their size, and when a row above the visible
/// top resizes (an older page sizing itself as it scrolls in) it shifts the content offset by the
/// same amount, so what the reader is looking at never jumps.
final class TranscriptLayout: UICollectionViewLayout {
  struct Metrics {
    var id: String
    var gap: CGFloat
    var estimate: CGFloat
  }

  /// The ID, top gap and estimated height of the item at an index.
  var metrics: (Int) -> Metrics? = { _ in nil }
  /// While following the end, the view pins the bottom itself; no offset shifts.
  var following: () -> Bool = { false }
  var bottomPadding: CGFloat = 20

  private var heights: [String: CGFloat] = [:]
  private var ids: [String] = []
  private var origins: [CGFloat] = []
  private var sizes: [CGFloat] = []
  private var cache: [UICollectionViewLayoutAttributes?] = []
  private var contentHeight: CGFloat = 0
  private var width: CGFloat = 0

  /// Forgets measured heights, for a Dynamic Type change.
  func resetHeights() {
    heights.removeAll()
    invalidateLayout()
  }

  /// Sets a row's height now, so a streaming row grows in the same frame as its text.
  func setHeight(_ height: CGFloat, for id: String) {
    guard heights[id] != height else { return }
    heights[id] = height
    invalidateLayout()
  }

  override func prepare() {
    super.prepare()
    guard let collectionView else { return }
    if collectionView.bounds.width != width {
      width = collectionView.bounds.width
      heights.removeAll()
    }
    let count = collectionView.numberOfSections > 0 ? collectionView.numberOfItems(inSection: 0) : 0
    ids.removeAll(keepingCapacity: true)
    origins.removeAll(keepingCapacity: true)
    sizes.removeAll(keepingCapacity: true)
    var y: CGFloat = 0
    for index in 0..<count {
      guard let metrics = metrics(index) else {
        ids.append("")
        origins.append(y)
        sizes.append(44)
        y += 44
        continue
      }
      y += metrics.gap
      let height = heights[metrics.id] ?? metrics.estimate
      ids.append(metrics.id)
      origins.append(y)
      sizes.append(height)
      y += height
    }
    contentHeight = count > 0 ? y + bottomPadding : 0
    cache = Array(repeating: nil, count: count)
  }

  override var collectionViewContentSize: CGSize {
    CGSize(width: width, height: contentHeight)
  }

  private func attributes(_ index: Int) -> UICollectionViewLayoutAttributes? {
    guard index >= 0, index < cache.count else { return nil }
    if let cached = cache[index] { return cached }
    let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: index, section: 0))
    attributes.frame = CGRect(x: 0, y: origins[index], width: width, height: sizes[index])
    cache[index] = attributes
    return attributes
  }

  override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
    guard !origins.isEmpty else { return [] }
    // First item whose bottom reaches the rect.
    var low = 0
    var high = origins.count
    while low < high {
      let mid = (low + high) / 2
      if origins[mid] + sizes[mid] < rect.minY { low = mid + 1 } else { high = mid }
    }
    var result: [UICollectionViewLayoutAttributes] = []
    var index = low
    while index < origins.count, origins[index] <= rect.maxY {
      if let attributes = attributes(index) { result.append(attributes) }
      index += 1
    }
    return result
  }

  override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    attributes(indexPath.item)
  }

  override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    newBounds.width != width
  }

  override func shouldInvalidateLayout(
    forPreferredLayoutAttributes preferred: UICollectionViewLayoutAttributes,
    withOriginalAttributes original: UICollectionViewLayoutAttributes
  ) -> Bool {
    let index = original.indexPath.item
    guard index < sizes.count else { return false }
    return abs(preferred.size.height - sizes[index]) > 0.5
  }

  override func invalidationContext(
    forPreferredLayoutAttributes preferred: UICollectionViewLayoutAttributes,
    withOriginalAttributes original: UICollectionViewLayoutAttributes
  ) -> UICollectionViewLayoutInvalidationContext {
    let context = super.invalidationContext(
      forPreferredLayoutAttributes: preferred, withOriginalAttributes: original)
    let index = original.indexPath.item
    guard let collectionView, index < sizes.count, !ids[index].isEmpty else { return context }
    let delta = preferred.size.height - sizes[index]
    heights[ids[index]] = preferred.size.height
    context.contentSizeAdjustment = CGSize(width: 0, height: delta)
    let top = collectionView.contentOffset.y + collectionView.adjustedContentInset.top
    if !following(), origins[index] < top, collectionView.contentOffset.y > -collectionView.adjustedContentInset.top {
      context.contentOffsetAdjustment = CGPoint(x: 0, y: delta)
    }
    return context
  }

  /// The frame of an item by ID after the last `prepare`, for anchoring.
  func frame(of id: String) -> CGRect? {
    guard let index = ids.firstIndex(of: id) else { return nil }
    return CGRect(x: 0, y: origins[index], width: width, height: sizes[index])
  }
}
