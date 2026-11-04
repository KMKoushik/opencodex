import SwiftUI

/// A document opened from the workspace tree.
enum WorkspaceDocument: Hashable {
  case file(String)
  case diff(String, CompareMode)
}

/// The desktop's right-rail workspace panel (Files and Changes) as a full-screen sheet: the
/// explorer is the root screen and documents push on top, like the panel's tree and tabs.
struct WorkspaceView: View {
  @State private var model: WorkspaceModel
  @State private var path: [WorkspaceDocument] = []
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  /// `segment` opens on Files or Changes, e.g. from Session details' changes row; nil keeps
  /// the last one used.
  init(
    client: GatewayClient, events: EventHub, directory: String,
    segment: WorkspaceModel.Segment? = nil
  ) {
    let model = WorkspaceModel(client: client, events: events, directory: directory)
    if let segment { model.segment = segment }
    _model = State(initialValue: model)
  }

  var body: some View {
    NavigationStack(path: $path) {
      WorkspaceExplorer(model: model) { path.append($0) }
        .navigationTitle(model.segment == .changes ? "Changes" : "Files")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            Button("Close workspace panel", systemImage: "xmark") { dismiss() }
              .accessibilityIdentifier("workspace-close")
          }
          ToolbarItem(placement: .topBarTrailing) {
            Button("Refresh workspace", systemImage: "arrow.clockwise") {
              Task { await model.refresh() }
            }
            .accessibilityIdentifier("workspace-refresh")
          }
        }
        .navigationDestination(for: WorkspaceDocument.self) { document in
          switch document {
          case .file(let file):
            FilePreviewScreen(model: model, path: file)
          case .diff(let file, let mode):
            DiffScreen(model: model, path: file, mode: mode) { self.path.append(.file(file)) }
          }
        }
    }
    .tint(palette.color("text"))
    .task { await model.run() }
  }
}

/// The explorer: Files/Changes switch, comparison, filter, tree and totals.
private struct WorkspaceExplorer: View {
  @Bindable var model: WorkspaceModel
  let open: (WorkspaceDocument) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      header
      rule
      list
      rule
      footer
    }
    .background(palette.color("surface-under"))
    .task(id: SearchKey(text: model.search, segment: model.segment)) {
      if model.segment == .files, !model.search.trimmingCharacters(in: .whitespaces).isEmpty {
        try? await Task.sleep(for: .milliseconds(180))
        guard !Task.isCancelled else { return }
      }
      await model.applySearch()
    }
  }

  private struct SearchKey: Hashable {
    var text: String
    var segment: WorkspaceModel.Segment
  }

  private var rule: some View {
    Rectangle().fill(palette.color("border")).frame(height: 1 / 3)
  }

  private var header: some View {
    VStack(spacing: 10) {
      WorkspaceSegmented(
        label: "Workspace view", selection: $model.segment,
        options: [
          .init(value: .files, label: "All files", identifier: "workspace-files"),
          .init(
            value: .changes, label: "Changes", badge: model.changes.map { "\($0.count)" },
            identifier: "workspace-changes"),
        ])
      if model.segment == .changes {
        WorkspaceSegmented(
          label: "Compare changes against", selection: $model.mode,
          options: CompareMode.allCases.map {
            .init(value: $0, label: $0.label, identifier: "workspace-mode-\($0.rawValue)")
          })
      }
      HStack(spacing: 6) {
        FilterField(
          text: $model.search,
          label: model.segment == .files ? "Find files" : "Filter changed files")
        Button {
          model.collapseAll()
        } label: {
          Image(systemName: "minus")
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(palette.color("text-secondary"))
            .frame(width: 36, height: 36)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Collapse folders")
      }
    }
    .padding(.horizontal, 12)
    .padding(.top, 8)
    .padding(.bottom, 10)
  }

  @ViewBuilder private var list: some View {
    let rows = model.rows()
    ZStack(alignment: .top) {
      List {
        ForEach(rows) { row in
          TreeRowView(row: row, selected: model.selected == row.path) {
            if row.folder {
              model.toggle(row)
            } else {
              model.selected = row.path
              open(model.segment == .changes ? .diff(row.path, model.mode) : .file(row.path))
            }
          }
          .listRowInsets(EdgeInsets())
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
        }
        if model.segment == .files, !model.query.isEmpty, model.found?.count == 200 {
          WorkspaceNotice(text: "First 200 results. Narrow your search.")
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .environment(\.defaultMinListRowHeight, 1)
      .scrollDismissesKeyboard(.immediately)
      .accessibilityIdentifier(model.segment == .files ? "File explorer" : "Changes explorer")
      status(empty: rows.isEmpty)
    }
    .frame(maxHeight: .infinity)
  }

  /// Loading, empty and error notes above the tree, worded as on the desktop.
  @ViewBuilder private func status(empty: Bool) -> some View {
    switch model.segment {
    case .changes:
      if let error = model.changesError, model.changes == nil {
        WorkspaceError(message: error) { Task { await model.loadChanges() } }
      } else if model.changes == nil {
        WorkspaceNotice(text: "Loading changes…")
      } else if model.changes?.isEmpty == true {
        WorkspaceNotice(text: "No changes.")
      }
    case .files:
      if !model.query.isEmpty, let error = model.findError {
        WorkspaceError(message: error) { Task { await model.applySearch() } }
      } else if let error = model.folderError, model.query.isEmpty, error.path.isEmpty || empty {
        WorkspaceError(message: error.message) { Task { await model.loadFolder(error.path) } }
      } else if model.folders[""] == nil, model.query.isEmpty {
        WorkspaceNotice(text: "Loading files…")
      }
    }
  }

  private var footer: some View {
    let totals = model.totals
    return HStack(spacing: 8) {
      Text(
        model.segment == .changes ? "\((model.changes ?? []).count) changed" : "Project files"
      )
      .foregroundStyle(palette.color("text-tertiary"))
      Spacer()
      Text("+\(totals.additions.formatted())").foregroundStyle(palette.color("success"))
      Text("−\(totals.deletions.formatted())").foregroundStyle(palette.color("error"))
    }
    .font(.system(.caption, design: .monospaced))
    .monospacedDigit()
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("workspace-footer")
  }
}

/// The desktop tree's text input.
private struct FilterField: View {
  @Binding var text: String
  let label: String
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 13))
        .foregroundStyle(palette.color("text-tertiary"))
      TextField(
        label, text: $text,
        prompt: Text("Filter files…").foregroundStyle(palette.color("text-tertiary")))
        .font(.subheadline)
        .foregroundStyle(palette.color("text"))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.search)
        .accessibilityIdentifier("workspace-filter")
      if !text.isEmpty {
        Button("Clear filter", systemImage: "xmark.circle.fill") { text = "" }
          .labelStyle(.iconOnly)
          .font(.system(size: 14))
          .foregroundStyle(palette.color("text-tertiary"))
          .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, 10)
    .frame(height: 36)
    .background(palette.color("control"), in: .rect(cornerRadius: 9, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 9, style: .continuous)
        .strokeBorder(palette.color("border-heavy"), lineWidth: 0.5)
    }
  }
}

