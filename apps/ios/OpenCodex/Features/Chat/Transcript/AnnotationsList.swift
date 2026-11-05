import SwiftUI
import UIKit

/// The annotations chip's list, anchored under the chip like the desktop's popover: an
/// `elevated` card with a `border-heavy` hairline and the `shadow` token, at most 400 wide and
/// 320 tall (scrolling past that), above the chip when there's no room below. Tapping outside
/// closes it.
final class AnnotationsPopover: UIViewController, UIGestureRecognizerDelegate {
  private let host: UIHostingController<AnyView>
  /// The chip, in window coordinates.
  private let anchor: CGRect

  init(prompt: SentPrompt, palette: Palette, from chip: UIView) {
    anchor = chip.convert(chip.bounds, to: nil)
    host = UIHostingController(
      rootView: AnyView(
        AnnotationsList(annotations: prompt.annotations, palette: palette)
          .clipShape(.rect(cornerRadius: 12, style: .continuous))
          .ceramic("elevated", shadow: "shadow", border: "border-heavy", radius: 12)
          .environment(\.palette, palette)))
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .overFullScreen
    modalTransitionStyle = .crossDissolve
  }

  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    view.accessibilityViewIsModal = true
    addChild(host)
    host.view.backgroundColor = .clear
    host.sizingOptions = []
    view.addSubview(host.view)
    host.didMove(toParent: self)
    let tap = UITapGestureRecognizer(target: self, action: #selector(close))
    tap.delegate = self
    view.addGestureRecognizer(tap)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let bounds = view.bounds
    let safe = view.safeAreaInsets
    let width = min(400, bounds.width - 32)
    let fitted = host.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
    let height = min(320, fitted.rounded(.up))
    // `top: anchor(bottom) + 6px; right: anchor(right); position-try-fallbacks: flip-block`.
    var y = anchor.maxY + 6
    if y + height > bounds.height - safe.bottom - 8, anchor.minY - 6 - height >= safe.top + 8 {
      y = anchor.minY - 6 - height
    }
    let x = max(16, min(anchor.maxX - width, bounds.width - 16 - width))
    host.view.frame = CGRect(x: x, y: y, width: width, height: height)
  }

  func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    !host.view.frame.contains(touch.location(in: view))
  }

  override func accessibilityPerformEscape() -> Bool {
    close()
    return true
  }

  @objc private func close() { dismiss(animated: true) }
}

/// `.message-annotations-preview`: each comment's number, source, selected text and comment.
struct AnnotationsList: View {
  let annotations: [SentPrompt.Annotation]
  let palette: Palette

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(Array(annotations.enumerated()), id: \.offset) { index, item in
          if index > 0 { Rectangle().fill(palette.color("border")).frame(height: 1) }
          VStack(alignment: .leading, spacing: 4) {
            Text(item.title)
              .font(.footnote.weight(.medium))
              .foregroundStyle(palette.color("text-secondary"))
            if !item.label.isEmpty {
              Text(item.label)
                .font(.caption)
                .foregroundStyle(palette.color("text-tertiary"))
                .lineLimit(1)
                .truncationMode(.middle)
            }
            if let quote = item.quote {
              caption("Selected text:")
              Text(quote)
                .font(item.kind == "comment" ? .system(.footnote, design: .monospaced) : .subheadline)
                .foregroundStyle(palette.color("text-secondary"))
                .padding(.leading, 11)
                .overlay(alignment: .leading) {
                  Rectangle().fill(palette.color("border-heavy")).frame(width: 2)
                }
                .lineLimit(8)
            }
            if let comment = item.comment {
              caption("User comment:")
              Text(comment)
                .font(.subheadline)
                .foregroundStyle(palette.color("text"))
            }
          }
          .fixedSize(horizontal: false, vertical: true)
          .padding(.horizontal, 14)
          .padding(.vertical, 11)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityElement(children: .combine)
        }
      }
    }
    .scrollBounceBehavior(.basedOnSize)
    .accessibilityIdentifier("transcript.annotations.list")
  }

  private func caption(_ text: String) -> some View {
    Text(text)
      .font(.caption.weight(.medium))
      .foregroundStyle(palette.color("text-tertiary"))
      .padding(.top, 4)
  }
}
