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
    SettingsForm {
      Section {
        Picker("Mode", selection: $themes.mode) {
          Text("Light").tag(ThemeStore.Mode.light)
          Text("Dark").tag(ThemeStore.Mode.dark)
          Text("System").tag(ThemeStore.Mode.system)
        }
        .pickerStyle(.segmented)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .accessibilityIdentifier("appearance-mode")
      } header: {
        SettingsHeader("Mode")
      } footer: {
        Text("Follow your system or keep one appearance.")
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .settingsRows()

      Section {
        ForEach([false, true], id: \.self) { dark in
          let current = themes.palette(dark: dark)
          NavigationLink(value: SettingsRoute.theme(dark: dark)) {
            LabeledContent {
              HStack(spacing: 8) {
                ThemeChip(palette: current, size: 24)
                Text(current.name).foregroundStyle(palette.color("text-secondary"))
              }
            } label: {
              Text(dark ? "Dark theme" : "Light theme").foregroundStyle(palette.color("text"))
            }
          }
          .accessibilityIdentifier(dark ? "dark-theme" : "light-theme")
        }
      } header: {
        SettingsHeader("Theme")
      }
      .settingsRows()

      Section {
        LabeledContent {
          Text("\(fontSize)px")
            .monospacedDigit()
            .foregroundStyle(palette.color("text-secondary"))
            .accessibilityIdentifier("chat-font-size-value")
        } label: {
          Text("Chat font size").foregroundStyle(palette.color("text"))
        }
        Slider(
          value: Binding(
            get: { Double(ChatFontSize.range.contains(fontSize) ? fontSize : ChatFontSize.standard) },
            set: { fontSize = Int($0.rounded()) }),
          in: Double(ChatFontSize.range.lowerBound)...Double(ChatFontSize.range.upperBound),
          step: 1
        ) {
          Text("Chat font size")
        } minimumValueLabel: {
          Image(systemName: "textformat.size.smaller")
            .foregroundStyle(palette.color("text-tertiary"))
        } maximumValueLabel: {
          Image(systemName: "textformat.size.larger")
            .foregroundStyle(palette.color("text-tertiary"))
        }
        .tint(palette.color("accent"))
        .accessibilityValue("\(fontSize) pixels")
        .accessibilityIdentifier("chat-font-size")
        Text("Good code should be easy to read.")
          .font(.system(size: ChatFontSize.pointSize(fontSize)))
          .foregroundStyle(palette.color("text"))
          .padding(.vertical, 6)
          .accessibilityLabel("Chat font preview")
        Button("Reset") { fontSize = ChatFontSize.standard }
          .foregroundStyle(
            palette.color(fontSize == ChatFontSize.standard ? "text-tertiary" : "text"))
          .disabled(fontSize == ChatFontSize.standard)
          .accessibilityLabel("Reset chat font size")
          .accessibilityIdentifier("chat-font-size-reset")
      } header: {
        SettingsHeader("Typography")
      } footer: {
        Text("Messages and the prompt input. Code and sidebar text are unchanged.")
          .foregroundStyle(palette.color("text-tertiary"))
      }
      .settingsRows()
    }
    .navigationTitle("Appearance")
    .navigationBarTitleDisplayMode(.inline)
  }
}

/// Every light or dark preset, each with its chip; the chosen one is checked.
struct ThemePicker: View {
  let dark: Bool
  @Environment(ThemeStore.self) private var themes
  @Environment(\.palette) private var palette

  var body: some View {
    let selected = dark ? themes.darkID : themes.lightID
    SettingsForm {
      Section {
        ForEach(themes.options(dark: dark), id: \.id) { option in
          Button {
            if dark { themes.darkID = option.id } else { themes.lightID = option.id }
          } label: {
            HStack(spacing: 12) {
              ThemeChip(palette: option)
              Text(option.name).foregroundStyle(palette.color("text"))
              Spacer(minLength: 0)
              if option.id == selected {
                Image(systemName: "checkmark")
                  .font(.body.weight(.semibold))
                  .foregroundStyle(palette.color("accent"))
              }
            }
            .contentShape(.rect)
          }
          .accessibilityAddTraits(option.id == selected ? .isSelected : [])
          .accessibilityIdentifier("theme-\(option.id)")
        }
      }
      .settingsRows()
    }
    .navigationTitle(dark ? "Dark theme" : "Light theme")
    .navigationBarTitleDisplayMode(.inline)
  }
}
