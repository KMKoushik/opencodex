import AVKit
import PDFKit
import QuickLook
import SwiftUI

/// A read-only file preview, like the desktop's `FilePreview`: code with line numbers, Markdown
/// with a source/preview switch, images, PDFs, video, Word documents, and the desktop's
/// binary and too-large states. Editing stays on the computer.
struct FilePreviewScreen: View {
  let model: WorkspaceModel
  let path: String

  @State private var phase: Phase = .loading
  @State private var markdownPreview = false
  @Environment(\.palette) private var palette

  enum Phase {
    case loading
    case failed(String)
    /// Over the gateway's 2 MiB preview bound (HTTP 413).
    case tooLarge(String)
    case loaded(WorkspaceFile, CodeDocument?)
  }

  private var isMarkdown: Bool {
    ["md", "markdown", "mdown"].contains((path as NSString).pathExtension.lowercased())
  }

  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(palette.color("surface"))
      .navigationTitle((path as NSString).lastPathComponent)
      .navigationSubtitle(parent)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if case .loaded(.text(let text, _, _), _) = phase {
          ToolbarItem(placement: .topBarTrailing) {
            ShareLink(item: text, subject: Text((path as NSString).lastPathComponent)) {
              Label("Share file", systemImage: "square.and.arrow.up")
            }
            .accessibilityIdentifier("file-share")
          }
        }
        if isMarkdown, case .loaded(.text, _) = phase {
          ToolbarItem(placement: .topBarTrailing) {
            Picker("Markdown view", selection: $markdownPreview) {
              Image(systemName: "chevron.left.forwardslash.chevron.right")
                .accessibilityLabel("Show source").tag(false)
              Image(systemName: "eye").accessibilityLabel("Preview Markdown").tag(true)
            }
            .pickerStyle(.segmented)
            .fixedSize()
            .accessibilityIdentifier("markdown-mode")
          }
        }
      }
      .task(id: model.revision) { await load() }
  }

  /// The breadcrumb path above the file name.
  private var parent: String {
    let folder = (path as NSString).deletingLastPathComponent
    return folder.split(separator: "/").joined(separator: " › ")
  }

  @ViewBuilder private var content: some View {
    switch phase {
    case .loading:
      WorkspaceEmpty(message: "Loading file…")
    case .failed(let message):
      WorkspaceError(message: message) { Task { await load() } }
    case .tooLarge(let message):
      PanelUnavailable("File too large to preview", systemImage: "doc.badge.ellipsis", message: message)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("file-too-large")
    case .loaded(let file, let document):
      switch file {
      case .text(let text, _, _):
        if isMarkdown && markdownPreview {
          MarkdownPreview(text: text) { markdownPreview = false }
        } else if let document {
          CodeLines(document: document, highlighter: CodeHighlighter(path: path), identifier: "file-lines")
        }
      case .image(let uri, let bytes):
        ImagePreview(uri: uri, bytes: bytes, name: (path as NSString).lastPathComponent)
      case .pdf(let bytes):
        PDFPreview(model: model, path: path, bytes: bytes)
      case .video(_, let bytes):
        VideoPreview(model: model, path: path, bytes: bytes)
      case .docx(let data, _, let bytes):
        DocumentPreview(data: data, bytes: bytes, name: (path as NSString).lastPathComponent)
      case .binary(let bytes):
        WorkspaceEmpty(
          symbol: "doc.zipper", title: "Binary file",
          message: "\(bytes.formatted()) bytes. Text preview is unavailable.")
          .accessibilityIdentifier("binary-file")
      }
    }
  }

  private func load() async {
    do {
      let file = try await model.client.workspaceFile(directory: model.directory, path: path)
      if case .loaded(let current, _) = phase, current.identity == file.identity { return }
      var document: CodeDocument?
      if case .text(let text, _, _) = file { document = await Self.lines(text) }
      guard !Task.isCancelled else { return }
      phase = .loaded(file, document)
    } catch is CancellationError {
    } catch let error as GatewayError where error.status == 413 {
      phase = .tooLarge(error.message)
    } catch {
      phase = .failed(error.localizedDescription)
    }
  }

  @concurrent private static func lines(_ text: String) async -> CodeDocument {
    DiffParser.code(text)
  }
}

