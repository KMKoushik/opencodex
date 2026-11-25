import Charts
import Observation
import SwiftUI

/// `GET /api/usage/stats`: spend and tokens over a period, from OpenCode's session stats.
nonisolated struct UsageStats: Codable, Sendable {
  struct Tokens: Codable, Hashable, Sendable {
    struct Cache: Codable, Hashable, Sendable {
      var read: Double
      var write: Double
    }
    var input: Double
    var output: Double
    var reasoning: Double
    var cache: Cache
    var total: Double { input + output + reasoning + cache.read + cache.write }
  }
  /// One model's usage, with its thinking variants merged.
  struct Model: Codable, Hashable, Sendable {
    var id: String
    var providerID: String
    var name: String
    var provider: String
    var steps: Int
    var cost: Double
    var tokens: Tokens
    /// False on a subscription plan: no per-token price, so its cost is 0 but it isn't free.
    var priced: Bool
    var key: String { "\(providerID)/\(id)" }
  }
  struct Part: Codable, Hashable, Sendable {
    var cost: Double
    var tokens: Double
  }
  /// One hour or local calendar day of the chart.
  struct Bucket: Codable, Hashable, Sendable {
    var start: Millis
    var end: Millis
    var cost: Double
    var tokens: Double
    var steps: Int
    var providers: [String: Part]
  }
  struct Tools: Codable, Hashable, Sendable {
    var calls: Int
    var succeeded: Int
    var failed: Int
  }
  struct Provider: Codable, Hashable, Sendable {
    var id: String
    var name: String
  }
  var period: String
  /// `hour` or `day`.
  var unit: String
  var sessions: Int
  var subagents: Int
  var prompts: Int
  var steps: Int
  var cost: Double
  var tokens: Tokens
  var tools: Tools
  var models: [Model]
  var providers: [Provider]
  var buckets: [Bucket]
}

nonisolated extension GatewayClient {
  func usageStats(period: String, project: String?) async throws -> UsageStats {
    try await get(
      "/usage/stats",
      ["period": period, "timeZone": TimeZone.current.identifier, "project": project])
  }
}

enum UsagePeriod: String, CaseIterable, Identifiable {
  case day = "24h"
  case week = "7d"
  case month = "30d"
  case quarter = "90d"
  var id: String { rawValue }
  var label: String {
    switch self {
    case .day: "24h"
    case .week: "7 days"
    case .month: "30 days"
    case .quarter: "90 days"
    }
  }
  var phrase: String {
    switch self {
    case .day: "the last 24 hours"
    case .week: "the last 7 days"
    case .month: "the last 30 days"
    case .quarter: "the last 90 days"
    }
  }
}

enum UsageMetric: String, CaseIterable, Identifiable {
  case cost = "Spend"
  case tokens = "Tokens"
  var id: String { rawValue }
}

@Observable
final class UsageStatsModel {
  let client: GatewayClient
  var period = UsagePeriod.month
  /// An OpenCode project ID, or "" for every project.
  var project = ""
  private(set) var projects: [Project] = []
  /// The last answer for each period and project, so switching back shows it at once.
  private var answers: [String: UsageStats] = [:]
  private(set) var shown: UsageStats?
  private(set) var error: String?
  private(set) var fetching = false

  init(client: GatewayClient) {
    self.client = client
  }

  var key: String { "\(period.rawValue)|\(project)" }
  /// Whether `shown` is another period's or project's answer, kept while this one loads.
  var stale: Bool { answers[key] == nil && shown != nil }

  func load() async {
    let key = key
    if let cached = answers[key] { shown = cached }
    fetching = true
    defer { if key == self.key { fetching = false } }
    do {
      let stats = try await client.usageStats(
        period: period.rawValue, project: project.isEmpty ? nil : project)
      answers[key] = stats
      if key == self.key {
        shown = stats
        error = nil
      }
    } catch {
      if error is CancellationError || (error as? URLError)?.code == .cancelled { return }
      if key == self.key { self.error = error.localizedDescription }
    }
  }

  func loadProjects() async {
    guard projects.isEmpty, let list = try? await client.projects() else { return }
    projects = list
  }
}

