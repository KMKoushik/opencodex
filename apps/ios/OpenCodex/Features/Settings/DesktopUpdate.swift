import SwiftUI

/// The desktop app's update state (`DesktopUpdateState`), read through the gateway it hosts.
nonisolated struct DesktopUpdateState: Codable, Equatable, Sendable {
  var status: String
  var currentVersion: String
  var version: String?
  var percent: Int?
  var error: String?
  var disabledReason: String?
}

extension GatewayClient {
  func desktopUpdate() async throws -> DesktopUpdateState {
    try await get("/host/update")
  }
  func desktopUpdate(_ action: String) async throws -> DesktopUpdateState {
    try await post("/host/update/\(action)")
  }
}

/// Settings → About: the computer's OpenCodex and its update, like the desktop's update
/// control: check, download, then restart it from the phone. Hidden when the gateway isn't
/// hosted by the desktop app.
struct DesktopUpdateRow: View {
  let client: GatewayClient
  @Environment(\.palette) private var palette
  @State private var state: DesktopUpdateState?
  @State private var unavailable = false
  /// Asked to restart; the computer is away until it's back on the new version.
  @State private var restarting: String?
  @State private var confirmRestart = false
  @State private var actionError: String?

  var body: some View {
    if !unavailable {
      LabeledContent {
        control
      } label: {
        Text("Desktop app").foregroundStyle(palette.color("text"))
        Text(status)
          .foregroundStyle(palette.color(failed ? "error" : "text-secondary"))
          .accessibilityIdentifier("desktop-update-status")
      }
      .task(id: polling) { await poll() }
      .alert("Restart OpenCodex on your computer?", isPresented: $confirmRestart) {
        Button("Cancel", role: .cancel) {}
        Button("Restart") { Task { await run("install") } }
      } message: {
        Text(
          "It restarts to install v\(state?.version ?? ""). Unsaved files and drafts on the computer will be lost. OpenCode and running agents keep running."
        )
      }
    }
  }

  @ViewBuilder private var control: some View {
    if let state, restarting == nil, !busy(state) {
      switch state.status {
      case "available":
        button("Download", action: "download")
      case "ready":
        Button("Restart") { confirmRestart = true }
          .buttonStyle(.borderedProminent)
          .tint(palette.color("accent"))
          // The form's ink is `text`, which matches `accent` in dark themes.
          .foregroundStyle(palette.color("on-accent"))
          .accessibilityIdentifier("desktop-update-restart")
      case "disabled":
        EmptyView()
      default:
        button("Check", action: "check")
      }
    } else if state != nil || restarting != nil {
      ProgressView().controlSize(.small)
    }
  }

  private func button(_ title: String, action: String) -> some View {
    Button(title) { Task { await run(action) } }
      .buttonStyle(.bordered)
      .foregroundStyle(palette.color("text"))
      .accessibilityIdentifier("desktop-update-\(action)")
  }

  private var status: String {
    if let actionError { return actionError }
    if let restarting {
      if let state, state.currentVersion == restarting { return "Updated to v\(restarting)" }
      return "Restarting to install v\(restarting)…"
    }
    guard let state else { return "Loading…" }
    let current = "v\(state.currentVersion)"
    switch state.status {
    case "checking": return "\(current) · Checking for updates…"
    case "available": return "v\(state.version ?? "") available · you have \(current)"
    case "downloading": return "Downloading v\(state.version ?? "")… \(state.percent ?? 0)%"
    case "ready": return "v\(state.version ?? "") ready · restart to install"
    case "installing": return "Restarting to install v\(state.version ?? "")…"
    case "up-to-date": return "\(current) · Up to date"
    case "error": return state.error ?? "The update failed"
    case "disabled": return state.disabledReason ?? current
    default: return current
    }
  }

  private var failed: Bool { actionError != nil || state?.status == "error" }

  private func busy(_ state: DesktopUpdateState) -> Bool {
    ["checking", "downloading", "installing"].contains(state.status)
  }

  /// Polls while something runs on the computer: once a second, every two while it restarts.
  private var polling: Bool {
    restarting != nil || state.map(busy) == true
  }

  private func poll() async {
    if state == nil { await load() }
    while !Task.isCancelled && polling {
      try? await Task.sleep(for: .seconds(restarting == nil ? 1 : 2))
      await load()
      if let restarting, let state, state.currentVersion == restarting {
        // Back on the new version: show it, then settle.
        try? await Task.sleep(for: .seconds(4))
        self.restarting = nil
      }
    }
  }

  private func load() async {
    do {
      let next = try await client.desktopUpdate()
      state = next
      if restarting == nil { actionError = nil }
    } catch let error as GatewayError where error.status == 404 {
      unavailable = true
    } catch {
      // Unreachable while the computer restarts; keep the last state until it's back.
      if restarting == nil { actionError = error.localizedDescription }
    }
  }

  private func run(_ action: String) async {
    actionError = nil
    if action == "install" { restarting = state?.version }
    do {
      state = try await client.desktopUpdate(action)
    } catch {
      if action != "install" { actionError = error.localizedDescription }
    }
  }
}
