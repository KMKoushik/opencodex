import SwiftUI

/// The desktop toolbar's breadcrumb ("📁 project / title"), stacked for a phone: the project
/// muted on top, the thread title below. While the event stream is down it says so, like the
/// desktop's "Live updates paused".
struct ChatTitle: View {
  let project: String?
  let title: String
  let live: Bool
  /// Shows the native spinner beside the title while the reply runs.
  var running = false
  @Environment(\.palette) private var palette

  var body: some View {
    // OpenCode's order: the thread title, with the project (or paused live updates) under it.
    VStack(spacing: 0) {
      HStack(spacing: 6) {
        if running { ProgressView().controlSize(.mini) }
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(palette.color("text"))
          .lineLimit(1)
      }
      if project != nil || !live {
        Text(live ? (project ?? "") : [project, "Live updates paused"].compactMap { $0 }.joined(separator: " · "))
          .font(.caption)
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(1)
      }
    }
    // Hugs the title like OpenCode's pill, truncating past 240 pt.
    .modifier(HugWidth(limit: 240))
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("chat.title")
  }
}

/// A thin arc turning around the "…" button while a reply runs, like OpenCode's iPhone app.
struct RunningRing: View {
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    TimelineView(.animation(paused: reduceMotion)) { context in
      let turn = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.1) / 1.1
      Circle()
        .trim(from: 0, to: 0.28)
        .stroke(palette.color("text"), style: StrokeStyle(lineWidth: 2, lineCap: .round))
        .rotationEffect(.degrees(turn * 360))
    }
    .accessibilityHidden(true)
  }
}

/// Sizes its content to fit, up to `limit`: a capsule that hugs short titles and truncates
/// long ones (a plain `maxWidth` frame always takes the whole limit in a toolbar).
private struct HugWidth: ViewModifier {
  let limit: CGFloat
  func body(content: Content) -> some View { HugLayout(limit: limit) { content } }
}

private struct HugLayout: Layout {
  let limit: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let child = subviews.first else { return .zero }
    let width = min(proposal.width ?? limit, limit)
    return child.sizeThatFits(ProposedViewSize(width: width, height: proposal.height))
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    subviews.first?.place(
      at: CGPoint(x: bounds.midX, y: bounds.midY), anchor: .center,
      proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
  }
}
