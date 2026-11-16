import SwiftUI

/// "+": what to add to the message, as a sheet like Claude's "Add to Chat": large Camera,
/// Photos and Files tiles, then Full access (the desktop's Permissions control).
///
/// A sheet rather than a menu: a menu opened over the keyboard sometimes swallowed the tap,
/// and the photo picker cancelled itself when it opened while the keyboard was still up. The
/// composer puts the keyboard down before this sheet comes up, and opens the chosen picker
/// only once the sheet has gone.
struct AttachSheet: View {
  enum Choice { case camera, photos, files, fullAccessOn }

  let cameraAvailable: Bool
  /// False at the attachment limit.
  let canAttach: Bool
  let fullAccess: Bool
  let fullAccessLocked: Bool
  /// Closes the sheet; the composer acts on the choice once it has gone.
  let onChoose: (Choice) -> Void
  let onFullAccessOff: () -> Void

  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 18) {
      ZStack {
        Text("Add to Chat")
          .font(.headline)
          .foregroundStyle(palette.color("text"))
        HStack {
          Button("Close", systemImage: "xmark") { dismiss() }
            .labelStyle(.iconOnly)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(palette.color("text-secondary"))
            .frame(width: 40, height: 40)
            .glassEffect(.regular.interactive(), in: .circle)
            .accessibilityIdentifier("attach.close")
          Spacer()
        }
      }

      HStack(spacing: 10) {
        if cameraAvailable {
          tile("Camera", systemImage: "camera", choice: .camera)
        }
        tile("Photos", systemImage: "photo.on.rectangle", choice: .photos)
        tile("Files", systemImage: "folder", choice: .files)
      }
      .disabled(!canAttach)

      HStack(spacing: 12) {
        Image(systemName: fullAccess ? "bolt.shield" : "shield")
          .font(.system(size: 17))
          .foregroundStyle(palette.color(fullAccess ? "warning" : "text-secondary"))
          .frame(width: 24)
        VStack(alignment: .leading, spacing: 1) {
          Text("Full access")
            .font(.body)
            .foregroundStyle(palette.color("text"))
          Text("Runs without asking")
            .font(.caption)
            .foregroundStyle(palette.color("text-tertiary"))
        }
        Spacer(minLength: 8)
        Toggle("Full access", isOn: fullAccessBinding)
          .labelsHidden()
          .tint(palette.color("warning"))
          .accessibilityLabel("Full access")
      }
      .padding(.horizontal, 16)
      .frame(minHeight: 64)
      .background(palette.color("secondary"), in: .rect(cornerRadius: 22, style: .continuous))
      .disabled(fullAccessLocked)
    }
    .padding(.horizontal, 20)
    .padding(.top, 18)
    .padding(.bottom, 12)
    .presentationDetents([.height(292)])
    .presentationDragIndicator(.visible)
  }

  /// Turning it on asks first (the composer's alert, once this sheet has gone).
  private var fullAccessBinding: Binding<Bool> {
    Binding {
      fullAccess
    } set: { on in
      if on { onChoose(.fullAccessOn) } else { onFullAccessOff() }
    }
  }

  private func tile(_ title: String, systemImage: String, choice: Choice) -> some View {
    Button {
      onChoose(choice)
    } label: {
      VStack(spacing: 8) {
        Image(systemName: systemImage)
          .font(.system(size: 22, weight: .regular))
          .frame(height: 28)
        Text(title)
          .font(.subheadline.weight(.medium))
      }
      .foregroundStyle(palette.color("text"))
      .frame(maxWidth: .infinity, minHeight: 96)
      .background(palette.color("secondary"), in: .rect(cornerRadius: 22, style: .continuous))
      .contentShape(.rect(cornerRadius: 22))
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("attach.\(title.lowercased())")
  }
}
