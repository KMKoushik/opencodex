import XCTest

/// Every transcript interaction, tapped through against the live loopback gateway with the
/// scripted model: following a stream, history paging, disclosure, copy and share, links,
/// images, undo, errors, and catching up after the app returns or the stream drops.
nonisolated final class TranscriptInteractionTests: XCTestCase {
  private let gateway = ChatFixture()
  /// "Explaining math.ts" in `proj`: a finished answer with code, a table, file links and tools.
  private let markdownChat = "ses_e57ae20fdffeG4BE6dcLy2S9aB"
  /// 84 messages in `long-transcript`, two pages.
  private let longChat = ProcessInfo.processInfo.environment["OPENCODEX_LONG_CHAT"] ?? "ses_e57a0c8c0ffeOhQvgxU2dQlgQ3"

  override func setUp() {
    continueAfterFailure = false
  }

  // MARK: Streaming

  /// The chat opens at the end and follows the stream; scrolling up stops following and shows
  /// Jump to latest; jumping, or sending, returns to the end.
  @MainActor
  func testStreamingFollowsUntilTheReaderScrollsUp() async throws {
    let id = try await gateway.chat("QA streaming")
    try await gateway.prompt(id, "short warm-up")
    try await gateway.idle(id)
    try await gateway.prompt(id, "long answer please")

    let app = XCUIApplication.chat(id)
    app.launch()
    let jump = app.buttons["transcript.jump"]
    let streamed = app.textViews.matching(NSPredicate(format: "value BEGINSWITH 'Streaming text should flow'"))
      .firstMatch
    XCTAssertTrue(streamed.waitForExistence(timeout: 20), "The long answer should stream in")
    // Following: the newest text stays on screen and Jump to latest stays hidden.
    for _ in 0..<4 {
      sleep(1)
      XCTAssertFalse(jump.exists, "A following transcript never offers Jump to latest")
    }
    screenshot("stream-following")

    app.transcript.swipeDown(velocity: .slow)
    XCTAssertTrue(jump.waitForExistence(timeout: 5), "Scrolling up stops following")
    sleep(2)
    // The stream keeps growing but no longer pulls the reader down.
    XCTAssertTrue(jump.isHittable)
    screenshot("stream-reading")
    jump.tap()
    XCTAssertTrue(jump.waitForNonExistence(timeout: 5), "Jump to latest returns to the end")
    try await gateway.idle(id)
    sleep(1)
    XCTAssertFalse(jump.exists, "Following stays on to the end of the reply")
    let last = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS '6b'")).firstMatch
    XCTAssertTrue(last.waitForExistence(timeout: 5))

    // Reading history, then sending, jumps to the end and shows the new prompt.
    app.transcript.swipeDown(velocity: .fast)
    XCTAssertTrue(jump.waitForExistence(timeout: 5))
    let input = app.composerInput
    input.tap()
    input.typeText("short follow-up")
    app.buttons["composer.send"].tap()
    XCTAssertTrue(jump.waitForNonExistence(timeout: 5), "Sending jumps to the end")
    let sent = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier == 'transcript.user' AND label == 'short follow-up'")
    ).firstMatch
    XCTAssertTrue(sent.waitForExistence(timeout: 10))
    XCTAssertTrue(sent.isHittable)
    try await gateway.idle(id)
  }

  // MARK: History

  /// Scrolling to the top loads the older page in place: what the reader is looking at
  /// doesn't move when the page arrives above it.
  @MainActor
  func testOlderPagesLoadWithoutJumping() throws {
    let app = XCUIApplication.chat(longChat)
    app.launch()
    let list = app.transcript
    XCTAssertTrue(list.waitForExistence(timeout: 15))
    XCTAssertTrue(app.buttons["Copy response"].waitForExistence(timeout: 15))
    let beginning = app.staticTexts["Beginning of conversation"]
    var swipes = 0
    var probes = 0
    while !beginning.exists, swipes < 80 {
      list.swipeDown(velocity: .fast)
      swipes += 1
      // Let deceleration settle, then watch one visible row through the next second, when
      // any older page lands above it.
      sleep(2)
      guard let probe = middleText(app) else { continue }
      let before = probe.frame.minY
      sleep(1)
      guard probe.exists else { continue }
      probes += 1
      XCTAssertEqual(probe.frame.minY, before, accuracy: 2, "Rows must not jump while older pages load")
    }
    XCTAssertTrue(beginning.exists, "Scrolling up reaches the beginning of the conversation")
    XCTAssertGreaterThan(probes, 3)
    // The first prompt of the whole chat is above the old first page.
    XCTAssertTrue(app.descendants(matching: .any)["transcript.user"].firstMatch.exists)
  }

  /// The text view nearest the middle of the screen, as a query that re-resolves by content.
  @MainActor
  private func middleText(_ app: XCUIApplication) -> XCUIElement? {
    let middle = app.windows.firstMatch.frame.midY
    let views = app.textViews.allElementsBoundByIndex.filter { $0.identifier != "composer.input" }
    let best = views.min { abs($0.frame.midY - middle) < abs($1.frame.midY - middle) }
    guard let best, let value = best.value as? String, value.count > 20 else { return nil }
    return app.textViews.matching(NSPredicate(format: "value == %@", value)).firstMatch
  }

  // MARK: Disclosure

  /// Turn headers fold earlier work; groups and tools open to their details.
  @MainActor
  func testTurnsGroupsAndToolsExpand() throws {
    let app = XCUIApplication.chat(markdownChat)
    app.launch()
    XCTAssertTrue(app.buttons["Copy response"].waitForExistence(timeout: 15))
    // The chat opens at the end; the turn header sits above the answer.
    let turn = app.buttons["transcript.turn"].firstMatch
    for _ in 0..<6 where !turn.exists || !turn.isHittable { app.transcript.swipeDown(velocity: .slow) }
    XCTAssertTrue(turn.isHittable)
    XCTAssertEqual(turn.value as? String, "Collapsed")
    turn.tap()
    XCTAssertTrue(turn.wait(until: "value == 'Expanded'"))
    let group = app.buttons["transcript.activity"].firstMatch
    XCTAssertTrue(group.waitForExistence(timeout: 5))
    XCTAssertEqual(group.value as? String, "Collapsed")
    group.tap()
    XCTAssertTrue(group.wait(until: "value == 'Expanded'"))
    let tool = app.buttons["transcript.tool"].firstMatch
    XCTAssertTrue(tool.waitForExistence(timeout: 5))
    XCTAssertEqual(tool.value as? String, "Collapsed")
    tool.tap()
    XCTAssertTrue(tool.wait(until: "value == 'Expanded'"))
    // `ToolDetails`: the input, then its output.
    let details = app.textViews.matching(NSPredicate(format: "value BEGINSWITH 'Input'")).firstMatch
    XCTAssertTrue(details.waitForExistence(timeout: 5))
    screenshot("disclosure-open")
    tool.tap()
    XCTAssertTrue(details.waitForNonExistence(timeout: 5))
    group.tap()
    XCTAssertTrue(tool.waitForNonExistence(timeout: 5))
    turn.tap()
    XCTAssertTrue(turn.wait(until: "value == 'Collapsed'"))
    XCTAssertTrue(group.waitForNonExistence(timeout: 5))
  }

  // MARK: Copy and share

  /// Copy code, Copy response and the bubble's long-press Copy each put the right text on the
  /// clipboard; Share opens the system share sheet.
  @MainActor
  func testCopyAndShare() async throws {
    let id = try await gateway.chat("QA copy")
    try await gateway.prompt(id, "copy me please")
    try await gateway.idle(id)
    let app = XCUIApplication.chat(id)
    app.launch()

    // The short answer ends with a code block and Copy response.
    let copyCode = app.buttons["transcript.copy-code"].firstMatch
    XCTAssertTrue(copyCode.waitForExistence(timeout: 15))
    let code = try XCTUnwrap(app.staticTexts["transcript.code"].firstMatch.label as String?)
    copyCode.tap()
    XCTAssertTrue(copyCode.wait(until: "label == 'Copied'", timeout: 2), "Copy code confirms")
    let pastedCode = app.pasteIntoComposer()
    XCTAssertTrue(pastedCode.contains(code.prefix(12)), "Copy code copies the block: \(pastedCode)")
    app.clearComposer()

    let copy = app.buttons["Copy response"]
    XCTAssertTrue(copy.waitForExistence(timeout: 5))
    copy.tap()
    XCTAssertTrue(app.staticTexts["Copied"].waitForExistence(timeout: 2))
    let pastedAnswer = app.pasteIntoComposer()
    XCTAssertTrue(pastedAnswer.contains(code.prefix(12)), "Copy response copies the whole answer")
    XCTAssertGreaterThan(pastedAnswer.count, code.count)
    app.clearComposer()

    // Long-press a prompt: the native context menu copies it.
    let bubble = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier == 'transcript.user' AND label == 'copy me please'")
    ).firstMatch
    XCTAssertTrue(bubble.waitForExistence(timeout: 5))
    bubble.press(forDuration: 1.0)
    let menuCopy = app.buttons["Copy"]
    XCTAssertTrue(menuCopy.waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Share"].exists, "The prompt's menu offers Share")
    screenshot("bubble-menu")
    menuCopy.tap()
    XCTAssertEqual(app.pasteIntoComposer(), "copy me please")
    app.clearComposer()

    // Share response opens the system share sheet.
    let share = app.buttons["transcript.share"]
    XCTAssertTrue(share.waitForExistence(timeout: 5))
    share.tap()
    let sheet = app.otherElements["ActivityListView"]
    XCTAssertTrue(sheet.waitForExistence(timeout: 5), "Share opens the share sheet")
    screenshot("share-sheet")
    let close = app.buttons["Close"].exists ? app.buttons["Close"] : app.navigationBars.buttons.firstMatch
    if close.exists { close.tap() } else { app.swipeDown() }
    XCTAssertTrue(sheet.waitForNonExistence(timeout: 5))
  }

  // MARK: Links and images

  /// A workspace file link opens the file, like the desktop's file links.
  @MainActor
  func testFileLinkOpensTheFile() throws {
    let app = XCUIApplication.chat(markdownChat)
    app.launch()
    XCTAssertTrue(app.buttons["Copy response"].waitForExistence(timeout: 15))
    // The answer's table links each file it describes.
    let link = app.links.matching(NSPredicate(format: "label == 'README.md'")).firstMatch
    XCTAssertTrue(link.waitForExistence(timeout: 5))
    if !link.isHittable { app.transcript.swipeDown(velocity: .slow) }
    link.tap()
    let title = app.navigationBars["README.md"]
    XCTAssertTrue(title.waitForExistence(timeout: 10), "The link opens README.md")
    screenshot("file-link")
    app.buttons["transcript.file.close"].tap()
    XCTAssertTrue(title.waitForNonExistence(timeout: 5))
  }

  /// An attached image previews full screen and closes.
  @MainActor
  func testAttachedImageEnlarges() async throws {
    let id = try await gateway.chat("QA image")
    try await gateway.prompt(
      id, "here is an image",
      files: [["name": "dot.png", "uri": "data:image/png;base64,\(Self.png)"]])
    try await gateway.idle(id)
    let app = XCUIApplication.chat(id)
    app.launch()
    let tile = app.buttons["transcript.attachment.image"].firstMatch
    XCTAssertTrue(tile.waitForExistence(timeout: 15))
    tile.tap()
    let close = app.buttons["transcript.preview.close"]
    XCTAssertTrue(close.waitForExistence(timeout: 5), "Tapping the image enlarges it")
    XCTAssertTrue(app.buttons["transcript.preview.share"].exists)
    screenshot("image-preview")
    close.tap()
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
  }

  /// A 24×24 red PNG.
  private static let png =
    "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAH0lEQVR4nGO44GBAFcQwatCoQaMGjRo0atCoQQNvEAC/R9Af5+c9lgAAAABJRU5ErkJggg=="

  // MARK: Undo

  /// Undo hides the last turn behind the desktop's note; redo brings it back.
  @MainActor
  func testUndoNoteAndRedo() async throws {
    let id = try await gateway.chat("QA undo")
    try await gateway.prompt(id, "first prompt")
    try await gateway.idle(id)
    try await gateway.prompt(id, "second prompt")
    try await gateway.idle(id)
    let app = XCUIApplication.chat(id)
    app.launch()
    let second = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier == 'transcript.user' AND label == 'second prompt'")
    ).firstMatch
    XCTAssertTrue(second.waitForExistence(timeout: 15))

    let messages = try await gateway.messages(id)
    let last = try XCTUnwrap(messages.first { $0["type"] as? String == "user" }?["id"] as? String)
    try await gateway.call("/sessions/\(id)/action", ["action": "undo", "messageID": last])
    let note = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Conversation undone.'")).firstMatch
    XCTAssertTrue(note.waitForExistence(timeout: 10), "Undo shows the desktop's note")
    XCTAssertTrue(second.waitForNonExistence(timeout: 5), "Undo hides the undone prompt")
    screenshot("undone")

    try await gateway.call("/sessions/\(id)/action", ["action": "redo"])
    XCTAssertTrue(note.waitForNonExistence(timeout: 10))
    XCTAssertTrue(second.waitForExistence(timeout: 10), "Redo restores the prompt")
  }

  // MARK: Errors

  /// A failed run shows its error under the transcript until the next run starts.
  @MainActor
  func testFailedRunFooterClearsOnTheNextRun() async throws {
    let id = try await gateway.chat("QA failure")
    let app = XCUIApplication.chat(id)
    app.launch()
    XCTAssertTrue(app.descendants(matching: .any)["transcript.empty"].waitForExistence(timeout: 15))
    try await gateway.prompt(id, "this run fails", model: ["id": "missing-model", "providerID": "fake"])
    // The live event carries OpenCode's own message.
    let failure = app.staticTexts["transcript.failure"]
    XCTAssertTrue(failure.waitForExistence(timeout: 20))
    XCTAssertTrue(failure.label.contains("missing-model"), failure.label)
    screenshot("run-failed")
    try await gateway.prompt(id, "this run works")
    XCTAssertTrue(failure.waitForNonExistence(timeout: 15), "The next run clears the failure")
    try await gateway.idle(id)
  }

  /// A chat that can't load shows the error banner, which dismisses on tap.
  @MainActor
  func testErrorBannerDismisses() throws {
    let app = XCUIApplication.chat("ses_qachat_missing_chat")
    app.launch()
    let banner = app.buttons["transcript.error"]
    XCTAssertTrue(banner.waitForExistence(timeout: 15))
    screenshot("error-banner")
    banner.tap()
    XCTAssertTrue(banner.waitForNonExistence(timeout: 5))
  }

  // MARK: Catching up

  /// Events missed in the background arrive by refetch when the app returns.
  @MainActor
  func testReturningToTheForegroundRefetches() async throws {
    let id = try await gateway.chat("QA foreground")
    try await gateway.prompt(id, "before background")
    try await gateway.idle(id)
    let app = XCUIApplication.chat(id)
    app.launch()
    XCTAssertTrue(app.buttons["Copy response"].waitForExistence(timeout: 15))

    XCUIDevice.shared.press(.home)
    XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10) || app.state == .runningBackgroundSuspended)
    try await gateway.call("/sessions/\(id)/action", ["action": "rename", "title": "QA foreground renamed"])
    try await gateway.prompt(id, "while in background")
    try await gateway.idle(id)
    app.activate()
    let missed = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier == 'transcript.user' AND label == 'while in background'")
    ).firstMatch
    XCTAssertTrue(missed.waitForExistence(timeout: 10), "The chat refetches on return")
    XCTAssertTrue(
      app.staticTexts["QA foreground renamed"].waitForExistence(timeout: 10)
        || app.buttons.matching(NSPredicate(format: "label CONTAINS 'QA foreground renamed'")).firstMatch.exists,
      "The title refetches too")
  }

  /// With the event stream down (`-eventsOffline YES`, Debug only), the chat polls every
  /// 5 seconds, so a reply still finishes on screen.
  @MainActor
  func testRecoveryPollingWithoutEvents() async throws {
    let id = try await gateway.chat("QA polling")
    let app = XCUIApplication.chat(id, ["-eventsOffline", "YES"])
    app.launch()
    XCTAssertTrue(app.descendants(matching: .any)["transcript.empty"].waitForExistence(timeout: 15))
    try await gateway.prompt(id, "reply without events")
    let prompt = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier == 'transcript.user' AND label == 'reply without events'")
    ).firstMatch
    XCTAssertTrue(prompt.waitForExistence(timeout: 15), "Polling picks up the prompt")
    try await gateway.idle(id)
    XCTAssertTrue(app.buttons["Copy response"].waitForExistence(timeout: 15), "Polling finishes the reply")
  }
}
