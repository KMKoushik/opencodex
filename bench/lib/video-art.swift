import Cocoa

guard CommandLine.arguments.count == 3 else { exit(2) }
let directory = CommandLine.arguments[1]
let lines = try String(contentsOfFile: CommandLine.arguments[2], encoding: .utf8)
func save(_ path: String, draw: () -> Void) throws {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1920, pixelsHigh: 1080, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    draw()
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}
let font = NSFont.monospacedSystemFont(ofSize: 22, weight: .medium)
let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white]
for second in 0...600 {
    try save("\(directory)/timer-\(String(format: "%03d", second)).png") {
        NSColor(calibratedWhite: 0.035, alpha: 1).setFill()
        NSRect(x: 0, y: 1018, width: 1920, height: 62).fill()
        ("Electron" as NSString).draw(at: NSPoint(x: 36, y: 1035), withAttributes: attrs)
        ("Rune" as NSString).draw(at: NSPoint(x: 1000, y: 1035), withAttributes: attrs)
        (String(format: "%02d:%02d", second / 60, second % 60) as NSString).draw(at: NSPoint(x: 887, y: 1035), withAttributes: attrs)
    }
}
try save("\(directory)/endcard.png") {
    NSColor(calibratedWhite: 0.035, alpha: 1).setFill()
    NSRect(x: 0, y: 0, width: 1920, height: 1080).fill()
    ("OpenCodex — same commit, same fixture" as NSString).draw(at: NSPoint(x: 60, y: 995), withAttributes: [.font: NSFont.systemFont(ofSize: 34, weight: .semibold), .foregroundColor: NSColor.white])
    let style = NSMutableParagraphStyle(); style.lineSpacing = 7
    (lines as NSString).draw(in: NSRect(x: 60, y: 125, width: 1800, height: 820), withAttributes: [.font: NSFont.monospacedSystemFont(ofSize: 21, weight: .regular), .foregroundColor: NSColor.white, .paragraphStyle: style])
    ("Software frame proxies, not photon latency. Streaming depends on network/model pacing. See COMPARISON.md." as NSString).draw(at: NSPoint(x: 60, y: 55), withAttributes: [.font: NSFont.systemFont(ofSize: 21), .foregroundColor: NSColor.lightGray])
}
