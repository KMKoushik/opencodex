import SwiftUI

/// Picks the project for a new chat, most recently active first.
struct NewChatSheet: View {
  let model: HomeModel
  let start: (_ directory: String) -> Void
  @Environment(\.dismiss) private var dismiss

  private var projects: [HomeProject] {
    model.projects.sorted { $0.activeAt > $1.activeAt }
  }

  var body: some View {
    NavigationStack {
      List(projects) { project in
        Button {
          start(project.canonical)
        } label: {
          HStack(spacing: 12) {
            Image(systemName: "folder")
              .foregroundStyle(Color.accentColor)
              .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
              Text(project.displayName)
                .foregroundStyle(.primary)
              Text(Self.abbreviated(project.canonical))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.head)
            }
          }
        }
        .tint(.primary)
        .accessibilityIdentifier("project-\(project.displayName)")
      }
      .overlay {
        if projects.isEmpty {
          ContentUnavailableView(
            "No Projects", systemImage: "folder",
            description: Text("Open a project on your computer, then start a chat here."))
        }
      }
      .navigationTitle("New Chat")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
        }
      }
      .task { await model.loadProjects() }
    }
    .presentationDetents([.medium, .large])
  }

  /// `/Users/me/code/app` → `~/code/app`; other paths unchanged.
  static func abbreviated(_ path: String) -> String {
    let parts = path.split(separator: "/", omittingEmptySubsequences: true)
    if parts.count >= 2, parts[0] == "Users" {
      return "~/" + parts.dropFirst(2).joined(separator: "/")
    }
    return path
  }
}
