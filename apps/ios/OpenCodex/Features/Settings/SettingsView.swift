import SwiftUI

/// The paired computer, its live status, and Forget.
struct SettingsView: View {
  let client: GatewayClient
  @Environment(ConnectionStore.self) private var connection
  @Environment(\.dismiss) private var dismiss
  @State private var opencode: Result<Connection, Error>?
  @State private var confirmForget = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          LabeledContent("Address", value: host)
          LabeledContent("Live updates") {
            Label(
              connection.events.live ? "Connected" : "Reconnecting…",
              systemImage: connection.events.live ? "checkmark.circle.fill" : "arrow.clockwise"
            )
            .labelStyle(StatusLabelStyle(live: connection.events.live))
          }
          LabeledContent("OpenCode") {
            switch opencode {
            case nil:
              ProgressView()
            case .success(let info):
              Text(info.version.map { "\(info.status.capitalized) · \($0)" } ?? info.status.capitalized)
            case .failure:
              Text("Unavailable")
            }
          }
          if case .failure(let error) = opencode {
            Text(error.localizedDescription)
              .font(.footnote)
              .foregroundStyle(.secondary)
            Button("Retry") { Task { await load() } }
          }
        } header: {
          Text("Computer")
        }

        Section {
          Button("Forget This Computer", role: .destructive) { confirmForget = true }
            .confirmationDialog(
              "Forget this computer?", isPresented: $confirmForget, titleVisibility: .visible
            ) {
              Button("Forget", role: .destructive) { connection.forget() }
            } message: {
              Text(
                "You’ll need a new pairing code to connect again. Revoke this iPhone in the computer’s Settings → Remote access to remove it there."
              )
            }
        }

        Section("About") {
          LabeledContent("Version", value: Self.appVersion)
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", systemImage: "checkmark") { dismiss() }
        }
      }
      .task { await load() }
    }
  }

  private func load() async {
    opencode = nil
    do {
      opencode = .success(try await client.connection())
    } catch {
      opencode = .failure(error)
    }
  }

  private var host: String {
    guard case .paired(let url) = connection.state else { return "Not paired" }
    let name = url.host(percentEncoded: false) ?? url.absoluteString
    return url.port.map { "\(name):\($0)" } ?? name
  }

  static var appVersion: String {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "–"
    let build = info?["CFBundleVersion"] as? String ?? "–"
    return "\(version) (\(build))"
  }
}

/// A status icon in the system green or secondary, before its text.
private struct StatusLabelStyle: LabelStyle {
  let live: Bool
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 6) {
      configuration.icon.foregroundStyle(live ? .green : .secondary)
      configuration.title
    }
  }
}
