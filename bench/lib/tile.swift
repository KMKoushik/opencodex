import Cocoa
import ApplicationServices

// --geometry is safe while locked; --dry-run validates the same layout without AX writes.
let screen = NSScreen.main!
let r = screen.visibleFrame
let top = screen.frame.height - r.maxY
let width = floor(r.width / 2)
if CommandLine.arguments.contains("--geometry") {
    print("\(Int(r.minX)),\(Int(top)),\(Int(r.width)),\(Int(r.height))"); exit(0)
}
if CommandLine.arguments.contains("--dry-run") {
    print("Electron: \(r.minX),\(top),\(width),\(r.height); Rune: \(r.minX + width),\(top),\(width),\(r.height)")
    exit(0)
}
guard AXIsProcessTrusted(), CommandLine.arguments.count == 3 else {
    fputs("Window tiling requires Accessibility for the invoking terminal in System Settings > Privacy & Security.\n", stderr); exit(3)
}
for (index, arg) in CommandLine.arguments.dropFirst().enumerated() {
    guard let pid = Int32(arg) else { exit(2) }
    let app = AXUIElementCreateApplication(pid)
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value) == .success,
          let windows = value as? [AXUIElement], let window = windows.first else {
        fputs("No accessible benchmark window for pid \(pid). Exit full-screen Spaces and keep it visible.\n", stderr); exit(4)
    }
    var point = CGPoint(x: r.minX + Double(index) * width, y: top)
    var size = CGSize(width: width, height: r.height)
    let p = AXValueCreate(.cgPoint, &point)!
    let s = AXValueCreate(.cgSize, &size)!
    guard AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, s) == .success,
          AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, p) == .success else {
        fputs("Could not tile benchmark windows with Accessibility.\n", stderr); exit(5)
    }
    // Read back; minimum sizes must not silently produce overlapping panes.
    var actual: CFTypeRef?
    AXUIElementCopyAttributeValue(window, kAXSizeAttribute as CFString, &actual)
    var measured = CGSize.zero
    if let actual { AXValueGetValue(actual as! AXValue, .cgSize, &measured) }
    guard abs(measured.width - width) < 4 else {
        fputs("Display too narrow for two equal app windows. Set a higher scaled display resolution (at least 1520 logical pixels wide), then rerun.\n", stderr); exit(6)
    }
    var actualPosition: CFTypeRef?
    AXUIElementCopyAttributeValue(window, kAXPositionAttribute as CFString, &actualPosition)
    var measuredPosition = CGPoint.zero
    if let actualPosition { AXValueGetValue(actualPosition as! AXValue, .cgPoint, &measuredPosition) }
    guard abs(measuredPosition.x - point.x) < 4, abs(measuredPosition.y - point.y) < 4 else {
        fputs("macOS did not place the benchmark window in the requested tile. Exit full-screen Spaces and rerun.\n", stderr); exit(7)
    }
}
