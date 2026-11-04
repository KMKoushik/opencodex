import SwiftUI

/// "Permissions" / "Full access" in the composer, and "Enable full access…" on approval cards.
/// Port of the desktop `permission-control.tsx`: turning full access on asks first; turning it
/// off restores OpenCode's permissions at once.
struct PermissionControl: View {
  let model: ChatModel
  /// The approval card's variant: only ever enables.
  var request = false
  var disabled = false
  /// An unsent thread's choice, applied once its first message creates it.
  var draft: Binding<Bool>?

  @Environment(\.palette) private var palette
  @State private var confirm = false
  @State private var pending = false

  private var full: Bool { draft?.wrappedValue ?? model.session?.fullAccess ?? false }

  var body: some View {
    Button {
      if full && !request {
        if let draft { draft.wrappedValue = false } else { Task { await set(false) } }
      } else {
        confirm = true
      }
    } label: {
      if request {
        Text("Enable full access…")
      } else {
        HStack(spacing: 6) {
          Image(systemName: full ? "bolt.shield" : "shield")
            .font(.system(size: 15, weight: .regular))
          Text(full ? "Full access" : "Permissions")
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(palette.color(full ? "accent" : "text-secondary"))
        .padding(.horizontal, 8)
        .frame(minHeight: 32)
        .frame(minHeight: 44)
        .contentShape(.rect)
      }
    }
    .buttonStyle(request ? AnyButtonStyle(DesktopButtonStyle(variant: .ghost, small: true)) : AnyButtonStyle(GhostButtonStyle()))
    .disabled(disabled || pending || (model.session == nil && draft == nil))
    .accessibilityLabel(
      request
        ? "Enable full access for this thread"
        : full ? "Full access: restore OpenCode permissions" : "Permissions: enable full access")
    .accessibilityAddTraits(!request && full ? .isSelected : [])
    .accessibilityIdentifier(request ? "permission.fullAccess" : "composer.permissions")
    .alert("Enable full access?", isPresented: $confirm) {
      Button("Cancel", role: .cancel) {}
      Button("Enable full access") {
        if let draft { draft.wrappedValue = true } else { Task { await set(true) } }
      }
    } message: {
      Text(
        "This agent can read and change files outside the project and run commands without approval, including destructive commands and access to secrets. Only enable this for work you trust.\n\nApplies to this thread and new subagents. Existing subagents keep their own permissions. Pending approvals in this thread will be allowed. Your global OpenCode settings stay unchanged; server policies still apply."
      )
    }
  }

  private func set(_ on: Bool) async {
    guard !pending else { return }
    pending = true
    await model.setFullAccess(on)
    pending = false
  }
}

/// Lets one call site pick between button styles.
struct AnyButtonStyle: ButtonStyle {
  private let make: (Configuration) -> AnyView
  init<S: ButtonStyle>(_ style: S) { make = { AnyView(style.makeBody(configuration: $0)) } }
  func makeBody(configuration: Configuration) -> some View { make(configuration) }
}
