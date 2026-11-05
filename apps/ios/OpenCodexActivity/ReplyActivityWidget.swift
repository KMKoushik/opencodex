import ActivityKit
import SwiftUI
import WidgetKit

@main
struct OpenCodexActivityBundle: WidgetBundle {
  var body: some Widget { ReplyActivityWidget() }
}

/// The OpenCodex light and dark theme tokens (`Core/Theme/themes.json`) a Live Activity uses.
/// The extension can't read the app's chosen theme, so it follows the system appearance.
struct ActivityPalette {
  var surface: Color
  var text: Color
  var secondary: Color
  var tertiary: Color
  var success: Color
  var error: Color

  static let light = ActivityPalette(
    surface: Color(hex: 0xF9F9F8), text: Color(hex: 0x18181A), secondary: Color(hex: 0x48484A),
    tertiary: Color(hex: 0x666667), success: Color(hex: 0x1E7A3A), error: Color(hex: 0xC0392B))
  static let dark = ActivityPalette(
    surface: Color(hex: 0x1A1A1D), text: Color(hex: 0xEDEDF0), secondary: Color(hex: 0xB0B0B3),
    tertiary: Color(hex: 0x828285), success: Color(hex: 0x5FD47F), error: Color(hex: 0xFF7B72))

  static func of(_ scheme: ColorScheme) -> ActivityPalette { scheme == .dark ? .dark : .light }
}

extension Color {
  init(hex: UInt32) {
    self.init(
      red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255)
  }
}

struct ReplyActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ReplyActivityAttributes.self) { context in
      LockScreenReply(context: context)
    } dynamicIsland: { context in
      // The Dynamic Island is always black: the dark tokens.
      let palette = ActivityPalette.dark
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Calico(size: 40).padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.title)
              .font(.headline)
              .foregroundStyle(palette.text)
              .lineLimit(1)
            Text(context.attributes.project)
              .font(.subheadline)
              .foregroundStyle(palette.secondary)
              .lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ReplyStatus(context: context, palette: palette)
            .font(.subheadline)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 4)
        }
      } compactLeading: {
        Calico(size: 22)
      } compactTrailing: {
        if context.state.state == .running {
          Text(timerInterval: context.interval, countsDown: false)
            .monospacedDigit()
            .font(.caption.weight(.medium))
            .foregroundStyle(palette.text)
            .frame(maxWidth: 44)
            .multilineTextAlignment(.trailing)
        } else {
          ReplyStatusIcon(state: context.state.state, palette: palette)
        }
      } minimal: {
        Calico(size: 22)
      }
      .widgetURL(context.url)
      .keylineTint(palette.text)
    }
  }
}

private struct LockScreenReply: View {
  let context: ActivityViewContext<ReplyActivityAttributes>
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let palette = ActivityPalette.of(scheme)
    HStack(spacing: 12) {
      Calico(size: 44)
      VStack(alignment: .leading, spacing: 3) {
        Text(context.title)
          .font(.headline)
          .foregroundStyle(palette.text)
          .lineLimit(1)
        HStack(spacing: 5) {
          Text(context.attributes.project)
            .foregroundStyle(palette.secondary)
            .lineLimit(1)
            .layoutPriority(1)
          Text("·").foregroundStyle(palette.tertiary).layoutPriority(1)
          ReplyStatus(context: context, palette: palette)
        }
        .font(.subheadline)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(16)
    .activityBackgroundTint(palette.surface)
    .activitySystemActionForegroundColor(palette.text)
    .widgetURL(context.url)
  }
}

/// "Working for 1:04", ticking without the app, or how the reply ended.
private struct ReplyStatus: View {
  let context: ActivityViewContext<ReplyActivityAttributes>
  let palette: ActivityPalette

  var body: some View {
    switch context.state.state {
    case .running:
      // A live timer takes all the width it's offered, so it goes last and the project name
      // claims its width first.
      Text("Working for \(Text(timerInterval: context.interval, countsDown: false))")
        .monospacedDigit()
        .foregroundStyle(palette.secondary)
        .lineLimit(1)
    case .finished: Text("Reply finished").foregroundStyle(palette.success)
    case .failed: Text("Reply failed").foregroundStyle(palette.error)
    case .stopped: Text("Stopped").foregroundStyle(palette.tertiary)
    }
  }
}

private struct ReplyStatusIcon: View {
  let state: ReplyActivityAttributes.ContentState.State
  let palette: ActivityPalette

  var body: some View {
    switch state {
    case .failed: Image(systemName: "xmark.circle").foregroundStyle(palette.error)
    case .stopped: Image(systemName: "stop.circle").foregroundStyle(palette.tertiary)
    default: Image(systemName: "checkmark.circle").foregroundStyle(palette.success)
    }
  }
}

/// The calico brand icon; Debug builds wear the Dev coat, like the app.
private struct Calico: View {
  var size: CGFloat

  var body: some View {
    #if DEBUG
      let name = "BrandDev"
    #else
      let name = "BrandCalico"
    #endif
    Image(name)
      .resizable()
      .interpolation(.high)
      .scaledToFit()
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}

extension ActivityViewContext<ReplyActivityAttributes> {
  var title: String { state.title ?? attributes.title }
  /// Live Activities last at most 12 hours, which bounds the timer's width.
  var interval: ClosedRange<Date> {
    attributes.started...attributes.started.addingTimeInterval(12 * 3600)
  }
  /// Opens the thread (`NotificationsHost` handles the link).
  var url: URL? {
    var components = URLComponents()
    components.scheme = "opencodex"
    components.host = "session"
    components.path = "/" + attributes.sessionID
    return components.url
  }
}
