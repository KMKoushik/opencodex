import XCTest

/// The composer's model control: the picker's search, Cancel, most-used order, picking a model,
/// and the thinking level at the top right; then a send uses the choice.
nonisolated final class ModelSwitchTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testChoosingAModelAndThinkingLevel() async throws {
    let gateway = TestGateway()
    let session = try await gateway.createSession()
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let input = app.composerInput
    XCTAssertTrue(input.waitForExistence(timeout: 15))
    input.tap()

    let model = app.buttons["composer.model"]
    XCTAssertTrue(model.waitForExistence(timeout: 10), "The model row appears once focused")
    await waitFor(timeout: 10) { (model.value as? String)?.hasPrefix("Scripted") == true }
    model.tap()

    // One flat list: logo, model and provider on each row.
    let search = app.searchFields["Search"]
    XCTAssertTrue(search.waitForExistence(timeout: 10), "The model picker should open")
    let pickle = app.buttons["Big Pickle, OpenCode"]
    XCTAssertTrue(pickle.waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["model.group.opencode"].exists, "No provider groups")

    // Cancel closes without changing the model.
    app.buttons["model.cancel"].tap()
    XCTAssertTrue(search.waitForNonExistence(timeout: 5))
    XCTAssertTrue((model.value as? String)?.hasPrefix("Scripted") == true)
    model.tap()
    XCTAssertTrue(search.waitForExistence(timeout: 10))

    // Search narrows the list, and picking closes the picker.
    search.tap()
    search.typeText("DeepSeek")
    let deepseek = app.buttons["DeepSeek V4.1 Flash Free, OpenCode"]
    XCTAssertTrue(deepseek.waitForExistence(timeout: 5))
    XCTAssertFalse(pickle.exists, "Search hides other models")
    deepseek.tap()
    XCTAssertTrue(search.waitForNonExistence(timeout: 5), "The picker closes on a pick")
    await waitFor(timeout: 10) { (model.value as? String)?.hasPrefix("DeepSeek V4.1 Flash Free") == true }

    // The model just used now leads the list; pick Scripted back.
    model.tap()
    XCTAssertTrue(deepseek.waitForExistence(timeout: 5))
    XCTAssertLessThan(
      deepseek.frame.minY, search.frame.maxY + 70, "The most used model is the first row")
    search.tap()
    search.typeText("Scripted")
    let scripted = app.buttons["Scripted, Scripted"]
    XCTAssertTrue(scripted.waitForExistence(timeout: 5))
    scripted.tap()
    XCTAssertTrue(search.waitForNonExistence(timeout: 5))
    await waitFor(timeout: 10) { (model.value as? String)?.hasPrefix("Scripted") == true }

    // The thinking level is at the picker's top right.
    model.tap()
    let thinking = app.buttons["composer.thinking"]
    XCTAssertTrue(thinking.waitForExistence(timeout: 10), "Thinking levels are in the picker")
    XCTAssertEqual(thinking.value as? String, "Default")
    thinking.tap()
    let high = app.buttons["High"]
    XCTAssertTrue(high.waitForExistence(timeout: 5))
    high.tap()
    XCTAssertEqual(thinking.value as? String, "High")
    // Close the picker; the composer reads "Scripted · High".
    app.buttons["model.cancel"].tap()
    XCTAssertTrue(search.waitForNonExistence(timeout: 5))
    XCTAssertEqual(model.value as? String, "Scripted, High")

    // A send uses the chosen model and thinking level.
    input.tap()
    input.typeText("Which model?")
    app.buttons["composer.send"].tap()
    try await gateway.waitFor {
      let reply = try await gateway.messages(session).last { $0["type"] as? String == "assistant" }
      let ref = reply?["model"] as? [String: Any]
      return ref?["id"] as? String == "scripted" && ref?["variant"] as? String == "high"
    }
  }
}
