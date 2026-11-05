import ActivityKit
import Foundation
import Observation
import UIKit

/// A Live Activity for each running reply the user started from this iPhone.
///
/// The app ends it when the reply ends while the event stream is live. While the app is
/// suspended, the gateway ends it with an APNs `liveactivity` push to the token registered here;
/// without push (no `push.json`, or a loopback gateway) it ends the next time the app is active.
@Observable
final class ReplyActivities {
  static let shared = ReplyActivities()

  @ObservationIgnored private var client: GatewayClient?
  @ObservationIgnored private var subscription: Subscription?
  @ObservationIgnored private var tokenTasks: [String: Task<Void, Never>] = [:]
  @ObservationIgnored private var observers: [NSObjectProtocol] = []

  private typealias Reply = Activity<ReplyActivityAttributes>

  init() {
    observers.append(
      NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in MainActor.assumeIsolated { self?.endFinished() } })
  }

  func attach(client: GatewayClient, events: EventHub) {
    self.client = client
    subscription = events.subscribe { [weak self] event in self?.handle(event) }
    for activity in Reply.activities { watchToken(activity) }
    endFinished()
  }

  func detach() {
    subscription = nil
    client = nil
    tokenTasks.values.forEach { $0.cancel() }
    tokenTasks = [:]
    Task { for activity in Reply.activities { await end(activity, .stopped) } }
  }

  /// A root chat's reply started from this phone. Call after the prompt is accepted; a message
  /// sent mid-run keeps the running activity.
  func start(sessionID: String, title: String, project: String, started: Date = .now) {
    guard ActivityAuthorizationInfo().areActivitiesEnabled,
      !Reply.activities.contains(where: { $0.attributes.sessionID == sessionID })
    else { return }
    let attributes = ReplyActivityAttributes(
      sessionID: sessionID, title: title, project: project, started: started)
    let content = ActivityContent(
      state: ReplyActivityAttributes.ContentState(state: .running), staleDate: nil)
    // Push needs the aps-environment entitlement; without it, the app ends the activity itself.
    let activity =
      (try? Activity.request(attributes: attributes, content: content, pushType: .token))
      ?? (try? Activity.request(attributes: attributes, content: content, pushType: nil))
    if let activity { watchToken(activity) }
  }

  private func watchToken(_ activity: Reply) {
    let id = activity.id
    guard tokenTasks[id] == nil, let client, client.token != nil else { return }
    let sessionID = activity.attributes.sessionID
    tokenTasks[id] = Task {
      for await data in activity.pushTokenUpdates {
        let token = data.map { String(format: "%02x", $0) }.joined()
        _ = try? await client.registerLiveActivity(
          sessionID: sessionID, token: token,
          environment: NotificationCenterModel.apsEnvironment)
      }
    }
  }

  private func handle(_ event: GatewayEvent) {
    guard let sessionID = event.sessionID,
      let activity = Reply.activities.first(where: { $0.attributes.sessionID == sessionID })
    else { return }
    switch event.type {
    case "session.execution.succeeded": Task { await end(activity, .finished) }
    case "session.execution.failed": Task { await end(activity, .failed) }
    case "session.execution.interrupted": Task { await end(activity, .stopped) }
    case "session.renamed":
      guard let client else { return }
      Task {
        guard let title = try? await client.session(sessionID).title, !title.isEmpty else { return }
        // ActivityKit's `Activity` isn't marked Sendable, but its methods are safe from any thread.
        nonisolated(unsafe) let activity = activity
        await activity.update(
          ActivityContent(
            state: .init(state: .running, title: title), staleDate: nil))
      }
    default: break
    }
  }

  /// Ends activities whose replies ended while the app was suspended.
  private func endFinished() {
    guard let client, !Reply.activities.isEmpty else { return }
    Task {
      guard let active = try? await client.active() else { return }
      for activity in Reply.activities where active[activity.attributes.sessionID] == nil {
        await end(activity, .finished)
      }
    }
  }

  private func end(_ activity: Reply, _ state: ReplyActivityAttributes.ContentState.State) async {
    tokenTasks.removeValue(forKey: activity.id)?.cancel()
    nonisolated(unsafe) let activity = activity
    // The reply's notification takes over; the activity leaves the Lock Screen at once.
    await activity.end(
      ActivityContent(
        state: .init(state: state, title: activity.content.state.title), staleDate: nil),
      dismissalPolicy: .immediate)
  }
}
