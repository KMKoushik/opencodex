import SwiftUI

/// A question the agent asked, in the composer's place: one field at a time, then a review
/// of the answers before sending. Port of the desktop `question-dock.tsx`.
struct QuestionDock: View {
  let model: ChatModel
  let form: FormInfo
  var pendingCount = 1

  @Environment(\.palette) private var palette
  @State private var answers: QuestionAnswers
  @State private var activeKey: String?
  @State private var collapsed = false
  @State private var reviewing = false
  @State private var busy = false
  @State private var error: String?
  @FocusState private var focus: String?

  init(model: ChatModel, form: FormInfo, pendingCount: Int = 1) {
    self.model = model
    self.form = form
    self.pendingCount = pendingCount
    _answers = State(initialValue: QuestionAnswers(form))
  }

  /// The fields whose conditions hold, without hidden ones, like the desktop's `fields`.
  private var fields: [FormInfo.Field] { answers.visible }
  private var index: Int { max(0, fields.firstIndex { $0.key == activeKey } ?? 0) }
  private var field: FormInfo.Field? { fields.indices.contains(index) ? fields[index] : nil }
  private var last: Bool { index >= fields.count - 1 }

  private var heading: String {
    field?.description ?? field?.title ?? form.title ?? "Question"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      if collapsed {
        Text(reviewing ? "Your answers are ready to send" : heading)
          .font(.subheadline)
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(1)
          .padding(.horizontal, 18)
          .padding(.bottom, 12)
      } else {
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            Text(reviewing ? "Check your answers before sending" : heading)
              .font(.callout.weight(.medium))
              .foregroundStyle(palette.color("text"))
              .fixedSize(horizontal: false, vertical: true)
              .padding(.horizontal, 8)
              .padding(.bottom, 12)
              .accessibilityAddTraits(.isHeader)
            if reviewing {
              review
            } else if let field {
              fieldView(field)
                .id(field.key)
                // `QuestionField` remounts per field and derives its custom text from the answer.
                .onAppear { answers.mount(field) }
            }
            if let error {
              Text(error)
                .font(.footnote)
                .foregroundStyle(palette.color("error"))
                .padding(8)
            }
          }
          .padding(.horizontal, 10)
          .padding(.top, 4)
          .padding(.bottom, 12)
          .disabled(busy)
        }
        .scrollBounceBehavior(.basedOnSize)
        .frame(maxHeight: 360)
        .fixedSize(horizontal: false, vertical: true)
      }
      footer
    }
    .background(palette.color("surface"), in: .rect(cornerRadius: 18, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .strokeBorder(palette.color("border-heavy")))
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("request.question")
  }

  // MARK: Header and footer

  private var header: some View {
    HStack(spacing: 10) {
      Text(
        reviewing
          ? "Review answers" : fields.count > 1 ? "Question \(index + 1) of \(fields.count)" : "Question")
        .foregroundStyle(palette.color("text-secondary"))
      if !reviewing, field?.description != nil, let title = field?.title {
        Text(title)
          .foregroundStyle(palette.color("text-tertiary"))
          .lineLimit(1)
      }
      if pendingCount > 1 {
        Text("\(pendingCount - 1) more pending")
          .foregroundStyle(palette.color("text-tertiary"))
          .lineLimit(1)
          .fixedSize()
      }
      Spacer(minLength: 0)
      Button {
        withAnimation(.snappy(duration: 0.2)) { collapsed.toggle() }
      } label: {
        Image(systemName: collapsed ? "chevron.up" : "chevron.down")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(palette.color("text-secondary"))
          .frame(width: 44, height: 44)
          .contentShape(.rect)
      }
      .buttonStyle(GhostButtonStyle())
      .accessibilityLabel(collapsed ? "Expand question" : "Collapse question")
    }
    .font(.footnote)
    .padding(.leading, 14)
    .padding(.trailing, 4)
  }

  private var footer: some View {
    HStack(spacing: 8) {
      Button("Dismiss") { Task { await dismiss() } }
        .buttonStyle(DesktopButtonStyle(variant: .ghost, small: true))
        .disabled(busy)
        .accessibilityIdentifier("question.dismiss")
      Spacer(minLength: 0)
      if (reviewing || index > 0), !collapsed, !fields.isEmpty {
        Button("Back") {
          activeKey = fields[reviewing ? fields.count - 1 : index - 1].key
          reviewing = false
          error = nil
        }
        .buttonStyle(DesktopButtonStyle(variant: .ghost, small: true))
        .disabled(busy)
      }
      Button {
        Task { await advance() }
      } label: {
        Text(
          busy
            ? "Sending…"
            : collapsed ? "Continue" : reviewing ? "Send answers" : last ? "Review answers" : "Next")
      }
      .buttonStyle(DesktopButtonStyle(variant: .primary, small: true))
      .disabled(busy)
      .accessibilityIdentifier("question.submit")
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 4)
    .overlay(alignment: .top) {
      Rectangle().fill(palette.color("border")).frame(height: 1)
    }
  }

  // MARK: Review

  private var review: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(fields, id: \.key) { item in
        HStack(alignment: .top, spacing: 12) {
          VStack(alignment: .leading, spacing: 4) {
            Text(item.description ?? item.title ?? item.key)
              .foregroundStyle(palette.color("text-secondary"))
            let values = reviewValues(item)
            if values.isEmpty {
              Text(item.type == "external" ? "External step" : "Not answered")
                .foregroundStyle(palette.color("text-tertiary"))
            } else {
              ForEach(Array(values.enumerated()), id: \.offset) { _, value in
                Text(value).foregroundStyle(palette.color("text"))
              }
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          Button("Edit") {
            activeKey = item.key
            reviewing = false
            error = nil
          }
          .buttonStyle(DesktopButtonStyle(variant: .ghost, small: true))
          .accessibilityLabel("Edit \(item.title ?? item.key)")
        }
        .font(.subheadline)
        .padding(.vertical, 12)
        .overlay(alignment: .top) {
          Rectangle().fill(palette.color("border")).frame(height: 1)
        }
      }
    }
    .padding(.horizontal, 8)
  }

  private func reviewValues(_ field: FormInfo.Field) -> [String] {
    let options = QuestionAnswers.options(field)
    func label(_ value: JSONValue) -> String {
      switch value {
      case .bool(let on): return on ? "Yes" : "No"
      case .string(let text): return options.first { $0.value == text }?.label ?? text
      case .number(let number):
        return number.rounded() == number && abs(number) < 1e15 ? String(Int64(number)) : String(number)
      default: return value.text
      }
    }
    switch answers.value(field) {
    case nil, .null: return []
    case .string(let text) where text.isEmpty: return []
    case .array(let items): return items.map(label)
    case .some(let value): return [label(value)]
    }
  }

  // MARK: Fields

  @ViewBuilder private func fieldView(_ field: FormInfo.Field) -> some View {
    let options = QuestionAnswers.options(field)
    let multiple = QuestionAnswers.multiple(field)
    let label = field.title ?? field.key
    if !options.isEmpty {
      VStack(alignment: .leading, spacing: 3) {
        Text(multiple ? "Select one or more answers" : "Select one answer")
          .font(.footnote)
          .foregroundStyle(palette.color("text-tertiary"))
          .padding(.horizontal, 8)
          .padding(.bottom, 5)
        ForEach(options, id: \.value) { option in
          choice(
            option.label ?? option.value, detail: option.description, multiple: multiple,
            selected: answers.isSelected(option, in: field)
          ) {
            answers.toggle(option, in: field)
            error = nil
          }
        }
        if field.custom == true {
          choice(
            "Type your own answer", detail: nil, multiple: multiple,
            selected: answers.isCustomOn(field)
          ) {
            answers.toggleCustom(field)
            error = nil
            if answers.isCustomOn(field) { focus = field.key }
          }
          if answers.isCustomOn(field) {
            input(
              multiple ? "One answer per line…" : "Type your answer…",
              text: Binding(get: { answers.customText(field) }, set: { answers.setCustom(field, $0); error = nil }),
              key: field.key, multiline: true)
            .accessibilityLabel("Custom answer for \(label)")
          }
        }
      }
      .accessibilityElement(children: .contain)
    } else if field.type == "boolean" {
      VStack(spacing: 3) {
        ForEach([true, false], id: \.self) { value in
          choice(value ? "Yes" : "No", detail: nil, multiple: false, selected: answers.value(field)?.bool == value) {
            answers.setBool(field, value)
            error = nil
          }
        }
      }
    } else if field.type == "external" {
      Group {
        if let url = field.url.flatMap(URL.init(string:)), ["http", "https"].contains(url.scheme?.lowercased()) {
          Link("\(field.title ?? "Open link") ↗", destination: url)
            .foregroundStyle(palette.color("link"))
        } else {
          Text("Open this request in OpenCode to continue.")
            .foregroundStyle(palette.color("text-secondary"))
        }
      }
      .font(.subheadline)
      .padding(8)
    } else if field.type == "number" || field.type == "integer" {
      input(
        "Enter a number",
        text: Binding(
          get: { answers.value(field).map(Self.numberText) ?? "" },
          set: { answers.setNumber(field, $0); error = nil }),
        key: field.key, multiline: false
      )
      .keyboardType(field.type == "integer" ? .numberPad : .decimalPad)
      .accessibilityLabel(label)
    } else if multiple {
      // A multiselect without options: one answer per line.
      input(
        "One answer per line…",
        text: Binding(get: { answers.customText(field) }, set: { answers.setCustom(field, $0); error = nil }),
        key: field.key, multiline: true
      )
      .accessibilityLabel(label)
    } else {
      input(
        field.placeholder.flatMap { $0.isEmpty ? nil : $0 } ?? "Type your answer…",
        text: Binding(get: { answers.value(field)?.string ?? "" }, set: { answers.setText(field, $0); error = nil }),
        key: field.key, multiline: false
      )
      .keyboardType(field.format == "email" ? .emailAddress : field.format == "uri" ? .URL : .default)
      .textInputAutocapitalization(field.format == "email" || field.format == "uri" ? .never : nil)
      .accessibilityLabel(label)
    }
  }

  private func input(_ prompt: String, text: Binding<String>, key: String, multiline: Bool) -> some View {
    TextField(
      "", text: text,
      prompt: Text(prompt).foregroundStyle(palette.color("text-tertiary")),
      axis: multiline ? .vertical : .horizontal
    )
    .lineLimit(multiline ? 2...5 : 1...1)
    .focused($focus, equals: key)
    .foregroundStyle(palette.color("text"))
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(palette.color("secondary"), in: .rect(cornerRadius: 8))
    .overlay(
      RoundedRectangle(cornerRadius: 8)
        .strokeBorder(palette.color(focus == key ? "border-heavy" : "border")))
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
  }

  private func choice(
    _ title: String, detail: String?, multiple: Bool, selected: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Image(
          systemName: multiple
            ? (selected ? "checkmark.square.fill" : "square")
            : (selected ? "smallcircle.filled.circle.fill" : "circle")
        )
        .font(.system(size: 16))
        .foregroundStyle(palette.color(selected ? "accent-text" : "text-tertiary"))
        .frame(width: 18)
        VStack(alignment: .leading, spacing: 3) {
          Text(title).foregroundStyle(palette.color("text"))
          if let detail, !detail.isEmpty {
            Text(detail)
              .font(.footnote)
              .foregroundStyle(palette.color("text-tertiary"))
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .font(.subheadline)
      .padding(10)
      .frame(minHeight: 44)
      .background(selected ? palette.color("selected") : .clear, in: .rect(cornerRadius: 8))
      .contentShape(.rect)
    }
    .buttonStyle(GhostButtonStyle(radius: 8))
    .sensoryFeedback(.selection, trigger: selected)
    .accessibilityLabel(title)
    .accessibilityHint(detail ?? "")
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  private static func numberText(_ value: JSONValue) -> String {
    if let number = value.number {
      return number.rounded() == number && abs(number) < 1e15 ? String(Int64(number)) : String(number)
    }
    return value.string ?? ""
  }

  // MARK: Actions

  /// Next, Review answers, then Send answers, validating like the desktop's `advance`.
  private func advance() async {
    guard !busy else { return }
    if collapsed {
      collapsed = false
      return
    }
    // The browser's own check of the field on screen comes first, like `reportValidity`.
    if !reviewing, let field, let message = answers.validity(field) {
      error = message
      return
    }
    let checked = reviewing || last ? fields : field.map { [$0] } ?? []
    if let invalid = checked.first(where: { answers.error($0) != nil }) {
      reviewing = false
      activeKey = invalid.key
      error = answers.error(invalid)
      return
    }
    error = nil
    if !reviewing, !last {
      activeKey = fields[index + 1].key
      return
    }
    if !reviewing {
      reviewing = true
      focus = nil
      return
    }
    busy = true
    await model.answer(form, answers.submission)
    busy = false
    keepError()
  }

  private func dismiss() async {
    guard !busy else { return }
    busy = true
    error = nil
    await model.dismiss(form)
    busy = false
    keepError()
  }

  /// The reply failed if the form is still pending; keep its error on the dock.
  private func keepError() {
    if model.forms.contains(where: { $0.id == form.id }), let failure = model.error {
      error = failure
      model.error = nil
    }
  }
}
