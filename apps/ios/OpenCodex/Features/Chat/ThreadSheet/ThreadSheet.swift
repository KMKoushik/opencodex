import SwiftUI

/// The chat's thread sheet, like OpenCode's iPhone app: the title and folder, a row of thread
/// actions, the model, context and cost, the desktop's side panels, notifications, Rename and
/// Delete. Opened from the title pill or the "…" button.
struct ThreadSheet: View {
  let chat: ChatModel
  let actions: ThreadActions
  let target: ThreadActionTarget
  let projectName: String?
  let directory: String?
  /// Closes the sheet, then the chat screen acts on the exit.
  let leave: (ThreadSheetExit) -> Void

  @State private var model: ThreadSheetModel
  @State private var picking = false
  @State private var confirmDelete = false
  @State private var deleteFailure: ThreadDeleteFailure?
  @State private var clearingUnread = false
  @Environment(\.palette) private var palette
  @Environment(\.dismiss) private var dismiss

  init(
    chat: ChatModel, actions: ThreadActions, target: ThreadActionTarget, projectName: String?,
    directory: String?, leave: @escaping (ThreadSheetExit) -> Void
  ) {
    self.chat = chat
    self.actions = actions
    self.target = target
    self.projectName = projectName
    self.directory = directory
    self.leave = leave
    _model = State(initialValue: ThreadSheetModel(client: chat.client, sessionID: target.id))
  }

  var body: some View {
    List {
      Section {
        header
          .listRowInsets(EdgeInsets(top: 4, leading: 4, bottom: 12, trailing: 4))
        actionRow
          .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 4, trailing: 0))
      }
      .listRowBackground(Color.clear)
      .listRowSeparator(.hidden)

      Section {
        ThreadSheetModelRow(chat: chat, open: { picking = true })
        contextRow
        costRow
      }

      Section { panels }

      Section {
        Toggle(isOn: mutedBinding) {
          Label("Mute notifications", systemImage: "bell.slash")
        }
        .disabled(actions.isBusy(target.id, "mute"))
        .accessibilityIdentifier("sheet.notifications")
      }

      Section {
        row("Rename thread", icon: "pencil", id: "sheet.rename") { actions.beginRename(target) }
          .disabled(actions.isBusy(target.id, "rename"))
        row(
          target.done ? "Mark as not done" : "Mark as done",
          icon: target.done ? "arrow.uturn.backward.circle" : "checkmark.circle", id: "sheet.done"
        ) {
          actions.focus(target.done ? .undone : .done, target)
        }
        // "Available when the thread finishes"
        .disabled(actions.isBusy(target.id, "focus") || (!target.done && target.running))
      }

