import Foundation

/// The answers to one form while the user fills it in. Each change mirrors the desktop's
/// `question-field.tsx`, and validation and the submitted answer mirror `question-answer.ts`,
/// so OpenCode receives the same answer from either app.
nonisolated struct QuestionAnswers: Equatable, Sendable {
  let form: FormInfo
  /// Only fields the user touched have a value, like the desktop's answer object.
  private(set) var answer: [String: JSONValue] = [:]
  /// Each field's custom text, kept while its custom choice is off.
  private(set) var custom: [String: String] = [:]
  private(set) var customOn: Set<String> = []

  init(_ form: FormInfo) { self.form = form }

  static func multiple(_ field: FormInfo.Field) -> Bool {
    field.type == "multiselect" || field.multiple == true
  }

  static func options(_ field: FormInfo.Field) -> [FormInfo.Option] {
    field.type == "string" || multiple(field) ? field.options ?? [] : []
  }

  // MARK: Reading

  func isSelected(_ option: FormInfo.Option, in field: FormInfo.Field) -> Bool {
    if Self.multiple(field) { return answer[field.key]?.array?.contains(.string(option.value)) == true }
    return !customOn.contains(field.key) && answer[field.key] == .string(option.value)
  }

  func isCustomOn(_ field: FormInfo.Field) -> Bool { customOn.contains(field.key) }
  func customText(_ field: FormInfo.Field) -> String { custom[field.key] ?? "" }
  func value(_ field: FormInfo.Field) -> JSONValue? { answer[field.key] }

  // MARK: Editing

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

  mutating func setCustom(_ field: FormInfo.Field, _ text: String) {
    updateCustom(field, text, on: true)
  }

  mutating func setText(_ field: FormInfo.Field, _ text: String) { answer[field.key] = .string(text) }
  mutating func setBool(_ field: FormInfo.Field, _ value: Bool) { answer[field.key] = .bool(value) }

  /// Like a number input: empty stays empty, and text that isn't a number fails validation.
  mutating func setNumber(_ field: FormInfo.Field, _ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    answer[field.key] = trimmed.isEmpty ? .string("") : Double(trimmed).map(JSONValue.number) ?? .string(trimmed)
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

  /// Port of `answerError`, for the fields the phone's form model decodes.
  func error(_ field: FormInfo.Field) -> String? {
    if field.type == "external" { return nil }
    let value = answer[field.key]
    let empty: Bool =
      switch value {
      case nil, .null: true
      case .string(let text): text.isEmpty
      case .array(let items): items.isEmpty
      default: false
      }
    if empty { return field.required == true ? "Choose or enter an answer to continue." : nil }
    if Self.multiple(field), value?.array == nil { return "Choose one or more answers." }
    if field.type == "string", let text = value?.string, field.required == true,
      text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      return "Enter an answer to continue."
    }
    if field.type == "number" || field.type == "integer" {
      guard let number = value?.number, number.isFinite else { return "Enter a number." }
      if field.type == "integer", number.rounded() != number { return "Enter a whole number." }
    }
    return nil
  }

  /// The first field that can't be submitted yet.
  var invalid: (key: String, message: String)? {
    for field in form.fields { if let message = error(field) { return (field.key, message) } }
    return nil
  }

  /// What to send: the answers to this form's fields, as the desktop sends them.
  var submission: [String: JSONValue] {
    let keys = Set(form.fields.map(\.key))
    return answer.filter { keys.contains($0.key) }
  }
}
