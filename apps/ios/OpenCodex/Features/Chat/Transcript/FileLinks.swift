import Foundation
import SwiftUI

/// A workspace file a chat link points at: the folder to read it from and its path there.
nonisolated struct FileLinkTarget: Hashable, Identifiable, Sendable {
  var directory: String
  var path: String
  var id: String { directory + "/" + path }

  /// Port of the desktop's `resolveFileLink`: relative and absolute paths and `file:` URLs
  /// resolve against the chat's folder; a file outside it opens from its own folder. Web
  /// links, anchors and other schemes are not files.
  static func resolve(_ href: String, directory: String) -> FileLinkTarget? {
    guard !href.isEmpty, !href.hasPrefix("#"), !href.hasPrefix("//") else { return nil }
    var rest = href
    if let scheme = href.range(of: #"^[a-zA-Z][a-zA-Z\d+.-]*:"#, options: .regularExpression) {
      guard href[scheme].lowercased() == "file:" else { return nil }
      rest = String(href[scheme.upperBound...])
      if rest.hasPrefix("//") {
        // `file://host/path`: only a local host.
        let afterSlashes = rest.dropFirst(2)
        let host = afterSlashes.prefix { $0 != "/" }
        guard host.isEmpty || host == "localhost" else { return nil }
        rest = String(afterSlashes.dropFirst(host.count))
      }
    }
    // The URL's path only: drop any query or fragment.
    if let end = rest.firstIndex(where: { $0 == "?" || $0 == "#" }) { rest = String(rest[..<end]) }
    guard let decoded = rest.removingPercentEncoding ?? Optional(rest),
      !decoded.contains("\0"), !decoded.contains("\\"), !decoded.hasSuffix("/"), !decoded.isEmpty
    else { return nil }
    let root = directory.hasSuffix("/") ? String(directory.dropLast()) : directory
    let joined = decoded.hasPrefix("/") ? decoded : root + "/" + decoded
    var segments: [Substring] = []
    for segment in joined.split(separator: "/", omittingEmptySubsequences: true) {
      if segment == ".." {
        _ = segments.popLast()
      } else if segment != "." {
        segments.append(segment)
      }
    }
    let absolute = "/" + segments.joined(separator: "/")
    if absolute.hasPrefix(root + "/") {
      return FileLinkTarget(directory: directory, path: String(absolute.dropFirst(root.count + 1)))
    }
    guard let name = segments.popLast() else { return nil }
    return FileLinkTarget(directory: "/" + segments.joined(separator: "/"), path: String(name))
  }
}

/// A linked file, previewed in a sheet over the chat (the desktop opens it in the workspace
/// panel beside the chat).
struct FileLinkSheet: View {
  let target: FileLinkTarget
  @State private var workspace: WorkspaceModel
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  init(target: FileLinkTarget, client: GatewayClient, events: EventHub) {
    self.target = target
    _workspace = State(
      initialValue: WorkspaceModel(client: client, events: events, directory: target.directory))
  }

  var body: some View {
    NavigationStack {
      FilePreviewScreen(model: workspace, path: target.path)
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            Button("Close", systemImage: "xmark") { dismiss() }
              .accessibilityIdentifier("transcript.file.close")
          }
        }
    }
    .tint(palette.color("text"))
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
  }
}
