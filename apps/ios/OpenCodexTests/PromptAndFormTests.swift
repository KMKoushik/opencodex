import Foundation
import Testing

@testable import OpenCodex

/// Ports of the desktop's `question-answer.ts`, `sentMentionRanges` and `messageAnnotations`.
struct PromptAndFormTests {
  private func form(_ json: String) throws -> FormInfo {
    try JSONDecoder().decode(FormInfo.self, from: Data(#"{"id":"f","sessionID":"s","fields":\#(json)}"#.utf8))
  }

  @Test func questionDefaultsConditionsAndLimits() throws {
    let form = try form(
      """
      [
        {"key":"kind","type":"string","options":[{"value":"bug","label":"Bug"},{"value":"idea","label":"Idea"}],
         "default":"bug"},
        {"key":"steps","type":"string","required":true,"minLength":5,"maxLength":8,
         "when":[{"key":"kind","op":"eq","value":"bug"}]},
        {"key":"tags","type":"multiselect","options":[{"value":"a"},{"value":"b"},{"value":"c"}],
         "minItems":2,"maxItems":2,"default":["a"]},
        {"key":"count","type":"integer","minimum":1,"maximum":10,"default":3},
        {"key":"source","type":"string","hidden":true,"default":"phone"},
        {"key":"other","type":"string","options":[{"value":"x"}],"custom":true,"default":"typed",
         "when":[{"key":"kind","op":"neq","value":"bug"}]}
      ]
      """)
    var answers = QuestionAnswers(form)
    let field = { (key: String) in form.fields.first { $0.key == key }! }

    // Defaults are prefilled; a hidden field is never shown but still sent; `neq` hides "other".
    #expect(answers.visible.map(\.key) == ["kind", "steps", "tags", "count"])
    #expect(answers.isSelected(field("kind").options![0], in: field("kind")))
    #expect(answers.error(field("steps")) == "Choose or enter an answer to continue.")
    #expect(answers.error(field("tags")) == "Choose at least 2 answers.")
    #expect(answers.error(field("count")) == nil)

    answers.setText(field("steps"), "abc")
    #expect(answers.error(field("steps")) == "Use at least 5 characters.")
    // `maxLength` stops typing past the limit, like the input's attribute.
    answers.setText(field("steps"), "abcdefghijk")
    #expect(answers.value(field("steps")) == .string("abcdefgh"))
    answers.toggle(field("tags").options![1], in: field("tags"))
    answers.toggle(field("tags").options![2], in: field("tags"))
    #expect(answers.error(field("tags")) == "Choose no more than 2 answers.")
    answers.setNumber(field("count"), "11")
    #expect(answers.error(field("count")) == "Enter 10 or less.")
    answers.setNumber(field("count"), "2.5")
    #expect(answers.error(field("count")) == "Enter a whole number.")

    // Choosing "Idea" swaps the conditional fields; a default outside the options is custom text.
    answers.toggle(field("kind").options![1], in: field("kind"))
    #expect(answers.visible.map(\.key) == ["kind", "tags", "count", "other"])
    #expect(answers.isCustomOn(field("other")) && answers.customText(field("other")) == "typed")
    #expect(Set(answers.submission.keys) == ["kind", "tags", "count", "source", "other"])
    #expect(answers.submission["source"] == .string("phone"))
  }

  @Test func sentMentionsBecomePillsAndAnnotationsAChip() {
    // UTF-16 offsets: the emoji is two units, so `@b.ts` starts at 12.
    let text = "see @a.ts 😀@b.ts and @skill\n\nAnnotation 1\n> quoted line\nfix this"
    func mention(_ start: Int, _ token: String) -> JSONValue {
      .object(["start": .number(Double(start)), "end": .number(Double(start + token.utf16.count)), "text": .string(token)])
    }
    let units = Array(text.utf16)
    let quoteStart = text.utf16.distance(from: text.utf16.startIndex, to: text.range(of: "> quoted")!.lowerBound)
    let commentStart = text.utf16.distance(from: text.utf16.startIndex, to: text.range(of: "fix this")!.lowerBound)
    let ownEnd = text.utf16.distance(from: text.utf16.startIndex, to: text.range(of: "\n\nAnnotation")!.lowerBound)
    let metadata: [String: JSONValue] = [
      "opencodexAnnotations": .object([
        "end": .number(Double(ownEnd + 2)),
        "items": .array([
          .object([
            "kind": .string("annotation"), "label": .string("Chat"),
            "quote": .array([.number(Double(quoteStart)), .number(Double(commentStart - 1))]),
            "comment": .array([.number(Double(commentStart)), .number(Double(units.count))]),
          ])
        ]),
      ])
    ]
    let prompt = SentPrompt(
      text: text,
      mentions: [
        (mention(12, "@b.ts"), "file"), (mention(4, "@a.ts"), "file"),
        // Overlapping and stale ranges are dropped.
        (mention(5, "a.ts"), "file"), (mention(0, "@nope"), "chat"), (mention(22, "@skill"), "skill"),
      ],
      metadata: metadata, files: [], pending: false)
    #expect(prompt.text == "see @a.ts 😀@b.ts and @skill")
    #expect(prompt.mentions.map(\.text) == ["@a.ts", "@b.ts", "@skill"])
    #expect(prompt.mentions.map(\.start) == [4, 12, 22])
    #expect(prompt.annotationSummary == "1 annotation")
    #expect(prompt.annotations.first?.title == "Annotation 1")
    #expect(prompt.annotations.first?.quote == "quoted line")
    #expect(prompt.annotations.first?.comment == "fix this")

    // A range past the text falls back to plain text, as the desktop's renderer does.
    let broken: [String: JSONValue] = [
      "opencodexAnnotations": .object([
        "end": .number(2),
        "items": .array([.object(["kind": .string("comment"), "label": .string(""), "quote": .array([.number(0), .number(9999)])])]),
      ])
    ]
    let plain = SentPrompt(text: text, mentions: [], metadata: broken, files: [], pending: false)
    #expect(plain.text == text && plain.annotations.isEmpty)
  }

  @Test func statusAndSwitchMessagesRenderLikeTheDesktop() throws {
    let page = try JSONDecoder().decode(
      MessagePage.self,
      from: Data(
        """
        {"data":[
          {"id":"m4","type":"location-switched","time":{"created":4},"location":{"directory":"/repo/wt"}},
          {"id":"m3","type":"compaction","time":{"created":3},"status":"failed","reason":"auto",
           "error":{"type":"x","message":"Too large"}},
          {"id":"m2","type":"assistant","time":{"created":2,"completed":2},"content":[],
           "retry":{"attempt":2,"at":5,"error":{"type":"rate","message":"Overloaded"}},
           "error":{"type":"provider.free-limit","message":"Free usage limit reached."}},
          {"id":"m1","type":"model-switched","time":{"created":1},"model":{"id":"big-pickle","providerID":"opencode"}}
        ]}
        """.utf8))
    let builder = TranscriptItemBuilder()
    let rows = TimelineProjector().project(page.data.reversed())
    let notes = rows.flatMap { builder.items(for: $0) { _, text, _ in text } }.compactMap { item -> String? in
      switch item.content {
      case .note(let text), .failure(let text): text
      default: nil
      }
    }
    #expect(
      notes == [
        "Model: big-pickle", "Retrying: Overloaded", "Free usage limit reached.", "Compaction failed: Too large",
        "Directory: /repo/wt",
      ])
  }
}
