import SwiftUI

/// Placeholder; replaced by the composer.
struct ComposerView: View {
  let model: ChatModel
  @State private var text = ""

  var body: some View {
    HStack {
      TextField("Message", text: $text)
      Button("Send") {
        let text = self.text
        self.text = ""
        Task { try? await model.send(text, model: nil) }
      }
    }
    .padding()
    .background(.bar)
  }
}
