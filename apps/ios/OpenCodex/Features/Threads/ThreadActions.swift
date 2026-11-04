import Observation
import SwiftUI
import UIKit

/// What the thread menu needs to know about one thread.
nonisolated struct ThreadActionTarget: Hashable, Identifiable, Sendable {
  var id: String
  var title: String
  var pinned: Bool
  /// Marked done with nothing newer (`isSettled` on the desktop).
  var done: Bool
  var muted: Bool
  var running: Bool
}

/// The desktop's thread actions (`session-actions-menu.tsx`) for any screen: Pin, Done, Mark as
/// unread, Mute notifications, Export, plus Rename and Fork on the phone, which has no inline
/// title editor or fork dialog. Keep one per screen and attach `threadActionsHost(_:)` to it for
/// the rename alert, share sheet and errors.
///
/// ```swift
/// @State private var actions = ThreadActions(client: client)
/// Menu { ThreadActionsMenu(actions: actions, target: target) } label: { … }
///   .threadActionsHost(actions)
/// ```
@Observable
final class ThreadActions {
  struct Failure: Identifiable {
    let id = UUID()
    var title: String
    var message: String
  }
  struct Export: Identifiable {
    let id = UUID()
    var url: URL
  }

  let client: GatewayClient
  /// Pin and Done go here instead of straight to the gateway, so a list can update at once
  /// and offer Undo. Without it, the menu writes them itself.
  @ObservationIgnored var focusHandler: ((FocusAction, ThreadActionTarget) -> Void)?
  /// After any successful write, with the thread's ID; lists refresh, a chat reloads its info.
  @ObservationIgnored var onChange: ((String) -> Void)?
  /// Opens a thread, e.g. the fork just made. Fork is offered only when this is set.
  @ObservationIgnored var onOpen: ((String) -> Void)?

  /// Threads with a write in flight, keyed by kind, like the desktop's per-action pending state.
  private(set) var busy: Set<String> = []
  var renaming: ThreadActionTarget?
  var renameText = ""
  var export: Export?
  var failure: Failure?

  init(client: GatewayClient) {
    self.client = client
  }

  func isBusy(_ id: String, _ kind: String) -> Bool { busy.contains("\(kind):\(id)") }

  func focus(_ action: FocusAction, _ target: ThreadActionTarget) {
    if let focusHandler {
      focusHandler(action, target)
      return
    }
    run(target, "focus", failure: "Could not update this thread") { client in
      _ = try await client.focus(target.id, action)
    }
  }

  func markUnread(_ target: ThreadActionTarget) {
    run(target, "unread", failure: "Could not mark this thread as unread") { client in
      _ = try await client.markUnread(target.id)
    }
  }

  func setMuted(_ target: ThreadActionTarget, _ muted: Bool) {
    run(target, "mute", failure: "Could not change this thread’s notifications") { client in
      _ = try await client.mute(target.id, muted)
    }
  }

  func beginRename(_ target: ThreadActionTarget) {
    renameText = target.title
    renaming = target
  }

  func commitRename() {
    guard let target = renaming else { return }
    renaming = nil
    let title = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty, title != target.title else { return }
    run(target, "rename", failure: "Could not rename this thread") { client in
      _ = try await client.rename(target.id, title: String(title.prefix(256)))
    }
  }

  func fork(_ target: ThreadActionTarget) {
    run(target, "fork", failure: "Could not fork this thread") { [weak self] client in
      let session = try await client.fork(target.id)
      self?.onOpen?(session.id)
    }
  }

  func export(_ target: ThreadActionTarget, _ format: ExportFormat) {
    run(target, "export", failure: "Could not export this thread", changes: false) {
      [weak self] client in
      let data = try await client.export(target.id, format: format)
      let folder = FileManager.default.temporaryDirectory
        .appending(path: "export-\(UUID().uuidString)", directoryHint: .isDirectory)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let url = folder.appending(
        path: "\(Self.fileName(target.title, id: target.id)).\(format.fileExtension)")
      try data.write(to: url)
      self?.export = Export(url: url)
    }
  }

  /// The desktop's download name: the title as a lowercase slug, else the thread ID.
  nonisolated static func fileName(_ title: String, id: String) -> String {
    var slug = ""
    var dash = false
    for scalar in title.lowercased().unicodeScalars {
      let keep =
        CharacterSet.letters.contains(scalar) || CharacterSet.decimalDigits.contains(scalar)
        || scalar == "_" || scalar == "-"
      if keep {
        slug.unicodeScalars.append(scalar)
        dash = false
      } else if !dash {
        slug.append("-")
        dash = true
      }
    }
    let trimmed = String(slug.trimmingCharacters(in: CharacterSet(charactersIn: "-")).prefix(80))
    return trimmed.isEmpty ? id : trimmed
  }

