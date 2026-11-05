import UIKit

/// The app's one syntax highlighter, for chat code blocks and the workspace's file previews and
/// diffs. Colors come from the theme's `syntax-*` tokens, like the desktop's code themes ("ink"
/// for OpenCodex: weight and brightness instead of hue). A small single-pass tokenizer covers
/// the common languages; anything else stays plain. Work runs on background queues and results
/// are cached (chat blocks here by theme, size, language and source; workspace lines by their
/// view), so scrolling never tokenizes on the main thread.
nonisolated final class SyntaxHighlighter: @unchecked Sendable {
  static let shared = SyntaxHighlighter()

  private let queue = DispatchQueue(label: "opencodex.syntax", qos: .userInitiated)
  private let cache: NSCache<NSString, NSAttributedString> = {
    let cache = NSCache<NSString, NSAttributedString>()
    cache.countLimit = 400
    cache.totalCostLimit = 3_000_000
    return cache
  }()

  struct Style: @unchecked Sendable {
    var font: UIFont
    var bold: UIFont
    var paragraph: NSParagraphStyle
    var syntax: TranscriptTheme.Syntax
    /// Part of the cache key: theme and Dynamic Type size.
    var key: String

    /// Code in the chat's line height, in the theme's syntax colors.
    init(typography: Typography, theme: TranscriptTheme) {
      let paragraph = NSMutableParagraphStyle()
      paragraph.lineSpacing = typography.spacing(typography.mono)
      font = typography.mono
      bold = typography.monoBold
      self.paragraph = paragraph
      syntax = theme.syntax
      key = "\(theme.id)|\(typography.key)"
    }
  }

  /// Highlights ahead of display (prefetch), so code scrolls in already colored.
  func warm(_ code: String, language: String, style: Style) {
    guard Grammar.for(language) != nil else { return }
    let key = key(code, language, style)
    queue.async { [cache] in
      guard cache.object(forKey: key) == nil else { return }
      cache.setObject(Self.render(code, language: language, style: style), forKey: key, cost: code.utf16.count)
    }
  }

  /// A finished highlight, if one is cached.
  func cached(_ code: String, language: String, style: Style) -> NSAttributedString? {
    cache.object(forKey: key(code, language, style))
  }

  /// Highlights in the background and calls back on the main thread.
  func highlight(
    _ code: String, language: String, style: Style,
    completion: @escaping @MainActor @Sendable (NSAttributedString) -> Void
  ) {
    let key = key(code, language, style)
    queue.async { [cache] in
      let result = cache.object(forKey: key) ?? {
        let rendered = Self.render(code, language: language, style: style)
        cache.setObject(rendered, forKey: key, cost: code.utf16.count)
        return rendered
      }()
      // Immutable once built, so it crosses to the main thread safely.
      nonisolated(unsafe) let done = result
      DispatchQueue.main.async { MainActor.assumeIsolated { completion(done) } }
    }
  }

  private func key(_ code: String, _ language: String, _ style: Style) -> NSString {
    "\(style.key)|\(language)|\(code)" as NSString
  }

  /// Plain code in the theme's base color, for the first frame and unknown languages.
  static func plain(_ code: String, style: Style) -> NSMutableAttributedString {
    NSMutableAttributedString(
      string: code,
      attributes: [.font: style.font, .foregroundColor: style.syntax.plain, .paragraphStyle: style.paragraph])
  }

  // MARK: Tokenizing

  enum Token: Equatable, Sendable { case keyword, string, comment, punctuation, function, type, constant }

  /// A token in one line, as UTF-16 offsets into that line.
  struct Span: Equatable, Sendable {
    var range: Range<Int>
    var token: Token
  }

  /// Token spans per line, tokenizing the lines as one source, so block comments and
  /// multi-line strings carry across lines.
  static func lineTokens(_ lines: [String], _ grammar: Grammar) -> [[Span]] {
    var out = [[Span]](repeating: [], count: lines.count)
    guard !lines.isEmpty else { return out }
    var starts: [Int] = []
    var lengths: [Int] = []
    starts.reserveCapacity(lines.count)
    var offset = 0
    for line in lines {
      let length = line.utf16.count
      starts.append(offset)
      lengths.append(length)
      offset += length + 1
    }
    var line = 0
    for (range, token) in tokens(lines.joined(separator: "\n"), grammar) {
      var start = range.location
      let end = range.location + range.length
      while line + 1 < starts.count && starts[line + 1] <= start { line += 1 }
      var index = line
      while start < end && index < starts.count {
        let lower = start - starts[index]
        let upper = min(end, starts[index] + lengths[index]) - starts[index]
        if upper > lower { out[index].append(Span(range: lower..<upper, token: token)) }
        index += 1
        guard index < starts.count else { break }
        start = starts[index]
      }
    }
    return out
  }

  static func render(_ code: String, language: String, style: Style) -> NSAttributedString {
    let out = plain(code, style: style)
    guard let grammar = Grammar.for(language) else { return out }
    for (range, token) in tokens(code, grammar) {
      var attributes: [NSAttributedString.Key: Any] = [:]
      switch token {
      case .keyword:
        attributes[.foregroundColor] = style.syntax.keyword
        if style.syntax.keywordBold { attributes[.font] = style.bold }
      case .string, .constant: attributes[.foregroundColor] = style.syntax.string
      case .comment: attributes[.foregroundColor] = style.syntax.comment
      case .punctuation: attributes[.foregroundColor] = style.syntax.punctuation
      case .function: attributes[.foregroundColor] = style.syntax.function
      case .type: attributes[.foregroundColor] = style.syntax.type
      }
      out.addAttributes(attributes, range: range)
    }
    return out
  }

  /// Token ranges (UTF-16) for one source.
  static func tokens(_ code: String, _ grammar: Grammar) -> [(NSRange, Token)] {
    let chars = Array(code.utf16)
    let n = chars.count
    var result: [(NSRange, Token)] = []
    var i = 0
    func at(_ index: Int) -> UInt16 { index < n ? chars[index] : 0 }
    func starts(_ text: [UInt16], _ index: Int) -> Bool {
      guard index + text.count <= n else { return false }
      for (offset, char) in text.enumerated() where chars[index + offset] != char { return false }
      return true
    }
    func isIdentStart(_ c: UInt16) -> Bool {
      (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 95 || c == 36 && grammar.dollarIdentifiers || c > 127
    }
    func isIdent(_ c: UInt16) -> Bool { isIdentStart(c) || (c >= 48 && c <= 57) }
    func isDigit(_ c: UInt16) -> Bool { c >= 48 && c <= 57 }
    func add(_ start: Int, _ end: Int, _ token: Token) {
      guard end > start else { return }
      result.append((NSRange(location: start, length: end - start), token))
    }

    while i < n {
      let c = chars[i]
      // Comments
      // A shell `#` starts a comment only at a word boundary (not `$#` or `a#b`).
      let shellWord = grammar.shell && c == 35 && i > 0 && ![32, 9, 10, 59].contains(at(i - 1))
      if !shellWord, grammar.lineComments.contains(where: { starts($0, i) }) {
        var end = i
        while end < n && chars[end] != 10 { end += 1 }
        add(i, end, .comment)
        i = end
        continue
      }
      if let (open, close) = grammar.blockComment, starts(open, i) {
        var end = i + open.count
        while end < n && !starts(close, end) { end += 1 }
        end = min(n, end + close.count)
        add(i, end, .comment)
        i = end
        continue
      }
      // Strings
      if let triple = grammar.tripleQuotes.first(where: { starts($0, i) }) {
        var end = i + triple.count
        while end < n && !starts(triple, end) { end += chars[end] == 92 ? 2 : 1 }
        end = min(n, end + triple.count)
        add(i, end, .string)
        i = end
        continue
      }
      if grammar.quotes.contains(c) {
        // Rust lifetimes (`'a`) and Swift/Go runes stay short; an unclosed `'` is punctuation.
        var end = i + 1
        var closed = false
        while end < n {
          let d = chars[end]
          if d == 92 { end += 2; continue }
          if d == c { closed = true; end += 1; break }
          if d == 10 && c != 96 { break }
          end += 1
        }
        if c == 39 && grammar.lifetimes && (!closed || end - i > 4) {
          add(i, i + 1, .punctuation)
          i += 1
          continue
        }
        add(i, min(end, n), .string)
        i = min(end, n)
        continue
      }
      // Numbers
      if isDigit(c) || (c == 46 && isDigit(at(i + 1)) && !isIdent(at(i - 1))) {
        if i > 0 && isIdent(chars[i - 1]) {
          i += 1
          continue
        }
        var end = i + 1
        while end < n && (isIdent(chars[end]) || chars[end] == 46 && isDigit(at(end + 1))) { end += 1 }
        add(i, end, .constant)
        i = end
        continue
      }
      // Identifiers, keywords, calls and types
      if isIdentStart(c) {
        var end = i + 1
        while end < n && isIdent(chars[end]) { end += 1 }
        let word = String(utf16CodeUnits: Array(chars[i..<end]), count: end - i)
        var next = end
        while next < n && (chars[next] == 32 || chars[next] == 9) { next += 1 }
        let previous = i > 0 ? chars[i - 1] : 0
        if grammar.shell && previous == 45 {
          // `--flag`: plain.
        } else if grammar.keywords.contains(grammar.caseInsensitive ? word.lowercased() : word) && previous != 46 {
          add(i, end, .keyword)
        } else if grammar.constants.contains(word) {
          add(i, end, .constant)
        } else if grammar.shell {
          // Shell words are plain; only keywords and strings stand out.
        } else if at(next) == 40 || (grammar.macros && at(end) == 33 && at(end + 1) == 40) {
          add(i, end, .function)
        } else if let first = word.utf16.first, first >= 65 && first <= 90, grammar.capitalTypes {
          add(i, end, .type)
        }
        i = end
        continue
      }
      // Punctuation and operators
      if grammar.punctuation.contains(c) {
        var end = i + 1
        while end < n && grammar.punctuation.contains(chars[end]) && !grammar.quotes.contains(chars[end])
          && !grammar.lineComments.contains(where: { starts($0, end) })
        {
          end += 1
        }
        add(i, end, .punctuation)
        i = end
        continue
      }
      i += 1
    }
    return result
  }

  struct Grammar: Sendable {
    var keywords: Set<String>
    var constants: Set<String> = ["true", "false", "null"]
    var lineComments: [[UInt16]] = [Array("//".utf16)]
    var blockComment: ([UInt16], [UInt16])? = (Array("/*".utf16), Array("*/".utf16))
    var quotes: Set<UInt16> = [34, 39]
    var tripleQuotes: [[UInt16]] = []
    var punctuation: Set<UInt16> = Set("{}[]()<>;:,.=+-*/%!&|^~?@".utf16)
    var capitalTypes = true
    var dollarIdentifiers = false
    var lifetimes = false
    var macros = false
    /// `#` comments only at a word boundary, and plain words stay plain.
    var shell = false
    /// SQL: keywords match in any case (the list is lowercase).
    var caseInsensitive = false

    static func `for`(_ language: String) -> Grammar? {
      switch language.lowercased().split(separator: " ").first.map(String.init) ?? "" {
      case "ts", "typescript", "tsx", "js", "javascript", "jsx", "mjs", "cjs", "mts", "cts": script
      case "swift": swift
      case "py", "python", "python3": python
      case "json", "jsonc", "json5": json
      case "sh", "bash", "zsh", "shell", "console", "shellscript", "fish": shellGrammar
      case "go", "golang": go
      case "rs", "rust": rust
      case "c", "h", "cpp", "c++", "cc", "hpp", "java", "kotlin", "kt", "cs", "csharp", "dart", "scala", "php",
        "objc", "objective-c":
        cLike
      case "rb", "ruby": ruby
      case "yaml", "yml", "toml", "ini", "conf", "properties": config
      case "css": css
      case "scss", "sass", "less": scss
      case "sql", "postgres", "postgresql", "mysql", "sqlite": sql
      case "html", "htm", "xml", "svg", "plist", "vue", "svelte": markup
      case "dockerfile", "docker", "makefile", "make", "gitignore", "env", "dotenv": hash
      default: nil
      }
    }

    /// The grammar for a workspace file, from its extension or well-known name.
    static func `for`(path: String) -> Grammar? {
      let name = (path as NSString).lastPathComponent.lowercased()
      switch name {
      case "dockerfile", "makefile", ".gitignore", ".env", ".dockerignore", ".npmignore": return hash
      default: break
      }
      if name.hasPrefix(".env.") { return hash }
      switch (name as NSString).pathExtension {
      case "vue", "svelte", "astro": return script
      case "m", "mm", "cxx", "hh", "kts": return cLike
      case "pyi": return python
      case "cfg": return config
      case "": return nil
      case let ext: return Self.for(ext)
      }
    }

    static let script = Grammar(
      keywords: [
        "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
        "debugger", "declare", "default", "delete", "do", "else", "enum", "export", "extends", "finally",
        "for", "from", "function", "get", "if", "implements", "import", "in", "instanceof", "interface",
        "keyof", "let", "namespace", "new", "of", "private", "protected", "public", "readonly", "return",
        "satisfies", "set", "static", "super", "switch", "this", "throw", "try", "type", "typeof", "var",
        "void", "while", "with", "yield",
      ],
      constants: ["true", "false", "null", "undefined", "NaN", "Infinity"],
      quotes: [34, 39, 96], dollarIdentifiers: true)

    static let swift = Grammar(
      keywords: [
        "actor", "any", "as", "associatedtype", "async", "await", "break", "case", "catch", "class",
        "continue", "default", "defer", "deinit", "do", "else", "enum", "extension", "fallthrough",
        "fileprivate", "final", "for", "func", "guard", "if", "import", "in", "init", "inout", "internal",
        "is", "isolated", "lazy", "let", "mutating", "nonisolated", "open", "operator", "override",
        "private", "protocol", "public", "repeat", "rethrows", "return", "self", "Self", "some", "static",
        "struct", "subscript", "super", "switch", "throw", "throws", "try", "typealias", "var", "weak",
        "where", "while",
      ],
      constants: ["true", "false", "nil"], quotes: [34], tripleQuotes: [Array("\"\"\"".utf16)])

    static let python = Grammar(
      keywords: [
        "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else",
        "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "match",
        "nonlocal", "not", "or", "pass", "raise", "return", "self", "try", "while", "with", "yield",
      ],
      constants: ["True", "False", "None"], lineComments: [Array("#".utf16)], blockComment: nil,
      tripleQuotes: [Array("\"\"\"".utf16), Array("'''".utf16)])

    static let json = Grammar(
      keywords: [], lineComments: [Array("//".utf16)], quotes: [34],
      punctuation: Set("{}[]:,".utf16), capitalTypes: false)

    static let shellGrammar = Grammar(
      keywords: [
        "if", "then", "else", "elif", "fi", "for", "in", "do", "done", "case", "esac", "while", "until",
        "function", "return", "export", "local", "readonly", "declare", "set", "unset", "source", "sudo",
        "echo", "cd", "exit",
      ],
      constants: [], lineComments: [Array("#".utf16)], blockComment: nil, quotes: [34, 39, 96],
      punctuation: Set("|&;<>()[]{}=".utf16), capitalTypes: false, dollarIdentifiers: false, shell: true)

    static let go = Grammar(
      keywords: [
        "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for",
        "func", "go", "goto", "if", "import", "interface", "map", "package", "range", "return", "select",
        "struct", "switch", "type", "var",
      ],
      constants: ["true", "false", "nil", "iota"], quotes: [34, 39, 96])

    static let rust = Grammar(
      keywords: [
        "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum", "extern",
        "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref",
        "return", "self", "Self", "static", "struct", "super", "trait", "type", "unsafe", "use", "where",
        "while",
      ],
      constants: ["true", "false", "None", "Some", "Ok", "Err"], quotes: [34, 39], lifetimes: true,
      macros: true)

    static let cLike = Grammar(
      keywords: [
        "abstract", "auto", "break", "case", "catch", "class", "const", "continue", "default", "delete",
        "do", "else", "enum", "extends", "extern", "final", "finally", "for", "fun", "goto", "if",
        "implements", "import", "include", "interface", "namespace", "new", "object", "override",
        "package", "private", "protected", "public", "return", "sealed", "static", "struct", "switch",
        "template", "this", "throw", "throws", "try", "typedef", "typename", "union", "using", "val", "var",
        "virtual", "void", "volatile", "when", "while", "int", "char", "float", "double", "long", "short",
        "unsigned", "signed", "bool", "boolean",
      ],
      constants: ["true", "false", "null", "nullptr", "NULL"])

    static let ruby = Grammar(
      keywords: [
        "begin", "break", "case", "class", "def", "do", "else", "elsif", "end", "ensure", "for", "if", "in",
        "module", "next", "raise", "require", "rescue", "return", "self", "then", "unless", "until", "when",
        "while", "yield",
      ],
      constants: ["true", "false", "nil"], lineComments: [Array("#".utf16)], blockComment: nil)

    /// YAML, TOML and INI: comments, strings and literals; keys stay plain.
    static let config = Grammar(
      keywords: [], constants: ["true", "false", "null", "yes", "no", "on", "off"],
      lineComments: [Array("#".utf16)], blockComment: nil, punctuation: Set("{}[]:,=-|>".utf16),
      capitalTypes: false, shell: true)

    static let css = Grammar(
      keywords: ["important"], constants: [], lineComments: [], capitalTypes: false)

    static let scss = Grammar(keywords: ["important"], constants: [], capitalTypes: false)

    static let sql = Grammar(
      keywords: [
        "add", "alter", "and", "as", "asc", "begin", "by", "case", "commit", "create", "delete", "desc",
        "distinct", "drop", "else", "end", "exists", "foreign", "from", "group", "having", "in", "index",
        "inner", "insert", "into", "is", "join", "key", "left", "like", "limit", "not", "null", "offset",
        "on", "or", "order", "outer", "primary", "references", "right", "select", "set", "table", "then",
        "union", "update", "values", "when", "where", "with",
      ],
      constants: ["true", "false", "TRUE", "FALSE"], lineComments: [Array("--".utf16)], capitalTypes: false,
      caseInsensitive: true)

    static let markup = Grammar(
      keywords: [], constants: [], lineComments: [], blockComment: (Array("<!--".utf16), Array("-->".utf16)),
      quotes: [34], punctuation: Set("<>/=".utf16), capitalTypes: false, shell: true)

    /// Dockerfiles, Makefiles and ignore files: `#` comments and strings.
    static let hash = Grammar(
      keywords: [], constants: [], lineComments: [Array("#".utf16)], blockComment: nil,
      punctuation: Set("=:$(){}".utf16), capitalTypes: false, shell: true)
  }
}
