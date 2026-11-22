import Cocoa

guard CommandLine.arguments.count == 2 else { exit(2) }
// Authored diagram attachment, not a screen capture or model-generated artifact.
let image = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 960, pixelsHigh: 480, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: image)
NSColor(calibratedWhite: 0.07, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: 960, height: 480).fill()
let title: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 32, weight: .semibold), .foregroundColor: NSColor.white]
("Request pipeline / bounded cache" as NSString).draw(at: NSPoint(x: 40, y: 400), withAttributes: title)
for (index, text) in ["HTTP request", "Gateway", "OpenCode"].enumerated() {
    let x = 40 + index * 310
    NSColor(calibratedRed: 0.14, green: 0.25, blue: 0.34, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: x, y: 205, width: 250, height: 100), xRadius: 16, yRadius: 16).fill()
    (text as NSString).draw(at: NSPoint(x: x + 22, y: 242), withAttributes: [.font: NSFont.monospacedSystemFont(ofSize: 25, weight: .medium), .foregroundColor: NSColor.white])
    if index < 2 {
        NSColor.systemTeal.setStroke()
        let path = NSBezierPath(); path.lineWidth = 4
        path.move(to: NSPoint(x: x + 260, y: 255)); path.line(to: NSPoint(x: x + 298, y: 255))
        path.move(to: NSPoint(x: x + 287, y: 265)); path.line(to: NSPoint(x: x + 298, y: 255)); path.line(to: NSPoint(x: x + 287, y: 245)); path.stroke()
    }
}
("✓ Cancellation propagates    ✓ Cache capped at 256 entries\n✓ One execution owner        ✓ Relative /api transport" as NSString).draw(in: NSRect(x: 40, y: 65, width: 880, height: 95), withAttributes: [.font: NSFont.monospacedSystemFont(ofSize: 20, weight: .regular), .foregroundColor: NSColor.lightGray])
try image.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
