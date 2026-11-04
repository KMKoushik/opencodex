import SwiftUI

/// Placeholder; replaced by the threads screen.
struct HomeView: View {
  let client: GatewayClient
  @Environment(ConnectionStore.self) private var connection
  @State private var sessions: [SessionSummary] = []
  @State private var error: String?
  @State private var path: [ChatRoute] = []

  var body: some View {
    NavigationStack(path: $path) {
      List(sessions) { session in
        NavigationLink(session.title, value: ChatRoute.session(session.id))
      }
      .overlay {
        if let error { Text(error).foregroundStyle(.red) }
      }
      .navigationTitle("Threads")
      .navigationDestination(for: ChatRoute.self) { route in
        ChatScreen(client: client, events: connection.events, route: route)
      }
      .task {
        do {
          sessions = try await client.searchSessions().sessions
        } catch {
          self.error = error.localizedDescription
        }
        // Tests can open a chat directly with `-session <id>`.
        if let id = UserDefaults.standard.string(forKey: "session") { path = [.session(id)] }
      }
    }
  }
}