/// Usage → Overview: the desktop's spend and tokens dashboard in one column.
struct UsageOverview: View {
  let model: UsageStatsModel
  @Environment(\.palette) private var palette

  var body: some View {
    @Bindable var model = model
    VStack(alignment: .leading, spacing: 16) {
      Picker("Period", selection: $model.period) {
        ForEach(UsagePeriod.allCases) { Text($0.label).tag($0) }
      }
      .pickerStyle(.segmented)
      .accessibilityIdentifier("usage-period")
      Menu {
        Picker("Project", selection: $model.project) {
          Text("All projects").tag("")
          ForEach(model.projects) { project in
            Text(Self.name(project)).tag(project.id)
          }
        }
      } label: {
        HStack(spacing: 6) {
          Image(systemName: "folder")
          Text(projectLabel).lineLimit(1)
          Image(systemName: "chevron.up.chevron.down").font(.caption)
        }
        .font(.subheadline)
        .foregroundStyle(palette.color("text-secondary"))
      }
      .accessibilityIdentifier("usage-project")
      if let error = model.error, model.shown == nil {
        Text(error)
          .font(.subheadline)
          .foregroundStyle(palette.color("error"))
      }
      if let stats = model.shown {
        VStack(alignment: .leading, spacing: 28) {
          StatGrid(stats: stats)
          if stats.steps == 0 {
            Text(
              "No agent activity in \(model.period.phrase)\(model.project.isEmpty ? "" : " for this project")."
            )
            .font(.subheadline)
            .foregroundStyle(palette.color("text-secondary"))
          } else {
            UsageChartCard(stats: stats)
            TokenTypes(tokens: stats.tokens)
            ModelList(models: stats.models)
          }
        }
        .opacity(model.stale ? 0.6 : 1)
        .animation(.easeOut(duration: 0.2), value: model.stale)
      }
    }
    .task(id: model.key) {
      // Fresh for each period and project, then every five minutes while it shows.
      while !Task.isCancelled {
        await model.load()
        try? await Task.sleep(for: .seconds(300))
      }
    }
    .task { await model.loadProjects() }
  }

  private var projectLabel: String {
    model.projects.first { $0.id == model.project }.map(Self.name) ?? "All projects"
  }

  static func name(_ project: Project) -> String {
    if let name = project.name, !name.isEmpty { return name }
    return project.canonical.split(separator: "/").last.map(String.init) ?? project.canonical
  }
}

/// Numbers in the desktop's formats: `$1,429.44`, `13.5B`, `97.6%`.
nonisolated enum UsageFormat {
  /// Like the desktop, US English: "$" for OpenCode's US-dollar prices (not "US$" or "USD"),
  /// and thousands, millions and billions (not lakh and crore) for token counts.
  private static let english = Locale(identifier: "en_US")

  static func money(_ value: Double) -> String {
    value > 0 && value < 0.01
      ? "<$0.01" : value.formatted(.currency(code: "USD").locale(english))
  }
  static func moneyShort(_ value: Double) -> String {
    value >= 1000
      ? "$" + compact(value)
      : value.formatted(.currency(code: "USD").locale(english).precision(.fractionLength(0)))
  }
  static func compact(_ value: Double) -> String {
    value.formatted(
      .number.notation(.compactName).locale(english).precision(.fractionLength(0...1)))
  }
  static func whole(_ value: Int) -> String {
    value.formatted(.number.locale(english))
  }
  static func percent(_ value: Double) -> String {
    (value.isFinite ? value : 0).formatted(
      .percent.locale(english).precision(.fractionLength(0...1)))
  }
}

private struct StatGrid: View {
  let stats: UsageStats
  @Environment(\.palette) private var palette

