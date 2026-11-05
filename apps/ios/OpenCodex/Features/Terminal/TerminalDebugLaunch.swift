import SwiftUI
import UIKit

/// DEBUG only: `-terminal <directory>` (with `-gateway <url>`) opens TerminalScreen over the app
/// at launch, so UI tests and screenshots reach it without a toolbar button. A C constructor
/// (`TerminalDebugLaunch.c`) calls this before `main`, which keeps the hook inside this folder.
@_cdecl("opencodex_terminal_debug_launch")
nonisolated func terminalDebugLaunch() {
  #if DEBUG
    guard ProcessInfo.processInfo.arguments.contains("-terminal") else { return }
    nonisolated(unsafe) var token: NSObjectProtocol?
    token = NotificationCenter.default.addObserver(
      forName: UIScene.didActivateNotification, object: nil, queue: .main
    ) { _ in
      MainActor.assumeIsolated {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let root = scenes.lazy.compactMap(\.keyWindow).first?.rootViewController,
          let directory = UserDefaults.standard.string(forKey: "terminal"),
          let gateway = UserDefaults.standard.string(forKey: "gateway").flatMap(URL.init(string:))
        else { return }
        if let token { NotificationCenter.default.removeObserver(token) }
        let host = UIHostingController(
          rootView: TerminalDebugRoot(client: GatewayClient(base: gateway, token: nil), directory: directory))
        host.modalPresentationStyle = .fullScreen
        // A separate presentation, so apply the saved light/dark mode as the app root does.
        host.overrideUserInterfaceStyle =
          switch ThemeStore().colorScheme {
          case .dark: .dark
          case .light: .light
          default: .unspecified
          }
        root.present(host, animated: false)
      }
    }
  #endif
}

#if DEBUG
  private struct TerminalDebugRoot: View {
    let client: GatewayClient
    let directory: String
    @State private var themes = ThemeStore()
    @State private var events = EventHub()

    var body: some View {
      TerminalScreen(client: client, events: events, directory: directory)
        .modifier(Themed())
        .environment(themes)
        .task { events.start(client) }
    }
  }
#endif
