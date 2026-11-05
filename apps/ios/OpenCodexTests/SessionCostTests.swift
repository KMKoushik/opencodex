import Foundation
import Testing

@testable import OpenCodex

/// The Session details cost walk, matching the desktop's `session-cost.test.ts`.
struct SessionCostTests {
  private static nonisolated func child(_ id: String, _ parentID: String, _ cost: Double) -> SessionDetails.SessionUsage {
    .init(id: id, parentID: parentID, cost: cost)
  }

  private static nonisolated func page(_ data: [SessionDetails.SessionUsage], next: String? = nil)
    -> SessionDetails.SubagentPage
  {
    .init(data: data, cursor: .init(next: next))
  }

  private func child(_ id: String, _ parentID: String, _ cost: Double) -> SessionDetails.SessionUsage {
    Self.child(id, parentID, cost)
  }
  private func page(_ data: [SessionDetails.SessionUsage], next: String? = nil)
    -> SessionDetails.SubagentPage
  {
    Self.page(data, next: next)
  }

  @Test func countsEveryPaginatedAndNestedSubagentOnceWithoutTheParent() async throws {
    let pages: [String: SessionDetails.SubagentPage] = [
      "parent:": page([child("a", "parent", 2)], next: "more"),
      "parent:more": page([child("a", "parent", 2), child("b", "parent", 3)]),
      "a:": page([child("nested", "a", 4)]),
      "b:": page([]),
      "nested:": page([child("parent", "nested", 100)]),
    ]
    let calls = Calls()
    let costs = try await SessionCost.subagents(of: "parent") { id, cursor in
      let key = "\(id):\(cursor ?? "")"
      await calls.add(key)
      guard let page = pages[key] else { throw SessionCost.Failure(message: "Unexpected \(key)") }
      return page
    }
    #expect(costs.map(\.id).sorted() == ["a", "b", "nested"])
    #expect(costs.reduce(0) { $0 + $1.cost } == 9)
    let made = await calls.all
    #expect(made.sorted() == pages.keys.sorted())
  }

  @Test func failsInsteadOfShowingAPartialCost() async {
    await #expect(throws: SessionCost.Failure.self) {
      try await SessionCost.subagents(of: "parent") { id, _ in
        if id == "parent" { return Self.page([Self.child("a", "parent", 2)]) }
        throw SessionCost.Failure(message: "Metadata unavailable")
      }
    }
  }

  @Test func contextUsesTheLatestReportedResponseOverItsModelsLimit() throws {
    let json = """
      [{"id":"a1","type":"assistant","time":{"created":1},"model":{"id":"m","providerID":"p"},"content":[],
        "tokens":{"input":100,"output":20,"reasoning":5,"cache":{"read":70,"write":5}}},
       {"id":"a2","type":"assistant","time":{"created":2},"model":{"id":"m","providerID":"p"},"content":[],
        "tokens":{"input":0,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}]
      """
    let messages = try JSONDecoder().decode([SessionMessage].self, from: Data(json.utf8))
    let model = ModelCatalog.Model(
      id: "m", providerID: "p", name: "M", limit: .init(context: 1000))
    let reading = ContextUsage.reading(messages: messages, fallback: nil, models: [model])
    #expect(reading.tokens == 200)
    #expect(reading.ratio == 0.2)
  }
}

private actor Calls {
  var all: [String] = []
  func add(_ key: String) { all.append(key) }
}
