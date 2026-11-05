import SwiftUI

/// Pairs by hand: the computer's address and the code under its QR code, or a pasted link.
struct ManualPairingView: View {
  @Environment(ConnectionStore.self) private var connection
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette
  @State private var host = ""
  @State private var code = ""
  @State private var pairing = false
  @State private var failure: String?
  @FocusState private var focus: Field?

  private typealias Input = ConnectionStore.PairingInput
  private enum Field { case host, code }

  private var input: Input? { Input(host: host, typedCode: code) }
  private var hostValid: Bool { Input(host: host, code: "-") != nil }

  var body: some View {
    NavigationStack {
      SettingsForm {
        Section {
          TextField("Address", text: $host, prompt: Text(verbatim: "ox.example.com"))
            .keyboardType(.URL)
            .textContentType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.next)
            .focused($focus, equals: .host)
            .onSubmit { focus = .code }
            .accessibilityIdentifier("pairing.host")
        } header: {
          SettingsHeader("Computer Address")
        } footer: {
          Group {
            if !host.isEmpty, !hostValid {
              problem("Use an https address, like ox.example.com.")
            } else {
              hint("The hostname shown in Remote access. You can also paste the whole pairing link.")
            }
          }
          .accessibilityIdentifier("pairing.host.hint")
        }
        .settingsRows()

        Section {
          TextField("Code", text: $code, prompt: Text(verbatim: "XXXXX-XXXXX"))
            .font(.body.monospaced())
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .textContentType(.oneTimeCode)
            .submitLabel(.go)
            .focused($focus, equals: .code)
            .onSubmit(pair)
            .accessibilityIdentifier("pairing.code")
        } header: {
          SettingsHeader("Pairing Code")
        } footer: {
          codeFooter.accessibilityIdentifier("pairing.code.hint")
        }
        .settingsRows()

        if let failure {
          Section {
            Label {
              Text(failure).accessibilityIdentifier("pairing.error")
            } icon: {
              Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(palette.color("error"))
            }
          }
          .settingsRows()
        }
      }
      .disabled(pairing)
      .navigationTitle("Enter Code")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
            .disabled(pairing)
        }
      }
      .safeAreaInset(edge: .bottom) {
        Button(action: pair) {
          HStack(spacing: 8) {
            if pairing { ProgressView() }
            Text(pairing ? "Pairing…" : "Pair")
          }
          .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.large)
        .disabled(input == nil || pairing)
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
        .accessibilityIdentifier("pairing.submit")
      }
      .onChange(of: host) { _, value in
        failure = nil
        // A pasted pairing link fills in both fields.
        if let link = Input(link: value) { fill(link) }
      }
      .onChange(of: code) { _, value in
        failure = nil
        if let link = Input(link: value) { fill(link) }
      }
      // Shown as `XXXXX-XXXXX` once typing stops. Rewriting the text on every keystroke
      // dropped the keystroke typed during the rewrite.
      .onChange(of: focus) { old, _ in
        if old == .code { code = Input.display(code: code) }
      }
    }
    .interactiveDismissDisabled(pairing)
    .onAppear { focus = .host }
  }

  @ViewBuilder private var codeFooter: some View {
    switch Input.problem(code: code) {
    case .lookalike:
      problem("Codes never use 0, 1, I or O.")
    case .characters:
      problem("Codes use only letters and digits.")
    case .length(let count) where count > Input.codeLength:
      problem("Codes are \(Input.codeLength) characters long.")
    case .length(let count) where count > 0:
      hint("\(count) of \(Input.codeLength) characters")
    case .length, nil:
      hint("The \(Input.codeLength)-character code under the QR code. It works once, for 5 minutes.")
    }
  }

  private func hint(_ text: LocalizedStringKey) -> some View {
    Text(text).foregroundStyle(palette.color("text-tertiary"))
  }

  private func problem(_ text: LocalizedStringKey) -> some View {
    Text(text).foregroundStyle(palette.color("error"))
  }

  private func fill(_ link: Input) {
    host = link.host.host() ?? host
    code = Input.display(code: link.code)
    focus = nil
  }

  private func pair() {
    guard let input, !pairing else { return }
    pairing = true
    failure = nil
    focus = nil
    Task {
      do {
        // On success the root view switches to Home and this sheet goes with it.
        try await connection.pair(input)
      } catch {
        failure = PairingFailure.message(error)
        pairing = false
      }
    }
  }
}
