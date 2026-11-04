import AVFoundation
import SwiftUI
import VisionKit

/// The camera sheet. It finds the pairing QR code shown on the computer and hands back its link.
struct ScanSheet: View {
  var onScan: (ConnectionStore.PairingInput) -> Void
  var onManual: () -> Void

  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var access: Access?
  @State private var scanned = false
  @State private var wrongCode = false

  enum Access {
    case ready
    /// No camera, or a device that can't run the scanner (the simulator).
    case unsupported
    /// The user turned camera access off for OpenCodex.
    case denied
    /// Screen Time or a profile blocks the camera.
    case restricted
  }

  var body: some View {
    NavigationStack {
      Group {
        switch access {
        case nil:
          ProgressView()
        case .ready:
          camera
        case .unsupported:
          unavailable(
            "Scanning Isn’t Available", systemImage: "qrcode.viewfinder",
            "This device can’t scan codes. Enter the code shown on your computer instead.")
        case .restricted:
          unavailable(
            "Camera Is Restricted", systemImage: "camera.slash",
            "This iPhone doesn’t allow camera use. Enter the code shown on your computer instead.")
        case .denied:
          unavailable(
            "Camera Access Is Off", systemImage: "camera.slash",
            "Allow camera access in Settings to scan the pairing code, or enter the code instead.",
            settings: true)
        }
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
            .accessibilityIdentifier("pairing.scan.cancel")
        }
      }
    }
    .sensoryFeedback(.success, trigger: scanned)
    .sensoryFeedback(.warning, trigger: wrongCode) { _, wrong in wrong }
    .task { access = await Self.checkAccess() }
  }

  private var camera: some View {
    QRScanner { payload in
      guard !scanned else { return }
      if let input = ConnectionStore.PairingInput(link: payload) {
        scanned = true
        onScan(input)
      } else {
        wrongCode = true
      }
    }
    .ignoresSafeArea()
    .accessibilityLabel("Camera viewfinder")
    .overlay(alignment: .bottom) {
      VStack(spacing: 12) {
        Text(
          wrongCode
            ? "That isn’t an OpenCodex pairing code."
            : "Point the camera at the code in Remote access → Add device on your computer."
        )
        .font(.callout)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .glassEffect(in: .rect(cornerRadius: 22))
        .contentTransition(.opacity)
        .animation(.default, value: wrongCode)

        Button("Enter Code Instead", action: onManual)
          .buttonStyle(.glass)
          .controlSize(.large)
      }
      .padding(.horizontal, 24)
      .padding(.bottom, 12)
    }
    // The camera is dark whatever the system appearance; keep the chrome legible over it.
    .environment(\.colorScheme, .dark)
  }

  private func unavailable(
    _ title: LocalizedStringKey, systemImage: String, _ description: LocalizedStringKey,
    settings: Bool = false
  ) -> some View {
    ContentUnavailableView {
      Label(title, systemImage: systemImage)
    } description: {
      Text(description)
    } actions: {
      if settings {
        Button("Open Settings") {
          if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
        }
        .buttonStyle(.glassProminent)
        .controlSize(.large)
        Button("Enter Code Instead", action: onManual)
          .buttonStyle(.glass)
          .controlSize(.large)
          .accessibilityIdentifier("pairing.scan.manual")
      } else {
        Button("Enter Code Instead", action: onManual)
          .buttonStyle(.glassProminent)
          .controlSize(.large)
          .accessibilityIdentifier("pairing.scan.manual")
      }
    }
  }

  private static func checkAccess() async -> Access {
    guard DataScannerViewController.isSupported else { return .unsupported }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .notDetermined:
      guard await AVCaptureDevice.requestAccess(for: .video) else { return .denied }
    case .denied:
      return .denied
    case .restricted:
      return .restricted
    default:
      break
    }
    return DataScannerViewController.isAvailable ? .ready : .restricted
  }
}

/// VisionKit's live scanner, limited to QR codes.
private struct QRScanner: UIViewControllerRepresentable {
  var onCode: (String) -> Void

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let scanner = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .balanced,
      recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false,
      isPinchToZoomEnabled: true,
      isGuidanceEnabled: true,
      isHighlightingEnabled: true)
    scanner.delegate = context.coordinator
    return scanner
  }

  func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
    context.coordinator.onCode = onCode
    if !scanner.isScanning { try? scanner.startScanning() }
  }

  static func dismantleUIViewController(
    _ scanner: DataScannerViewController, coordinator: Coordinator
  ) {
    scanner.stopScanning()
  }

  func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    var onCode: (String) -> Void

    init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

    func dataScanner(
      _ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
      allItems: [RecognizedItem]
    ) {
      for case .barcode(let barcode) in addedItems {
        if let payload = barcode.payloadStringValue { onCode(payload) }
      }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
      if case .barcode(let barcode) = item, let payload = barcode.payloadStringValue {
        onCode(payload)
      }
    }
  }
}
