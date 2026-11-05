import SwiftUI

extension View {
  /// DEBUG launch arguments that open the side chat, Tasks and Apps screens directly, for UI
  /// tests and screenshots. Mount once on the paired root (e.g. `HomeView`'s body):
  ///
  /// - `-tasks YES` opens Tasks (`-tasksDemo YES` adds a fixed local board for a gateway
  ///   without the tasks plugin).
  /// - `-apps YES` opens Apps, `-app <id>` one app, and `-canvas <id>` one canvas full-size.
  /// - `-sideChat <sessionID>` opens that main chat's side chats.
  func extrasDebugLaunch(client: GatewayClient, events: EventHub) -> some View {
    #if DEBUG
      modifier(ExtrasDebugLaunch(client: client, events: events))
    #else
      self
    #endif
  }
}

#if DEBUG
  private struct ExtrasDebugLaunch: ViewModifier {
    let client: GatewayClient
    let events: EventHub

    enum Screen: Identifiable {
      case tasks, apps, app(String), canvas(String), sideChat(String)
      var id: String {
        switch self {
        case .tasks: "tasks"
        case .apps: "apps"
        case .app(let id): "app:\(id)"
        case .canvas(let id): "canvas:\(id)"
        case .sideChat(let id): "side:\(id)"
        }
      }
    }

    @State private var screen: Screen? = {
      let defaults = UserDefaults.standard
      if let id = defaults.string(forKey: "sideChat") { return .sideChat(id) }
      if let id = defaults.string(forKey: "canvas") { return .canvas(id) }
      if let id = defaults.string(forKey: "app") { return .app(id) }
      if defaults.bool(forKey: "tasks") { return .tasks }
      if defaults.bool(forKey: "apps") { return .apps }
      return nil
    }()

    func body(content: Content) -> some View {
      content
        .fullScreenCover(item: tasksOrApps) { screen in
          NavigationStack {
            Group {
              switch screen {
              case .tasks: TasksScreen(client: client, events: events) { print("open session \($0)") }
              case .apps: AppsScreen(client: client, events: events)
              case .app(let id): AppsScreen(client: client, events: events, app: id)
              case .canvas(let id):
                CanvasPanel(client: client, events: events, id: id, title: id)
                  .navigationTitle(id)
                  .navigationBarTitleDisplayMode(.inline)
              case .sideChat: EmptyView()
              }
            }
            .toolbar {
              ToolbarItem(placement: .topBarLeading) {
                Button("Close", systemImage: "xmark") { self.screen = nil }
              }
            }
          }
        }
        .sheet(item: sideChat) { screen in
          if case .sideChat(let id) = screen {
            SideChatSheet(client: client, events: events, mainID: id)
          }
        }
    }

    private var tasksOrApps: Binding<Screen?> {
      Binding {
        if case .sideChat = screen { return nil }
        return screen
      } set: { screen = $0 }
    }

    private var sideChat: Binding<Screen?> {
      Binding {
        if case .sideChat = screen { return screen }
        return nil
      } set: { screen = $0 }
    }
  }
#endif