      Section {
        Button(role: .destructive) {
          confirmDelete = true
        } label: {
          HStack {
            Label("Delete thread", systemImage: "trash")
            Spacer()
            if model.deleting { ProgressView() }
          }
          .foregroundStyle(palette.color("error"))
        }
        .disabled(model.deleting)
        .accessibilityIdentifier("sheet.delete")
      }
    }
    .listStyle(.insetGrouped)
    .tint(palette.color("accent"))
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .accessibilityIdentifier("thread.sheet")
    .threadActionsHost(actions)
    .confirmationDialog("Delete this thread?", isPresented: $confirmDelete, titleVisibility: .visible) {
      Button("Delete thread", role: .destructive) { delete() }
        .accessibilityIdentifier("sheet.delete.confirm")
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("“\(target.title)” and its history are deleted from OpenCode. This can’t be undone.")
    }
    .alert(
      deleteFailure?.title ?? "", isPresented: Binding(
        get: { deleteFailure != nil }, set: { if !$0 { deleteFailure = nil } })
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(deleteFailure?.message ?? "")
    }
    .sheet(isPresented: $picking) { ThreadSheetModelPicker(chat: chat) }
    .task { await model.loadCost() }
    // A finished run changes the cost.
    .onChange(of: chat.running) { _, running in
      if !running { Task { await model.loadCost() } }
    }
  }

  // MARK: Header

  private var header: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 8) {
        if chat.running { ProgressView().accessibilityLabel("Working") }
        Text(target.title)
          .font(.title2.bold())
          .foregroundStyle(palette.color("text"))
          .lineLimit(2)
      }
      if let subtitle {
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(palette.color("text-secondary"))
          .lineLimit(1)
          .truncationMode(.middle)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("sheet.title")
  }

  private var subtitle: String? {
    let parts = [projectName, directory.map(shortPath)].compactMap { $0 }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }

  // MARK: Actions

  private var unreadMarker: String? {
    chat.session.flatMap { ThreadSession($0).unread }
  }

  private var actionRow: some View {
    let id = target.id
    return HStack(alignment: .top, spacing: 0) {
      ThreadSheetAction(
        target.pinned ? "Unpin" : "Pin", icon: target.pinned ? "pin.slash" : "pin",
        selected: target.pinned, busy: actions.isBusy(id, "focus"), id: "sheet.pin"
      ) {
        actions.focus(target.pinned ? .unpin : .pin, target)
      }
      ThreadSheetAction(
        unreadMarker == nil ? "Unread" : "Read",
        icon: unreadMarker == nil ? "circlebadge" : "circlebadge.fill",
        selected: unreadMarker != nil, busy: actions.isBusy(id, "unread") || clearingUnread,
        id: "sheet.unread"
      ) {
        if let marker = unreadMarker { clearUnread(marker) } else { actions.markUnread(target) }
      }
      ThreadSheetAction(
        target.muted ? "Unmute" : "Mute", icon: target.muted ? "bell" : "bell.slash",
        selected: target.muted, busy: actions.isBusy(id, "mute"), id: "sheet.mute"
      ) {
        actions.setMuted(target, !target.muted)
      }
      ThreadSheetAction(
        "Compact", icon: "arrow.down.right.and.arrow.up.left", busy: model.compacting,
        id: "sheet.compact"
      ) {
        model.compact(chat)
        dismiss()
      }
      ThreadSheetAction(
        "Fork", icon: "arrow.triangle.branch", busy: actions.isBusy(id, "fork"), id: "sheet.fork"
      ) {
        // Opens the fork once it's made; `ChatScreen` routes `onOpen` through `leave`.
        actions.fork(target)
      }
      ThreadSheetAction(
        "Export", icon: "square.and.arrow.up", busy: actions.isBusy(id, "export"), id: "sheet.export",
        menu: {
          Button("Export as Markdown", systemImage: "doc.text") { actions.export(target, .markdown) }
          Button("Export as JSON", systemImage: "curlybraces") { actions.export(target, .json) }
        })
    }
  }

  private func clearUnread(_ marker: String) {
    clearingUnread = true
    Task {
      defer { clearingUnread = false }
      do {
        try await chat.client.clearUnread(target.id, marker: marker)
        chat.refreshSession()
      } catch {
        actions.failure = .init(
          title: "Could not mark this thread as read", message: error.localizedDescription)
      }
    }
  }

  private var mutedBinding: Binding<Bool> {
    Binding(get: { target.muted }, set: { actions.setMuted(target, $0) })
  }

  // MARK: Model, context, cost

  private var contextRow: some View {
    let reading = ContextUsage.reading(
      messages: chat.messages, fallback: chat.session?.model,
      models: chat.projectDirectory.flatMap { ModelCatalogStore.shared.entries[$0]?.catalog?.data })
    return LabeledContent {
      HStack(spacing: 6) {
        ContextRing(ratio: reading.ratio, size: 18)
        Text(reading.ratio.map(DetailsFormat.percent) ?? "—")
          .monospacedDigit()
          .foregroundStyle(palette.color("text-secondary"))
      }
    } label: {
      Label("Context", systemImage: "chart.pie")
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("sheet.context")
  }

  @ViewBuilder private var costRow: some View {
    switch model.cost {
    case .loaded(let total) where total > 0:
      costContent(DetailsFormat.money(total))
    case .failed:
      costContent("Unavailable")
    default:
      EmptyView()
    }
  }

  private func costContent(_ value: String) -> some View {
    LabeledContent {
      Text(value)
        .monospacedDigit()
        .foregroundStyle(palette.color("text-secondary"))
    } label: {
      Label("Cost", systemImage: "dollarsign.circle")
    }
    .accessibilityElement(children: .combine)
    .accessibilityHint("This thread and all its subagents.")
    .accessibilityIdentifier("sheet.cost")
  }

  // MARK: Panels

  @ViewBuilder private var panels: some View {
    row("Files and changes", icon: "folder", id: "workspace-open") { leave(.panel(.workspace)) }
      .disabled(directory == nil)
    Button {
      leave(.panel(.subagents))
    } label: {
      LabeledContent {
        if running > 0 {
          Text("\(running) running").foregroundStyle(palette.color("text-secondary"))
        }
      } label: {
        Label { Text("Subagents") } icon: { Image("Robot") }
      }
      .foregroundStyle(palette.color("text"))
    }
    .accessibilityIdentifier("chat.subagents")
    row("Side chat", icon: "bubble.left.and.text.bubble.right", id: "sheet.sidechat") {
      leave(.panel(.sideChat))
    }
    row("Terminal", icon: "apple.terminal", id: "sheet.terminal") { leave(.panel(.terminal)) }
      .disabled(directory == nil)
    row("Session details", icon: "info.circle", id: "sheet.details") { leave(.panel(.details)) }
  }

  private var running: Int { chat.activity.subagents.count }

  private func row(
    _ title: String, icon: String, id: String, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Label(title, systemImage: icon)
        .foregroundStyle(palette.color("text"))
    }
    .accessibilityIdentifier(id)
  }

  // MARK: Delete

  private func delete() {
    Task {
      do {
        try await model.delete()
        leave(.deleted)
      } catch let failure as ThreadDeleteFailure {
        deleteFailure = failure
      } catch {
        deleteFailure = .init(title: "Could not delete this thread", message: error.localizedDescription)
      }
    }
  }
}

