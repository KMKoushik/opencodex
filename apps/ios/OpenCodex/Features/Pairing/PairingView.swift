import SwiftUI

/// The first screen on an unpaired iPhone: scan the computer's pairing code, or enter it by hand.
/// Once a pairing succeeds the root view switches to Home on its own.
struct PairingView: View {
  @Environment(ConnectionStore.self) private var connection
  @Environment(\.palette) private var palette
  @State private var sheet: Sheet?
  @State private var pairing = false
  @State private var failure: String?

  private enum Sheet: Identifiable {
    case scan, manual
    var id: Self { self }
  }

  var body: some View {
    GeometryReader { proxy in
      ScrollView {
        welcome
          .padding(.horizontal, 32)
          .padding(.vertical, 24)
          .frame(maxWidth: .infinity, minHeight: proxy.size.height)
      }
      .scrollBounceBehavior(.basedOnSize)
    }
    .background(palette.color("surface"))
    .safeAreaInset(edge: .bottom) { actions }
    .sheet(item: $sheet) { sheet in
      switch sheet {
      case .scan:
        ScanSheet(
          onScan: { input in
            self.sheet = nil
            pair(input)
          },
          onManual: { self.sheet = .manual })
      case .manual:
        ManualPairingView()
      }
    }
    .alert(
      "Couldn’t Pair", isPresented: .init(get: { failure != nil }, set: { _ in failure = nil })
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(failure ?? "")
    }
    // `opencodex://pair?link=<url-encoded pairing link>`
    .onOpenURL { url in
      guard let input = ConnectionStore.PairingInput(appURL: url) else { return }
      sheet = nil
      pair(input)
    }
  }

  private var welcome: some View {
    VStack(spacing: 24) {
      BrandIcon(size: 112)
      VStack(spacing: 12) {
        Text("Pair with Your Computer")
          .font(.largeTitle.bold())
          .foregroundStyle(palette.color("text"))
          .accessibilityAddTraits(.isHeader)
        Text(
          "On your computer, open OpenCodex → Settings → Remote access → Add device, then scan the code."
        )
        .font(.body)
        .foregroundStyle(palette.color("text-secondary"))
      }
      .multilineTextAlignment(.center)
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var actions: some View {
    VStack(spacing: 4) {
      Button {
        sheet = .scan
      } label: {
        HStack(spacing: 8) {
          if pairing {
            ProgressView()
            Text("Pairing…")
          } else {
            Label("Scan Code", systemImage: "qrcode.viewfinder")
          }
        }
        .frame(maxWidth: .infinity, minHeight: 32)
      }
      .buttonStyle(.glassProminent)
      .controlSize(.large)
      .accessibilityIdentifier("pairing.scan")

      Button("Enter Code Manually") { sheet = .manual }
        .foregroundStyle(palette.color("text"))
        .frame(minHeight: 44)
        .accessibilityIdentifier("pairing.manual")
    }
    .disabled(pairing)
    .padding(.horizontal, 24)
    .padding(.bottom, 8)
  }

  private func pair(_ input: ConnectionStore.PairingInput) {
    guard !pairing else { return }
    pairing = true
    Task {
      do {
        try await connection.pair(input)
      } catch {
        failure = PairingFailure.message(error)
        pairing = false
      }
    }
  }
}
