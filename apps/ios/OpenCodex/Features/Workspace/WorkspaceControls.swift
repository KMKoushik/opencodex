import SwiftUI

extension View {
  /// Draws a CSS `box-shadow` token's outer layers; inset highlights are left out.
  func workspaceShadow(_ layers: [Palette.Shadow]) -> some View {
    let outer = layers.filter { !$0.inset }
    return self
      .shadow(
        color: Color(uiColor: outer.first?.color ?? .clear), radius: (outer.first?.blur ?? 0) / 2,
        x: outer.first?.x ?? 0, y: outer.first?.y ?? 0)
      .shadow(
        color: Color(uiColor: outer.dropFirst().first?.color ?? .clear),
        radius: (outer.dropFirst().first?.blur ?? 0) / 2, x: outer.dropFirst().first?.x ?? 0,
        y: outer.dropFirst().first?.y ?? 0)
  }
}

/// The desktop's file icons (`@pierre/trees`), as SF Symbols or the same small language badges.
struct FileIcon: View {
  let name: String
  var tint = "text-tertiary"
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      switch Self.icon(for: name) {
      case .symbol(let symbol):
        Image(systemName: symbol)
          .font(.system(size: 13, weight: .regular))
      case .badge(let text):
        Text(text)
          .font(.system(size: 8, weight: .semibold, design: .rounded))
          .padding(.horizontal, 2)
          .frame(minWidth: 16, minHeight: 13)
          .overlay {
            RoundedRectangle(cornerRadius: 3).strokeBorder(palette.color(tint).opacity(0.5), lineWidth: 0.75)
          }
      }
    }
    .foregroundStyle(palette.color(tint))
    .frame(width: 20)
    .accessibilityHidden(true)
  }

  enum Icon: Equatable {
    case symbol(String)
    case badge(String)
  }

  static func icon(for name: String) -> Icon {
    let lower = name.lowercased()
    let ext = (lower as NSString).pathExtension
    switch lower {
    case "dockerfile": return .symbol("shippingbox")
    case "makefile": return .symbol("hammer")
    case "license", "licence", "license.md": return .symbol("checkmark.seal")
    case ".gitignore", ".gitattributes", ".gitmodules": return .symbol("arrow.triangle.branch")
    case ".env", ".npmrc", ".editorconfig", ".prettierrc": return .symbol("gearshape")
    default: break
    }
    switch ext {
    case "ts", "mts", "cts": return .badge("TS")
    case "js", "mjs", "cjs": return .badge("JS")
    case "tsx", "jsx": return .symbol("atom")
    case "md", "mdx", "markdown", "mdown": return .badge("M↓")
    case "py": return .badge("PY")
    case "go": return .badge("GO")
    case "rs": return .badge("RS")
    case "rb": return .badge("RB")
    case "java", "kt", "kts", "scala": return .badge(ext == "java" ? "JV" : "KT")
    case "c", "h": return .badge("C")
    case "cc", "cpp", "cxx", "hpp", "hh": return .badge("C++")
    case "cs": return .badge("C#")
    case "php": return .badge("PHP")
    case "swift": return .symbol("swift")
    case "json", "jsonc", "json5": return .symbol("curlybraces")
    case "css", "scss", "sass", "less": return .symbol("number")
    case "html", "htm", "xml", "vue", "svelte", "astro": return .symbol("chevron.left.forwardslash.chevron.right")
    case "sh", "bash", "zsh", "fish", "ps1": return .symbol("terminal")
    case "yml", "yaml", "toml", "ini", "conf", "cfg", "plist", "properties": return .symbol("gearshape")
    case "png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "ico", "svg", "avif": return .symbol("photo")
    case "pdf": return .symbol("doc.richtext")
    case "mp4", "mov", "m4v", "webm", "mkv", "avi": return .symbol("film")
    case "mp3", "wav", "m4a", "aac", "flac", "ogg": return .symbol("waveform")
    case "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar": return .symbol("doc.zipper")
    case "lock", "lockb": return .symbol("lock")
    case "sql", "db", "sqlite": return .symbol("cylinder")
    case "docx", "doc", "rtf", "pages": return .symbol("doc.text")
    case "csv", "tsv", "xlsx", "xls": return .symbol("tablecells")
    case "txt", "log": return .symbol("doc.plaintext")
    default: return .symbol("doc")
    }
  }
}

/// The desktop's `.wb-empty`: loading notes get the native spinner; other notes are a
/// `ContentUnavailableView`.
struct WorkspaceEmpty: View {
  var symbol: String?
  var title: String?
  var message: String
  var note: String?

  var body: some View {
    if message.hasSuffix("…"), symbol == nil, title == nil {
      PanelLoading(message)
    } else {
      PanelUnavailable(
        title ?? message, systemImage: symbol ?? "doc",
        message: title == nil ? note : [message, note].compactMap { $0 }.joined(separator: "\n"))
    }
  }
}

/// The desktop's `QueryError`: the gateway's message in `error`, with Retry.
struct WorkspaceError: View {
  let message: String
  let retry: () -> Void

  var body: some View {
    PanelUnavailable(
      "Couldn’t load this", systemImage: "exclamationmark.triangle", message: message, tone: "error"
    ) {
      Button("Retry", action: retry)
        .buttonStyle(WorkspaceButtonStyle())
        .accessibilityIdentifier("workspace-retry")
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("workspace-error")
  }
}

/// The desktop's secondary button: a glazed chip.
struct WorkspaceButtonStyle: ButtonStyle {
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.footnote.weight(.medium))
      .foregroundStyle(palette.color("text"))
      .padding(.horizontal, 14)
      .frame(minHeight: 32)
      .background(palette.gradient("chip"), in: .rect(cornerRadius: 8, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .strokeBorder(palette.color("chip-border"), lineWidth: 0.5)
      }
      .opacity(configuration.isPressed ? 0.7 : 1)
      .contentShape(.rect)
  }
}

/// The desktop's `.wb-notice`: a small tertiary note.
struct WorkspaceNotice: View {
  let text: String
  var token = "text-tertiary"
  @Environment(\.palette) private var palette

  var body: some View {
    Text(text)
      .font(.caption)
      .foregroundStyle(palette.color(token))
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
  }
}

/// A diff status's icon, as in the desktop diff header.
struct ChangeStatusIcon: View {
  let status: ChangeStatus
  @Environment(\.palette) private var palette

  var body: some View {
    Image(systemName: symbol)
    .font(.system(size: 15))
    .foregroundStyle(palette.color(status.token))
    .accessibilityLabel(status.rawValue.capitalized)
  }

  private var symbol: String {
    switch status {
    case .added: "plus.square"
    case .deleted: "minus.square"
    case .modified: "dot.square"
    }
  }
}

enum ByteFormat {
  /// "1.2 MiB", like the desktop's media notes.
  static func mebibytes(_ bytes: Int) -> String {
    (Double(bytes) / (1024 * 1024)).formatted(.number.precision(.fractionLength(0...1))) + " MiB"
  }

  static func kilobytes(_ bytes: Int) -> String {
    (Double(bytes) / 1024).formatted(.number.precision(.fractionLength(0...1))) + " KB"
  }
}
