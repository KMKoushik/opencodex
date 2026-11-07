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
      SettingsForm {
        Section {
          ForEach(SettingsSection.allCases, id: \.self) { section in
            NavigationLink(value: SettingsRoute.section(section)) {
              Label {
                Text(section.label).foregroundStyle(palette.color("text"))
              } icon: {
                Image(systemName: section.systemImage)
                  .foregroundStyle(palette.color("text-secondary"))
              }
            }
            .accessibilityIdentifier("settings-\(section.rawValue)")
          }
        }
        .settingsRows()
        Section {
          SettingsValue(label: "Version", value: Self.appVersion)
            .accessibilityIdentifier("settings-version")
        } header: {
          SettingsHeader("About")
        }
        .settingsRows()
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
    // The app root's scheme doesn't reach a sheet that's already open, so switching Mode here
    // would leave this sheet's glass and title in the old one. Always explicit: a sheet doesn't
    // return to the system's scheme from nil. The palette already follows System.
    .preferredColorScheme(palette.dark ? .dark : .light)
  }

  @ToolbarContentBuilder private var done: some ToolbarContent {
    ToolbarItem(placement: .confirmationAction) {
      Button("Done", systemImage: "checkmark") { dismiss() }
        .accessibilityIdentifier("settings-done")
    }
  }

  /// "0.1.0 (12)": the marketing version and the build number.
  static var appVersion: String {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "–"
    let build = info?["CFBundleVersion"] as? String ?? "–"
    return "\(version) (\(build))"
  }
}

/// Settings → General: OpenCode on the computer, live updates, notifications, and this phone's
/// pairing.
struct GeneralSettings: View {
  let client: GatewayClient
  @Environment(ConnectionStore.self) private var connection
  @Environment(\.palette) private var palette
  @State private var info: Result<Connection, Error>?
  @State private var checking = false
  @State private var confirmForget = false

  var body: some View {
    SettingsForm {
      Section {
        LabeledContent {
          if checking {
            ProgressView().controlSize(.small)
          } else {
            Button(connected ? "Check" : "Connect") {
              Task { await load(connect: !connected) }
            }
            .buttonStyle(.bordered)
            .foregroundStyle(palette.color("text"))
            .accessibilityIdentifier("service-check")
          }
        } label: {
          Text("Service").foregroundStyle(palette.color("text"))
          Text(status)
            .foregroundStyle(palette.color(failed ? "error" : "text-secondary"))
            .accessibilityIdentifier("service-status")
        }
        SettingsValue(
          label: "Live updates",
          value: connected ? (connection.events.live ? "Connected" : "Reconnecting…") : "Unavailable"
        )
        .accessibilityIdentifier("live-updates")
      } header: {
        SettingsHeader("OpenCode")
      }
      .settingsRows()

      NotificationSettingsSection()

      Section {
        SettingsValue(label: "Address", value: host)
          .accessibilityIdentifier("computer-address")
        Button(role: .destructive) {
          confirmForget = true
        } label: {
          Text("Forget This Computer").foregroundStyle(palette.color("error"))
        }
        .accessibilityIdentifier("forget-computer")
      } header: {
        SettingsHeader("Computer")
      } footer: {
        Text("You’ll need a new pairing code to connect again.")
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .settingsRows()
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

  private var failed: Bool {
    if case .failure = info { return true }
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
      if error is CancellationError || (error as? URLError)?.code == .cancelled { return }
      info = .failure(error)
    }
  }

  private var host: String {
    guard case .paired(let url) = connection.state else { return "Not paired" }
    let name = url.host(percentEncoded: false) ?? url.absoluteString
    return url.port.map { "\(name):\($0)" } ?? name
  }
}
