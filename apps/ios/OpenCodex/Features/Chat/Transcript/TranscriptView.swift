import SwiftUI

/// Placeholder; replaced by the transcript.
struct TranscriptView: View {
  let model: ChatModel

  var body: some View {
    List(model.messages) { message in
      Text(message.id).font(.caption)
    }
  }
}
