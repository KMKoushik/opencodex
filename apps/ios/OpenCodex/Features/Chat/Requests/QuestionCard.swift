import SwiftUI

/// A question the agent asked: each field's choices, an optional custom answer, Submit and Dismiss.
struct QuestionCard: View {
  let model: ChatModel
  let form: FormInfo

  @State private var answers: QuestionAnswers
  @State private var busy: Busy?
  @State private var error: String?
  @State private var invalidKey: String?
  @FocusState private var focus: String?

  private enum Busy { case submit, dismiss }

  init(model: ChatModel, form: FormInfo) {
    self.model = model
    self.form = form
    _answers = State(initialValue: QuestionAnswers(form))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Label(form.title.flatMap { $0.isEmpty || $0 == "Questions" ? nil : $0 } ?? "Question", systemImage: "questionmark.bubble.fill")
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .labelStyle(TightLabelStyle())

      ForEach(form.fields, id: \.key) { field in
        fieldView(field)
      }

      if let error {
        Label(error, systemImage: "exclamationmark.triangle.fill")
          .font(.footnote)
          .foregroundStyle(.red)
      }

      HStack(spacing: 8) {
        Button {
          Task { await dismiss() }
        } label: {
          busyLabel("Dismiss", .dismiss)
        }
        .buttonStyle(.glass)
        .accessibilityIdentifier("question.dismiss")
        Button {
          Task { await submit() }
        } label: {
          busyLabel("Submit", .submit)
        }
        .buttonStyle(.glassProminent)
        .accessibilityIdentifier("question.submit")
      }
      .controlSize(.large)
      .disabled(busy != nil)
    }
    .padding(14)
    .glassEffect(.regular, in: .rect(cornerRadius: 22))
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("request.question")
  }

  private func busyLabel(_ title: String, _ kind: Busy) -> some View {
    ZStack {
      Text(title).opacity(busy == kind ? 0 : 1)
      if busy == kind { ProgressView().controlSize(.small) }
    }
    .font(.subheadline.weight(.semibold))
    .frame(maxWidth: .infinity, minHeight: 22)
  }

  // MARK: Fields

  @ViewBuilder private func fieldView(_ field: FormInfo.Field) -> some View {
    let heading = field.description ?? field.title ?? field.key
    VStack(alignment: .leading, spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        if field.description != nil, let title = field.title {
          Text(title)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        Text(heading)
          .font(.headline)
          .fixedSize(horizontal: false, vertical: true)
      }
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isHeader)

      let options = QuestionAnswers.options(field)
      let multiple = QuestionAnswers.multiple(field)
      if !options.isEmpty {
        VStack(spacing: 0) {
          ForEach(Array(options.enumerated()), id: \.element.value) { index, option in
            if index > 0 { Divider().padding(.leading, 44) }
            choice(
              option.label ?? option.value, detail: option.description, multiple: multiple,
              selected: answers.isSelected(option, in: field)
            ) {
              answers.toggle(option, in: field)
              changed(field)
            }
          }
          if field.custom == true {
            Divider().padding(.leading, 44)
            choice(
              "Type your own answer", detail: nil, multiple: multiple,
              selected: answers.isCustomOn(field)
            ) {
              answers.toggleCustom(field)
              changed(field)
              if answers.isCustomOn(field) { focus = field.key }
            }
            if answers.isCustomOn(field) {
              TextField(
                multiple ? "One answer per line…" : "Type your answer…",
                text: Binding(
                  get: { answers.customText(field) },
                  set: {
                    answers.setCustom(field, $0)
                    changed(field)
                  }),
                axis: .vertical
              )
              .lineLimit(1...4)
              .focused($focus, equals: field.key)
              .padding(10)
              .background(.fill.tertiary, in: .rect(cornerRadius: 10))
              .padding(.horizontal, 10)
              .padding(.bottom, 10)
              .accessibilityLabel("Custom answer")
            }
          }
        }
        .background(.fill.quaternary, in: .rect(cornerRadius: 14))
        .accessibilityElement(children: .contain)
      } else if field.type == "boolean" {
        Picker(heading, selection: Binding(
          get: { answers.value(field)?.bool },
          set: { if let value = $0 { answers.setBool(field, value); changed(field) } }
        )) {
          Text("Yes").tag(Bool?.some(true))
          Text("No").tag(Bool?.some(false))
        }
        .pickerStyle(.segmented)
        .labelsHidden()
      } else if field.type == "external" {
        Text("Open this request in OpenCode to continue.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      } else if field.type == "number" || field.type == "integer" {
        TextField("Enter a number", text: Binding(
          get: { answers.value(field).map(Self.numberText) ?? "" },
          set: { answers.setNumber(field, $0); changed(field) }
        ))
        .keyboardType(field.type == "integer" ? .numberPad : .decimalPad)
        .padding(10)
        .background(.fill.tertiary, in: .rect(cornerRadius: 10))
      } else {
        TextField("Type your answer…", text: Binding(
          get: { answers.value(field)?.string ?? "" },
          set: { answers.setText(field, $0); changed(field) }
        ), axis: multiple ? .vertical : .horizontal)
        .padding(10)
        .background(.fill.tertiary, in: .rect(cornerRadius: 10))
      }

      if invalidKey == field.key, let message = answers.error(field) {
        Text(message)
          .font(.footnote)
          .foregroundStyle(.red)
      }
    }
    .disabled(busy != nil)
  }

  private func choice(
    _ title: String, detail: String?, multiple: Bool, selected: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Image(
          systemName: multiple
            ? (selected ? "checkmark.square.fill" : "square")
            : (selected ? "checkmark.circle.fill" : "circle")
        )
        .font(.title3)
        .foregroundStyle(selected ? AnyShapeStyle(.tint) : AnyShapeStyle(.tertiary))
        .frame(width: 22)
        .contentTransition(.symbolEffect(.replace))
        VStack(alignment: .leading, spacing: 2) {
          Text(title).foregroundStyle(.primary)
          if let detail, !detail.isEmpty {
            Text(detail)
              .font(.subheadline)
              .foregroundStyle(.secondary)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 9)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
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

  private func changed(_ field: FormInfo.Field) {
    if invalidKey == field.key, answers.error(field) == nil { invalidKey = nil }
    error = nil
  }

  // MARK: Actions

  private func submit() async {
    guard busy == nil else { return }
    if let invalid = answers.invalid {
      invalidKey = invalid.key
      return
    }
    busy = .submit
    error = nil
    await model.answer(form, answers.submission)
    busy = nil
    keepError()
  }

  private func dismiss() async {
    guard busy == nil else { return }
    busy = .dismiss
    error = nil
    await model.dismiss(form)
    busy = nil
    keepError()
  }

  /// The reply failed if the form is still pending; keep its error on the card.
  private func keepError() {
    if model.forms.contains(where: { $0.id == form.id }), let failure = model.error {
      error = failure
      model.error = nil
    }
  }
}

private struct TightLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 5) {
      configuration.icon
      configuration.title
    }
  }
}
