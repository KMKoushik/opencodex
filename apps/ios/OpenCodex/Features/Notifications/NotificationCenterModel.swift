import Foundation
import Observation
import UIKit
import UserNotifications

/// Which kinds notify, per device, like the desktop's preference. All off until allowed.
nonisolated struct NotificationPreferences: Codable, Equatable, Sendable {
  var reply = false
  var question = false
  var permission = false

  subscript(kind: NotificationKind) -> Bool {
    get {
      switch kind {
      case .reply: reply
      case .question: question
      case .permission: permission
      }
    }
    set {
      switch kind {
      case .reply: reply = newValue
      case .question: question = newValue
      case .permission: permission = newValue
      }
    }
  }

  var any: Bool { reply || question || permission }
  static let all = NotificationPreferences(reply: true, question: true, permission: true)
}

/// The desktop's system notifications on the phone.
///
/// While the app runs, it raises local notifications from the shared event stream, with the
/// desktop's rules and wording (`NotificationRules`). iOS suspends that stream in the
/// background, so the gateway also sends the same notifications through APNs (`push.ts`) to the
/// token registered here. While the stream is live, those pushes are hidden in the foreground so
/// nothing shows twice.
@Observable
final class NotificationCenterModel {
  static let shared = NotificationCenterModel()

  private(set) var settings: NotificationPreferences
  private(set) var authorization: UNAuthorizationStatus = .notDetermined
  /// The first launch after pairing asks once, with `NotificationPrompt`.
  var promptVisible = false
  /// The chat on screen; its own notifications stay quiet while the app is active.
  var visibleSessionID: String?
  /// Opens a thread when its notification is tapped. Set by the app's navigation.
  var onOpenSession: ((String) -> Void)? {
    didSet {
      if let onOpenSession, let pending = pendingOpen {
        pendingOpen = nil
        onOpenSession(pending)
      }
    }
  }

  /// The `aps-environment` this build is signed with (`Config/OpenCodex.entitlements`).
  static let apsEnvironment = "development"

  @ObservationIgnored private var client: GatewayClient?
  @ObservationIgnored private weak var events: EventHub?
  @ObservationIgnored private var subscription: Subscription?
  @ObservationIgnored private var deviceToken: String?
  @ObservationIgnored private var pendingOpen: String?
  @ObservationIgnored private var observers: [NSObjectProtocol] = []
  @ObservationIgnored private var syncTask: Task<Void, Never>?

  private static let settingsKey = "notifications"
  private static let askedKey = "notificationsAsked"
  private var center: UNUserNotificationCenter { .current() }

