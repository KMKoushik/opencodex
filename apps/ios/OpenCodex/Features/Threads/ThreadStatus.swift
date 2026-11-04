import SwiftUI
import UIKit

/// The desktop's `.session-activity`: a thin ring in `border-heavy` with its top and right
/// edges in `text-secondary`, turning once every 900 ms.
///
/// Every spinner adds the same `CABasicAnimation`, begun at one shared epoch, so they all turn
/// in phase as one animation run by the render server: no timers, tasks or SwiftUI updates.
struct RingSpinner: UIViewRepresentable {
  var size: CGFloat = 14
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func makeUIView(context: Context) -> RingSpinnerView { RingSpinnerView() }

  func updateUIView(_ view: RingSpinnerView, context: Context) {
    view.configure(
      size: size, track: palette.ui("border-heavy"), arc: palette.ui("text-secondary"),
      animated: !reduceMotion)
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: RingSpinnerView, context: Context)
    -> CGSize?
  {
    CGSize(width: size, height: size)
  }
}

final class RingSpinnerView: UIView {
  private let track = CAShapeLayer()
  private let arc = CAShapeLayer()
  private var animated = true
  private var size: CGFloat = 0

  /// One animation shared by every spinner; the epoch keeps them in phase.
  private static let spin: CABasicAnimation = {
    let animation = CABasicAnimation(keyPath: "transform.rotation.z")
    animation.fromValue = 0
    animation.toValue = 2 * Double.pi
    animation.duration = 0.9
    animation.repeatCount = .infinity
    animation.isRemovedOnCompletion = false
    animation.beginTime = epoch
    return animation
  }()
  private static let epoch = CACurrentMediaTime()

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    for layer in [track, arc] {
      layer.fillColor = nil
      self.layer.addSublayer(layer)
    }
    arc.lineCap = .butt
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  func configure(size: CGFloat, track trackColor: UIColor, arc arcColor: UIColor, animated: Bool) {
    track.strokeColor = trackColor.resolvedColor(with: traitCollection).cgColor
    arc.strokeColor = arcColor.resolvedColor(with: traitCollection).cgColor
    if size != self.size {
      self.size = size
      setNeedsLayout()
    }
    if animated != self.animated {
      self.animated = animated
      updateAnimation()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let line = max(1.5, size * 0.125)
    let bounds = CGRect(x: 0, y: 0, width: size, height: size)
    let path = UIBezierPath(ovalIn: bounds.insetBy(dx: line / 2, dy: line / 2))
    for layer in [track, arc] {
      layer.frame = bounds
      layer.lineWidth = line
    }
    track.path = path.cgPath
    // CSS colors the top and right borders: from the top-left corner clockwise to bottom-right.
    arc.path =
      UIBezierPath(
        arcCenter: CGPoint(x: size / 2, y: size / 2), radius: (size - line) / 2,
        startAngle: -.pi * 3 / 4, endAngle: .pi / 4, clockwise: true
      ).cgPath
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateAnimation()
  }

  private func updateAnimation() {
    if animated, window != nil {
      if arc.animation(forKey: "spin") == nil { arc.add(Self.spin, forKey: "spin") }
    } else {
      arc.removeAnimation(forKey: "spin")
    }
  }
}

/// A row's trailing indicators, as `SessionRow` draws them: a pending approval or question
/// outranks everything; otherwise the running spinner and the unread dot.
struct ThreadIndicators: View {
  let item: ThreadItem
  @Environment(\.palette) private var palette

  var body: some View {
    if let attention = item.attention {
      AttentionBadge(kind: attention)
    } else if item.responding {
      RingSpinner()
        .overlay(alignment: .bottomTrailing) {
          // `.session-unread[data-responding]`: a smaller dot tucked beside the spinner.
          if item.unread {
            Circle().fill(palette.color("accent")).frame(width: 5, height: 5).offset(x: 6, y: 2)
          }
        }
    } else if item.unread {
      UnreadDot()
    }
  }
}

/// `.session-unread`: a small dot in the accent (ink in the OpenCodex themes).
struct UnreadDot: View {
  @Environment(\.palette) private var palette
  var body: some View {
    Circle().fill(palette.color("accent")).frame(width: 8, height: 8)
  }
}

/// `.session-attention`: "!" on `warning` for an approval, "?" on `accent` for a question.
struct AttentionBadge: View {
  let kind: ThreadItem.Attention
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .body) private var size: CGFloat = 18

  var body: some View {
    let permission = kind == .permission
    Text(permission ? "!" : "?")
      .font(.system(size: size * 0.7, weight: .bold))
      .foregroundStyle(palette.color(permission ? "surface" : "on-accent"))
      .frame(width: size, height: size)
      .background(palette.color(permission ? "warning" : "accent"), in: .circle)
  }
}
