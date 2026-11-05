import XCTest

/// The `@` menu: a file, a skill and another chat, sent as native mentions.
nonisolated final class ComposerMentionTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testMentioningAFileASkillAndAChat() async throws {
    let gateway = TestGateway()
    // Another chat to mention, findable by its title.
    let other = try await gateway.createSession(in: TestGateway.homeDemo)
    // One word: like the desktop, a space ends the `@` query.
    let title = "Mention\(UUID().uuidString.prefix(6))"
    _ = try await gateway.call("/sessions/\(other)/action", ["action": "rename", "title": title])
    let session = try await gateway.createSession(in: TestGateway.homeDemo)
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let input = app.composerInput
    XCTAssertTrue(input.waitForExistence(timeout: 15))
    input.tap()
    input.typeText("Compare @READ")
    let menu = app.descendants(matching: .any)["composer.menu"]
    XCTAssertTrue(menu.waitForExistence(timeout: 5))
    let file = app.buttons["menu.file:README.md"]
    XCTAssertTrue(file.waitForExistence(timeout: 10), "Files are searched in the project")
    file.tapWhenStill()
    XCTAssertEqual(input.text, "Compare @README.md ")
    XCTAssertTrue(menu.waitForNonExistence(timeout: 2))

    input.typeText("with @Open")
    let skill = app.buttons["menu.skill:opencode"]
    XCTAssertTrue(skill.waitForExistence(timeout: 10), "Skills are listed")
    skill.tapWhenStill()
    XCTAssertEqual(input.text, "Compare @README.md with @OpenCode ")

    input.typeText("and @\(title.prefix(11))")
    let chat = app.buttons["menu.chat:\(other)"]
    XCTAssertTrue(chat.waitForExistence(timeout: 10), "Recent chats are listed")
    chat.tapWhenStill()
    XCTAssertEqual(input.text, "Compare @README.md with @OpenCode and @\(title) ")

    app.buttons["composer.send"].tap()
    await waitFor(timeout: 15) { input.text.isEmpty }

    try await gateway.waitFor {
      guard let sent = try await gateway.messages(session).first(where: { $0["type"] as? String == "user" })
      else { return false }
      let files = sent["files"] as? [[String: Any]] ?? []
      let skills = sent["skills"] as? [[String: Any]] ?? []
      let mentioned = files.compactMap { ($0["mention"] as? [String: Any])?["text"] as? String }
      return mentioned.contains("@README.md") && mentioned.contains("@\(title)")
        && skills.contains { $0["id"] as? String == "opencode" }
    }
  }
}
