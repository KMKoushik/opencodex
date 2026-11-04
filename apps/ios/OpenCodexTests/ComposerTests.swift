import Foundation
import Testing

@testable import OpenCodex

struct ComposerTests {
  private func messages(_ json: String) throws -> [SessionMessage] {
    try JSONDecoder().decode([SessionMessage].self, from: Data(json.utf8))
  }

  private func assistant(_ id: String, completed: Bool, tools: String) -> String {
    """
    {"id":"\(id)","type":"assistant","time":{"created":2\(completed ? ",\"completed\":3" : "")},"content":[\(tools)]}
    """
  }

  private func tool(_ name: String, _ status: String, metadata: String = "{}", input: String = "{}") -> String {
    """
    {"type":"tool","id":"t-\(name)-\(status)","name":"\(name)","time":{"created":1},"state":{"status":"\(status)","input":\(input),"metadata":\(metadata)}}
    """
  }

  @Test func blockingWorkReadsTheNewestUnfinishedReply() throws {
    let shell = tool("shell", "running", metadata: #"{"shellID":"sh_1"}"#, input: #"{"command":"sleep 60"}"#)
    let subagent = tool("subagent", "running", metadata: #"{"sessionID":"ses_child"}"#)
    let tools = [shell, subagent, tool("shell", "completed"), tool("read", "running")].joined(separator: ",")

    let work = BlockingWork(try messages("[\(assistant("a1", completed: false, tools: tools))]"))
    #expect(work.shells == [.init(id: "sh_1", command: "sleep 60")])
    #expect(work.subagents == ["ses_child"])

    // A finished reply blocks nothing, and only the newest assistant message counts.
    #expect(BlockingWork(try messages("[\(assistant("a1", completed: true, tools: shell))]")).isEmpty)
    let older = "[\(assistant("a1", completed: false, tools: shell)),\(assistant("a2", completed: false, tools: tool("shell", "completed")))]"
    #expect(BlockingWork(try messages(older)).isEmpty)
    let user = #"{"id":"u1","type":"user","time":{"created":4},"text":"steer"}"#
    #expect(!BlockingWork(try messages("[\(assistant("a1", completed: false, tools: shell)),\(user)]")).isEmpty)
  }

  @Test func questionAnswersMatchTheDesktop() throws {
    let form = try JSONDecoder().decode(
      FormInfo.self,
      from: Data(
        """
        {"id":"f","sessionID":"s","fields":[
          {"key":"color","type":"string","required":true,"custom":true,
           "options":[{"value":"Red"},{"value":"Blue"}]},
          {"key":"tags","type":"multiselect","custom":true,"options":[{"value":"a"},{"value":"b"}]},
          {"key":"note","type":"string"}
        ]}
        """.utf8))
    let color = form.fields[0], tags = form.fields[1]
    var answers = QuestionAnswers(form)

    // Required and untouched: invalid; untouched optional fields are left out.
    #expect(answers.invalid?.key == "color")
    answers.toggle(color.options![1], in: color)
    #expect(answers.submission == ["color": .string("Blue")])

    // A custom answer replaces the choice; choosing an option again turns it off.
    answers.toggleCustom(color)
    answers.setCustom(color, "Green")
    #expect(answers.submission["color"] == .string("Green"))
    #expect(!answers.isSelected(color.options![1], in: color))
    answers.toggle(color.options![0], in: color)
    #expect(answers.submission["color"] == .string("Red"))

    // Multiselect keeps chosen options, then unique custom lines not already chosen.
    answers.toggle(tags.options![1], in: tags)
    answers.toggleCustom(tags)
    answers.setCustom(tags, " x \n\nb\nx\ny")
    #expect(answers.submission["tags"] == .array([.string("b"), .string("x"), .string("y")]))
    answers.toggleCustom(tags)
    #expect(answers.submission["tags"] == .array([.string("b")]))
    #expect(answers.invalid == nil)
  }
}