  var body: some View {
    let input = stats.tokens.input + stats.tokens.cache.read + stats.tokens.cache.write
    let plans = stats.models.filter { !$0.priced }
    let planTokens = plans.reduce(0) { $0 + $1.tokens.total }
    VStack(spacing: 0) {
      HStack(spacing: 0) {
        stat(
          "API spend", UsageFormat.money(stats.cost),
          planTokens > 0
            ? "+ \(UsageFormat.compact(planTokens)) tokens on plans"
            : "\(stats.models.count) \(stats.models.count == 1 ? "model" : "models")")
        divider(vertical: true)
        stat(
          "Tokens", UsageFormat.compact(stats.tokens.total),
          input > 0
            ? "\(UsageFormat.percent(stats.tokens.cache.read / input)) of input cached" : "—")
      }
      .fixedSize(horizontal: false, vertical: true)
      divider(vertical: false)
      HStack(spacing: 0) {
        stat(
          "Sessions", UsageFormat.whole(stats.sessions),
          "\(UsageFormat.compact(Double(stats.prompts))) prompts · \(UsageFormat.compact(Double(stats.subagents))) subagents"
        )
        divider(vertical: true)
        stat(
          "Tool calls", UsageFormat.compact(Double(stats.tools.calls)),
          stats.tools.calls > 0
            ? "\(UsageFormat.percent(Double(stats.tools.failed) / Double(stats.tools.calls))) failed"
            : "—")
      }
      .fixedSize(horizontal: false, vertical: true)
    }
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .strokeBorder(palette.color("border-heavy"))
    }
  }

  private func stat(_ label: String, _ value: String, _ detail: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label)
        .font(.footnote.weight(.medium))
        .foregroundStyle(palette.color("text-secondary"))
      Text(value)
        .font(.system(size: 24, weight: .medium))
        .monospacedDigit()
        .tracking(-0.4)
        .foregroundStyle(palette.color("text"))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(detail)
        .font(.caption)
        .foregroundStyle(palette.color("text-tertiary"))
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .accessibilityElement(children: .combine)
  }

  private func divider(vertical: Bool) -> some View {
    palette.color("border")
      .frame(width: vertical ? 1 : nil, height: vertical ? nil : 1)
  }
}

/// The desktop's provider tints: Anthropic orange, OpenAI green, Google blue, then the rest.
private struct Series: Identifiable {
  var id: String
  var name: String
  var tint: Color
}

private struct UsageChartCard: View {
  let stats: UsageStats
  @State private var metric = UsageMetric.cost
  @State private var selected: Date?
  @Environment(\.palette) private var palette

  private var hourly: Bool { stats.unit == "hour" }

