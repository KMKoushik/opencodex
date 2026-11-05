import SwiftUI

/// "Enable full access…" on approval cards. Port of the desktop `permission-control.tsx` request
/// variant: it asks first, then turns the thread's full access on. The composer's own toggle is
/// in its "+" menu.
struct PermissionControl: View {
  let model: ChatModel
  var disabled = false

  @Environment(\.palette) private var palette
  @State private var confirm = false
  @State private var pending = false

  var body: some View {
    Button("Enable full access…") { confirm = true }
      .buttonStyle(.borderless)
      .foregroundStyle(palette.color("text-secondary"))
      .disabled(disabled || pending || model.session == nil)
      .accessibilityLabel("Enable full access for this thread")
      .accessibilityIdentifier("permission.fullAccess")
      .alert("Enable full access?", isPresented: $confirm) {
        Button("Cancel", role: .cancel) {}
        Button("Enable full access") { Task { await enable() } }
      } message: {
        Text(Self.warning)
      }
  }

  private func enable() async {
    guard !pending else { return }
    pending = true
    await model.setFullAccess(true)
    pending = false
  }

  /// The desktop's confirmation text for turning full access on.
  static let warning =
    "This agent can read and change files outside the project and run commands without approval, including destructive commands and access to secrets. Only enable this for work you trust.\n\nApplies to this thread and new subagents. Existing subagents keep their own permissions. Pending approvals in this thread will be allowed. Your global OpenCode settings stay unchanged; server policies still apply."
}