// MARK: - Media

/// A meta line above media, like the desktop's `.wb-subtoolbar` note.
private struct MediaBar<Trailing: View>: View {
  let note: String
  @ViewBuilder var trailing: Trailing
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 4) {
      Text(note)
        .font(.caption)
        .foregroundStyle(palette.color("text-tertiary"))
        .accessibilityIdentifier("media-note")
      Spacer(minLength: 8)
      trailing
    }
    .padding(.horizontal, 14)
    .frame(minHeight: 44)
    .overlay(alignment: .bottom) {
      Rectangle().fill(palette.color("border")).frame(height: 1 / 3)
    }
  }
}

/// Fit, zoom and pan, with the desktop's size note and zoom controls.
private struct ImagePreview: View {
  let uri: String
  let bytes: Int
  let name: String
  @State private var image: UIImage?
  @State private var zoom = ZoomController()
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      MediaBar(note: note) {
        Group {
          Button("Zoom out", systemImage: "minus") { zoom.step(-1) }
            .disabled(image == nil)
            .accessibilityIdentifier("image-zoom-out")
          Button("\(Int((zoom.scale * 100).rounded()))%") { zoom.actual() }
            .accessibilityLabel("Actual size")
            .accessibilityValue("\(Int((zoom.scale * 100).rounded()))%")
            .accessibilityIdentifier("image-zoom")
            .font(.caption.monospacedDigit())
            .frame(minWidth: 44)
          Button("Zoom in", systemImage: "plus") { zoom.step(1) }
            .disabled(image == nil)
            .accessibilityIdentifier("image-zoom-in")
          Button("Fit") { zoom.fit() }
            .font(.caption.weight(.medium))
            .accessibilityIdentifier("image-fit")
          if let image {
            ShareLink(
              item: Image(uiImage: image), preview: SharePreview(name, image: Image(uiImage: image))
            ) {
              Image(systemName: "square.and.arrow.down")
            }
            .accessibilityLabel("Download image")
          }
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
        .foregroundStyle(palette.color("text-secondary"))
        .frame(minWidth: 36, minHeight: 44)
      }
      if let image {
        ZoomableImage(image: image, controller: zoom)
          .accessibilityLabel("Image preview: \(name)")
          .accessibilityIdentifier("image-preview")
      } else {
        WorkspaceEmpty(message: "Loading file…")
      }
    }
    .task(id: uri.count) {
      image = await Self.decode(uri)
    }
  }

  private var note: String {
    let size = image.map { "\(Int($0.size.width * $0.scale)) × \(Int($0.size.height * $0.scale)) · " } ?? ""
    return size + ByteFormat.kilobytes(bytes)
  }

  @concurrent private static func decode(_ uri: String) async -> UIImage? {
    guard let comma = uri.firstIndex(of: ","),
      let data = Data(base64Encoded: String(uri[uri.index(after: comma)...]))
    else { return nil }
    return UIImage(data: data)?.preparingForDisplay()
  }
}

/// Drives `ZoomableImage` from SwiftUI buttons. 100% is one image pixel per point, like the
/// desktop's one image pixel per CSS pixel.
@Observable
final class ZoomController {
  var scale: CGFloat = 1
  @ObservationIgnored weak var view: ImageScrollView?
  private static let steps: [CGFloat] = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16]

  func fit() {
    guard let view else { return }
    view.setZoomScale(view.fitScale, animated: true)
  }

  func actual() { view?.setZoomScale(1, animated: true) }

  func step(_ direction: Int) {
    guard let view else { return }
    let current = view.zoomScale
    let next =
      direction > 0
      ? Self.steps.first { $0 > current + 0.001 } ?? 16
      : Self.steps.last { $0 < current - 0.001 } ?? view.minimumZoomScale
    view.setZoomScale(next, animated: true)
  }
}

