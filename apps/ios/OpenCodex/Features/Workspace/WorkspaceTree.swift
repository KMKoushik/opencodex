import Foundation

/// One visible row of a file tree.
nonisolated struct TreeRow: Hashable, Identifiable, Sendable {
  /// Project-relative path; folders have no trailing slash.
  var path: String
  /// What the row shows: a file or folder name, or `a/b` for flattened single-folder chains.
  var name: String
  var depth: Int
  var folder: Bool
  var expanded = false
  /// A file's change status.
  var status: ChangeStatus?
  /// A folder that holds changed files.
  var changed = false
  /// A folder whose children are loading.
  var loading = false

  var id: String { folder ? path + "/" : path }
}

/// Flattens file trees into rows, like the desktop's `@pierre/trees`: folders first, then files,
/// in natural order; only expanded folders contribute children.
nonisolated enum WorkspaceTree {
  /// A tree built from full paths, as the Changes view and file search show it. Every folder is
  /// open unless collapsed. With `flatten`, a folder whose only child is a folder shares its row.
  static func rows(
    paths: [String], statuses: [String: ChangeStatus], collapsed: Set<String> = [],
    flatten: Bool
  ) -> [TreeRow] {
    let root = Node()
    for path in paths {
      var node = root
      let parts = path.split(separator: "/", omittingEmptySubsequences: true)
      for (index, part) in parts.enumerated() {
        let name = String(part)
        let isFile = index == parts.count - 1
        if let next = node.children[name] {
          node = next
        } else {
          let next = Node()
          next.file = isFile
          node.children[name] = next
          node = next
        }
      }
    }
    let changedFolders = ancestors(of: statuses.keys)
    var rows: [TreeRow] = []
    rows.reserveCapacity(paths.count * 2)
    func walk(_ node: Node, prefix: String, depth: Int) {
      for (name, child) in sorted(node.children) {
        var path = prefix.isEmpty ? name : "\(prefix)/\(name)"
        if child.file {
          rows.append(TreeRow(path: path, name: name, depth: depth, folder: false, status: statuses[path]))
          continue
        }
        var label = name
        var folder = child
        while flatten, folder.children.count == 1, let only = folder.children.first, !only.value.file {
          label += "/" + only.key
          path += "/" + only.key
          folder = only.value
        }
        let open = !collapsed.contains(path)
        rows.append(
          TreeRow(
            path: path, name: label, depth: depth, folder: true, expanded: open,
            changed: changedFolders.contains(path)))
        if open { walk(folder, prefix: path, depth: depth + 1) }
      }
    }
    walk(root, prefix: "", depth: 0)
    return rows
  }

  /// The lazily loaded project tree: `folders` maps a folder path (`""` is the root) to its
  /// loaded children. Unloaded expanded folders show as loading.
  static func rows(
    folders: [String: [WorkspaceEntry]], expanded: Set<String>, statuses: [String: ChangeStatus],
    changedFolders: Set<String>
  ) -> [TreeRow] {
    var rows: [TreeRow] = []
    func walk(_ folder: String, depth: Int) {
      guard let entries = folders[folder] else { return }
      for entry in sortedEntries(entries) {
        let path = entry.trimmed
        let name = (path as NSString).lastPathComponent
        if entry.isFolder {
          let open = expanded.contains(path)
          rows.append(
            TreeRow(
              path: path, name: name, depth: depth, folder: true, expanded: open,
              changed: changedFolders.contains(path), loading: open && folders[path] == nil))
          if open { walk(path, depth: depth + 1) }
        } else {
          rows.append(TreeRow(path: path, name: name, depth: depth, folder: false, status: statuses[path]))
        }
      }
    }
    walk("", depth: 0)
    return rows
  }

  /// Every folder that contains one of `paths`.
  static func ancestors(of paths: some Sequence<String>) -> Set<String> {
    var folders = Set<String>()
    for path in paths {
      var current = Substring(path)
      while let slash = current.lastIndex(of: "/") {
        current = current[..<slash]
        if !folders.insert(String(current)).inserted { break }
      }
    }
    return folders
  }

  private final class Node {
    var children: [String: Node] = [:]
    var file = false
  }

  private static func sorted(_ children: [String: Node]) -> [(String, Node)] {
    children.sorted { a, b in
      if a.value.file != b.value.file { return !a.value.file }
      return a.key.localizedStandardCompare(b.key) == .orderedAscending
    }
  }

  private static func sortedEntries(_ entries: [WorkspaceEntry]) -> [WorkspaceEntry] {
    entries.sorted { a, b in
      if a.isFolder != b.isFolder { return a.isFolder }
      return a.trimmed.localizedStandardCompare(b.trimmed) == .orderedAscending
    }
  }
}
