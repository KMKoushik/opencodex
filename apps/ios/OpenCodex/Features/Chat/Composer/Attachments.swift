import SwiftUI
import UIKit

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

/// The system camera, for taking a photo to attach.
struct CameraPicker: UIViewControllerRepresentable {
  var onPick: (UIImage) -> Void
  @Environment(\.dismiss) private var dismiss

  static var available: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let parent: CameraPicker
    init(_ parent: CameraPicker) { self.parent = parent }

    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      if let image = info[.originalImage] as? UIImage { parent.onPick(image) }
      parent.dismiss()
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
  }
}

/// Removable thumbnails above the input.
struct AttachmentStrip: View {
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
                Image(systemName: "xmark")
                  .font(.system(size: 9, weight: .bold))
                  .foregroundStyle(.white)
                  .frame(width: 20, height: 20)
                  .background(.black.opacity(0.65), in: .circle)
                  .overlay(Circle().stroke(.white.opacity(0.8), lineWidth: 1))
                  .padding(4)
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
            .background(.fill.tertiary, in: .rect(cornerRadius: 12))
            .accessibilityLabel("Preparing photo")
        }
      }
      .padding(.horizontal, 14)
      .padding(.top, 12)
    }
    .scrollClipDisabled()
  }
}