/// One of the sheet's round actions: a Liquid Glass button with its label under it.
private struct ThreadSheetAction<Items: View>: View {
  let title: String
  let icon: String
  var selected = false
  var busy = false
  let id: String
  let action: (() -> Void)?
  let menu: Items?
  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled

  init(
    _ title: String, icon: String, selected: Bool = false, busy: Bool = false, id: String,
    action: @escaping () -> Void
  ) where Items == EmptyView {
    self.title = title
    self.icon = icon
    self.selected = selected
    self.busy = busy
    self.id = id
    self.action = action
    self.menu = nil
  }

  init(
    _ title: String, icon: String, busy: Bool = false, id: String,
    @ViewBuilder menu: () -> Items
  ) {
    self.title = title
    self.icon = icon
    self.busy = busy
    self.id = id
    self.action = nil
    self.menu = menu()
  }

  var body: some View {
    VStack(spacing: 6) {
      Group {
        if let menu {
          Menu { menu } label: { glyph }
        } else {
          Button { action?() } label: { glyph }
        }
      }
      .buttonStyle(.glass)
      .buttonBorderShape(.circle)
      .disabled(busy)
      .accessibilityLabel(title)
      .accessibilityAddTraits(selected ? .isSelected : [])
      .accessibilityIdentifier(id)
      Text(title)
        .font(.caption)
        .foregroundStyle(palette.color("text-secondary"))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .accessibilityHidden(true)
    }
    .frame(maxWidth: .infinity)
  }

  private var glyph: some View {
    ZStack {
      if busy {
        ProgressView()
      } else {
        Image(systemName: icon)
          .font(.system(size: 18, weight: .regular))
          .foregroundStyle(palette.color(selected ? "accent" : "text"))
      }
    }
    .frame(width: 32, height: 32)
  }
}
