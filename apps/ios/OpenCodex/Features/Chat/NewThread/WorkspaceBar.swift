import SwiftUI

/// Where an unsent chat will work, under its composer, like the desktop's workspace bar:
/// Local (the project folder) or a new worktree from a branch, created by the first send.
/// Hidden for projects without version control, like the desktop.
struct WorkspaceBar: View {
  let model: ChatModel
  let directory: String
  let projects: [SessionDetails.Project]?
  /// nil until loaded; an empty string is a detached HEAD.
  @State private var branch: String?
  @State private var branches: [String] = []
  @Environment(\.palette) private var palette

  private var client: GatewayClient { model.client }

  var body: some View {
    HStack(spacing: 2) {
      if model.startingWorktree {
        Label("Creating worktree…", systemImage: "arrow.triangle.branch")
          .foregroundStyle(palette.color("text-secondary"))
          .padding(.horizontal, 8)
      } else if checkout?.local == true {
        Menu {
          Picker("Where this chat works", selection: worktreeMode) {
            Label("Local", systemImage: "folder").tag(false)
            Label("New worktree", systemImage: "folder.badge.gearshape").tag(true)
          }
        } label: {
          Label {
            HStack(spacing: 3) {
              Text(model.worktree == nil ? "Local" : "New worktree")
              Image(systemName: "chevron.down").imageScale(.small)
            }
          } icon: {
            Image(systemName: model.worktree == nil ? "folder" : "folder.badge.gearshape")
          }
          .foregroundStyle(palette.color("text-secondary"))
          .padding(.horizontal, 8)
          .frame(minHeight: 30)
        }
        .accessibilityIdentifier("newThread.workspace.mode")
        if model.worktree != nil {
          Menu {
            Picker("Starting branch", selection: startBranch) {
              Text("Current branch\(branch.map { $0.isEmpty ? "" : " (\($0))" } ?? "")")
                .tag(String?.none)
              ForEach(branches, id: \.self) { name in Text(name).tag(Optional(name)) }
            }
          } label: {
            Label {
              HStack(spacing: 3) {
                Text(model.worktree?.branch ?? branch.flatMap { $0.isEmpty ? nil : $0 } ?? "HEAD")
                  .lineLimit(1)
                Image(systemName: "chevron.down").imageScale(.small)
              }
            } icon: {
              Image(systemName: "arrow.triangle.branch")
            }
            .foregroundStyle(palette.color("text-tertiary"))
            .padding(.horizontal, 8)
            .frame(minHeight: 30)
          }
          .accessibilityLabel("Starting branch")
          .accessibilityValue(model.worktree?.branch ?? branch.flatMap { $0.isEmpty ? nil : $0 } ?? "HEAD")
          .accessibilityIdentifier("newThread.workspace.branch")
          .task { branches = (try? await client.branches(directory: directory)) ?? [] }
        } else if let branch {
          Label {
            Text(branch.isEmpty ? "Detached HEAD" : branch).lineLimit(1)
          } icon: {
            Image(systemName: "arrow.triangle.branch")
          }
          .foregroundStyle(palette.color("text-tertiary"))
          .padding(.horizontal, 8)
          .accessibilityLabel("Current branch \(branch.isEmpty ? "Detached HEAD" : branch)")
        }
      }
      Spacer(minLength: 0)
    }
    .font(.footnote.weight(.medium))
    .labelStyle(BarLabelStyle())
    .frame(minHeight: 30)
    .padding(.horizontal, 16)
    .padding(.bottom, 4)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Workspace")
    .accessibilityIdentifier("newThread.workspace")
    .task(id: checkout?.canonical) { await load() }
  }

  private var worktreeMode: Binding<Bool> {
    Binding(
      get: { model.worktree != nil },
      set: { model.worktree = $0 ? ChatModel.Worktree(branch: nil) : nil })
  }

  private var startBranch: Binding<String?> {
    Binding(
      get: { model.worktree?.branch },
      set: { model.worktree = ChatModel.Worktree(branch: $0) })
  }

  private var checkout: SessionDetails.Checkout? {
    guard let projects else { return nil }
    let checkout = SessionDetails.Checkout(
      project: projects.first { $0.canonical == directory }, directory: directory)
    return checkout.canonical != nil ? checkout : nil
  }

  private func load() async {
    branch = nil
    guard checkout != nil else { return }
    if let vcs = try? await client.vcsSummary(directory: directory) {
      branch = vcs.info.branch.current ?? ""
    }
  }
}

private struct BarLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 6) {
      configuration.icon.imageScale(.small)
      configuration.title
    }
  }
}
