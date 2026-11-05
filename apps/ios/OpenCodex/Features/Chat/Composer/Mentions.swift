import Foundation

/// A mention picked from the `@` menu. Its `@` token in the draft text carries it.
/// Port of the desktop `mentions.ts`. Offsets are UTF-16 code units, as the gateway and
/// OpenCode count them.
nonisolated enum DraftMention: Hashable, Sendable {
  case file(path: String, token: String)
  case skill(id: String, token: String)
  case chat(id: String, token: String)

  var token: String {
    switch self {
    case .file(_, let token), .skill(_, let token), .chat(_, let token): token
    }
  }
}

/// A mention as the prompt input sends it: the referent and where its token sits in the text.
nonisolated struct PromptMention: Encodable, Equatable, Sendable {
  struct Range: Codable, Equatable, Sendable {
    var start: Int
    var end: Int
    var text: String
  }
  var type: String
  var path: String?
  var id: String?
  var mention: Range
}

nonisolated enum Mentions {
  private static func isSpace(_ unit: UInt16) -> Bool {
    guard let scalar = Unicode.Scalar(unit) else { return false }
    return CharacterSet.whitespacesAndNewlines.contains(scalar)
  }
  private static let before = Set("([{\"'`".utf16)
  private static let after = Set(")]}\"'`,.;:!?".utf16)

  static func boundaryBefore(_ unit: UInt16) -> Bool { isSpace(unit) || before.contains(unit) }
  static func boundaryAfter(_ unit: UInt16) -> Bool { isSpace(unit) || after.contains(unit) }

  /// A whole-token occurrence at or after `from`, so `@a.ts` is not found inside `@a.tsx`.
  static func find(_ text: String, _ token: String, from: Int = 0) -> Int? {
    find(Array(text.utf16), Array(token.utf16), from: from)
  }

  static func find(_ text: [UInt16], _ token: [UInt16], from: Int = 0) -> Int? {
    guard !token.isEmpty, text.count >= token.count else { return nil }
    var index = max(0, from)
    while index + token.count <= text.count {
      if text[index] == token[0], Array(text[index..<(index + token.count)]) == token {
        let beforeOK = index == 0 || boundaryBefore(text[index - 1])
        let end = index + token.count
        let afterOK = end == text.count || boundaryAfter(text[end])
        if beforeOK && afterOK { return index }
      }
      index += 1
    }
    return nil
  }

  /// The `@query` typed just before the caret (a UTF-16 offset), if the caret is inside one.
  static func query(_ text: String, caret: Int) -> (start: Int, query: String)? {
    let units = Array(text.utf16)
    let caret = min(max(0, caret), units.count)
    var index = caret - 1
    while index >= 0, caret - index <= 128 {
      let unit = units[index]
      if unit == UInt16(UInt8(ascii: "@")) {
        guard index == 0 || boundaryBefore(units[index - 1]) else { return nil }
        return (index, String(decoding: units[(index + 1)..<caret], as: UTF16.self))
      }
      if isSpace(unit) { return nil }
      index -= 1
    }
    return nil
  }

  /// Native mention ranges for the tokens still present in the text being sent.
  static func prompt(_ text: String, _ mentions: [DraftMention]) -> [PromptMention] {
    let units = Array(text.utf16)
    return mentions.compactMap { item in
      let token = Array(item.token.utf16)
      guard let start = find(units, token) else { return nil }
      let range = PromptMention.Range(start: start, end: start + token.count, text: item.token)
      switch item {
      case .file(let path, _): return PromptMention(type: "file", path: path, mention: range)
      case .skill(let id, _): return PromptMention(type: "skill", id: id, mention: range)
      case .chat(let id, _): return PromptMention(type: "chat", id: id, mention: range)
      }
    }
  }

  /// Edits drop mentions whose token was deleted; retyping the token doesn't relink it.
  static func live(_ text: String, _ mentions: [DraftMention]) -> [DraftMention] {
    guard !mentions.isEmpty else { return mentions }
    let units = Array(text.utf16)
    return mentions.filter { find(units, Array($0.token.utf16)) != nil }
  }
}