  private var series: [Series] {
    let tints: [String: String] = [
      "anthropic": "project-orange", "claude-agent": "project-orange",
      "claude-code": "project-orange", "openai": "project-green",
      "google-vertex": "project-blue", "google": "project-blue",
    ]
    let spare = ["project-purple", "project-pink", "project-gray"]
    var totals: [String: Double] = [:]
    for bucket in stats.buckets {
      for (id, part) in bucket.providers { totals[id, default: 0] += value(part) }
    }
    let names = Dictionary(
      stats.providers.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
    var used = Set<String>()
    var next = 0
    return totals.filter { $0.value > 0 }.sorted { $0.value > $1.value }.map { id, _ in
      var tint = tints[id]
      // Two providers sharing a tint (Anthropic and Claude Agent) would merge in the stack.
      if tint == nil || used.contains(tint!) {
        tint = spare[next % spare.count]
        next += 1
      }
      used.insert(tint!)
      return Series(id: id, name: names[id] ?? id, tint: palette.color(tint!))
    }
  }

  private func value(_ part: UsageStats.Part) -> Double {
    metric == .cost ? part.cost : part.tokens
  }

  private func format(_ value: Double) -> String {
    metric == .cost ? UsageFormat.moneyShort(value) : UsageFormat.compact(value)
  }

  private func leftHalf(_ bucket: UsageStats.Bucket) -> Bool {
    guard let index = stats.buckets.firstIndex(of: bucket) else { return true }
    return Double(index) + 0.5 < Double(stats.buckets.count) / 2
  }

  private var focused: UsageStats.Bucket? {
    guard let selected else { return nil }
    let time = selected.timeIntervalSince1970 * 1000
    return stats.buckets.first { $0.start <= time && time < $0.end }
  }

  var body: some View {
    let series = series
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("\(hourly ? "Hourly" : "Daily") \(metric == .cost ? "spend" : "tokens")")
          .font(.callout.weight(.medium))
          .foregroundStyle(palette.color("text"))
          .accessibilityAddTraits(.isHeader)
        Spacer()
        Picker("Chart metric", selection: $metric) {
          ForEach(UsageMetric.allCases) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
        .fixedSize()
      }
      Chart {
        ForEach(stats.buckets, id: \.start) { bucket in
          ForEach(series) { item in
            if let part = bucket.providers[item.id], value(part) > 0 {
              BarMark(
                x: .value(
                  "Time", Date(timeIntervalSince1970: bucket.start / 1000),
                  unit: hourly ? .hour : .day),
                y: .value(metric.rawValue, value(part))
              )
              .foregroundStyle(by: .value("Provider", item.name))
              .opacity(focused == nil || focused == bucket ? 1 : 0.45)
            }
          }
        }
        if let focused {
          RuleMark(
            x: .value(
              "Selected", Date(timeIntervalSince1970: focused.start / 1000),
              unit: hourly ? .hour : .day)
          )
          .foregroundStyle(palette.color("border-heavy"))
          // Beside the bar, never over it: right of it in the chart's left half.
          .annotation(
            position: leftHalf(focused) ? .trailing : .leading, alignment: .top, spacing: 8,
            overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))
          ) {
            card(focused, series: series)
          }
        }
      }
      .chartForegroundStyleScale(domain: series.map(\.name), range: series.map(\.tint))
      .chartLegend(series.count > 1 ? .visible : .hidden)
      .chartOverlay { proxy in
        // A tap picks a bar and a second tap clears it; Charts' own selection needs a drag,
        // which would fight the page's scrolling.
        GeometryReader { geometry in
          Rectangle().fill(.clear).contentShape(.rect)
            .onTapGesture { location in
              guard let plot = proxy.plotFrame else { return }
              let x = location.x - geometry[plot].origin.x
              guard let date: Date = proxy.value(atX: x) else { return }
              let time = date.timeIntervalSince1970 * 1000
              let hit = stats.buckets.first { $0.start <= time && time < $0.end }
              selected = hit == nil || hit == focused ? nil : date
            }
        }
      }
      .chartYAxis {
        AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
          AxisGridLine().foregroundStyle(palette.color("border"))
          AxisValueLabel {
            if let number = value.as(Double.self) {
              Text(format(number)).foregroundStyle(palette.color("text-tertiary"))
            }
          }
        }
      }
      .chartXAxis {
        AxisMarks(values: .automatic(desiredCount: hourly ? 4 : 5)) { _ in
          AxisValueLabel(format: hourly ? .dateTime.hour() : .dateTime.day().month(.abbreviated))
            .foregroundStyle(palette.color("text-tertiary"))
        }
      }
      .frame(height: 220)
      .accessibilityIdentifier("usage-chart")
    }
    .padding(16)
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .strokeBorder(palette.color("border-heavy"))
    }
    .onChange(of: stats.period) { selected = nil }
  }

  private func card(_ bucket: UsageStats.Bucket, series: [Series]) -> some View {
    let start = Date(timeIntervalSince1970: bucket.start / 1000)
    return VStack(alignment: .leading, spacing: 6) {
      Text(
        hourly
          ? start.formatted(.dateTime.weekday(.abbreviated).hour().minute())
          : start.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
      )
      .foregroundStyle(palette.color("text-secondary"))
      HStack(alignment: .firstTextBaseline) {
        Text(
          metric == .cost
            ? UsageFormat.money(bucket.cost) : "\(UsageFormat.compact(bucket.tokens)) tokens"
        )
        .font(.subheadline.weight(.medium))
        .foregroundStyle(palette.color("text"))
        Spacer(minLength: 12)
        Text(
          metric == .cost
            ? "\(UsageFormat.compact(bucket.tokens)) tokens" : UsageFormat.money(bucket.cost)
        )
        .foregroundStyle(palette.color("text-tertiary"))
      }
      ForEach(series.filter { (bucket.providers[$0.id]?.tokens ?? 0) > 0 }) { item in
        HStack(spacing: 6) {
          RoundedRectangle(cornerRadius: 2).fill(item.tint).frame(width: 8, height: 8)
          Text(item.name).lineLimit(1)
          Spacer(minLength: 12)
          Text(
            metric == .cost
              ? UsageFormat.money(bucket.providers[item.id]!.cost)
              : UsageFormat.compact(bucket.providers[item.id]!.tokens))
        }
        .foregroundStyle(palette.color("text-secondary"))
      }
    }
    .font(.caption)
    .monospacedDigit()
    .frame(width: 190)
    .padding(10)
    .background(palette.color("elevated"), in: .rect(cornerRadius: 10, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .strokeBorder(palette.color("border-heavy"))
    }
  }
}

