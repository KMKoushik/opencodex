import Foundation
import Testing

@testable import OpenCodex

/// The desktop sidebar's Focus placement (`focus.ts`) and plan-limit pace, ported 1:1.
struct FocusTests {
  private let now: Millis = 1_800_000_000_000
  private let day: Millis = 24 * 60 * 60_000

  private func row(
    _ id: String, idle: Millis, done: Double? = nil, pinned: Double? = nil, folder: String = "/a",
    attention: ThreadItem.Attention? = nil, running: Bool = false, unread: Bool = false
  ) -> (session: ThreadSession, item: ThreadItem) {
    let json = """
      {"id":"\(id)","title":"\(id)","directory":"\(folder)","updatedAt":\(idle),
       "time":{"created":\(idle - 1000),"idle":\(idle)}}
      """
    var session = try! JSONDecoder().decode(ThreadSession.self, from: Data(json.utf8))
    session.done = done
    session.pinned = pinned
    let item = ThreadItem(
      id: id, title: id, directory: folder, project: ProjectBadge(name: "a", icon: nil),
      attention: attention, responding: running, unread: unread, markedUnread: false,
      muted: false, forked: false, pinned: pinned != nil, done: session.settled)
    return (session, item)
  }

  @Test func placesThreadsLikeTheDesktop() {
    let rows = [
      row("recent", idle: now - 1000),
      row("running", idle: now - 10 * day, running: true),
      row("approval", idle: now - 20 * day, folder: "/hidden", attention: .permission),
      row("unread", idle: now - 2000, unread: true),
      row("old-unread", idle: now - 5 * day, unread: true),
      row("done", idle: now - 3000, done: now - 3000),
      row("reopened", idle: now - 500, done: now - 4000),
      row("pinned", idle: now, pinned: now),
      row("excluded", idle: now - 100, folder: "/hidden"),
    ]
    let focus = HomeModel.deriveFocus(rows, now: now, excluded: ["/hidden"])
    // Needs-you first (requests and recent unread), then running, then the rest by activity.
    #expect(focus.active.map(\.id) == ["unread", "approval", "running", "reopened", "recent"])
    #expect(focus.inactive.map(\.id) == ["done", "old-unread"])
  }

  @Test func paceAndCountdown() {
    let hour: Millis = 3_600_000
    let window = UsageLimits.Window(
      id: "5h", label: "5-hour", usedPercent: 81, resetsAt: now + 2 * hour,
      durationMs: 5 * hour, limited: false)
    let pace = UsageMath.pace(window, now: now)
    #expect(pace?.fast == true)
    #expect(pace?.label == "Using faster than the limit resets: 81% used with 60% of the window elapsed")
    #expect(UsageMath.countdown(2 * hour + 5 * 60_000) == "2h 5m")
    #expect(UsageMath.countdown(3 * day + hour) == "3d 1h")
    #expect(UsageMath.countdown(0) == "now")
  }

  @Test func exportNamesFollowTheDesktop() {
    #expect(ThreadActions.fileName("Fix the README: typos!", id: "ses_1") == "fix-the-readme-typos")
    #expect(ThreadActions.fileName("???", id: "ses_1") == "ses_1")
  }
}
