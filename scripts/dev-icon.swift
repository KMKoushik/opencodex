// Run from the repository root: swift scripts/dev-icon.swift
// Uses only macOS system frameworks; production artwork is left untouched.
import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let image = NSImage(contentsOf: root.appendingPathComponent("apps/desktop/build/icon.png"))!
let artwork = NSImage(size: NSSize(width: 1024, height: 1024))
artwork.lockFocus()
image.draw(in: NSRect(x: 0, y: 0, width: 1024, height: 1024))
let ribbon = NSRect(x: 252, y: 126, width: 520, height: 150)
NSColor(srgbRed: 0.16, green: 0.43, blue: 0.86, alpha: 1).setFill()
NSBezierPath(roundedRect: ribbon, xRadius: 42, yRadius: 42).fill()
let label = NSAttributedString(string: "DEV", attributes: [
    .font: NSFont.monospacedSystemFont(ofSize: 108, weight: .heavy),
    .foregroundColor: NSColor.white,
])
let labelSize = label.size()
label.draw(at: NSPoint(x: ribbon.midX - labelSize.width / 2, y: ribbon.midY - labelSize.height / 2))
artwork.unlockFocus()

func writePNG(_ path: String, size: Int) throws {
    let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
        isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    )!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    artwork.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path, relativeTo: root))
}

try writePNG("apps/desktop/build/icon-dev.png", size: 1024)
try writePNG("apps/web/src/assets/brand/dev-96.png", size: 96)
try writePNG("apps/web/src/assets/brand/dev-384.png", size: 384)
try writePNG("apps/web/public/favicon-dev.png", size: 32)

let iconset = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: iconset) }
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let filename = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try writePNG(iconset.appendingPathComponent(filename).path, size: size * scale)
    }
}
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o", root.appendingPathComponent("apps/desktop/build/icon-dev.icns").path]
try process.run()
process.waitUntilExit()
precondition(process.terminationStatus == 0, "Could not generate the development bundle icon")
