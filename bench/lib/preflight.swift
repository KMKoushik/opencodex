import Cocoa
import ApplicationServices
import CoreGraphics

// --permissions is safe to exercise while locked. No prompting or automatic grants.
if CommandLine.arguments.contains("--permissions") || CommandLine.arguments.contains("--test-denied") {
    let denied = CommandLine.arguments.contains("--test-denied")
    var failed = false
    if denied || !AXIsProcessTrusted() {
        fputs("Grant Accessibility to the terminal running this command (Terminal/iTerm/OpenCodex) in System Settings > Privacy & Security > Accessibility, then restart that terminal. Also grant Automation > System Events when macOS asks.\n", stderr)
        failed = true
    }
    if denied || !CGPreflightScreenCaptureAccess() {
        fputs("Grant Screen Recording to the terminal running this command in System Settings > Privacy & Security > Screen & System Audio Recording (Screen Recording on older macOS), then quit and reopen it.\n", stderr)
        failed = true
    }
    exit(failed ? 3 : 0)
}
// A real probe window catches an inactive/full-screen Space before benchmarks launch.
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let rect = NSRect(x: 80, y: 80, width: 420, height: 240)
let window = NSWindow(contentRect: rect, styleMask: [.titled, .closable], backing: .buffered, defer: false)
window.title = "OpenCodex benchmark visibility probe"
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
RunLoop.current.run(until: Date().addingTimeInterval(1))
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let visible = windows.contains { ($0[kCGWindowNumber as String] as? Int) == window.windowNumber && ($0[kCGWindowLayer as String] as? Int) == 0 }
window.orderOut(nil)
if !visible {
    fputs("The test window is not on screen. Exit full-screen OpenCodex/other apps (Control-Command-F), switch to a normal Desktop Space, and rerun. Keep both test windows unobstructed.\n", stderr)
    exit(4)
}
print("Visibility probe passed (CGWindowList).")
