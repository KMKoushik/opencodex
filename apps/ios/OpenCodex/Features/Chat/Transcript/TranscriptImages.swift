import ImageIO
import UIKit

/// Where an image's bytes come from: inline base64 (attachments) or a URL request (Markdown
/// images, through the gateway for workspace paths).
nonisolated enum ImageSource: Hashable, Sendable {
  case data(key: String, base64: String)
  case request(URLRequest)

  var key: String {
    switch self {
    case .data(let key, _): key
    case .request(let request): request.url?.absoluteString ?? ""
    }
  }

  static func == (lhs: ImageSource, rhs: ImageSource) -> Bool { lhs.key == rhs.key }
  func hash(into hasher: inout Hasher) { hasher.combine(key) }
}

/// Loads and downsamples transcript images off the main thread, caching decoded images and
/// their natural sizes so rows measure correctly when they scroll back in.
final class TranscriptImages {
  static let shared = TranscriptImages()

  enum State {
    case loading
    case loaded(UIImage)
    case failed
  }

  private let images: NSCache<NSString, UIImage> = {
    let cache = NSCache<NSString, UIImage>()
    cache.totalCostLimit = 64 * 1024 * 1024
    return cache
  }()
  /// Natural sizes in points (1 image pixel = 1pt, like a CSS pixel), kept after eviction.
  private var sizes: [String: CGSize] = [:]
  private var failed: Set<String> = []
  private var waiting: [String: [(State) -> Void]] = [:]

  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.urlCache = URLCache(memoryCapacity: 0, diskCapacity: 64 * 1024 * 1024)
    return URLSession(configuration: configuration)
  }()

  func size(_ source: ImageSource) -> CGSize? { sizes[source.key] }

  func state(_ source: ImageSource) -> State {
    if let image = images.object(forKey: source.key as NSString) { return .loaded(image) }
    return failed.contains(source.key) ? .failed : .loading
  }

  /// Loads an image no larger than `maxPixels` on its long side; calls back on the main thread.
  func load(_ source: ImageSource, maxPixels: CGFloat, _ done: @escaping (State) -> Void) {
    let key = source.key
    if case .loaded = state(source) { return done(state(source)) }
    failed.remove(key)
    if waiting[key] != nil {
      waiting[key]!.append(done)
      return
    }
    waiting[key] = [done]
    Task { [weak self] in
      let result = await Self.fetch(source, maxPixels: maxPixels)
      guard let self else { return }
      let state: State
      if let (image, size) = result {
        images.setObject(image, forKey: key as NSString, cost: Int(image.size.width * image.size.height * image.scale * image.scale * 4))
        sizes[key] = size
        state = .loaded(image)
      } else {
        failed.insert(key)
        state = .failed
      }
      for callback in waiting.removeValue(forKey: key) ?? [] { callback(state) }
    }
  }

  @concurrent private static func fetch(_ source: ImageSource, maxPixels: CGFloat) async -> (UIImage, CGSize)? {
    let data: Data
    switch source {
    case .data(_, let base64):
      guard let decoded = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return nil }
      data = decoded
    case .request(let request):
      guard let (body, response) = try? await session.data(for: request),
        let status = (response as? HTTPURLResponse)?.statusCode, (200..<300).contains(status)
      else { return nil }
      data = body
    }
    guard let image = CGImageSourceCreateWithData(data as CFData, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? CGFloat,
      let height = properties[kCGImagePropertyPixelHeight] as? CGFloat
    else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: max(1, min(maxPixels, max(width, height))),
    ]
    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(image, 0, options as CFDictionary) else {
      return nil
    }
    let orientation = (properties[kCGImagePropertyOrientation] as? UInt32).flatMap { $0 >= 5 } ?? false
    let size = orientation ? CGSize(width: height, height: width) : CGSize(width: width, height: height)
    return (UIImage(cgImage: thumbnail), size)
  }
}

/// A tapped image, full screen: pinch to zoom, the name and Close, like the desktop's preview.
final class ImagePreviewController: UIViewController, UIScrollViewDelegate {
  private let image: UIImage?
  private let source: ImageSource?
  private let name: String
  private let scroll = UIScrollView()
  private let imageView = UIImageView()
  private let theme: TranscriptTheme

  init(image: UIImage?, source: ImageSource?, name: String, theme: TranscriptTheme) {
    self.image = image
    self.source = source
    self.name = name
    self.theme = theme
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
    modalTransitionStyle = .crossDissolve
  }

  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = theme.surface
    scroll.frame = view.bounds
    scroll.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    scroll.delegate = self
    scroll.maximumZoomScale = 5
    scroll.showsVerticalScrollIndicator = false
    scroll.showsHorizontalScrollIndicator = false
    scroll.contentInsetAdjustmentBehavior = .never
    imageView.contentMode = .scaleAspectFit
    imageView.image = image
    imageView.accessibilityLabel = name
    imageView.isAccessibilityElement = true
    view.addSubview(scroll)
    scroll.addSubview(imageView)

    let title = UILabel()
    title.text = name
    title.textColor = theme.text
    title.font = .preferredFont(forTextStyle: .subheadline)
    title.lineBreakMode = .byTruncatingMiddle
    var close = UIButton.Configuration.glass()
    close.image = UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .medium))
    close.baseForegroundColor = theme.text
    close.cornerStyle = .capsule
    let button = UIButton(configuration: close)
    button.accessibilityLabel = "Close image preview"
    button.accessibilityIdentifier = "transcript.preview.close"
    button.addAction(UIAction { [weak self] _ in self?.dismiss(animated: true) }, for: .primaryActionTriggered)
    for subview in [title, button] as [UIView] {
      subview.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(subview)
    }
    NSLayoutConstraint.activate([
      button.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
      button.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
      button.widthAnchor.constraint(equalToConstant: 44),
      button.heightAnchor.constraint(equalToConstant: 44),
      title.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
      title.trailingAnchor.constraint(lessThanOrEqualTo: button.leadingAnchor, constant: -12),
      title.centerYAnchor.constraint(equalTo: button.centerYAnchor),
    ])
    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(toggleZoom))
    doubleTap.numberOfTapsRequired = 2
    scroll.addGestureRecognizer(doubleTap)
    // Full resolution for zooming, if the thumbnail was downsampled.
    if let source {
      TranscriptImages.full.load(source, maxPixels: 4096) { [weak self] state in
        if case .loaded(let full) = state { self?.imageView.image = full }
      }
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard scroll.zoomScale == 1 else { return }
    imageView.frame = scroll.bounds.inset(by: view.safeAreaInsets).insetBy(dx: 0, dy: 44)
    scroll.contentSize = scroll.bounds.size
  }

  func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

  @objc private func toggleZoom(_ gesture: UITapGestureRecognizer) {
    if scroll.zoomScale > 1 {
      scroll.setZoomScale(1, animated: true)
    } else {
      let point = gesture.location(in: imageView)
      scroll.zoom(to: CGRect(x: point.x - 60, y: point.y - 60, width: 120, height: 120), animated: true)
    }
  }
}

extension TranscriptImages {
  /// Full-resolution images for the preview, kept apart from the thumbnails.
  static let full = TranscriptImages()
}
