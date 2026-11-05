import UIKit
import UserNotifications

/// Shows notifications in the foreground by `NotificationCenterModel`'s rules, and opens the
/// thread a tapped notification belongs to. iOS calls it off the main actor.
///
/// These are the completion-handler forms on purpose: with the `async` forms, Swift resumes
/// iOS's completion off the main thread, and UIKit aborts the app when a tap is handled
/// ("_performBlockAfterCATransactionCommitSynchronizes"), so tapping a notification crashed.
nonisolated final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate, Sendable {
  static let shared = NotificationDelegate()

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void
  ) {
    let sessionID = notification.request.content.userInfo["sessionID"] as? String
    let remote = notification.request.trigger is UNPushNotificationTrigger
    DispatchQueue.main.async {
      let options = MainActor.assumeIsolated {
        NotificationCenterModel.shared.presentation(sessionID: sessionID, remote: remote)
      }
      completionHandler(options)
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping @Sendable () -> Void
  ) {
    let sessionID =
      response.actionIdentifier == UNNotificationDefaultActionIdentifier
      ? (response.notification.request.content.userInfo["sessionID"] as? String).flatMap {
        $0.isEmpty ? nil : $0
      } : nil
    DispatchQueue.main.async {
      if let sessionID {
        MainActor.assumeIsolated { NotificationCenterModel.shared.open(sessionID) }
      }
      completionHandler()
    }
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
