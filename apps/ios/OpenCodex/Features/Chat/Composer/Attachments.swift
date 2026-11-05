import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

nonisolated enum AttachmentEncoder {
  static let maxSide: CGFloat = 2048
  static let maxBytes = 10 * 1024 * 1024
  /// The gateway's per-message image total.
  static let maxTotalBytes = 80 * 1024 * 1024
  static let maxCount = 10

  struct Encoded: Sendable {
    var jpeg: Data
    var thumbnail: Data
  }

  struct Failure: LocalizedError {
    var errorDescription: String?
  }

  /// Downscales to 2048 px on the longest side and encodes JPEG under 10 MB, off the main actor.
  @concurrent static func encode(_ image: UIImage) async throws -> Encoded {
    let full = draw(image, maxSide: maxSide, opaque: true)
    var quality: CGFloat = 0.8
    var jpeg = full.jpegData(compressionQuality: quality)
    while let data = jpeg, data.count > maxBytes, quality > 0.3 {
      quality -= 0.15
      jpeg = full.jpegData(compressionQuality: quality)
    }
    guard let jpeg, jpeg.count <= maxBytes else {
      throw Failure(errorDescription: "This photo is too large to attach.")
    }
    let thumbnail = draw(full, maxSide: 180, opaque: true).jpegData(compressionQuality: 0.7) ?? Data()
    return Encoded(jpeg: jpeg, thumbnail: thumbnail)
  }

  @concurrent static func encode(data: Data) async throws -> Encoded {
    guard let image = UIImage(data: data) else {
      throw Failure(errorDescription: "This photo couldn’t be read.")
    }
    return try await encode(image)
  }

  private static func draw(_ image: UIImage, maxSide: CGFloat, opaque: Bool) -> UIImage {
    let size = image.size
    let scale = min(1, maxSide / max(size.width, size.height, 1))
    let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = opaque
    // Drawing also bakes in the photo's orientation.
    return UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
    }
  }
}

extension DraftAttachment {
  init(_ encoded: AttachmentEncoder.Encoded) {
    self.init(
      name: "photo-\(UUID().uuidString.prefix(8).lowercased()).jpg",
      uri: "data:image/jpeg;base64," + encoded.jpeg.base64EncodedString(),
      bytes: encoded.jpeg.count,
      thumbnail: UIImage(data: encoded.thumbnail) ?? UIImage())
  }
}

/// The system photo library and camera, presented from UIKit's topmost view controller.
///
/// SwiftUI's `.photosPicker` / `.fullScreenCover` silently drop the request when their host is
/// mid-transition (the "+" menu still closing) or something else is presented, which showed up
/// on device as "nothing opens". Presenting from the top, after any running transition, can't
/// be dropped that way.
@MainActor
enum MediaPicker {
  static var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

  /// The delegate of the open picker; UIKit holds delegates weakly.
  private static var delegate: NSObject?

  /// Picks up to `limit` photos; `onPick` gets each one's image data (HEIC, JPEG, …).
  static func pickPhotos(limit: Int, onPick: @escaping ([Data]) -> Void) {
    var configuration = PHPickerConfiguration()
    configuration.filter = .images
    configuration.selectionLimit = max(1, limit)
    configuration.preferredAssetRepresentationMode = .compatible
    let picker = PHPickerViewController(configuration: configuration)
    let library = LibraryDelegate(onPick: onPick)
    delegate = library
    picker.delegate = library
    present(picker)
  }

  static func takePhoto(onPick: @escaping (UIImage) -> Void) {
    guard cameraAvailable else { return }
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    let camera = CameraDelegate(onPick: onPick)
    delegate = camera
    picker.delegate = camera
    present(picker)
  }

  private static func present(_ controller: UIViewController, attempt: Int = 0) {
    guard let top = topController() else { return }
    // Wait out a running transition, such as a menu or sheet still closing.
    if let coordinator = top.transitionCoordinator, attempt < 10 {
      coordinator.animate(alongsideTransition: nil) { _ in present(controller, attempt: attempt + 1) }
      return
    }
    if top.isBeingDismissed || top.isBeingPresented, attempt < 10 {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { present(controller, attempt: attempt + 1) }
      return
    }
    top.present(controller, animated: true)
  }

  private static func topController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window =
      scenes.filter { $0.activationState == .foregroundActive }.flatMap(\.windows).first(where: \.isKeyWindow)
      ?? scenes.flatMap(\.windows).first(where: \.isKeyWindow)
    var top = window?.rootViewController
    while let next = top?.presentedViewController, !next.isBeingDismissed { top = next }
    return top
  }

  private final class LibraryDelegate: NSObject, PHPickerViewControllerDelegate {
    let onPick: ([Data]) -> Void
    init(onPick: @escaping ([Data]) -> Void) { self.onPick = onPick }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      picker.dismiss(animated: true)
      MediaPicker.delegate = nil
      guard !results.isEmpty else { return }
      let providers = results.map(\.itemProvider)
      let onPick = onPick
      Task {
        var images: [Data] = []
        for provider in providers {
          if let data = await Self.imageData(provider) { images.append(data) }
        }
        onPick(images)
      }
    }

    private static func imageData(_ provider: NSItemProvider) async -> Data? {
      await withCheckedContinuation { continuation in
        provider.loadDataRepresentation(for: .image) { data, _ in continuation.resume(returning: data) }
      }
    }
  }

  private final class CameraDelegate: NSObject, UIImagePickerControllerDelegate,
    UINavigationControllerDelegate
  {
    let onPick: (UIImage) -> Void
    init(onPick: @escaping (UIImage) -> Void) { self.onPick = onPick }

    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      if let image = info[.originalImage] as? UIImage { onPick(image) }
      picker.dismiss(animated: true)
      MediaPicker.delegate = nil
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
      picker.dismiss(animated: true)
      MediaPicker.delegate = nil
    }
  }
}

/// Removable thumbnails above the input.
struct AttachmentStrip: View {
  @Environment(\.palette) private var palette
  let attachments: [DraftAttachment]
  /// Photos still being prepared.
  var encoding = 0
  var onRemove: (DraftAttachment) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(attachments) { attachment in
          Image(uiImage: attachment.thumbnail)
            .resizable()
            .scaledToFill()
            .frame(width: 56, height: 56)
            .clipShape(.rect(cornerRadius: 12))
            .overlay(alignment: .topTrailing) {
              Button {
                onRemove(attachment)
              } label: {
                Image(systemName: "xmark.circle.fill")
                  .font(.system(size: 20))
                  .symbolRenderingMode(.palette)
                  .foregroundStyle(.white, .black.opacity(0.6))
                  .padding(3)
                  .contentShape(.rect)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Remove \(attachment.name)")
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Attached photo")
        }
        ForEach(0..<encoding, id: \.self) { _ in
          ProgressView()
            .frame(width: 56, height: 56)
            .background(palette.color("secondary"), in: .rect(cornerRadius: 12))
            .accessibilityLabel("Preparing photo")
        }
      }

    }
    .scrollClipDisabled()
  }
}
