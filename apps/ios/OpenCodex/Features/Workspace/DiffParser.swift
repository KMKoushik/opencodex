import Foundation

/// One rendered line of a unified diff or a code file.
nonisolated struct CodeLine: Sendable, Equatable {
  enum Kind: Sendable, Equatable {
    case context, added, removed
    /// A collapsed run of unchanged lines; `count` is nil when unknown (after the last hunk).
    case separator(count: Int?)
  }

  var kind: Kind
  /// The line number shown in the single unified gutter: new for context and additions, old for
  /// removals, as in the desktop's unified diff.
  var number: Int?
  var text: String
  /// The changed span inside a paired removed/added line (UTF-16 offsets into `text`).
  var changed: Range<Int>?
}

/// Lines for the code views, prepared off the main thread.
nonisolated struct CodeDocument: Sendable {
  var lines: [CodeLine]
  /// The widest line, in characters after tab expansion, for the horizontal scroll width.
  var columns: Int
  /// The largest line number, for the gutter width.
  var maxNumber: Int

  /// Long minified lines are cut for display, like the desktop's 2,000-character tokenizer limit.
  static let maxLineLength = 2000
}

nonisolated enum DiffParser {
  /// Parses a git unified patch into display lines, with "N unmodified lines" separators
  /// between hunks and a trailing one for modified files, like the desktop's `line-info-basic`.
  static func parse(_ patch: String, trailingContext: Bool) -> CodeDocument {
    var lines: [CodeLine] = []
    var oldLine = 0
    var newLine = 0
    var previousOldEnd: Int?
    var columns = 0
    var maxNumber = 0
    var inHunk = false
    var pendingRemoved: [Int] = []
    var pendingAdded: [Int] = []

    func flushPairs() {
      // Pair each added line with the most similar removed line after the previous pair, then
      // mark their differing middle. Dissimilar lines stay unpaired: the row tint says enough.
      var next = 0
      if pendingRemoved.count <= 64, pendingAdded.count <= 64 {
        for added in pendingAdded where next < pendingRemoved.count {
          var best: (index: Int, score: Int)?
          for index in next..<pendingRemoved.count {
            let score = similarity(lines[pendingRemoved[index]].text, lines[added].text)
            if score > (best?.score ?? 0) { best = (index, score) }
          }
          guard let best else { continue }
          let removed = pendingRemoved[best.index]
          let (a, b) = changedRanges(lines[removed].text, lines[added].text)
          lines[removed].changed = a
          lines[added].changed = b
          next = best.index + 1
        }
      }
      pendingRemoved = []
      pendingAdded = []
    }

    for raw in patch.split(separator: "\n", omittingEmptySubsequences: false) {
      if raw.hasPrefix("@@") {
        flushPairs()
        guard let header = hunkHeader(raw) else { continue }
        let gap = header.oldStart - (previousOldEnd ?? 1)
        if gap > 0 { lines.append(CodeLine(kind: .separator(count: gap), text: "")) }
        oldLine = header.oldStart
        newLine = header.newStart
        previousOldEnd = header.oldStart + header.oldCount
        inHunk = true
        continue
      }
      guard inHunk, let first = raw.first else { continue }
      let text = display(raw.dropFirst())
      columns = max(columns, text.columns)
      switch first {
      case "+":
        pendingAdded.append(lines.count)
        lines.append(CodeLine(kind: .added, number: newLine, text: text.text))
        maxNumber = max(maxNumber, newLine)
        newLine += 1
      case "-":
        if !pendingAdded.isEmpty { flushPairs() }
        pendingRemoved.append(lines.count)
        lines.append(CodeLine(kind: .removed, number: oldLine, text: text.text))
        maxNumber = max(maxNumber, oldLine)
        oldLine += 1
      case " ":
        flushPairs()
        lines.append(CodeLine(kind: .context, number: newLine, text: text.text))
        maxNumber = max(maxNumber, newLine)
        oldLine += 1
        newLine += 1
      default:
        // "\ No newline at end of file", or the next file's header.
        continue
      }
    }
    flushPairs()
    if trailingContext, !lines.isEmpty { lines.append(CodeLine(kind: .separator(count: nil), text: "")) }
    return CodeDocument(lines: lines, columns: columns, maxNumber: maxNumber)
  }

  /// A text file as numbered lines.
  static func code(_ text: String) -> CodeDocument {
    var lines: [CodeLine] = []
    var columns = 0
    var number = 0
    let parts = text.split(separator: "\n", omittingEmptySubsequences: false)
    lines.reserveCapacity(parts.count)
    for (index, part) in parts.enumerated() {
      // A trailing newline doesn't start another line.
      if index == parts.count - 1, part.isEmpty, index > 0 { break }
      number += 1
      var line = part
      if line.last == "\r" { line = line.dropLast() }
      let shown = display(line)
      columns = max(columns, shown.columns)
      lines.append(CodeLine(kind: .context, number: number, text: shown.text))
    }
    return CodeDocument(lines: lines, columns: columns, maxNumber: number)
  }

  static func hunkHeader(_ line: Substring) -> (oldStart: Int, oldCount: Int, newStart: Int, newCount: Int)? {
    // @@ -a,b +c,d @@ optional section
    let parts = line.split(separator: " ")
    guard parts.count >= 3, parts[1].hasPrefix("-"), parts[2].hasPrefix("+") else { return nil }
    func range(_ part: Substring) -> (Int, Int)? {
      let numbers = part.dropFirst().split(separator: ",")
      guard let start = Int(numbers.first ?? "") else { return nil }
      let count = numbers.count > 1 ? Int(numbers[1]) ?? 1 : 1
      return (start, count)
    }
    guard let old = range(parts[1]), let new = range(parts[2]) else { return nil }
    // A zero-length side starts *after* the given line.
    return (old.1 == 0 ? old.0 + 1 : old.0, old.1, new.1 == 0 ? new.0 + 1 : new.0, new.1)
  }

  /// Expands tabs to 4 columns and cuts very long lines.
  private static func display(_ line: Substring) -> (text: String, columns: Int) {
    var text = line.contains("\t") ? line.replacingOccurrences(of: "\t", with: "    ") : String(line)
    if text.utf16.count > CodeDocument.maxLineLength {
      text = String(text.prefix(CodeDocument.maxLineLength)) + " …"
    }
    return (text, text.count)
  }

  /// Shared non-blank prefix and suffix length, or 0 when the lines share less than a third.
  static func similarity(_ a: String, _ b: String) -> Int {
    let x = Array(a.utf16)
    let y = Array(b.utf16)
    var lead = 0
    while lead < x.count, lead < y.count, x[lead] == 32 || x[lead] == 9, x[lead] == y[lead] { lead += 1 }
    var prefix = lead
    while prefix < x.count, prefix < y.count, x[prefix] == y[prefix] { prefix += 1 }
    var suffix = 0
    while suffix < x.count - prefix, suffix < y.count - prefix,
      x[x.count - 1 - suffix] == y[y.count - 1 - suffix]
    {
      suffix += 1
    }
    let shared = prefix - lead + suffix
    let shorter = min(x.count, y.count) - lead
    return shorter > 0 && shared * 3 >= shorter ? shared : 0
  }

  /// The differing middle of two lines: everything between their common prefix and suffix.
  static func changedRanges(_ a: String, _ b: String) -> (Range<Int>?, Range<Int>?) {
    let x = Array(a.utf16)
    let y = Array(b.utf16)
    var prefix = 0
    while prefix < x.count, prefix < y.count, x[prefix] == y[prefix] { prefix += 1 }
    var suffix = 0
    while suffix < x.count - prefix, suffix < y.count - prefix,
      x[x.count - 1 - suffix] == y[y.count - 1 - suffix]
    {
      suffix += 1
    }
    // Lines that share nothing are wholly changed; the line tint already says so.
    guard prefix + suffix > 0 else { return (nil, nil) }
    let ra = prefix..<(x.count - suffix)
    let rb = prefix..<(y.count - suffix)
    return (ra.isEmpty ? nil : ra, rb.isEmpty ? nil : rb)
  }
}
