import XCTest

/// The composer's model control: open the picker, choose another model, set its thinking level.
nonisolated final class ModelSwitchTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  @MainActor func testChoosingAModelAndThinkingLevel() async throws {
    let session = try await TestGateway().createSession()
    let app = XCUIApplication.opencodex(["-session", session])
    app.launch()

    let input =
      app.textViews["composer.input"].exists
      ? app.textViews["composer.input"] : app.textFields["composer.input"]
    XCTAssertTrue(input.waitForExistence(timeout: 15))
    input.tap()

    let model = app.buttons["composer.model"]
    XCTAssertTrue(model.waitForExistence(timeout: 10), "The model row appears once focused")
    XCTAssertEqual(model.value as? String, "Scripted")
    model.tap()

    let search = app.textFields["model.search"]
    XCTAssertTrue(search.waitForExistence(timeout: 10), "The model picker should open")
    search.tap()
    search.typeText("DeepSeek")
    let deepseek = app.buttons.matching(NSPredicate(format: "label CONTAINS 'DeepSeek V4.1 Flash'"))
      .firstMatch
    XCTAssertTrue(deepseek.waitForExistence(timeout: 5))
    deepseek.tap()

    // The picker closes on a pick, and the composer shows the new model.
    let picked = NSPredicate { _, _ in model.value as? String == "DeepSeek V4.1 Flash Free" }
    await fulfillment(of: [expectation(for: picked, evaluatedWith: nil)], timeout: 10)

    // Its thinking levels are in the picker's bottom bar.
    model.tap()
    let thinking = app.buttons["composer.thinking"]
    XCTAssertTrue(thinking.waitForExistence(timeout: 10), "Thinking levels are in the picker")
    thinking.tap()
    let high = app.buttons["High"]
    XCTAssertTrue(high.waitForExistence(timeout: 5))
    high.tap()
    XCTAssertEqual(thinking.value as? String, "High")
  }
}
