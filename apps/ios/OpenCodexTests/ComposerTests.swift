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

struct SlashAndMentionTests {
  @Test func slashCommandsParseAndRankLikeTheDesktop() {
    #expect(SlashCommand.parse("  /rename  New title \n")! == ("rename", "New title"))
    #expect(SlashCommand.parse("/undo")! == ("undo", ""))
    #expect(SlashCommand.parse("/a/b") == nil)
    #expect(SlashCommand.parse("hello /undo") == nil)
    #expect(SlashCommand.isSearch("/re"))
    #expect(!SlashCommand.isSearch("/rename x"))

    let commands = [
      SlashCommand(name: "review", description: "review changes"),
      SlashCommand(name: "pre", description: "x"),
      SlashCommand(name: "init", description: "prepare AGENTS.md"),
      SlashCommand(name: "re", description: "y"),
    ]
    // Exact, then prefix, then substring, then description.
    #expect(SlashCommand.match(commands, "re").map(\.name) == ["re", "review", "pre", "init"])
    let many = (0..<80).map { SlashCommand(name: "c\($0)", description: "") }
    #expect(SlashCommand.match(many, "").count == 50)
  }

  @Test func mentionRangesCountUTF16LikeTheGateway() {
    // "😀" is two UTF-16 units, so the token starts at 7, not 6.
    let text = "fix 😀 @a.ts and @a.tsx, then ask @Review."
    #expect(Mentions.find(text, "@a.ts") == 7)
    // A whole token only: "@a.ts" isn't found inside "@a.tsx".
    #expect(Mentions.find(text, "@a.ts", from: 8) == nil)
    let mentions: [DraftMention] = [
      .file(path: "a.tsx", token: "@a.tsx"), .skill(id: "review", token: "@Review"),
      .chat(id: "ses_1", token: "@Gone"),
    ]
    let sent = Mentions.prompt(text, mentions)
    #expect(sent.map(\.type) == ["file", "skill"])
    #expect(sent[0].mention == .init(start: 17, end: 23, text: "@a.tsx"))
    #expect(sent[1].path == nil && sent[1].id == "review")
    let units = Array(text.utf16)
    #expect(String(decoding: units[sent[1].mention.start..<sent[1].mention.end], as: UTF16.self) == "@Review")
    // Deleting a token drops its mention.
    #expect(Mentions.live("fix @a.ts", mentions).isEmpty)
  }

  @Test func mentionQueryFindsTheTokenBeforeTheCaret() {
    let text = "see (@src/ma and me@x"
    #expect(Mentions.query(text, caret: 12)! == (5, "src/ma"))
    // An `@` inside a word isn't a mention, and a space ends the query.
    #expect(Mentions.query(text, caret: text.utf16.count) == nil)
    #expect(Mentions.query("@a b", caret: 4) == nil)
    #expect(Mentions.query("@", caret: 1)! == (0, ""))
  }

  @Test func undoRestoresSentMentions() throws {
    let message = try JSONDecoder().decode(
      SentMessage.self,
      from: Data(
        #"""
        {"id":"m","type":"user","text":"read @a.ts and @Chat",
         "files":[{"data":"","mime":"text/plain","source":{"type":"uri","uri":"file:///p/a.ts"},
                   "mention":{"start":5,"end":10,"text":"@a.ts"}},
                  {"data":"","mime":"text/plain","source":{"type":"inline"},
                   "description":"Chat transcript (ses_9)","mention":{"start":15,"end":20,"text":"@Chat"}},
                  {"data":"aGk=","mime":"image/png","source":{"type":"inline"}}],
         "skills":[{"id":"s","name":"S"}]}
        """#.utf8))
    #expect(message.mentions == [.file(path: "a.ts", token: "@a.ts"), .chat(id: "ses_9", token: "@Chat")])
  }
}