  private func run(
    _ target: ThreadActionTarget, _ kind: String, failure title: String, changes: Bool = true,
    _ work: @escaping (GatewayClient) async throws -> Void
  ) {
    let key = "\(kind):\(target.id)"
    guard !busy.contains(key) else { return }
    busy.insert(key)
    Task {
      defer { busy.remove(key) }
      do {
        try await work(client)
        if changes { onChange?(target.id) }
      } catch {
        failure = Failure(title: title, message: error.localizedDescription)
      }
    }
  }
}

/// The menu items, in the desktop's order and wording. Use inside `.contextMenu` or `Menu`.
struct ThreadActionsMenu: View {
  let actions: ThreadActions
  let target: ThreadActionTarget

  var body: some View {
    let id = target.id
    Section {
      Button(
        target.pinned ? "Unpin thread" : "Pin thread",
        systemImage: target.pinned ? "pin.slash" : "pin"
      ) {
        actions.focus(target.pinned ? .unpin : .pin, target)
      }
      .disabled(actions.isBusy(id, "focus"))
      Button(
        target.done ? "Mark as not done" : "Mark as done",
        systemImage: target.done ? "arrow.uturn.backward.circle" : "checkmark.circle"
      ) {
        actions.focus(target.done ? .undone : .done, target)
      }
      // "Available when the thread finishes"
      .disabled(actions.isBusy(id, "focus") || (!target.done && target.running))
      Button(
        actions.isBusy(id, "unread") ? "Marking as unread…" : "Mark as unread",
        systemImage: "circlebadge"
      ) {
        actions.markUnread(target)
      }
      .disabled(actions.isBusy(id, "unread"))
      Button(
        target.muted ? "Unmute notifications" : "Mute notifications",
        systemImage: target.muted ? "bell" : "bell.slash"
      ) {
        actions.setMuted(target, !target.muted)
      }
      .disabled(actions.isBusy(id, "mute"))
    }
    Section {
      Button("Rename thread", systemImage: "pencil") { actions.beginRename(target) }
        .disabled(actions.isBusy(id, "rename"))
      if actions.onOpen != nil {
        Button(
          actions.isBusy(id, "fork") ? "Forking…" : "Fork thread",
          systemImage: "arrow.triangle.branch"
        ) {
          actions.fork(target)
        }
        .disabled(actions.isBusy(id, "fork"))
      }
    }
    Section {
      Button("Export as Markdown", systemImage: "doc.text") { actions.export(target, .markdown) }
        .disabled(actions.isBusy(id, "export"))
      Button("Export as JSON", systemImage: "curlybraces") { actions.export(target, .json) }
        .disabled(actions.isBusy(id, "export"))
    }
  }
}

extension View {
  /// The rename alert, export share sheet and error alert for a screen's `ThreadActions`.
  func threadActionsHost(_ actions: ThreadActions) -> some View {
    modifier(ThreadActionsHost(actions: actions))
  }
}

private struct ThreadActionsHost: ViewModifier {
  @Bindable var actions: ThreadActions

  func body(content: Content) -> some View {
    content
      .alert(
        "Rename thread",
        isPresented: Binding(
          get: { actions.renaming != nil }, set: { if !$0 { actions.renaming = nil } })
      ) {
        TextField("Thread title", text: $actions.renameText)
          .submitLabel(.done)
        Button("Cancel", role: .cancel) { actions.renaming = nil }
        Button("Rename") { actions.commitRename() }
      }
      .alert(
        actions.failure?.title ?? "",
        isPresented: Binding(
          get: { actions.failure != nil }, set: { if !$0 { actions.failure = nil } })
      ) {
        Button("OK", role: .cancel) {}
      } message: {
        Text(actions.failure?.message ?? "")
      }
      .sheet(item: $actions.export) { export in
        ShareSheet(items: [export.url])
          .presentationDetents([.medium, .large])
          .ignoresSafeArea()
      }
  }
}

/// The system share sheet, for exported transcripts.
struct ShareSheet: UIViewControllerRepresentable {
  let items: [Any]

  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: items, applicationActivities: nil)
  }

  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
