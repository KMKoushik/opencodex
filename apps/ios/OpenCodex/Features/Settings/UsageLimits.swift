import Observation
import SwiftUI

/// `GET /api/usage/limits`: plan windows for the subscriptions agents run on.
nonisolated struct UsageLimits: Codable, Sendable {
  struct Window: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var label: String
    /// 0–100.
    var usedPercent: Double
    /// Epoch milliseconds.
    var resetsAt: Millis?
    /// Window length in milliseconds, used to compare usage against elapsed time.
    var durationMs: Millis?
    var limited: Bool
  }
  struct Provider: Codable, Hashable, Identifiable, Sendable {
    /// `codex`, `claude` or `opencode-go`.
    var id: String
    var name: String
    var windows: [Window]
    /// Why the windows could not be read; the provider is configured but unavailable.
    var error: String?
  }
  var providers: [Provider]
}

nonisolated extension GatewayClient {
  func usageLimits() async throws -> UsageLimits { try await get("/usage/limits") }
}

/// The desktop's `usagePace` and `countdown`.
nonisolated enum UsageMath {
  struct Pace: Equatable {
    var fast: Bool
    var label: String
  }

  /// Compares usage with the share of the window already elapsed.
  static func pace(_ window: UsageLimits.Window, now: Millis) -> Pace? {
    guard let resetsAt = window.resetsAt, let duration = window.durationMs, duration > 0 else {
      return nil
    }
    let elapsed = 1 - (resetsAt - now) / duration
    guard elapsed > 0, elapsed < 1 else { return nil }
    let fast = window.usedPercent / 100 > elapsed
    let used = Int(window.usedPercent.rounded())
    let share = Int((elapsed * 100).rounded())
    return Pace(
      fast: fast,
      label: fast
        ? "Using faster than the limit resets: \(used)% used with \(share)% of the window elapsed"
        : "On pace: \(used)% used with \(share)% of the window elapsed")
  }

  static func countdown(_ ms: Millis) -> String {
    let minutes = max(0, Int((ms / 60_000).rounded(.up)))
    let days = minutes / 1440
    let hours = (minutes % 1440) / 60
    if days > 0 { return "\(days)d \(hours)h" }
    if hours > 0 { return "\(hours)h \(minutes % 60)m" }
    return minutes > 0 ? "\(minutes)m" : "now"
  }
}

@Observable
final class UsageModel {
  let client: GatewayClient
  private(set) var limits: UsageLimits?
  private(set) var error: String?
  private(set) var fetching = false

  init(client: GatewayClient) {
    self.client = client
  }

  func load() async {
    guard !fetching else { return }
    fetching = true
    defer { fetching = false }
    do {
      limits = try await client.usageLimits()
      error = nil
    } catch {
      if error is CancellationError || (error as? URLError)?.code == .cancelled { return }
      self.error = error.localizedDescription
    }
  }
}

/// Settings → Usage: each plan's windows with what's left, its pace, and when it resets.
struct UsageSettings: View {
  @State private var model: UsageModel
  @Environment(\.palette) private var palette

  init(client: GatewayClient) {
    _model = State(initialValue: UsageModel(client: client))
  }

  var body: some View {
    SettingsPage {
      if let error = model.error {
        Text(error)
          .font(.subheadline)
          .foregroundStyle(palette.color("error"))
      }
      if let providers = model.limits?.providers {
        if providers.isEmpty {
          ContentUnavailableView {
            Label("No Plan Limits", systemImage: "gauge.with.dots.needle.0percent")
              .foregroundStyle(palette.color("text"))
          } description: {
            Text(
              "Sign in with ChatGPT or add an OpenCode Go key in OpenCode, or sign in to Claude Code, to see your remaining usage here."
            )
            .foregroundStyle(palette.color("text-secondary"))
          }
          .accessibilityIdentifier("usage-empty")
        }
        TimelineView(.everyMinute) { context in
          let now = context.date.timeIntervalSince1970 * 1000
          VStack(alignment: .leading, spacing: 32) {
            ForEach(providers) { provider in
              ProviderLimits(provider: provider, now: now)
            }
          }
        }
      }
    }
    .overlay {
      // The first load: a centered native spinner, only if it takes a moment.
      if model.limits == nil, model.error == nil {
        Delayed {
          ProgressView("Checking limits…")
            .foregroundStyle(palette.color("text-secondary"))
        }
        .accessibilityIdentifier("usage-loading")
      }
    }
    .navigationTitle("Usage")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("Refresh limits", systemImage: "arrow.clockwise") {
          Task { await model.load() }
        }
        .disabled(model.fetching)
        .symbolEffect(.rotate, isActive: model.fetching)
      }
    }
    .task {
      // Like the desktop: fresh on open, then every five minutes while it shows.
      while !Task.isCancelled {
        await model.load()
        try? await Task.sleep(for: .seconds(300))
      }
    }
  }
}

