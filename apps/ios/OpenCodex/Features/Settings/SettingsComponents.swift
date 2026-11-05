import SwiftUI
import UIKit

/// A native inset-grouped settings form in the theme's colors: `surface` behind, `elevated`
/// rows split by `border` hairlines, ink labels. Use `SettingsSection`-styled rows inside.
struct SettingsForm<Content: View>: View {
  @ViewBuilder let content: Content
  @Environment(\.palette) private var palette

  var body: some View {
    Form { content }
      .formStyle(.grouped)
      .scrollContentBackground(.hidden)
      .background(palette.color("surface"))
      .foregroundStyle(palette.color("text"))
      .environment(\.defaultMinListRowHeight, 48)
  }
}

extension View {
  /// Rows in a settings form: `elevated` backgrounds and `border` hairlines.
  func settingsRows() -> some View { modifier(SettingsRows()) }
}

private struct SettingsRows: ViewModifier {
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content
      .listRowBackground(palette.color("elevated"))
      .listRowSeparatorTint(palette.color("border"))
  }
}

/// A section header in the form's `text-secondary`, like the desktop's group titles.
struct SettingsHeader: View {
  let title: String
  @Environment(\.palette) private var palette

  init(_ title: String) { self.title = title }

  var body: some View {
    Text(title)
      .foregroundStyle(palette.color("text-secondary"))
      .accessibilityAddTraits(.isHeader)
  }
}

/// `LabeledContent` with the value in `text-secondary` and an optional description line.
struct SettingsValue: View {
  let label: String
  let value: String
  var description: String?
  var valueColor = "text-secondary"
  @Environment(\.palette) private var palette

  var body: some View {
    LabeledContent {
      Text(value)
        .foregroundStyle(palette.color(valueColor))
        .multilineTextAlignment(.trailing)
        .textSelection(.enabled)
    } label: {
      Text(label).foregroundStyle(palette.color("text"))
      if let description {
        Text(description).foregroundStyle(palette.color("text-secondary"))
      }
    }
  }
}

/// The desktop's settings page: groups on `surface`, 16 pt apart.
struct SettingsPage<Content: View>: View {
  @ViewBuilder let content: Content
  @Environment(\.palette) private var palette

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) { content }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 48)
    }
    .background(palette.color("surface"))
  }
}

/// `.settings-group`: an `elevated` card with a hairline border, rows split by hairlines.
struct SettingsGroup<Content: View, Action: View>: View {
  var title: String?
  @ViewBuilder var action: Action
  @ViewBuilder var content: Content
  @Environment(\.palette) private var palette

  init(
    _ title: String? = nil, @ViewBuilder action: () -> Action = { EmptyView() },
    @ViewBuilder content: () -> Content
  ) {
    self.title = title
    self.action = action()
    self.content = content()
  }

  var body: some View {
    VStack(spacing: 0) {
      if let title {
        HStack(spacing: 8) {
          Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(palette.color("text"))
            .accessibilityAddTraits(.isHeader)
          Spacer(minLength: 0)
          action
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        Divider().overlay(palette.color("border"))
      }
      Group(subviews: content) { rows in
        ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
          if index > 0 { Divider().overlay(palette.color("border")) }
          row
        }
      }
    }
    .background(palette.color("elevated"), in: .rect(cornerRadius: 12, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .strokeBorder(palette.color("border"))
    }
  }
}

/// `.settings-row`: a label with an optional description, and a control on the trailing side.
/// Wide controls move under the label, as the desktop's rows wrap on narrow screens.
struct SettingsRow<Control: View>: View {
  let label: String
  var description: String?
  var descriptionColor: String = "text-secondary"
  var stacked = false
  @ViewBuilder var control: Control
  @Environment(\.palette) private var palette

  init(
    _ label: String, description: String? = nil, descriptionColor: String = "text-secondary",
    stacked: Bool = false, @ViewBuilder control: () -> Control = { EmptyView() }
  ) {
    self.label = label
    self.description = description
    self.descriptionColor = descriptionColor
    self.stacked = stacked
    self.control = control()
  }

