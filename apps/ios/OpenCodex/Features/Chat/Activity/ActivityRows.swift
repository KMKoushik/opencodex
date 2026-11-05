import SwiftUI
import UIKit

/// SF Symbols standing in for the desktop's Hugeicons in the activity views.
enum ActivitySymbol {
  /// Hugeicons `BotIcon` is the `Robot` asset (`RobotIcon`); SF Symbols has no robot.
  /// Hugeicons `CommandLineIcon`.
  static let shell = "apple.terminal"
  /// Hugeicons `ArrowRight01Icon`.
  static let open = "chevron.right"
}

/// The desktop's `.session-activity` spinner: a 10pt ring with a turning half arc. Core
/// Animation turns it on the render server, so many rows cost the main thread nothing.
struct SessionActivity: UIViewRepresentable {
  @Environment(\.palette) private var palette

  func makeUIView(context: Context) -> SpinnerView { SpinnerView() }

  func updateUIView(_ view: SpinnerView, context: Context) {
    view.track.strokeColor = palette.ui("border-heavy").cgColor
    view.arc.strokeColor = palette.ui("text-secondary").cgColor
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: SpinnerView, context: Context) -> CGSize? {
    CGSize(width: 10, height: 10)
  }

  final class SpinnerView: UIView {
    let track = CAShapeLayer()
    let arc = CAShapeLayer()

    override init(frame: CGRect) {
      super.init(frame: frame)
      isUserInteractionEnabled = false
      for shape in [track, arc] {
        shape.fillColor = nil
        shape.lineWidth = 1.5
        layer.addSublayer(shape)
      }
      // The top and right borders of a CSS circle: from 10:30 round to 4:30.
      arc.strokeStart = 0
      arc.strokeEnd = 0.5
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
      super.layoutSubviews()
      let rect = bounds.insetBy(dx: 0.75, dy: 0.75)
      track.path = UIBezierPath(ovalIn: rect).cgPath
      arc.frame = bounds
      arc.path = UIBezierPath(
        arcCenter: CGPoint(x: bounds.midX, y: bounds.midY), radius: rect.width / 2,
        startAngle: -.pi * 3 / 4, endAngle: .pi * 5 / 4, clockwise: true
      ).cgPath
      startSpinning()
    }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      startSpinning()
    }

    private func startSpinning() {
      guard window != nil, arc.animation(forKey: "spin") == nil else { return }
      guard !UIAccessibility.isReduceMotionEnabled else { return }
      let spin = CABasicAnimation(keyPath: "transform.rotation.z")
      spin.fromValue = 0
      spin.toValue = 2 * Double.pi
      spin.duration = 0.9
      spin.repeatCount = .infinity
      spin.isRemovedOnCompletion = false
      arc.add(spin, forKey: "spin")
    }
  }
}

/// Foreground work holds up the reply; background work reports back when it finishes.
/// The desktop's `.run-mode` badge.
struct RunMode: View {
  let foreground: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    Text(foreground ? "Foreground" : "Background")
      .font(.caption2.weight(.medium))
      .foregroundStyle(palette.color(foreground ? "accent-text" : "text-tertiary"))
      .padding(.horizontal, 6)
      .padding(.vertical, 1)
      .background(
        palette.color(foreground ? "accent-soft" : "hover"), in: .rect(cornerRadius: 6))
      .fixedSize()
      .accessibilityLabel(
        foreground
          ? "Foreground. The reply is waiting for this to finish"
          : "Background. Runs in the background; the agent is told when it finishes")
  }
}

/// The small "!" or "?" circle for a pending approval, question or error.
struct AttentionDot: View {
  enum Kind { case approval, question, error }
  let kind: Kind
  @Environment(\.palette) private var palette

  var body: some View {
    Text(kind == .question ? "?" : "!")
      .font(.system(size: 9, weight: .bold))
      .foregroundStyle(palette.color(kind == .question ? "on-accent" : "surface"))
      .frame(width: 12, height: 12)
      .background(
        palette.color(kind == .question ? "accent" : kind == .error ? "error" : "warning"),
        in: .circle)
      .accessibilityHidden(true)
  }
}

/// One running shell command in the tray.
struct ShellRow: View {
  let shell: ShellInfo
  let foreground: Bool
  let now: Millis
  let open: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Button(action: open) {
      HStack(spacing: 8) {
        SessionActivity()
          .frame(width: 10, height: 10)
        Text(shell.command)
          .font(.footnote.monospaced())
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: .infinity, alignment: .leading)
        RunMode(foreground: foreground)
        Text(formatDuration(now - shell.time.started))
          .font(.caption.monospacedDigit())
          .foregroundStyle(palette.color("text-tertiary"))
          .fixedSize()
        Image(systemName: ActivitySymbol.open)
          .font(.caption2.weight(.medium))
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .padding(.horizontal, 8)
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(TrayRowStyle())
    .accessibilityLabel("View output: \(shell.command)")
    .accessibilityValue(
      "\(foreground ? "Foreground" : "Background"), \(formatDuration(now - shell.time.started))")
    .accessibilityIdentifier("activity.shell.row")
  }
}

/// One running subagent in the tray.
struct SubagentRow: View {
  let item: ActivityModel.RunningSubagent
  let attention: ActivityModel.Attention?
  let foreground: Bool
  let showAgent: Bool
  let now: Millis
  let open: () -> Void
  @Environment(\.palette) private var palette

  private var title: String {
    if let title = item.title, !title.isEmpty { return title }
    return "Untitled subagent"
  }

  private var meta: String {
    switch attention {
    case .permission: "Needs approval"
    case .question: "Has a question"
    case .error: "Could not check requests"
    case nil: item.started.map { formatDuration(now - $0) } ?? "Working"
    }
  }

  private var metaColor: String {
    switch attention {
    case .permission: "warning"
    case .question: "accent-text"
    case .error: "error"
    case nil: "text-tertiary"
    }
  }

  var body: some View {
    Button(action: open) {
      HStack(spacing: 8) {
        Group {
          switch attention {
          case .permission: AttentionDot(kind: .approval)
          case .question: AttentionDot(kind: .question)
          default: SessionActivity().frame(width: 10, height: 10)
          }
        }
        .frame(width: 12, height: 12)
        .padding(.horizontal, 1)
        if showAgent {
          Text(agentName(item.agent))
            .font(.footnote.weight(.medium))
            .foregroundStyle(palette.color("text"))
            .lineLimit(1)
            .fixedSize()
        }
        Text(title)
          .font(.footnote)
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
        RunMode(foreground: foreground)
        Text(meta)
          .font(.caption.monospacedDigit())
          .foregroundStyle(palette.color(metaColor))
          .lineLimit(1)
          .fixedSize()
        Image(systemName: ActivitySymbol.open)
          .font(.caption2.weight(.medium))
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .padding(.horizontal, 8)
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(TrayRowStyle())
    .accessibilityLabel("Open \(title)")
    .accessibilityValue("\(agentName(item.agent)), \(foreground ? "Foreground" : "Background"), \(meta)")
    .accessibilityIdentifier("activity.subagent.row")
  }
}

/// Rows highlight with `hover` while pressed, like the desktop's hover.
struct TrayRowStyle: ButtonStyle {
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(
        configuration.isPressed ? palette.color("hover") : .clear, in: .rect(cornerRadius: 8))
  }
}
