import Cocoa
import ApplicationServices

// Explicit opt-in OS input injection. Never interact with any other app.
guard CommandLine.arguments.count == 3, let pid = Int32(CommandLine.arguments[1]) else { exit(2) }
guard AXIsProcessTrusted() else {
    fputs("Native scrolling/typing requires Accessibility permission for the benchmark terminal.\n", stderr)
    exit(3)
}
guard let app = NSRunningApplication(processIdentifier: pid) else { exit(4) }
app.activate(options: [.activateIgnoringOtherApps])
Thread.sleep(forTimeInterval: 0.2)
let source = CGEventSource(stateID: .hidSystemState)
if CommandLine.arguments[2] == "scroll" {
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    guard let window = windows.first(where: { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }),
          let bounds = window[kCGWindowBounds as String] as? NSDictionary,
          let rect = CGRect(dictionaryRepresentation: bounds) else { exit(5) }
    for i in 0..<240 {
        let event = CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 1, wheel1: i < 120 ? 60 : -60, wheel2: 0, wheel3: 0)
        event?.location = CGPoint(x: rect.minX + rect.width * 0.65, y: rect.minY + rect.height * 0.45)
        event?.postToPid(pid)
        Thread.sleep(forTimeInterval: 1.0 / 120.0)
    }
} else {
    // Focus composer via the app's own shortcut, then type without submitting.
    let focus = CGEvent(keyboardEventSource: source, virtualKey: 37, keyDown: true)
    focus?.flags = [.maskCommand, .maskShift]; focus?.postToPid(pid)
    CGEvent(keyboardEventSource: source, virtualKey: 37, keyDown: false)?.postToPid(pid)
    Thread.sleep(forTimeInterval: 0.2)
    for _ in 0..<30 {
        CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)?.postToPid(pid)
        CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)?.postToPid(pid)
        Thread.sleep(forTimeInterval: 0.08)
    }
}
