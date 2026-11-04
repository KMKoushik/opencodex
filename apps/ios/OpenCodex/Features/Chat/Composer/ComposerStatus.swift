import SwiftUI

/// The line above the composer: the running reply, queued messages, and errors.
struct ComposerStatus: View {
  let running: Bool
  let blocking: BlockingWork
  let pending: Int
  let moving: Bool
  let errors: [Notice]
  var onBackground: () -> Void

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
            .foregroundStyle(.red)
            .accessibilityHidden(true)
          Text(notice.text)
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
          Button("Dismiss", systemImage: "xmark", action: notice.dismiss)
            .labelStyle(.iconOnly)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(minWidth: 28, minHeight: 28)
            .contentShape(.rect)
            .buttonStyle(.plain)
        }
        .font(.footnote)
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .padding(.vertical, 4)
        .background(.red.opacity(0.12), in: .rect(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("composer.error")
      }
      if running || pending > 0 {
        HStack(spacing: 8) {
          if running {
            ProgressView()
              .controlSize(.small)
            Text("Working…")
          }
          if pending > 0 {
            if running { Text("·").foregroundStyle(.tertiary) }
            Text("\(pending) pending")
              .accessibilityLabel("\(pending) message\(pending == 1 ? "" : "s") waiting to be delivered")
          }
          Spacer(minLength: 8)
          if !blocking.isEmpty {
            Button(moving ? "Moving…" : "Move to background", action: onBackground)
              .font(.footnote.weight(.semibold))
              .buttonStyle(.bordered)
              .buttonBorderShape(.capsule)
              .controlSize(.small)
              .disabled(moving)
              .accessibilityHint("Lets the agent read your message without waiting for running commands and subagents.")
          }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 8)
        .frame(minHeight: 28)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("composer.status")
      }
    }
    .padding(.horizontal, 6)
  }
}