private struct ZoomableImage: UIViewRepresentable {
  let image: UIImage
  let controller: ZoomController
  @Environment(\.palette) private var palette

  func makeUIView(context: Context) -> ImageScrollView {
    let view = ImageScrollView(image: image)
    view.onZoom = { [controller] scale in controller.scale = scale }
    controller.view = view
    return view
  }

  func updateUIView(_ view: ImageScrollView, context: Context) {
    view.backgroundColor = palette.ui("well")
    if view.imageView.image !== image { view.set(image) }
  }
}

final class ImageScrollView: UIScrollView, UIScrollViewDelegate {
  let imageView = UIImageView()
  var onZoom: ((CGFloat) -> Void)?
  /// The zoom that fits the whole image, never above 100%.
  private(set) var fitScale: CGFloat = 1
  private var fitted = CGSize.zero

  init(image: UIImage) {
    super.init(frame: .zero)
    delegate = self
    showsVerticalScrollIndicator = false
    showsHorizontalScrollIndicator = false
    contentInsetAdjustmentBehavior = .never
    decelerationRate = .fast
    maximumZoomScale = 16
    addSubview(imageView)
    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(toggle(_:)))
    doubleTap.numberOfTapsRequired = 2
    addGestureRecognizer(doubleTap)
    set(image)
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ image: UIImage) {
    zoomScale = 1
    imageView.image = image
    imageView.frame = CGRect(
      origin: .zero,
      size: CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale))
    contentSize = imageView.frame.size
    fitted = .zero
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if bounds.size != fitted, bounds.width > 0, imageView.bounds.width > 0 {
      fitted = bounds.size
      let size = imageView.bounds.size
      fitScale = min(1, bounds.width / size.width, bounds.height / size.height)
      minimumZoomScale = min(fitScale, 0.1)
      zoomScale = fitScale
      onZoom?(zoomScale)
    }
    center()
  }

  /// Keeps a smaller-than-screen image centered.
  private func center() {
    let x = max(0, (bounds.width - contentSize.width) / 2)
    let y = max(0, (bounds.height - contentSize.height) / 2)
    let inset = UIEdgeInsets(top: y, left: x, bottom: y, right: x)
    if contentInset != inset { contentInset = inset }
  }

  func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

  func scrollViewDidZoom(_ scrollView: UIScrollView) {
    center()
    onZoom?(zoomScale)
  }

  @objc private func toggle(_ gesture: UITapGestureRecognizer) {
    if zoomScale > fitScale * 1.01 {
      setZoomScale(fitScale, animated: true)
    } else {
      let point = gesture.location(in: imageView)
      let scale = min(maximumZoomScale, max(1, fitScale * 3))
      let size = CGSize(width: bounds.width / scale, height: bounds.height / scale)
      zoom(
        to: CGRect(
          x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width,
          height: size.height), animated: true)
    }
  }
}

/// PDFs stream from the gateway's media route (no 2 MiB bound) into PDFKit.
private struct PDFPreview: View {
  let model: WorkspaceModel
  let path: String
  let bytes: Int
  @State private var state: MediaState = .loading

  var body: some View {
    VStack(spacing: 0) {
      MediaBar(note: "\(ByteFormat.mebibytes(bytes)) · PDF") { EmptyView() }
      switch state {
      case .loading:
        WorkspaceEmpty(message: "Loading file…")
      case .failed(let message):
        WorkspaceError(message: message) { Task { await load() } }
      case .ready(let url):
        PDFKitView(url: url).accessibilityIdentifier("pdf-preview")
      }
    }
    .task(id: bytes) { await load() }
  }

