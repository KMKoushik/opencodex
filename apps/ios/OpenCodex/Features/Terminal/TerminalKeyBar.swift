import SwiftTerm
import UIKit

/// The keys an iPhone keyboard lacks, above it: Esc, Tab, a sticky Ctrl, `~ | / -`, arrows that
/// repeat while held, and a key that hides the keyboard. Hardware keyboards go straight to
/// SwiftTerm and don't need it.
final class TerminalKeyBar: UIInputView, UIInputViewAudioFeedback {
  private weak var terminal: TerminalView?
  private var buttons: [UIButton] = []
  private var control: UIButton!
  private let rule = UIView()
  private var palette: Palette
  private var repeatTimer: Timer?
  private var repeatAction: (() -> Void)?
  private var observer: NSObjectProtocol?

  var enableInputClicksWhenVisible: Bool { true }

  init(terminal: TerminalView, palette: Palette) {
    self.terminal = terminal
    self.palette = palette
    super.init(frame: CGRect(x: 0, y: 0, width: 390, height: 46), inputViewStyle: .default)
    allowsSelfSizing = true
    autoresizingMask = .flexibleWidth

    let stack = UIStackView()
    stack.axis = .horizontal
    stack.distribution = .fillEqually
    stack.spacing = 4
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    rule.translatesAutoresizingMaskIntoConstraints = false
    addSubview(rule)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 4),
      stack.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -4),
      stack.topAnchor.constraint(equalTo: topAnchor, constant: 5),
      stack.heightAnchor.constraint(equalToConstant: 36),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -5),
      rule.leadingAnchor.constraint(equalTo: leadingAnchor),
      rule.trailingAnchor.constraint(equalTo: trailingAnchor),
      rule.topAnchor.constraint(equalTo: topAnchor),
      rule.heightAnchor.constraint(equalToConstant: 0.5),
    ])

    func add(_ title: String?, symbol: String? = nil, label: String, id: String, repeats: Bool = false,
             action: @escaping (TerminalView) -> Void) -> UIButton {
      var configuration = UIButton.Configuration.plain()
      configuration.contentInsets = .zero
      if let title {
        configuration.attributedTitle = AttributedString(
          title, attributes: AttributeContainer([
            .font: UIFont.monospacedSystemFont(ofSize: 16, weight: .medium)
          ]))
      }
      if let symbol {
        configuration.image = UIImage(
          systemName: symbol,
          withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .medium))
      }
      let button = UIButton(configuration: configuration)
      button.accessibilityLabel = label
      button.accessibilityIdentifier = id
      button.layer.cornerRadius = 7
      button.layer.cornerCurve = .continuous
      button.layer.borderWidth = 0.5
      let send = { [weak self] in
        guard let terminal = self?.terminal else { return }
        UIDevice.current.playInputClick()
        action(terminal)
      }
      if repeats {
        button.addAction(UIAction { [weak self] _ in
          send()
          self?.startRepeating(send)
        }, for: .touchDown)
        for event: UIControl.Event in [.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit] {
          button.addAction(UIAction { [weak self] _ in self?.stopRepeating() }, for: event)
        }
      } else {
        button.addAction(UIAction { _ in send() }, for: .touchUpInside)
      }
      stack.addArrangedSubview(button)
      buttons.append(button)
      return button
    }

    _ = add(nil, symbol: "escape", label: "Escape", id: "terminal-key-esc") { $0.send([0x1b]) }
    _ = add(nil, symbol: "arrow.right.to.line", label: "Tab", id: "terminal-key-tab") { $0.send([0x09]) }
    control = add(nil, symbol: "control", label: "Control", id: "terminal-key-ctrl") { [weak self] terminal in
      terminal.controlModifier.toggle()
      self?.paint()
    }
    for key in ["~", "|", "/", "-"] {
      _ = add(key, label: key, id: "terminal-key-\(key)") { $0.insertText(key) }
    }
    let arrows: [(String, String, [UInt8], [UInt8])] = [
      ("arrow.left", "Left", EscapeSequences.moveLeftNormal, EscapeSequences.moveLeftApp),
      ("arrow.down", "Down", EscapeSequences.moveDownNormal, EscapeSequences.moveDownApp),
      ("arrow.up", "Up", EscapeSequences.moveUpNormal, EscapeSequences.moveUpApp),
      ("arrow.right", "Right", EscapeSequences.moveRightNormal, EscapeSequences.moveRightApp),
    ]
    for (symbol, name, normal, app) in arrows {
      _ = add(nil, symbol: symbol, label: name, id: "terminal-key-\(name.lowercased())", repeats: true) {
        $0.send($0.getTerminal().applicationCursor ? app : normal)
      }
    }
    _ = add(nil, symbol: "keyboard.chevron.compact.down", label: "Hide keyboard", id: "terminal-key-hide") {
      _ = $0.resignFirstResponder()
    }

    // SwiftTerm clears Ctrl after the next key.
    observer = NotificationCenter.default.addObserver(
      forName: .terminalViewControlModifierReset, object: terminal, queue: .main
    ) { [weak self] _ in MainActor.assumeIsolated { self?.paint() } }
    paint()
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  isolated deinit {
    repeatTimer?.invalidate()
    if let observer { NotificationCenter.default.removeObserver(observer) }
  }

  override var intrinsicContentSize: CGSize { CGSize(width: UIView.noIntrinsicMetric, height: 46) }

  func apply(_ palette: Palette) {
    self.palette = palette
    paint()
  }

  private func paint() {
    backgroundColor = palette.ui("surface-under")
    rule.backgroundColor = palette.ui("border")
    let ctrl = terminal?.controlModifier == true
    for button in buttons {
      let chosen = button === control && ctrl
      button.backgroundColor = palette.ui(chosen ? "primary" : "elevated")
      button.layer.borderColor = palette.ui("border").cgColor
      button.tintColor = palette.ui(chosen ? "on-primary" : "text")
      button.configuration?.baseForegroundColor = palette.ui(chosen ? "on-primary" : "text")
      if button === control {
        button.accessibilityTraits = chosen ? [.button, .selected] : .button
      }
    }
  }

  private func startRepeating(_ send: @escaping () -> Void) {
    stopRepeating()
    repeatAction = send
    repeatTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: false) { [weak self] _ in
      MainActor.assumeIsolated {
        self?.repeatTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) {
          [weak self] _ in
          MainActor.assumeIsolated { self?.repeatAction?() }
        }
      }
    }
  }

  private func stopRepeating() {
    repeatTimer?.invalidate()
    repeatTimer = nil
    repeatAction = nil
  }
}
