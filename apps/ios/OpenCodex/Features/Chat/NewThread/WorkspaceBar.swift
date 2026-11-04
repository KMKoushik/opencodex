import SwiftUI

/// Where an unsent chat will work, under its composer: "Local" and the checkout's current
/// branch, like the desktop's workspace bar. Read-only for now: starting in a new worktree
/// needs the send to call `/sessions/:id/worktree` between creating the chat and prompting it.
/// Hidden for projects without version control, like the desktop.
struct WorkspaceBar: View {
  let client: GatewayClient
  let directory: String
  let projects: [SessionDetails.Project]?
  /// nil until loaded; an empty string is a detached HEAD.
  @State private var branch: String?
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 2) {
      if checkout?.local == true {
        Label {
          Text("Local")
        } icon: {
          Image(systemName: "folder")
        }
        .foregroundStyle(palette.color("text-secondary"))
        .padding(.horizontal, 8)
        if let branch {
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