  private func load() async {
    state = .loading
    do {
      state = .ready(try await model.client.downloadMedia(directory: model.directory, path: path))
    } catch is CancellationError {
    } catch {
      state = .failed(error.localizedDescription)
    }
  }
}

private enum MediaState {
  case loading
  case failed(String)
  case ready(URL)
}

private struct PDFKitView: UIViewRepresentable {
  let url: URL
  @Environment(\.palette) private var palette

  func makeUIView(context: Context) -> PDFView {
    let view = PDFView()
    view.autoScales = true
    view.displayMode = .singlePageContinuous
    view.document = PDFDocument(url: url)
    return view
  }

  func updateUIView(_ view: PDFView, context: Context) {
    view.backgroundColor = palette.ui("well")
    if view.document?.documentURL != url { view.document = PDFDocument(url: url) }
  }

  static func dismantleUIView(_ view: PDFView, coordinator: ()) {
    if let url = view.document?.documentURL {
      try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
    }
  }
}

/// Video plays from the media route's byte ranges, with the device token as a header.
private struct VideoPreview: View {
  let model: WorkspaceModel
  let path: String
  let bytes: Int
  @State private var player: AVPlayer?
  @State private var failed = false
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      MediaBar(note: "\(ByteFormat.mebibytes(bytes)) · Video") { EmptyView() }
      ZStack {
        palette.color("well")
        if let player, !failed {
          VideoPlayer(player: player).accessibilityIdentifier("video-preview")
        }
        if failed {
          VStack(spacing: 12) {
            Text(
              "This video could not be played. Its format or codec may not be supported, or the file may no longer be available. You can open it from your file manager in the desktop app."
            )
            .font(.footnote)
            .foregroundStyle(palette.color("text-secondary"))
            .multilineTextAlignment(.center)
            Button("Retry") { start() }.buttonStyle(WorkspaceButtonStyle())
          }
          .padding(24)
        }
      }
    }
    .onAppear { start() }
    .onDisappear {
      player?.pause()
      player = nil
    }
  }

  private func start() {
    failed = false
    let url = model.client.workspaceMediaURL(directory: model.directory, path: path)
    let asset = AVURLAsset(
      url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": model.client.authorizationHeaders])
    let item = AVPlayerItem(asset: asset)
    let player = AVPlayer(playerItem: item)
    self.player = player
    Task {
      for await status in item.publisher(for: \.status).values {
        if status == .failed { failed = true }
        if status != .unknown { break }
      }
    }
  }
}

/// Word documents in QuickLook, read-only like the desktop's converted preview.
private struct DocumentPreview: View {
  let data: String
  let bytes: Int
  let name: String
  @State private var url: URL?

  var body: some View {
    Group {
      if let url {
        QuickLookView(url: url).accessibilityIdentifier("document-preview")
      } else {
        WorkspaceEmpty(message: "Loading document…")
      }
    }
    .task(id: data.count) {
      url = await Self.write(data, name: name)
    }
    .onDisappear {
      if let url { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
    }
  }

  @concurrent private static func write(_ base64: String, name: String) async -> URL? {
    guard let data = Data(base64Encoded: base64) else { return nil }
    let folder = FileManager.default.temporaryDirectory.appending(path: "workspace-\(UUID().uuidString)")
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let url = folder.appending(path: name)
    return (try? data.write(to: url)) == nil ? nil : url
  }
}

private struct QuickLookView: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> QLPreviewController {
    let controller = QLPreviewController()
    controller.dataSource = context.coordinator
    return controller
  }

  func updateUIViewController(_ controller: QLPreviewController, context: Context) {
    context.coordinator.url = url
    controller.reloadData()
  }

  func makeCoordinator() -> Coordinator { Coordinator(url: url) }

  final class Coordinator: NSObject, QLPreviewControllerDataSource {
    var url: URL
    init(url: URL) { self.url = url }
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
      url as NSURL
    }
  }
}
