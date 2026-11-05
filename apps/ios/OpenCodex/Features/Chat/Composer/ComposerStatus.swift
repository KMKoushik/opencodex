import SwiftUI

/// The lines above the composer: send and attachment errors, and messages waiting in
/// OpenCode's inbox. Running state and "Move to background" live in the transcript's turn
/// header and the activity tray, as on the desktop.
struct ComposerStatus: View {
  let pending: Int
  let errors: [Notice]

  @Environment(\.palette) private var palette

  struct Notice: Identifiable {
    var id: String
    var text: String
    var dismiss: () -> Void
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      ForEach(errors) { notice in
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Image(systemName: "exclamationmark.triangle.fill")
            .foregroundStyle(palette.color("error"))
            .accessibilityHidden(true)
          Text(notice.text)
            .foregroundStyle(palette.color("text"))
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
          Button("Dismiss", systemImage: "xmark", action: notice.dismiss)
            .labelStyle(.iconOnly)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(palette.color("text-secondary"))
            .frame(minWidth: 28, minHeight: 28)
            .contentShape(.rect)
            .buttonStyle(.plain)
        }
        .font(.footnote)
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .padding(.vertical, 4)
        .background(palette.color("error").opacity(0.12), in: .rect(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("composer.error")
      }
      if pending > 0 {
        Text("\(pending) pending in OpenCode")
          .font(.footnote)
          .foregroundStyle(palette.color("text-secondary"))
          .padding(.horizontal, 8)
          .frame(minHeight: 24)
          .accessibilityLabel("\(pending) message\(pending == 1 ? "" : "s") waiting to be delivered")
          .accessibilityIdentifier("composer.status")
      }
    }
    .padding(.horizontal, 6)
  }
}
