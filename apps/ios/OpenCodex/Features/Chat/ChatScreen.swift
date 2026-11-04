import SwiftUI

/// Where the threads list navigates.
enum ChatRoute: Hashable {
  case session(String)
  /// An unsent chat in a project directory; the first message creates it.
  case new(directory: String)
}

/// One chat: the transcript, with pending requests and the composer docked at the bottom.
struct ChatScreen: View {
  @State private var model: ChatModel

  init(client: GatewayClient, events: EventHub, route: ChatRoute) {
    switch route {
    case .session(let id):
      _model = State(initialValue: ChatModel(client: client, events: events, sessionID: id))
    case .new(let directory):
      _model = State(initialValue: ChatModel(client: client, events: events, directory: directory))
    }
  }

  var body: some View {
    TranscriptView(model: model)
      .safeAreaInset(edge: .bottom, spacing: 0) {
        VStack(spacing: 0) {
          RequestsView(model: model)
          ComposerView(model: model)
        }
      }
      .navigationTitle(model.title)
      .navigationBarTitleDisplayMode(.inline)
      .task { await model.run() }
      .task(id: model.session?.time.idle) { await model.markViewed() }
  }
}
