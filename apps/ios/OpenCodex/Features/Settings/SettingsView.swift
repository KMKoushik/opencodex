import SwiftUI

/// The desktop's settings sections a phone can use. Shortcuts, Projects and Remote access
/// belong to the computer.
enum SettingsSection: String, CaseIterable, Hashable {
  case general, appearance, usage

  var label: String {
    switch self {
    case .general: "General"
    case .appearance: "Appearance"
    case .usage: "Usage"
    }
  }

  var systemImage: String {
    switch self {
    case .general: "gearshape"
    case .appearance: "paintpalette"
    case .usage: "gauge.with.dots.needle.33percent"
    }
  }
}

enum SettingsRoute: Hashable {
  case section(SettingsSection)
  case theme(dark: Bool)
}

/// Settings: the section list, opening at a section when asked (the brand menu and usage
/// shortcut), and About.
struct SettingsView: View {
  let client: GatewayClient
  @State private var path: [SettingsRoute]
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss

  init(client: GatewayClient, section: SettingsSection? = nil) {
    self.client = client
    _path = State(initialValue: section.map { [.section($0)] } ?? [])
  }

  var body: some View {
    NavigationStack(path: $path) {
      SettingsPage {
        SettingsGroup {
          ForEach(SettingsSection.allCases, id: \.self) { section in
            SettingsLinkRow(
              section.label, systemImage: section.systemImage, value: SettingsRoute.section(section)
            )
            .accessibilityIdentifier("settings-\(section.rawValue)")
          }
        }
        SettingsGroup("About") {
          SettingsRow("Version") {
            Text(Self.appVersion)
              .font(.subheadline)
              .monospacedDigit()
              .foregroundStyle(palette.color("text-secondary"))
          }
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .navigationDestination(for: SettingsRoute.self) { route in
        Group {
          switch route {
          case .section(.general): GeneralSettings(client: client)
          case .section(.appearance): AppearanceSettings()
          case .section(.usage): UsageSettings(client: client)
          case .theme(let dark): ThemePicker(dark: dark)
          }
        }
        .toolbar { done }
      }
      .toolbar { done }
    }
  }

  @ToolbarContentBuilder private var done: some ToolbarContent {
    ToolbarItem(placement: .confirmationAction) {
      Button("Done", systemImage: "checkmark") { dismiss() }
        .accessibilityIdentifier("settings-done")
    }
  }

  static var appVersion: String {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "–"
    let build = info?["CFBundleVersion"] as? String ?? "–"
    return "\(version) (\(build))"
  }
}

/// Settings → General: OpenCode on the computer, live updates, and this phone's pairing.
struct GeneralSettings: View {
  let client: GatewayClient
  @Environment(ConnectionStore.self) private var connection
  @Environment(\.palette) private var palette
  @State private var info: Result<Connection, Error>?
  @State private var checking = false
  @State private var confirmForget = false

  var body: some View {
    SettingsPage {
      SettingsGroup("OpenCode") {
        SettingsRow(
          "Service", description: status,
          descriptionColor: info.map { if case .failure = $0 { "error" } else { "text-secondary" } }
            ?? "text-secondary"
        ) {
          SecondaryButton(title: checking ? "Connecting…" : connected ? "Check" : "Connect") {
            Task { await load(connect: !connected) }
          }
          .disabled(checking)
        }
        SettingsRow(
          "Live updates",
          description: connected ? (connection.events.live ? "Connected" : "Reconnecting…") : "Unavailable")
      }
      SettingsGroup("Computer") {
        SettingsRow("Address", description: host)
        SettingsRow(
          "Forget this computer",
          description: "You’ll need a new pairing code to connect again.", stacked: false
        ) {
          Button("Forget") { confirmForget = true }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(palette.color("error"))
            .padding(.horizontal, 14)
            .frame(minHeight: 36)
            .background(palette.color("secondary"), in: .rect(cornerRadius: 8, style: .continuous))
            .buttonStyle(.plain)
            .accessibilityIdentifier("forget-computer")
        }
      }
    }
    .navigationTitle("General")
    .navigationBarTitleDisplayMode(.inline)
    .confirmationDialog(
      "Forget this computer?", isPresented: $confirmForget, titleVisibility: .visible
    ) {
      Button("Forget", role: .destructive) { connection.forget() }
    } message: {
      Text(
        "You’ll need a new pairing code to connect again. Revoke this iPhone in the computer’s Settings → Remote access to remove it there."
      )
    }
    .task { await load(connect: false) }
  }

  private var connected: Bool {
    if case .success(let info) = info { return info.status == "connected" }
    return false
  }

  /// The desktop's Service line: "Connected · v2.2.5", OpenCode's message, or the failure.
  private var status: String {
    switch info {
    case nil: "Checking…"
    case .failure(let error): "The gateway is unavailable. \(error.localizedDescription)"
    case .success(let info):
      info.status == "connected"
        ? "Connected · v\(info.version ?? "–")" : (info.message ?? info.status.capitalized)
    }
  }

  private func load(connect: Bool) async {
    checking = true
    defer { checking = false }
    do {
      info = .success(try await connect ? client.connect() : client.connection())
    } catch {
      info = .failure(error)
    }
  }

  private var host: String {
    guard case .paired(let url) = connection.state else { return "Not paired" }
    let name = url.host(percentEncoded: false) ?? url.absoluteString
    return url.port.map { "\(name):\($0)" } ?? name
  }
}