private struct TokenTypes: View {
  let tokens: UsageStats.Tokens
  @Environment(\.palette) private var palette

  private var kinds: [(label: String, tint: String, value: Double)] {
    [
      ("Cache read", "project-blue", tokens.cache.read),
      ("Cache write", "project-purple", tokens.cache.write),
      ("Input", "project-green", tokens.input),
      ("Output", "project-orange", tokens.output),
      ("Reasoning", "project-pink", tokens.reasoning),
    ]
  }

  var body: some View {
    let total = tokens.total
    VStack(alignment: .leading, spacing: 14) {
      Text("Tokens by type")
        .font(.callout.weight(.medium))
        .foregroundStyle(palette.color("text"))
        .accessibilityAddTraits(.isHeader)
      GeometryReader { proxy in
        let shown = kinds.filter { $0.value > 0 }
        let gaps = CGFloat(max(0, shown.count - 1)) * 2
        HStack(spacing: 2) {
          ForEach(shown, id: \.label) { kind in
            palette.color(kind.tint)
              .frame(width: max(3, (proxy.size.width - gaps) * kind.value / max(total, 1)))
          }
        }
      }
      .frame(height: 14)
      .clipShape(.rect(cornerRadius: 5, style: .continuous))
      .accessibilityHidden(true)
      LazyVGrid(
        columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: 3), spacing: 12
      ) {
        ForEach(kinds, id: \.label) { kind in
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
              RoundedRectangle(cornerRadius: 2).fill(palette.color(kind.tint))
                .frame(width: 8, height: 8)
              Text(kind.label)
            }
            .font(.caption)
            .foregroundStyle(palette.color("text-secondary"))
            HStack(alignment: .firstTextBaseline, spacing: 4) {
              Text(UsageFormat.compact(kind.value))
                .font(.subheadline)
                .foregroundStyle(palette.color("text"))
              Text(UsageFormat.percent(kind.value / max(total, 1)))
                .font(.caption2)
                .foregroundStyle(palette.color("text-tertiary"))
            }
            .monospacedDigit()
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
  }
}

private struct ModelList: View {
  let models: [UsageStats.Model]
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Models")
        .font(.callout.weight(.medium))
        .foregroundStyle(palette.color("text"))
        .accessibilityAddTraits(.isHeader)
        .padding(.bottom, 6)
      ForEach(Array(models.enumerated()), id: \.element.key) { index, model in
        if index > 0 { palette.color("border").frame(height: 1) }
        HStack(spacing: 12) {
          ProviderLogo(providerID: model.providerID)
            .foregroundStyle(palette.color("text-secondary"))
          VStack(alignment: .leading, spacing: 2) {
            Text(model.name).foregroundStyle(palette.color("text"))
            Text(model.provider)
              .font(.caption)
              .foregroundStyle(palette.color("text-tertiary"))
          }
          .lineLimit(1)
          Spacer(minLength: 8)
          VStack(alignment: .trailing, spacing: 2) {
            if model.priced {
              Text(UsageFormat.money(model.cost)).foregroundStyle(palette.color("text"))
            } else {
              Text("Plan")
                .font(.caption)
                .foregroundStyle(palette.color("text-secondary"))
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(palette.color("secondary"), in: .rect(cornerRadius: 6))
                .accessibilityLabel("On a subscription plan")
            }
            Text("\(UsageFormat.compact(model.tokens.total)) tokens")
              .font(.caption)
              .foregroundStyle(palette.color("text-tertiary"))
          }
          .monospacedDigit()
        }
        .font(.subheadline)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
      }
    }
  }
}
