import Foundation

/// Reveals growing text at a steady, word-aligned pace instead of in network bursts: the
/// backlog drains with a ~280 ms time constant, so the display stays a fraction of a second
/// behind the stream. A port of the web's `paced-text.ts`; a display link drives `advance`.
nonisolated struct PacedText {
  static let catchUp: Double = 0.280
  static let minimumPerSecond: Double = 50

  private(set) var target: String
  /// Revealed UTF-8 bytes of `target`, always on a character boundary.
  private(set) var shown: Int

  /// Text present at the start shows at once; only later growth is paced.
  init(showing text: String) {
    target = text
    shown = text.utf8.count
  }

  init(target: String, shown: Int) {
    self.target = target
    self.shown = min(shown, target.utf8.count)
  }

  var done: Bool { shown >= target.utf8.count }

  var text: String {
    done ? target : String(decoding: target.utf8.prefix(shown), as: UTF8.self)
  }

  /// New streamed text. A rewrite (not an extension) shows at once.
  mutating func retarget(_ text: String) {
    if !text.hasPrefix(String(decoding: target.utf8.prefix(shown), as: UTF8.self)) {
      shown = text.utf8.count
    }
    target = text
    shown = min(shown, target.utf8.count)
  }

  /// Advances by `elapsed` seconds; returns whether the shown text changed.
  mutating func advance(_ elapsed: Double) -> Bool {
    let total = target.utf8.count
    let backlog = total - shown
    guard backlog > 0 else { return false }
    let elapsed = min(elapsed, 0.05)
    let step = max(Self.minimumPerSecond * elapsed, Double(backlog) * elapsed / Self.catchUp)
    var index = min(total, shown + Int(step.rounded(.up)))
    // End on whitespace, so words appear whole; fall back to a character boundary.
    let bytes = target.utf8
    var position = bytes.index(bytes.startIndex, offsetBy: index)
    var scanned = 0
    while position < bytes.endIndex {
      let byte = bytes[position]
      if byte == 0x20 || byte == 0x0A || byte == 0x09 { break }
      if scanned > 24 && byte & 0xC0 != 0x80 { break }
      position = bytes.index(after: position)
      index += 1
      scanned += 1
    }
    shown = index
    return true
  }
}