  init() {
    // `-reset` forgets the gateway; this phone's notification choices go with it.
    if CommandLine.arguments.contains("-reset") {
      UserDefaults.standard.removeObject(forKey: Self.settingsKey)
      UserDefaults.standard.removeObject(forKey: Self.askedKey)
    }
    let saved = UserDefaults.standard.data(forKey: Self.settingsKey)
    settings = saved.flatMap { try? JSONDecoder().decode(NotificationPreferences.self, from: $0) } ?? NotificationPreferences()
    observers.append(
      NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in MainActor.assumeIsolated { self?.becameActive() } })
  }

  // MARK: Lifecycle

  /// Starts notifying for a paired gateway. Called by `NotificationsHost`.
  func attach(client: GatewayClient, events: EventHub) async {
    self.client = client
    self.events = events
    subscription = events.subscribe { [weak self] event in self?.handle(event) }
    await refreshAuthorization()
    if !UserDefaults.standard.bool(forKey: Self.askedKey), !(allowed && settings.any),
      authorization != .denied
    {
      promptVisible = true
    } else if allowed, settings.any {
      UIApplication.shared.registerForRemoteNotifications()
    }
  }

  /// Stops notifying, e.g. after forgetting the computer. Pushes stop too: the gateway forgets
  /// this phone's token, since it keeps the device paired until it's revoked there.
  func detach() {
    subscription = nil
    if let client, client.token != nil, deviceToken != nil {
      Task { _ = try? await client.unregisterPush() }
    }
    client = nil
    promptVisible = false
  }

  private var allowed: Bool {
    [.authorized, .provisional, .ephemeral].contains(authorization)
  }

  private func refreshAuthorization() async {
    authorization = await center.notificationSettings().authorizationStatus
  }

  private func becameActive() {
    // Like the desktop: returning to the app dismisses its alerts. The thread list still shows
    // unread and waiting chats.
    center.removeAllDeliveredNotifications()
    Task { await refreshAuthorization() }
  }

  // MARK: Permission and settings

  /// The prompt's "Turn on notifications": every kind, once iOS allows it.
  func turnOnFromPrompt() async {
    UserDefaults.standard.set(true, forKey: Self.askedKey)
    promptVisible = false
    if await requestAuthorization() { save(.all) }
  }

  func dismissPrompt() {
    UserDefaults.standard.set(true, forKey: Self.askedKey)
    promptVisible = false
  }

  /// A Settings row's switch. Returns the message to show when iOS blocks notifications.
  func set(_ kind: NotificationKind, _ enabled: Bool) async -> String? {
    var next = settings
    next[kind] = enabled
    if enabled, !(await requestAuthorization()) {
      return "Notifications are blocked. Allow them in the Settings app, under Notifications."
    }
    save(next)
    return nil
  }

  private func requestAuthorization() async -> Bool {
    await refreshAuthorization()
    if authorization == .notDetermined {
      _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
      await refreshAuthorization()
    }
    return allowed
  }

  private func save(_ next: NotificationPreferences) {
    settings = next
    UserDefaults.standard.set(try? JSONEncoder().encode(next), forKey: Self.settingsKey)
    if next.any { UIApplication.shared.registerForRemoteNotifications() }
    sync()
  }

  // MARK: Push registration

  /// From the app delegate: APNs gave this install a token.
  func registered(deviceToken data: Data) {
    deviceToken = data.map { String(format: "%02x", $0) }.joined()
    sync()
  }

  /// Tells the gateway where to push, and for which kinds; or to stop when all are off.
  private func sync() {
    // A loopback gateway (simulator) has no paired device to keep a token with.
    guard let client, client.token != nil, let token = deviceToken else { return }
    let settings = settings
    syncTask?.cancel()
    syncTask = Task {
      do {
        if settings.any {
          _ = try await client.registerPush(
            token: token, environment: Self.apsEnvironment, kinds: settings)
        } else {
          _ = try await client.unregisterPush()
        }
      } catch {
        // The next launch registers again.
      }
    }
  }

  // MARK: Events

  private func handle(_ event: GatewayEvent) {
    guard let trigger = NotificationRules.trigger(event), settings[trigger.kind], allowed,
      !viewing(trigger.sessionID), let client
    else { return }
    Task {
      do {
        guard
          let thread = try await NotificationRules.thread(
            for: trigger, info: { try await client.session($0) }),
          !viewing(thread.id)
        else { return }
        let content = UNMutableNotificationContent()
        content.title = NotificationRules.title(trigger)
        content.body = thread.title
        content.sound = .default
        content.threadIdentifier = thread.id
        content.userInfo = ["sessionID": thread.id, "kind": trigger.kind.rawValue]
        // One per thread: a newer notification replaces the older one, like the desktop's `tag`.
        try await center.add(UNNotificationRequest(identifier: thread.id, content: content, trigger: nil))
      } catch {
        // Like the desktop, a notification that can't be resolved is skipped.
      }
    }
  }

  private func viewing(_ sessionID: String) -> Bool {
    UIApplication.shared.applicationState == .active && visibleSessionID == sessionID
  }

  /// How a notification shows while the app is in the foreground.
  func presentation(sessionID: String?, remote: Bool) -> UNNotificationPresentationOptions {
    // The live stream already raised this one locally.
    if remote, events?.live == true { return [] }
    if let sessionID, sessionID == visibleSessionID { return [] }
    return [.banner, .list, .sound]
  }

  /// A tapped notification: open its thread, now or once navigation is ready (cold launch).
  func open(_ sessionID: String) {
    if let onOpenSession { onOpenSession(sessionID) } else { pendingOpen = sessionID }
  }
}

// MARK: - Routes

nonisolated extension GatewayClient {
  struct PushRegistration: Encodable {
    var token: String
    var environment: String
    var kinds: NotificationPreferences
  }

  /// `POST /api/remote/push-token`: the gateway pushes these kinds to this paired iPhone.
  func registerPush(token: String, environment: String, kinds: NotificationPreferences)
    async throws -> OK
  {
    try await post(
      "/remote/push-token",
      PushRegistration(token: token, environment: environment, kinds: kinds))
  }

  func unregisterPush() async throws -> OK { try await delete("/remote/push-token") }
}
