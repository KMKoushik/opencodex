import Foundation

/// The answers to one form while the user fills it in. Each change mirrors the desktop's
/// `question-field.tsx`, and defaults, conditions, validation and the submitted answer mirror
/// `question-answer.ts` and `question-dock.tsx`, so OpenCode receives the same answer from either app.
nonisolated struct QuestionAnswers: Equatable, Sendable {
  let form: FormInfo
  /// Fields start at their defaults (`initialAnswers`); the rest have a value once touched.
  private(set) var answer: [String: JSONValue]
  /// Each field's custom text, kept while its custom choice is off.
  private(set) var custom: [String: String] = [:]
  private(set) var customOn: Set<String> = []

  init(_ form: FormInfo) {
    self.form = form
    var answer: [String: JSONValue] = [:]
    for field in form.fields {
      if let value = field.default, value != .null { answer[field.key] = value }
    }
    self.answer = answer
    for field in form.fields { mount(field) }
  }

  /// `type: "multiselect"` is the only multi-choice field.
  static func multiple(_ field: FormInfo.Field) -> Bool { field.type == "multiselect" }

  static func options(_ field: FormInfo.Field) -> [FormInfo.Option] {
    field.type == "string" || multiple(field) ? field.options ?? [] : []
  }

  /// `fieldApplies`: every `when` condition holds against the current answers.
  static func applies(_ field: FormInfo.Field, _ answer: [String: JSONValue]) -> Bool {
    guard let conditions = field.when, !conditions.isEmpty else { return true }
    return conditions.allSatisfy { condition in
      condition.op == "eq" ? answer[condition.key] == condition.value : answer[condition.key] != condition.value
    }
  }

  /// Fields whose conditions hold; hidden ones still submit their defaults.
  var applicable: [FormInfo.Field] { form.fields.filter { Self.applies($0, answer) } }
  /// The fields the dock steps through and reviews.
  var visible: [FormInfo.Field] { applicable.filter { $0.hidden != true } }

  // MARK: Reading

  func isSelected(_ option: FormInfo.Option, in field: FormInfo.Field) -> Bool {
    if Self.multiple(field) { return answer[field.key]?.array?.contains(.string(option.value)) == true }
    return !customOn.contains(field.key) && answer[field.key] == .string(option.value)
  }

  func isCustomOn(_ field: FormInfo.Field) -> Bool { customOn.contains(field.key) }
  func customText(_ field: FormInfo.Field) -> String { custom[field.key] ?? "" }
  func value(_ field: FormInfo.Field) -> JSONValue? { answer[field.key] }

  // MARK: Editing

  /// What `QuestionField` derives when it mounts: answers that aren't one of the options are
  /// the custom text, and the custom choice is on when there is any.
  mutating func mount(_ field: FormInfo.Field) {
    let options = Set(Self.options(field).map(\.value))
    let text: String =
      switch answer[field.key] {
      case .array(let items)?:
        items.compactMap { item in item.string.flatMap { options.contains($0) ? nil : $0 } }
          .joined(separator: "\n")
      case .string(let value)? where !options.contains(value): value
      default: ""
      }
    custom[field.key] = text
    if text.isEmpty { customOn.remove(field.key) } else { customOn.insert(field.key) }
  }

  mutating func toggle(_ option: FormInfo.Option, in field: FormInfo.Field) {
    if Self.multiple(field) {
      let values = answer[field.key]?.array ?? []
      answer[field.key] = .array(
        isSelected(option, in: field)
          ? values.filter { $0 != .string(option.value) } : values + [.string(option.value)])
    } else {
      customOn.remove(field.key)
      answer[field.key] = .string(option.value)
    }
  }

  /// Taps the "Type your own answer" choice.
  mutating func toggleCustom(_ field: FormInfo.Field) {
    let on = Self.multiple(field) ? !customOn.contains(field.key) : true
    if on { customOn.insert(field.key) } else { customOn.remove(field.key) }
    updateCustom(field, customText(field), on: on)
  }

  /// The custom textarea, and a multiselect without options (one answer per line).
  mutating func setCustom(_ field: FormInfo.Field, _ text: String) {
    let text = Self.multiple(field) ? text : Self.limited(text, field.maxLength)
    updateCustom(field, text, on: true)
  }

  mutating func setText(_ field: FormInfo.Field, _ text: String) {
    answer[field.key] = .string(Self.limited(text, field.maxLength))
  }

  mutating func setBool(_ field: FormInfo.Field, _ value: Bool) { answer[field.key] = .bool(value) }

  /// Like a number input: empty stays empty, and text that isn't a number fails validation.
  mutating func setNumber(_ field: FormInfo.Field, _ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    answer[field.key] = trimmed.isEmpty ? .string("") : Double(trimmed).map(JSONValue.number) ?? .string(trimmed)
  }

  /// `maxLength` on an input stops typing past the limit (in UTF-16 units, as browsers count).
  private static func limited(_ text: String, _ max: Int?) -> String {
    guard let max, text.utf16.count > max else { return text }
    return String(decoding: text.utf16.prefix(max), as: UTF16.self)
  }

  private mutating func updateCustom(_ field: FormInfo.Field, _ text: String, on: Bool) {
    custom[field.key] = text
    guard Self.multiple(field) else {
      answer[field.key] = .string(on ? text : "")
      return
    }
    let options = Set(Self.options(field).map(\.value))
    let selected = (answer[field.key]?.array ?? []).filter { $0.string.map(options.contains) == true }
    var added: [JSONValue] = []
    if on {
      var seen = Set<String>()
      for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
        let item = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !item.isEmpty, seen.insert(item).inserted, !selected.contains(.string(item)) else { continue }
        added.append(.string(item))
      }
    }
    answer[field.key] = .array(selected + added)
  }

  // MARK: Submitting

  /// Port of `answerError`.
  func error(_ field: FormInfo.Field) -> String? {
    if field.type == "external" || field.hidden == true { return nil }
    let value = answer[field.key]
    let empty: Bool =
      switch value {
      case nil, .null: true
      case .string(let text): text.isEmpty
      case .array(let items): items.isEmpty
      default: false
      }
    if empty { return field.required == true ? "Choose or enter an answer to continue." : nil }
    if Self.multiple(field) {
      guard let items = value?.array else { return "Choose one or more answers." }
      if let min = field.minItems, items.count < min { return "Choose at least \(min) answers." }
      if let max = field.maxItems, items.count > max { return "Choose no more than \(max) answers." }
    }
    if field.type == "string", let text = value?.string {
      if field.required == true, text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return "Enter an answer to continue."
      }
      let length = text.utf16.count
      if let min = field.minLength, length < min { return "Use at least \(min) characters." }
      if let max = field.maxLength, length > max { return "Use no more than \(max) characters." }
    }
    if field.type == "number" || field.type == "integer" {
      guard let number = value?.number, number.isFinite else { return "Enter a number." }
      if field.type == "integer", number.rounded() != number { return "Enter a whole number." }
      if let min = field.minimum, number < min { return "Enter \(Self.format(min)) or more." }
      if let max = field.maximum, number > max { return "Enter \(Self.format(max)) or less." }
    }
    return nil
  }

  /// The browser's `reportValidity` for the field on screen: a text answer must match `pattern`.
  func validity(_ field: FormInfo.Field) -> String? {
    guard field.type == "string", Self.options(field).isEmpty, let pattern = field.pattern,
      let text = value(field)?.string, !text.isEmpty,
      let regex = try? NSRegularExpression(pattern: "^(?:\(pattern))$")
    else { return nil }
    let range = NSRange(location: 0, length: text.utf16.count)
    return regex.firstMatch(in: text, range: range) == nil ? "Please match the requested format." : nil
  }

  /// The first shown field that can't be submitted yet.
  var invalid: (key: String, message: String)? {
    for field in visible { if let message = error(field) { return (field.key, message) } }
    return nil
  }

  /// What to send: the answers to the fields that apply, hidden ones included, as the desktop sends them.
  var submission: [String: JSONValue] {
    let keys = Set(applicable.map(\.key))
    return answer.filter { keys.contains($0.key) }
  }

  /// A number as JavaScript prints it: `5`, `1.5`.
  static func format(_ number: Double) -> String {
    number.rounded() == number && abs(number) < 1e15 ? String(Int64(number)) : String(number)
  }
}