private struct ProviderLimits: View {
  let provider: UsageLimits.Provider
  let now: Millis
  @Environment(\.palette) private var palette

  /// `--usage-tint`: Claude in orange, OpenCode Go in blue, the rest in the tertiary ink.
  private var tint: UIColor {
    switch provider.id {
    case "claude": palette.ui("project-orange")
    case "opencode-go": palette.ui("project-blue")
    default: palette.ui("text-tertiary")
    }
  }

  var body: some View {
    let fill = Color(uiColor: tint.mixed(0.4, with: palette.ui("elevated")))
    VStack(alignment: .leading, spacing: 12) {
      Text(provider.name)
        .font(.callout.weight(.medium))
        .foregroundStyle(palette.color("text"))
        .accessibilityAddTraits(.isHeader)
      if let error = provider.error {
        card { Text(error).font(.footnote).foregroundStyle(palette.color("error")) }
      } else if provider.windows.isEmpty {
        card {
          Text("This plan reports no usage limits.")
            .font(.footnote)
            .foregroundStyle(palette.color("text"))
        }
      } else {
        ForEach(provider.windows) { window in
          card { LimitCard(provider: provider.name, window: window, now: now, fill: fill) }
        }
      }
    }
  }

  private func card(@ViewBuilder _ content: () -> some View) -> some View {
    content()
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 20)
      .padding(.vertical, 16)
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .strokeBorder(palette.color("border-heavy"))
      }
  }
}

/// `LimitCard`, in its narrow single-column layout.
private struct LimitCard: View {
  let provider: String
  let window: UsageLimits.Window
  let now: Millis
  let fill: Color
  @Environment(\.palette) private var palette

  var body: some View {
    let left = Int((100 - window.usedPercent).rounded())
    let pace = UsageMath.pace(window, now: now)
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 2) {
        Text(window.label)
          .font(.callout.weight(.medium))
          .foregroundStyle(palette.color("text"))
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          Text("\(left)%")
            .font(.system(size: 40, weight: .medium))
            .monospacedDigit()
            .tracking(-0.8)
            .foregroundStyle(palette.color(window.limited ? "error" : "text"))
          Text("left")
            .font(.callout)
            .foregroundStyle(palette.color("text-tertiary"))
          if let pace {
            Image(systemName: pace.fast ? "chart.line.uptrend.xyaxis" : "chart.line.downtrend.xyaxis")
              .font(.body)
              .foregroundStyle(palette.color("text-tertiary"))
              .accessibilityLabel(pace.label)
          }
        }
      }
      VStack(alignment: .leading, spacing: 10) {
        UsageBar(left: left, fill: fill)
          .accessibilityElement()
          .accessibilityLabel("\(provider) \(window.label.lowercased()) limit remaining")
          .accessibilityValue("\(left)% left")
        HStack(spacing: 12) {
          HStack(spacing: 8) {
            Text("1")
              .font(.caption2.weight(.medium))
              .foregroundStyle(palette.color("text-secondary"))
              .frame(width: 18, height: 18)
              .background(fill, in: .rect(cornerRadius: 5))
              .accessibilityHidden(true)
            Text("\(provider) \(left)%")
              .font(.subheadline)
              .monospacedDigit()
              .foregroundStyle(palette.color("text"))
              .lineLimit(1)
          }
          Spacer(minLength: 0)
          if let resetsAt = window.resetsAt, resetsAt > now {
            Label(UsageMath.countdown(resetsAt - now), systemImage: "arrow.clockwise")
              .font(.footnote)
              .monospacedDigit()
              .foregroundStyle(palette.color("text-secondary"))
              .accessibilityLabel("Resets in \(UsageMath.countdown(resetsAt - now))")
          }
        }
        .padding(.horizontal, 14)
      }
    }
  }
}

/// `.usage-bar`: diagonal hatching on `secondary`, filled to what's left.
private struct UsageBar: View {
  let left: Int
  let fill: Color
  @Environment(\.palette) private var palette

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
    GeometryReader { proxy in
      ZStack(alignment: .leading) {
        palette.color("secondary")
        Canvas { context, size in
          var path = Path()
          var x: CGFloat = -size.height
          while x < size.width + size.height {
            path.move(to: CGPoint(x: x, y: size.height))
            path.addLine(to: CGPoint(x: x + size.height, y: 0))
            x += 7
          }
          context.stroke(path, with: .color(palette.color("border-heavy")), lineWidth: 1)
        }
        if left > 0 {
          shape.fill(fill)
            .frame(width: max(4, proxy.size.width * CGFloat(left) / 100))
            .overlay {
              if left >= 8 {
                Text("1")
                  .font(.caption2.weight(.medium))
                  .foregroundStyle(palette.color("text-secondary"))
              }
            }
        }
      }
    }
    .frame(height: 24)
    .clipShape(shape)
  }
}
