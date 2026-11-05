import XCTest

/// Launches the app against a loopback gateway (the simulator shares the Mac's network).
/// Set `OPENCODEX_GATEWAY` in the test scheme's environment, or it defaults to the dev port.
extension XCUIApplication {
  static func opencodex(_ arguments: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    let gateway = ProcessInfo.processInfo.environment["OPENCODEX_GATEWAY"] ?? "http://127.0.0.1:4310"
    app.launchArguments = ["-gateway", gateway] + arguments
    return app
  }
}
