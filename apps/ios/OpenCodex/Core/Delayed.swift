import SwiftUI

/// Shows its content only after a pause, so a load that finishes quickly never flashes a
/// loading state (T3 Code waits 400 ms before its status indicators).
struct Delayed<Content: View>: View {
  var delay: Duration = .milliseconds(400)
  @ViewBuilder let content: Content
  @State private var shown = false

  var body: some View {
    ZStack {
      if shown { content }
    }
    .task {
      try? await Task.sleep(for: delay)
      if !Task.isCancelled { shown = true }
    }
  }
}

/// The native spinner, after the same pause.
struct DelayedProgress: View {
  var body: some View {
    Delayed { ProgressView() }
  }
}
