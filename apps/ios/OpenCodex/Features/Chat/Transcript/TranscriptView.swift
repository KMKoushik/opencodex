import SwiftUI

/// The chat transcript, with loading, empty and error states around the UIKit list.
struct TranscriptView: View {
  let model: ChatModel
  @Environment(\.palette) private var palette

  var body: some View {
    TranscriptList(model: model)
      // The list scrolls under the navigation bar and ends at the composer, which the
      // screen docks as a safe-area inset (so the keyboard moves both).
      .ignoresSafeArea(.container, edges: .top)
      .overlay {
        if !model.loaded {
          ProgressView()
            .controlSize(.large)
            .accessibilityIdentifier("transcript.loading")
        } else if isEmpty {
          EmptyTranscript(project: project)
        }
      }
      .overlay(alignment: .top) {
        if let error = model.error {
          ErrorBanner(message: error) { model.error = nil }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
      }
      .animation(.snappy, value: model.error)
      // The chat's page color, under the navigation bar and composer too.
      .background(palette.color("surface").ignoresSafeArea())
  }

  private var isEmpty: Bool {
    model.messages.isEmpty && model.inbox.isEmpty && !model.running && model.error == nil
      && !model.undone
  }

  private var project: String? {
    guard let directory = model.session?.location.directory ?? model.directory else { return nil }
    return (directory as NSString).lastPathComponent
  }
}

private struct TranscriptList: UIViewControllerRepresentable {
  let model: ChatModel
  @Environment(\.palette) private var palette

  func makeUIViewController(context: Context) -> TranscriptViewController {
    let controller = TranscriptViewController(model: model)
    controller.setPalette(palette)
    return controller
  }

  func updateUIViewController(_ controller: TranscriptViewController, context: Context) {
    controller.setPalette(palette)
  }
}

private struct EmptyTranscript: View {
  let project: String?
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 6) {
      Image(systemName: "sparkles")
        .font(.system(size: 28, weight: .light))
        .foregroundStyle(palette.color("text-tertiary"))
        .padding(.bottom, 6)
      Text("Ask anything")
        .font(.title2.weight(.semibold))
        .foregroundStyle(palette.color("text"))
      if let project {
        Text("in \(project)")
          .font(.body)
          .foregroundStyle(palette.color("text-secondary"))
      }
    }
    .multilineTextAlignment(.center)
    .padding(32)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("transcript.empty")
  }
}

private struct ErrorBanner: View {
  let message: String
  let dismiss: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Button(action: dismiss) {
      HStack(spacing: 8) {
        Image(systemName: "exclamationmark.triangle.fill")
          .foregroundStyle(palette.color("warning"))
        Text(message)
          .font(.footnote)
          .foregroundStyle(palette.color("text"))
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        Spacer(minLength: 0)
        Image(systemName: "xmark")
          .font(.caption.weight(.semibold))
          .foregroundStyle(palette.color("text-secondary"))
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 10)
      .glassEffect(.regular, in: .capsule)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("transcript.error")
  }
}