  var body: some View {
    let layout = stacked
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
      : AnyLayout(HStackLayout(spacing: 16))
    layout {
      VStack(alignment: .leading, spacing: 2) {
        Text(label)
          .font(.subheadline)
          .foregroundStyle(palette.color("text"))
        if let description {
          Text(description)
            .font(.footnote)
            .foregroundStyle(palette.color(descriptionColor))
            .textSelection(.enabled)
        }
      }
      .frame(maxWidth: stacked ? nil : .infinity, alignment: .leading)
      control
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
  }
}

/// A row that opens another settings page.
struct SettingsLinkRow<Value: Hashable, Trailing: View>: View {
  let label: String
  var systemImage: String?
  let value: Value
  @ViewBuilder var trailing: Trailing
  @Environment(\.palette) private var palette

  init(
    _ label: String, systemImage: String? = nil, value: Value,
    @ViewBuilder trailing: () -> Trailing = { EmptyView() }
  ) {
    self.label = label
    self.systemImage = systemImage
    self.value = value
    self.trailing = trailing()
  }

  var body: some View {
    NavigationLink(value: value) {
      HStack(spacing: 12) {
        if let systemImage {
          Image(systemName: systemImage)
            .foregroundStyle(palette.color("text-secondary"))
            .frame(width: 22)
        }
        Text(label)
          .font(.subheadline)
          .foregroundStyle(palette.color("text"))
        Spacer(minLength: 8)
        trailing
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .padding(.horizontal, 16)
      .frame(maxWidth: .infinity, minHeight: 52)
      .contentShape(.rect)
    }
    .buttonStyle(SettingsRowStyle())
  }
}

/// Settings rows press to `hover`.
struct SettingsRowStyle: ButtonStyle {
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(configuration.isPressed ? palette.color("hover") : .clear)
  }
}

/// The desktop's `SegmentedControl`: a `well` with a raised `glaze` thumb.
struct SegmentedControl<Value: Hashable>: View {
  struct Option {
    var value: Value
    var label: String
    var systemImage: String?
  }

  let label: String
  @Binding var value: Value
  let options: [Option]
  @Environment(\.palette) private var palette
  @Namespace private var thumb

  var body: some View {
    HStack(spacing: 2) {
      ForEach(options, id: \.value) { option in
        let selected = option.value == value
        Button {
          withAnimation(.snappy(duration: 0.2)) { value = option.value }
        } label: {
          HStack(spacing: 6) {
            if let systemImage = option.systemImage {
              Image(systemName: systemImage).font(.footnote)
            }
            Text(option.label)
          }
          .font(.footnote.weight(.medium))
          .foregroundStyle(palette.color(selected ? "text" : "text-secondary"))
          .padding(.horizontal, 12)
          .frame(minHeight: 36)
          .background {
            if selected {
              RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(palette.gradient("glaze"))
                .shadow(
                  color: Color(uiColor: palette.shadows("glaze-shadow").first?.color ?? .clear),
                  radius: 1, y: 1
                )
                .matchedGeometryEffect(id: "thumb", in: thumb)
            }
          }
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
      }
    }
    .padding(2)
    .background(palette.gradient("well"), in: .rect(cornerRadius: 10, style: .continuous))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(label)
  }
}

/// `.theme-chip`: "Aa" in the theme's accent on its surface, ringed in a faint ink.
struct ThemeChip: View {
  let palette: Palette
  var size: CGFloat = 26

  var body: some View {
    let surface = palette.ui("surface")
    Text("Aa")
      .font(.system(size: size * 0.42, weight: .semibold))
      .foregroundStyle(palette.color("accent"))
      .frame(width: size, height: size)
      .background(Color(uiColor: surface), in: .circle)
      .overlay {
        Circle().strokeBorder(Color(uiColor: palette.ui("text").mixed(0.16, with: surface)))
      }
      .accessibilityHidden(true)
  }
}

extension UIColor {
  /// `color-mix(in srgb, self amount, other)`.
  func mixed(_ amount: CGFloat, with other: UIColor) -> UIColor {
    var (r1, g1, b1, a1): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
    var (r2, g2, b2, a2): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
    getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
    other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
    func mix(_ a: CGFloat, _ b: CGFloat) -> CGFloat { a * amount + b * (1 - amount) }
    return UIColor(red: mix(r1, r2), green: mix(g1, g2), blue: mix(b1, b2), alpha: mix(a1, a2))
  }
}
