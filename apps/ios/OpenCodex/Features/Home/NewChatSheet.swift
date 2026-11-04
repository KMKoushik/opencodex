import SwiftUI

/// Picks the project for a new thread, most recently active first.
struct NewChatSheet: View {
  let model: HomeModel
  let start: (_ directory: String) -> Void
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  var body: some View {
    NavigationStack {
      List(model.projects) { project in
        Button {
          start(project.canonical)
        } label: {
          HStack(spacing: 12) {
            ProjectIcon(
              badge: ProjectBadge(name: project.displayName, icon: project.icon), size: 28)
            VStack(alignment: .leading, spacing: 2) {
              Text(project.displayName)
                .foregroundStyle(palette.color("text"))
              Text(Self.abbreviated(project.canonical))
                .font(.footnote)
                .foregroundStyle(palette.color("text-tertiary"))
                .lineLimit(1)
                .truncationMode(.head)
            }
            Spacer(minLength: 0)
          }
          .frame(minHeight: 52)
          .contentShape(.rect)
        }
        .buttonStyle(NavRowStyle())
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
        .accessibilityIdentifier("project-\(project.displayName)")
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(palette.color("surface"))
      .overlay {
        if model.projects.isEmpty {
          Text("Open a project on your computer, then start a thread here.")
            .font(.subheadline)
            .foregroundStyle(palette.color("text-tertiary"))
            .multilineTextAlignment(.center)
            .padding(32)
        }
      }
      .navigationTitle("New thread")
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
