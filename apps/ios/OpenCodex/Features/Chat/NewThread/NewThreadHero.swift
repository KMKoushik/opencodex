import SwiftUI

/// The desktop's new-thread hero (`new-chat-view.tsx`): the brand art, "What should we build?",
/// the project picker and the starter prompts. Shown instead of the transcript while the chat
/// is an unsent draft.
struct NewThreadHero: View {
  let model: ChatModel
  /// Every project, most recently active first; nil while loading.
  let projects: [SessionDetails.Project]?
  /// Moves the draft to another project.
  let select: (String) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    GeometryReader { proxy in
      ScrollView {
        VStack(spacing: 0) {
          BrandIcon(size: 132)
            .padding(.bottom, 4)
          Text("What should we build?")
            .font(.title.weight(.semibold))
            .tracking(-0.5)
            .foregroundStyle(palette.color("text"))
          Text("Any model, any provider. Your repo stays on your machine.")
            .font(.subheadline)
            .foregroundStyle(palette.color("text-secondary"))
            .padding(.top, 10)
          ProjectPicker(projects: projects ?? [], directory: model.directory, select: select)
            .padding(.top, 8)
          Starters(key: DraftStore.key(sessionID: nil, directory: model.directory))
            .padding(.top, 20)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, minHeight: proxy.size.height)
      }
      .scrollDismissesKeyboard(.interactively)
    }
    .background(palette.color("surface"))
    .accessibilityIdentifier("chat.new")
  }
}

/// The four starter prompts. Choosing one only fills the draft; nothing is sent.
struct Starters: View {
  let key: String
  @Environment(\.palette) private var palette

  struct Starter {
    var icon: String
    var label: String
    var prompt: String
  }

  static let all = [
    Starter(
      icon: "book", label: "Explain how this repo is put together",
      prompt:
        "Explain how this repo is put together: the main modules, how data flows between them, and where to start reading."
    ),
    Starter(
      icon: "flask", label: "Find and fix the failing test",
      prompt: "Run the tests, find the failing one, and fix the underlying bug."),
    Starter(
      icon: "plusminus", label: "Review my uncommitted changes",
      prompt:
        "Review my uncommitted changes for bugs, missed edge cases, and anything that should be simpler."
    ),
    Starter(
      icon: "list.bullet", label: "Plan a refactor before touching code",
      prompt:
        "Plan a refactor before touching any code: what to change, in what order, and how to verify each step."
    ),
  ]

  /// Catppuccin tints each starter with its own pastel instead of the primary glaze.
  private static let tints = ["link", "success", "warning", "accent-text"]

  var body: some View {
    Grid(horizontalSpacing: 12, verticalSpacing: 12) {
      ForEach(0..<2, id: \.self) { row in
        GridRow {
          ForEach(0..<2, id: \.self) { column in
            let index = row * 2 + column
            card(Self.all[index], tint: Self.tints[index])
          }
        }
      }
    }
  }

  private func card(_ starter: Starter, tint: String) -> some View {
    Button {
      DraftStore.shared.fill(key, text: starter.prompt)
    } label: {
      VStack(alignment: .leading, spacing: 12) {
        StarterIcon(name: starter.icon, tint: tint)
        Spacer(minLength: 0)
        Text(starter.label)
          .font(.subheadline.weight(.medium))
          .foregroundStyle(palette.color("text"))
          .multilineTextAlignment(.leading)
          .fixedSize(horizontal: false, vertical: true)
      }
      .padding(14)
      .frame(maxWidth: .infinity, minHeight: 104, maxHeight: .infinity, alignment: .topLeading)
      .ceramic("glaze", shadow: "glaze-shadow", radius: 14)
      .contentShape(.rect(cornerRadius: 14))
    }
    .buttonStyle(PressableStyle())
    .accessibilityIdentifier("starter.\(starter.icon)")
  }
}

private struct StarterIcon: View {
  let name: String
  let tint: String
  @Environment(\.palette) private var palette

  var body: some View {
    let image = Image(systemName: name)
      .font(.system(size: 14, weight: .medium))
      .frame(width: 30, height: 30)
    if palette.art == "catppuccin" {
      let color = palette.color(tint)
      image
        .foregroundStyle(color)
        .background(
          LinearGradient(
            colors: [color.opacity(0.24), color.opacity(0.13)], startPoint: .top,
            endPoint: .bottom),
          in: .rect(cornerRadius: 9)
        )
        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(color.opacity(0.22), lineWidth: 1))
    } else {
      image
        .foregroundStyle(palette.color("on-primary"))
        .ceramic("primary-glaze", shadow: "primary-shadow", radius: 9)
    }
  }
}

/// Dims slightly while pressed, like the desktop's active state.
struct PressableStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.7 : 1)
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .animation(.snappy(duration: 0.15), value: configuration.isPressed)
  }
}

/// The desktop's project switcher: the project's name, large and muted, with every project
/// to move the draft to, most recently active first.
private struct ProjectPicker: View {
  let projects: [SessionDetails.Project]
  let directory: String?
  let select: (String) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Menu {
      ForEach(projects) { project in
        Button {
          if project.canonical != directory { select(project.canonical) }
        } label: {
          Label {
            Text(project.displayName)
            Text(Self.abbreviated(project.canonical))
          } icon: {
            if project.canonical == directory { Image(systemName: "checkmark") }
          }
        }
      }
    } label: {
      HStack(spacing: 6) {
        Text(name)
          .font(.title3)
          .tracking(-0.4)
          .lineLimit(1)
        Image(systemName: "chevron.down")
          .font(.caption.weight(.medium))
      }
      .foregroundStyle(palette.color("text-secondary"))
      .padding(.horizontal, 10)
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .accessibilityLabel("Project: \(name)")
    .accessibilityIdentifier("newThread.project")
  }

  private var name: String {
    projects.first { $0.canonical == directory }?.displayName
      ?? directory.map { ($0 as NSString).lastPathComponent } ?? "Project"
  }

  /// `/Users/me/code/app` → `~/code/app`; other paths unchanged.
  static func abbreviated(_ path: String) -> String {
    let parts = path.split(separator: "/", omittingEmptySubsequences: true)
    if parts.count >= 2, parts[0] == "Users" {
      return "~/" + parts.dropFirst(2).joined(separator: "/")
    }
    return path
  }
}
