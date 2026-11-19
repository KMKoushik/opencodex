import SwiftUI

nonisolated struct ProjectInstructions: Codable, Sendable {
  var text: String
}

extension GatewayClient {
  /// A project's own instructions, sent with every chat in it (the desktop's Settings →
  /// Projects → Instructions; the gateway's `project-instructions.ts`).
  func projectInstructions(_ projectID: String) async throws -> ProjectInstructions {
    try await get("/projects/\(projectID)/instructions")
  }
  func saveProjectInstructions(_ projectID: String, _ text: String) async throws
    -> ProjectInstructions
  {
    try await send(
      request(
        url("/projects/\(projectID)/instructions"), method: "PUT",
        body: JSONEncoder().encode(ProjectInstructions(text: text))))
  }
}

/// Edits a project's instructions, from its header's long-press menu. Port of the desktop's
/// `project-instructions.tsx`.
struct ProjectInstructionsSheet: View {
  let client: GatewayClient
  let projectID: String
  let name: String
  /// `PROJECT_INSTRUCTIONS_MAX`.
  static let limit = 50_000

  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette
  @State private var text = ""
  @State private var loaded = false
  @State private var saving = false
  @State private var error: String?
  @FocusState private var focused: Bool

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text(
            "Sent with every chat in this project. They're saved on your computer, not in the repo; for instructions your team shares, use the repo's AGENTS.md."
          )
          .font(.footnote)
          .foregroundStyle(palette.color("text-secondary"))

          ZStack(alignment: .topLeading) {
            TextEditor(text: $text)
              .focused($focused)
              .font(.body)
              .foregroundStyle(palette.color("text"))
              .scrollContentBackground(.hidden)
              .padding(.horizontal, 10)
              .padding(.vertical, 8)
              .frame(minHeight: 280)
              .disabled(!loaded || saving)
              .accessibilityLabel("Project instructions")
              .accessibilityIdentifier("project-instructions.text")
              .onChange(of: text) { _, value in
                if value.count > Self.limit { text = String(value.prefix(Self.limit)) }
              }
            if text.isEmpty {
              Text(loaded ? "For example: Use pnpm, not npm. Run pnpm test before saying a change works." : "Loading…")
                .font(.body)
                .foregroundStyle(palette.color("text-tertiary"))
                .padding(.horizontal, 15)
                .padding(.vertical, 16)
                .allowsHitTesting(false)
            }
          }
          .background(palette.color("secondary"), in: .rect(cornerRadius: 16, style: .continuous))

          Text(
            text.count > Self.limit * 9 / 10
              ? "\(text.count.formatted()) of \(Self.limit.formatted()) characters."
              : "Open chats use the new instructions from their next message."
          )
          .font(.caption)
          .foregroundStyle(palette.color("text-tertiary"))

          if let error {
            HStack(spacing: 12) {
              Text(error)
                .font(.footnote)
                .foregroundStyle(palette.color("error"))
              if !loaded {
                Button("Retry") { Task { await load() } }
                  .font(.footnote.weight(.semibold))
              }
            }
          }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 24)
      }
      .scrollDismissesKeyboard(.interactively)
      .background(palette.color("surface"))
      .navigationTitle("\(name) instructions")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
            .disabled(saving)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save", systemImage: "checkmark") { Task { await save() } }
            .disabled(!loaded || saving)
            .accessibilityIdentifier("project-instructions.save")
        }
      }
      .task { await load() }
    }
    .interactiveDismissDisabled(saving)
  }

  private func load() async {
    do {
      text = try await client.projectInstructions(projectID).text
      loaded = true
      error = nil
      if text.isEmpty { focused = true }
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func save() async {
    saving = true
    defer { saving = false }
    do {
      _ = try await client.saveProjectInstructions(projectID, text)
      dismiss()
    } catch {
      self.error = error.localizedDescription
    }
  }
}
