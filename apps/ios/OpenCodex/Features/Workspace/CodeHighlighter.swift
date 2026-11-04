import Foundation

/// A light, line-at-a-time highlighter: keywords, strings, comments and punctuation, the four
/// roles the themes' `syntax-*` tokens define. One linear scan per visible line, so it runs as
/// rows appear rather than over the whole file.
nonisolated struct CodeHighlighter: Sendable {
  enum Role: Sendable { case keyword, string, comment, punctuation }
  struct Span: Sendable, Equatable {
    var range: Range<Int>
    var role: Role
  }

  private let keywords: Set<String>
  private let lineComments: [String]
  private let blockComment: (open: String, close: String)?
  private let quotes: Set<UInt16>
  let enabled: Bool

  init(path: String) {
    let name = (path as NSString).lastPathComponent.lowercased()
    let ext = (name as NSString).pathExtension
    var keywords: Set<String> = []
    var lineComments = ["//"]
    var block: (String, String)? = ("/*", "*/")
    var quotes: Set<Character> = ["\"", "'", "`"]
    var enabled = true
    switch ext {
    case "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "vue", "svelte", "astro":
      keywords = Self.javascript
    case "swift": keywords = Self.swift
    case "go": keywords = Self.go
    case "rs": keywords = Self.rust
    case "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "m", "mm", "cs", "java", "kt", "kts", "scala", "dart":
      keywords = Self.cFamily
    case "py", "pyi":
      keywords = Self.python
      lineComments = ["#"]
      block = nil
    case "rb":
      keywords = Self.ruby
      lineComments = ["#"]
      block = nil
    case "sh", "bash", "zsh", "fish", "env":
      keywords = Self.shell
      lineComments = ["#"]
      block = nil
    case "yml", "yaml", "toml", "ini", "conf", "cfg", "properties":
      keywords = ["true", "false", "null", "yes", "no", "on", "off"]
      lineComments = ["#"]
      block = nil
      quotes = ["\"", "'"]
    case "json", "jsonc", "json5":
      keywords = ["true", "false", "null"]
      quotes = ["\""]
    case "css", "scss", "sass", "less":
      keywords = ["@media", "@import", "@supports", "@keyframes", "@layer", "!important"]
      lineComments = ext == "css" ? [] : ["//"]
      quotes = ["\"", "'"]
    case "sql":
      keywords = Self.sql
      lineComments = ["--"]
      quotes = ["'", "\""]
    case "html", "htm", "xml", "svg", "plist":
      keywords = []
      lineComments = []
      block = ("<!--", "-->")
      quotes = ["\"", "'"]
    default:
      if ["dockerfile", "makefile", ".gitignore", ".env"].contains(name) {
        lineComments = ["#"]
        block = nil
        quotes = ["\"", "'"]
      } else {
        enabled = false
      }
    }
    self.keywords = keywords
    self.lineComments = lineComments
    self.blockComment = block
    self.quotes = Set(quotes.compactMap { $0.utf16.first })
    self.enabled = enabled
  }

  /// Spans for one line, as UTF-16 ranges.
  func spans(_ line: String) -> [Span] {
    guard enabled else { return [] }
    let units = Array(line.utf16)
    var spans: [Span] = []
    var index = 0
    let count = units.count
    // A line inside a block comment that we can't see the start of: treat `*`-led lines as comments.
    if let block = blockComment, block.open == "/*" {
      var start = 0
      while start < count, units[start] == 32 || units[start] == 9 { start += 1 }
      if start < count, units[start] == 42,
        start + 1 == count || units[start + 1] == 32 || units[start + 1] == 47
      {
        return [Span(range: start..<count, role: .comment)]
      }
    }
    func matches(_ token: String, at position: Int) -> Bool {
      let token = Array(token.utf16)
      guard position + token.count <= count else { return false }
      for offset in 0..<token.count where units[position + offset] != token[offset] { return false }
      return true
    }
    while index < count {
      let unit = units[index]
      if let comment = lineComments.first(where: { matches($0, at: index) }),
        comment != "#" || index == 0 || units[index - 1] == 32 || units[index - 1] == 9
      {
        spans.append(Span(range: index..<count, role: .comment))
        break
      }
      if let block = blockComment, matches(block.open, at: index) {
        var end = index + block.open.utf16.count
        while end < count, !matches(block.close, at: end) { end += 1 }
        end = min(count, end + block.close.utf16.count)
        spans.append(Span(range: index..<end, role: .comment))
        index = end
        continue
      }
      if quotes.contains(unit) {
        var end = index + 1
        while end < count, units[end] != unit {
          end += units[end] == 92 ? 2 : 1
        }
        end = min(count, end + 1)
        spans.append(Span(range: index..<end, role: .string))
        index = end
        continue
      }
      if Self.isWordStart(unit) {
        var end = index + 1
        while end < count, Self.isWord(units[end]) { end += 1 }
        if !keywords.isEmpty, keywords.contains(String(decoding: units[index..<end], as: UTF16.self)) {
          spans.append(Span(range: index..<end, role: .keyword))
        }
        index = end
        continue
      }
      if Self.punctuation.contains(unit) {
        var end = index + 1
        while end < count, Self.punctuation.contains(units[end]) { end += 1 }
        spans.append(Span(range: index..<end, role: .punctuation))
        index = end
        continue
      }
      index += 1
    }
    return spans
  }

  private static func isWordStart(_ unit: UInt16) -> Bool {
    (65...90).contains(unit) || (97...122).contains(unit) || unit == 95 || unit == 36 || unit == 64
      || unit == 35 || (48...57).contains(unit)
  }

  private static func isWord(_ unit: UInt16) -> Bool {
    (65...90).contains(unit) || (97...122).contains(unit) || unit == 95 || unit == 36
      || (48...57).contains(unit)
  }

  private static let punctuation: Set<UInt16> = Set("{}[]();,.:=<>+-*/%!&|^~?".utf16)

  private static let javascript: Set<String> = [
    "import", "export", "from", "as", "default", "const", "let", "var", "function", "return", "if",
    "else", "for", "while", "do", "switch", "case", "break", "continue", "new", "class", "extends",
    "implements", "interface", "type", "enum", "async", "await", "yield", "try", "catch", "finally",
    "throw", "typeof", "instanceof", "in", "of", "void", "delete", "this", "super", "null",
    "undefined", "true", "false", "public", "private", "protected", "readonly", "static", "declare",
    "namespace", "keyof", "satisfies", "abstract", "get", "set",
  ]
  private static let swift: Set<String> = [
    "import", "let", "var", "func", "return", "if", "else", "guard", "for", "in", "while", "repeat",
    "switch", "case", "default", "break", "continue", "struct", "class", "enum", "protocol",
    "extension", "init", "deinit", "self", "Self", "super", "nil", "true", "false", "private",
    "fileprivate", "internal", "public", "open", "static", "final", "override", "mutating", "throws",
    "throw", "rethrows", "try", "catch", "do", "async", "await", "some", "any", "where", "typealias",
    "associatedtype", "inout", "defer", "lazy", "weak", "unowned", "nonisolated", "isolated", "actor",
    "@MainActor", "@Observable", "@State", "@Binding", "@Environment",
  ]
  private static let go: Set<String> = [
    "package", "import", "func", "return", "if", "else", "for", "range", "switch", "case", "default",
    "break", "continue", "go", "defer", "chan", "select", "struct", "interface", "map", "type", "var",
    "const", "nil", "true", "false", "fallthrough", "goto",
  ]
  private static let rust: Set<String> = [
    "use", "mod", "pub", "fn", "let", "mut", "return", "if", "else", "match", "for", "in", "while",
    "loop", "break", "continue", "struct", "enum", "impl", "trait", "type", "where", "self", "Self",
    "super", "crate", "const", "static", "async", "await", "move", "ref", "true", "false", "unsafe",
    "dyn", "as",
  ]
  private static let cFamily: Set<String> = [
    "include", "#include", "#define", "#if", "#endif", "#ifdef", "#ifndef", "#import", "import",
    "package", "return", "if", "else", "for", "while", "do", "switch", "case", "default", "break",
    "continue", "struct", "class", "enum", "union", "typedef", "const", "static", "void", "public",
    "private", "protected", "new", "delete", "this", "null", "nullptr", "true", "false", "try",
    "catch", "throw", "throws", "final", "override", "virtual", "namespace", "using", "template",
    "fun", "val", "var", "object", "interface", "extends", "implements", "abstract", "sealed",
  ]
  private static let python: Set<String> = [
    "import", "from", "as", "def", "return", "if", "elif", "else", "for", "while", "in", "not",
    "and", "or", "is", "class", "try", "except", "finally", "raise", "with", "yield", "lambda",
    "pass", "break", "continue", "global", "nonlocal", "None", "True", "False", "async", "await",
    "self",
  ]
  private static let ruby: Set<String> = [
    "def", "end", "class", "module", "if", "elsif", "else", "unless", "while", "until", "for", "in",
    "do", "return", "yield", "begin", "rescue", "ensure", "raise", "require", "self", "nil", "true",
    "false", "then", "case", "when",
  ]
  private static let shell: Set<String> = [
    "if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while", "case", "esac",
    "function", "return", "export", "local", "echo", "set", "unset", "source",
  ]
  private static let sql: Set<String> = [
    "select", "from", "where", "insert", "into", "values", "update", "set", "delete", "create",
    "table", "alter", "drop", "join", "left", "right", "inner", "on", "and", "or", "not", "null",
    "primary", "key", "references", "index", "as", "group", "by", "order", "limit",
    "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE",
    "TABLE", "ALTER", "DROP", "JOIN", "LEFT", "ON", "AND", "OR", "NOT", "NULL", "PRIMARY", "KEY",
    "AS", "GROUP", "BY", "ORDER", "LIMIT",
  ]
}
