import Foundation
import Testing

@testable import OpenCodex

/// The transcript projection (a port of the web's `timeline-model.ts`) on real gateway pages.
struct TimelineTests {
  private func messages(_ name: String) throws -> [SessionMessage] {
    let url = try #require(
      Bundle(for: Marker.self).url(forResource: name, withExtension: nil, subdirectory: "Fixtures"))
    // Pages are newest first; the chat keeps them oldest first.
    return try JSONDecoder().decode(MessagePage.self, from: Data(contentsOf: url)).data.reversed()
  }

  private func project(
    _ messages: [SessionMessage], running: Bool = false, overrides: [String: Bool] = [:],
    projector: TimelineProjector = TimelineProjector(), grouper: TurnGrouper = TurnGrouper()
  ) -> [TimelineRow] {
    grouper.group(projector.project(messages), messages: messages, running: running, overrides: overrides)
  }

  @Test func finishedTurnFoldsWorkUnderHeader() throws {
    let messages = try messages("messages-shell.json")
    let rows = project(messages)
    // The user prompt, a collapsed "Worked for" header, and the final answer with Copy.
    #expect(rows.count == 3)
    #expect(rows[0].isUser)
    guard case .turn(let turn) = rows[1], case .text(let answer) = rows[2] else {
      Issue.record("expected a turn header and the answer: \(rows.map(\.id))")
      return
    }
    #expect(turn.status == .worked && !turn.open && turn.end != nil)
    #expect(DisclosureCell.label(turn) == "Worked for 35s")
    #expect(answer.copyable && answer.text.hasPrefix("Done"))

    // Opening it shows one activity group across both assistant steps: reasoning and 2 shells.
    let open = project(messages, overrides: [turn.id: true])
    let activities = open.compactMap { row -> ActivityRow? in
      if case .activity(let activity) = row { activity } else { nil }
    }
    #expect(activities.count == 1)
    #expect(activities.first?.entries.count == 3)
    #expect(activities.first?.summary == "Ran 2 commands")
    #expect(open.last == rows.last)
  }

  @Test func idsStayStableAcrossRefreshesAndOlderPages() throws {
    let messages = try messages("messages-shell.json")
    let projector = TimelineProjector()
    let grouper = TurnGrouper()
    // The newest page first lacks the user prompt and the first step (reasoning + `ls`).
    let firstStep = try #require(messages.firstIndex { if case .assistant = $0 { true } else { false } })
    let newest = Array(messages[(firstStep + 1)...])
    let projected = projector.project(newest)
    let partial = grouper.group(projected, messages: newest, running: false, overrides: [:])
    let activity = try #require(projected.first { if case .activity = $0 { true } else { false } })
    let header = try #require(partial.first { if case .turn = $0 { true } else { false } })

    // The older page extends the same group and turn; their IDs (and so scroll anchoring and
    // toggles) survive, and a re-decoded refresh changes nothing.
    let full = project(messages, projector: projector, grouper: grouper)
    let opened = project(messages, overrides: [header.id: true], projector: projector, grouper: grouper)
    #expect(full.contains { $0.id == header.id })
    #expect(opened.contains { $0.id == activity.id })
    #expect(opened.contains { if case .activity(let a) = $0 { a.entries.count == 3 } else { false } })
    let refreshed = project(try self.messages("messages-shell.json"), projector: projector, grouper: grouper)
    #expect(refreshed == full)
  }

  @Test func runningTurnStaysOpenAndShowsStreamedParts() throws {
    let messages = try messages("messages-markdown.json")
    let running = project(messages, running: true)
    guard case .turn(let turn)? = running.first(where: { if case .turn = $0 { true } else { false } }) else {
      Issue.record("expected a turn header")
      return
    }
    #expect(turn.status == .working && turn.open && turn.end == nil)
    #expect(running.contains { if case .activity(let a) = $0 { a.summary == "Read 2 files" } else { false } })

    // Streamed text the snapshot doesn't have yet renders in order after the known parts.
    let last = try #require(messages.last?.id)
    let live = withLiveParts(
      messages,
      live: [
        ChatModel.LiveKey(messageID: last, kind: .text, ordinal: 1),
        ChatModel.LiveKey(messageID: "msg_zzz_next", kind: .text, ordinal: 0),
      ])
    let ids = project(live, running: true).map(\.id)
    let known = try #require(ids.firstIndex(of: "\(last):text:1"))
    let next = try #require(ids.firstIndex(of: "msg_zzz_next:text:0"))
    #expect(known < next)
  }

  @Test func streamedMarkdownSettlesBlocks() {
    let text = "# Title\n\nFirst paragraph.\n\n- one\n- two\n\n```swift\nlet x = 1\n```\n\nLast **bold**."
    let splitter = BlockSplitter()
    var settled: [MarkdownBlock] = []
    var end = text.startIndex
    while end < text.endIndex {
      end = text.index(end, offsetBy: min(7, text.distance(from: end, to: text.endIndex)))
      let blocks = splitter.split(String(text[..<end]))
      // Blocks followed by two others never change again.
      #expect(Array(blocks.prefix(settled.count)) == settled)
      settled = Array(blocks.dropLast(2))
    }
    #expect(splitter.split(text).map(\.kind) == [.text, .text, .text, .code, .text])
    #expect(MarkdownBlocks.split(text).map(\.source) == splitter.split(text).map(\.source))
  }
}

private final class Marker {}
