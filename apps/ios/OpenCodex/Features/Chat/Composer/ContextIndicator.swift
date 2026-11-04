import SwiftUI

/// How full the model's context window is, from the latest response's token use.
/// Port of the desktop `context-usage.ts`.
nonisolated struct ContextUsage: Equatable, Sendable {
  var tokens: Double?
  var limit: Double?
  var model: ModelRef?

  var used: Double? {
    guard let tokens, let limit, limit > 0 else { return nil }
    return tokens / limit
  }

  static func total(_ tokens: AssistantMessage.Tokens) -> Double {
    (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0)
      + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0)
  }

  /// The newest response with token use. Reads only the newest messages, never the whole
  /// transcript.
  static func latest(_ messages: [SessionMessage]) -> AssistantMessage? {
    for message in messages.suffix(100).reversed() {
      if case .assistant(let reply) = message, let tokens = reply.tokens, total(tokens) > 0 {
        return reply
      }
    }
    return nil
  }
}

/// The ring beside the model chip, with a popover of the numbers. Only this view reads the
/// transcript, so message refreshes don't re-render the rest of the composer.
struct ContextIndicator: View {
  let model: ChatModel
  let catalog: ModelCatalog?
  let current: ModelRef?

  private var loaded: Bool { model.loaded }

  private var usage: ContextUsage {
    let latest = ContextUsage.latest(model.messages)
    let responseModel = latest?.model ?? current
    let limit = responseModel.flatMap { ref in
      catalog?.data.first { $0.ref.key == ref.key }?.limit?.context
    }
    return ContextUsage(
      tokens: latest?.tokens.map(ContextUsage.total), limit: limit, model: responseModel)
  }

  @Environment(\.palette) private var palette
  @State private var open = false


  var body: some View {
    let usage = self.usage
    Button {
      open = true
    } label: {
      ZStack {
        Circle()
          .stroke(palette.color("border-heavy"), lineWidth: 2.5 * 20 / 24)
        if let used = usage.used {
          Circle()
            .trim(from: 0, to: min(used, 1))
            .stroke(
              palette.color(used >= 0.9 ? "error" : used >= 0.75 ? "warning" : "text-secondary"),
              lineWidth: 2.5 * 20 / 24)
            .rotationEffect(.degrees(-90))
        }
      }
      .frame(width: 16, height: 16)
      .frame(width: 32, height: 32)
      .background(open ? palette.color("hover") : .clear, in: .rect(cornerRadius: 9))
      .frame(minWidth: 44, minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      usage.used.map { "\(Self.percent($0)) context used" } ?? "Context usage unavailable")
    .accessibilityIdentifier("composer.context")
    .popover(isPresented: $open, arrowEdge: .bottom) {
      popover(usage)
        .presentationCompactAdaptation(.popover)
        .presentationBackground(palette.color("elevated"))
    }
  }

  private func popover(_ usage: ContextUsage) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text("Context window")
        Spacer(minLength: 12)
        Text(usage.used.map { "\(Self.percent($0)) used" } ?? "—")
      }
      .foregroundStyle(palette.color("text"))
      Capsule()
        .fill(palette.color("secondary-hover"))
        .frame(height: 4)
        .overlay(alignment: .leading) {
          GeometryReader { proxy in
            Capsule()
              .fill(palette.color("text-secondary"))
              .frame(width: proxy.size.width * min(usage.used ?? 0, 1))
          }
        }
        .padding(.vertical, 12)
        .accessibilityHidden(true)
      Text(detail(usage))
        .foregroundStyle(palette.color("text-secondary"))
      if usage.tokens != nil {
        Text("Latest response" + (usage.used == nil ? " · Context limit unavailable" : ""))
          .foregroundStyle(palette.color("text-tertiary"))
          .padding(.top, 4)
      }
    }
    .font(.footnote.monospacedDigit())
    .padding(14)
    .frame(width: 280)
    .fixedSize(horizontal: false, vertical: true)
  }

  private func detail(_ usage: ContextUsage) -> String {
    guard let tokens = usage.tokens else {
      return loaded ? "Usage appears after the first response." : "Loading context usage…"
    }
    let limit = usage.limit.map { " / \(Self.number($0))" } ?? ""
    return "\(Self.number(tokens))\(limit) tokens used"
  }

  static func percent(_ value: Double) -> String {
    value.formatted(.percent.precision(.fractionLength(0...1)))
  }

  static func number(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(0)))
  }
}
