import SwiftUI

@main
struct OpenCodexApp: App {
  @State private var connection = ConnectionStore()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(connection)
    }
  }
}

struct RootView: View {
  @Environment(ConnectionStore.self) private var connection

  var body: some View {
    switch connection.state {
    case .unpaired:
      PairingView()
    case .paired:
      if let client = connection.client {
        HomeView(client: client)
          // A different gateway is a different app state; drop every screen's snapshots.
          .id(client.base)
      }
    }
  }
}
