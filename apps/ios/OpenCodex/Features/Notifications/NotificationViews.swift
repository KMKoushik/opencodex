import SwiftUI

/// Connects notifications to the paired gateway, and asks once, after
/// pairing, whether to turn notifications on. Attach to the paired root view.
struct NotificationsHost: ViewModifier {
  let client: GatewayClient
  let events: EventHub
  @State private var model = NotificationCenterModel.shared

  func body(content: Content) -> some View {
    content
      .task(id: client.base) {
        await model.attach(client: client, events: events)
        while !Task.isCancelled { try? await Task.sleep(for: .seconds(3600)) }
        model.detach()
      }
      .sheet(
        isPresented: $model.promptVisible, onDismiss: { model.dismissPrompt() }
      ) {
        NotificationPrompt(model: model)
      }
      // A link to a thread: `opencodex://session/<id>`.
      .onOpenURL { url in
        guard url.scheme == "opencodex", url.host() == "session" else { return }
        let id = url.lastPathComponent
        if !id.isEmpty, id != "/" { model.open(id) }
      }
  }
}

/// The one-time ask, before iOS's own permission alert.
struct NotificationPrompt: View {
  let model: NotificationCenterModel
  @Environment(\.palette) private var palette
  @State private var asking = false

  var body: some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(spacing: 0) {
          BrandIcon(size: 64)
            .padding(.top, 36)
          Text("Turn on notifications")
            .font(.title3.weight(.semibold))
            .foregroundStyle(palette.color("text"))
            .padding(.top, 16)
          Text("Know when a chat needs you, even while OpenCodex is in the background.")
            .font(.subheadline)
            .foregroundStyle(palette.color("text-secondary"))
            .multilineTextAlignment(.center)
            .padding(.top, 6)
          SettingsGroup {
            row("checkmark.circle", .reply)
            row("questionmark.bubble", .question)
            row("hand.raised", .permission)
          }
          .padding(.top, 24)
          Text("You can change these later in Settings → General.")
            .font(.footnote)
            .foregroundStyle(palette.color("text-tertiary"))
            .multilineTextAlignment(.center)
            .padding(.top, 12)
        }
        .padding(.horizontal, 20)
      }
      .scrollBounceBehavior(.basedOnSize)
      VStack(spacing: 4) {
        Button {
          asking = true
          Task {
            await model.turnOnFromPrompt()
            asking = false
          }
        } label: {
          Text("Turn on notifications")
            .font(.body.weight(.semibold))
            .foregroundStyle(palette.color("on-primary"))
            .frame(maxWidth: .infinity, minHeight: 50)
            .ceramic("primary-glaze", shadow: "primary-shadow", radius: 12)
            .contentShape(.rect)
        }
        .buttonStyle(PressableStyle())
        .disabled(asking)
        .accessibilityIdentifier("notifications-turn-on")
        Button("Not now") { model.dismissPrompt() }
          .font(.body.weight(.medium))
          .foregroundStyle(palette.color("text-secondary"))
          .frame(maxWidth: .infinity, minHeight: 44)
          .buttonStyle(.plain)
          .accessibilityIdentifier("notifications-not-now")
      }
      .padding(.horizontal, 20)
      .padding(.top, 12)
      .padding(.bottom, 8)
    }
    .background(palette.color("surface"))
    .presentationDetents([.fraction(0.76), .large])
    .presentationDragIndicator(.visible)
    .interactiveDismissDisabled(asking)
  }

  private func row(_ symbol: String, _ kind: NotificationKind) -> some View {
    HStack(spacing: 12) {
      Image(systemName: symbol)
        .font(.body)
        .foregroundStyle(palette.color("text-secondary"))
        .frame(width: 24)
      VStack(alignment: .leading, spacing: 2) {
        Text(kind.label)
          .font(.subheadline)
          .foregroundStyle(palette.color("text"))
        Text(kind.description)
          .font(.footnote)
          .foregroundStyle(palette.color("text-secondary"))
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .frame(minHeight: 52)
    .accessibilityElement(children: .combine)
  }
}

/// The desktop's Settings → General → Notifications group: a switch for each kind, turned on
/// only once iOS allows notifications.
struct NotificationSettingsSection: View {
  @State private var model = NotificationCenterModel.shared
  @State private var error: (kind: NotificationKind, message: String)?
  @State private var requesting = false
  @Environment(\.palette) private var palette

  var body: some View {
    Section {
      ForEach(NotificationKind.allCases, id: \.self) { kind in
        let failed = error?.kind == kind
        Toggle(
          isOn: Binding(get: { model.settings[kind] }, set: { change(kind, $0) })
        ) {
          Text(kind.label).foregroundStyle(palette.color("text"))
          Text(failed ? error?.message ?? "" : kind.description)
            .foregroundStyle(palette.color(failed ? "error" : "text-secondary"))
        }
        .tint(palette.color("accent"))
        .disabled(requesting)
        .accessibilityIdentifier("notifications-\(kind.rawValue)")
      }
    } header: {
      SettingsHeader("Notifications")
    }
    .settingsRows()
  }

  private func change(_ kind: NotificationKind, _ enabled: Bool) {
    guard !requesting else { return }
    error = nil
    requesting = true
    Task {
      if let message = await model.set(kind, enabled) { error = (kind, message) }
      requesting = false
    }
  }
}