/// One tree row: chevron for folders, icon for files, status letter or changed-folder dot.
private struct TreeRowView: View {
  let row: TreeRow
  let selected: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if row.folder {
          Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(palette.color("text-tertiary"))
            .rotationEffect(.degrees(row.expanded ? 90 : 0))
            .frame(width: 20)
        } else {
          FileIcon(name: row.name)
        }
        Text(row.name)
          .font(.subheadline)
          .foregroundStyle(palette.color(selected ? "text" : "text-secondary"))
          .lineLimit(1)
          .truncationMode(.middle)
        Spacer(minLength: 8)
        if row.loading {
          ProgressView().controlSize(.mini)
        } else if let status = row.status {
          Text(status.letter)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(palette.color(status.token))
            .frame(width: 16)
        } else if row.folder, row.changed {
          Circle()
            .fill(palette.color("warning").opacity(0.55))
            .frame(width: 6, height: 6)
            .frame(width: 16)
        }
      }
      .padding(.leading, 12 + CGFloat(row.depth) * 14)
      .padding(.trailing, 14)
      .frame(minHeight: 44)
      .background {
        if selected {
          RoundedRectangle(cornerRadius: 7, style: .continuous)
            .fill(palette.color("selected"))
            .padding(.horizontal, 6)
        }
      }
      .contentShape(.rect)
    }
    .buttonStyle(TreeRowStyle())
    .accessibilityLabel(accessibility)
    .accessibilityIdentifier("tree-\(row.id)")
  }

  private var accessibility: String {
    var parts = [row.name]
    if row.folder { parts.append(row.expanded ? "expanded folder" : "folder") }
    if let status = row.status { parts.append(status.rawValue) }
    return parts.joined(separator: ", ")
  }
}

private struct TreeRowStyle: ButtonStyle {
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background {
        if configuration.isPressed {
          RoundedRectangle(cornerRadius: 7, style: .continuous)
            .fill(palette.color("hover"))
            .padding(.horizontal, 6)
        }
      }
  }
}

