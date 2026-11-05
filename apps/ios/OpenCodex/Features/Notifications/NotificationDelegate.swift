import UIKit
import UserNotifications

/// Shows notifications in the foreground by `NotificationCenterModel`'s rules, and opens the
/// thread a tapped notification belongs to. iOS calls it off the main actor.
nonisolated final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate, Sendable {
  static let shared = NotificationDelegate()

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    let sessionID = notification.request.content.userInfo["sessionID"] as? String
    let remote = notification.request.trigger is UNPushNotificationTrigger
    return await MainActor.run {
      NotificationCenterModel.shared.presentation(sessionID: sessionID, remote: remote)
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse
  ) async {
    guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
      let sessionID = response.notification.request.content.userInfo["sessionID"] as? String
    else { return }
    await MainActor.run { NotificationCenterModel.shared.open(sessionID) }
  }
}

/// The app delegate notifications need: the center's delegate must be set before launch ends
/// (so a tap that launched the app is delivered), and APNs reports tokens here.
/// Attach with `@UIApplicationDelegateAdaptor(NotificationAppDelegate.self)`.
final class NotificationAppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
    return true
  }

  func application(
    _ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data
  ) {
    NotificationCenterModel.shared.registered(deviceToken: token)
  }

  func application(
    _ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    // Without the aps-environment entitlement or a network, only in-app notifications work.
  }
}
