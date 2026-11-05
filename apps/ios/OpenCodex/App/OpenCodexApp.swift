import SwiftUI

@main
struct OpenCodexApp: App {
  @UIApplicationDelegateAdaptor(NotificationAppDelegate.self) private var notificationDelegate
  @State private var connection = ConnectionStore()
  @State private var themes = ThemeStore()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(connection)
        .modifier(Themed())
        .environment(themes)
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
          .modifier(NotificationsHost(client: client, events: connection.events))
          // A different gateway is a different app state; drop every screen's snapshots.
          .id(client.base)
      }
    }
  }
}
