import SwiftUI

/// Settings → Appearance: mode, chat font size, and the light and dark themes, as on the
/// desktop. Custom accent, background and contrast stay desktop-only; the phone uses each
/// preset's exported tokens.
struct AppearanceSettings: View {
  @Environment(ThemeStore.self) private var themes
  @Environment(\.palette) private var palette
  @AppStorage(ChatFontSize.key) private var fontSize = ChatFontSize.standard

  var body: some View {
    @Bindable var themes = themes
    SettingsPage {
      SettingsGroup {
        SettingsRow("Mode", description: "Follow your system or keep one appearance.", stacked: true) {
          SegmentedControl(
            label: "Mode", value: $themes.mode,
            options: [
              .init(value: .light, label: "Light", systemImage: "sun.max"),
              .init(value: .dark, label: "Dark", systemImage: "moon"),
              .init(value: .system, label: "System", systemImage: "desktopcomputer"),
            ])
        }
      }

      SettingsGroup("Typography") {
        Button("Reset") { fontSize = ChatFontSize.standard }
          .font(.footnote.weight(.medium))
          .foregroundStyle(palette.color(fontSize == ChatFontSize.standard ? "text-tertiary" : "text"))
          .disabled(fontSize == ChatFontSize.standard)
          .accessibilityLabel("Reset chat font size")
      } content: {
        SettingsRow(
          "Chat font size",
          description: "Messages and the prompt input. Code and sidebar text are unchanged.",
          stacked: true
        ) {
          HStack(spacing: 12) {
            Slider(
              value: Binding(
                get: { Double(ChatFontSize.range.contains(fontSize) ? fontSize : ChatFontSize.standard) },
                set: { fontSize = Int($0.rounded()) }),
              in: Double(ChatFontSize.range.lowerBound)...Double(ChatFontSize.range.upperBound),
              step: 1
            )
            .tint(palette.color("accent"))
            .accessibilityLabel("Chat font size")
            .accessibilityValue("\(fontSize) pixels")
            Text("\(fontSize)px")
              .font(.footnote)
              .monospacedDigit()
              .foregroundStyle(palette.color("text-secondary"))
              .frame(width: 40, alignment: .trailing)
          }
        }
        Text("Good code should be easy to read.")
          .font(.system(size: ChatFontSize.pointSize(fontSize)))
          .foregroundStyle(palette.color("text"))
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(16)
          .accessibilityLabel("Chat font preview")
      }

      SettingsGroup {
        ForEach([false, true], id: \.self) { dark in
          let current = themes.palette(dark: dark)
          SettingsLinkRow(dark ? "Dark theme" : "Light theme", value: SettingsRoute.theme(dark: dark)) {
            HStack(spacing: 8) {
              ThemeChip(palette: current, size: 24)
              Text(current.name)
                .font(.subheadline)
                .foregroundStyle(palette.color("text-secondary"))
            }
          }
          .accessibilityIdentifier(dark ? "dark-theme" : "light-theme")
        }
      }
    }
    .navigationTitle("Appearance")
    .navigationBarTitleDisplayMode(.inline)
  }
}

/// Every light or dark preset, each with its chip.
struct ThemePicker: View {
  let dark: Bool
  @Environment(ThemeStore.self) private var themes
  @Environment(\.palette) private var palette

  var body: some View {
    let selected = dark ? themes.darkID : themes.lightID
    SettingsPage {
      SettingsGroup {
        ForEach(themes.options(dark: dark), id: \.id) { option in
          Button {
            if dark { themes.darkID = option.id } else { themes.lightID = option.id }
          } label: {
            HStack(spacing: 12) {
              ThemeChip(palette: option)
              Text(option.name)
                .font(.subheadline)
                .foregroundStyle(palette.color("text"))
              Spacer(minLength: 0)
              if option.id == selected {
                Image(systemName: "checkmark")
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(palette.color("text"))
              }
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 52)
            .contentShape(.rect)
          }
          .buttonStyle(SettingsRowStyle())
          .accessibilityAddTraits(option.id == selected ? .isSelected : [])
          .accessibilityIdentifier("theme-\(option.id)")
        }
      }
    }
    .navigationTitle(dark ? "Dark theme" : "Light theme")
    .navigationBarTitleDisplayMode(.inline)
  }
}
