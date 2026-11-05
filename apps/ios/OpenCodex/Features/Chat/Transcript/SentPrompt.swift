import Foundation

/// A sent prompt as its bubble shows it: the user's own text with mention pills, its review
/// comments as one chip, and its attachments. Port of the desktop `user-prompt.tsx`,
/// `message-text.tsx`, `mentions.ts` (`sentMentionRanges`) and `messageAnnotations`.
/// Offsets are UTF-16 code units, as JavaScript and OpenCode count them.
nonisolated struct SentPrompt: Hashable, Sendable {
  /// One `@` mention drawn as a pill.
  struct Mention: Hashable, Sendable {
    var start: Int
    var end: Int
    var text: String
    /// `file`, `chat` or `skill`.
    var kind: String
  }

  /// One review comment sent with the prompt, numbered per kind.
  struct Annotation: Hashable, Sendable {
    /// `annotation` or `comment`.
    var kind: String
    var number: Int
    var label: String
    var quote: String?
    var comment: String?

    /// "Annotation 1", "Comment 2".
    var title: String { "\(kind == "comment" ? "Comment" : "Annotation") \(number)" }
  }

  /// The bubble's text: the user's own words, before any review comments.
  var text: String
  var mentions: [Mention]
  var annotations: [Annotation]
  var files: [Attachment]
  var pending: Bool

  init(
    text: String, mentions: [(mention: JSONValue?, kind: String)], metadata: [String: JSONValue]?,
    files: [Attachment], pending: Bool
  ) {
    let parsed = Self.annotations(text, metadata)
    let own: String
    if let end = parsed?.end {
      own = String(decoding: text.utf16.prefix(end), as: UTF16.self).trimmingTrailingWhitespace()
    } else {
      own = text
    }
    self.text = own
    self.mentions = Self.mentionRanges(own, mentions)
    self.annotations = parsed?.items ?? []
    self.files = files
    self.pending = pending
  }

  /// "1 annotation, 2 comments".
  var annotationSummary: String {
    let annotations = self.annotations.count { $0.kind == "annotation" }
    let comments = self.annotations.count - annotations
    return [
      annotations > 0 ? "\(annotations) \(annotations == 1 ? "annotation" : "annotations")" : nil,
      comments > 0 ? "\(comments) \(comments == 1 ? "comment" : "comments")" : nil,
    ].compactMap(\.self).joined(separator: ", ")
  }

  /// `sentMentionRanges`: sorted, non-overlapping ranges that still match the text.
  static func mentionRanges(_ text: String, _ mentions: [(mention: JSONValue?, kind: String)]) -> [Mention] {
    guard !mentions.isEmpty else { return [] }
    let units = Array(text.utf16)
    let ranges = mentions.compactMap { item -> Mention? in
      guard let mention = item.mention, let start = mention["start"]?.number.flatMap({ Int(exactly: $0) }),
        let end = mention["end"]?.number.flatMap({ Int(exactly: $0) }), let token = mention["text"]?.string,
        start >= 0, start <= end, end <= units.count,
        String(decoding: units[start..<end], as: UTF16.self) == token
      else { return nil }
      return Mention(start: start, end: end, text: token, kind: item.kind)
    }
    .sorted { $0.start < $1.start }
    var end = 0
    return ranges.filter { range in
      guard range.start >= end else { return false }
      end = range.end
      return true
    }
  }

  /// `messageAnnotations`: the metadata's annotations, only if every range fits the text.
  static func annotations(_ text: String, _ metadata: [String: JSONValue]?) -> (end: Int, items: [Annotation])? {
    guard let value = metadata?["opencodexAnnotations"]?.object,
      let end = value["end"]?.number.flatMap({ Int(exactly: $0) }), end >= 0,
      let items = value["items"]?.array, (1...64).contains(items.count)
    else { return nil }
    let units = Array(text.utf16)
    guard end <= units.count else { return nil }
    func range(_ value: JSONValue?) -> Range<Int>?? {
      guard let value else { return .some(nil) }
      guard let pair = value.array, pair.count == 2,
        let a = pair[0].number.flatMap({ Int(exactly: $0) }), let b = pair[1].number.flatMap({ Int(exactly: $0) }),
        a >= 0, a <= b, b <= units.count
      else { return nil }
      return .some(a..<b)
    }
    func slice(_ range: Range<Int>?) -> String? {
      guard let range, !range.isEmpty else { return nil }
      return String(decoding: units[range], as: UTF16.self)
    }
    var numbers = ["annotation": 0, "comment": 0]
    var out: [Annotation] = []
    for item in items {
      guard let kind = item["kind"]?.string, let number = numbers[kind],
        let label = item["label"]?.string, label.utf16.count <= 4096,
        let quote = range(item["quote"]), let comment = range(item["comment"])
      else { return nil }
      numbers[kind] = number + 1
      out.append(
        Annotation(
          kind: kind, number: number + 1, label: label,
          // Quotes are sent as Markdown blockquotes; the list shows them without the markers.
          quote: slice(quote).map { $0.replacing(/(?m)^> ?/, with: "") }, comment: slice(comment)))
    }
    return (end, out)
  }
}

extension String {
  /// JavaScript's `trimEnd()`.
  nonisolated func trimmingTrailingWhitespace() -> String {
    var units = Substring(self)
    while let last = units.last, last.isWhitespace { units.removeLast() }
    return String(units)
  }
}
