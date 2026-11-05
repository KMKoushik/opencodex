import PhotosUI
import SwiftUI

/// The message composer, matching the desktop's `composer.tsx` at phone width: the input,
/// then the model controls on their own row (context ring, model chip, thinking), then
/// attach, Permissions, Stop and Send. A pending question takes the composer's place, as on
/// the desktop.
struct ComposerView: View {
  let model: ChatModel

  var body: some View {
    ComposerBody(model: model, draft: draft)
  }

  /// A new chat's draft follows it to the session its first send creates.
  private var draft: Draft {
    let store = DraftStore.shared
    let key = DraftStore.key(sessionID: model.sessionID, directory: model.directory)
    if model.sessionID != nil, model.directory != nil {
      store.move(from: DraftStore.key(sessionID: nil, directory: model.directory), to: key)
    }
    return store.draft(key)
  }
}

private struct ComposerBody: View {
  let model: ChatModel
  @Bindable var draft: Draft

  @Environment(\.palette) private var palette
  @Environment(\.composerNavigation) private var navigation
  /// Settings → Appearance → Chat font size applies to the prompt too, like the desktop.
  @AppStorage(ChatFontSize.key) private var chatSize = ChatFontSize.standard

  @State private var sending = false
  @State private var stopping = false
  @State private var moving = false
  @State private var encoding = 0
  @State private var sendError: String?
  @State private var attachError: String?
  @State private var sent = 0
  @State private var picking = false
  @State private var confirmFullAccess = false
  @State private var showPhotos = false
  @State private var showCamera = false
  @State private var photos: [PhotosPickerItem] = []
  @State private var selection: TextSelection?
  @State private var dismissedMenu = false
  @State private var forkDraft: Draft.Snapshot?
  @State private var exported: ExportFile?
  @State private var mentions = MentionSearch()
  /// Room above the composer for the `/` and `@` menus.
  @State private var menuRoom: CGFloat = 280
  @FocusState private var focused: Bool

  private struct ExportFile: Identifiable {
    var url: URL
    var id: URL { url }
  }

  private var catalogs: ModelCatalogStore { .shared }
  private var entry: ModelCatalogStore.Entry? {
    model.projectDirectory.flatMap { catalogs.entries[$0] }
  }
  private var current: ModelRef? { model.currentModel(draft: draft, catalog: entry?.catalog) }
  private var currentInfo: ModelCatalog.Model? {
    guard let current else { return nil }
    return entry?.catalog?.data.first { $0.ref.key == current.key }
  }

  var body: some View {
    VStack(spacing: 6) {
      ComposerStatus(pending: model.inbox.count, errors: notices)
      if let form = model.forms.first {
        QuestionDock(model: model, form: form, pendingCount: model.forms.count)
          .id(form.id)
          .transition(.opacity)
      } else {
        composer
      }
    }
    .padding(.horizontal, 12)
    .padding(.bottom, 8)
    .animation(.snappy(duration: 0.2), value: model.running)
    .animation(.snappy(duration: 0.2), value: notices.map(\.id))
    .animation(.snappy(duration: 0.2), value: draft.attachments.count + encoding)
    .animation(.snappy(duration: 0.2), value: model.forms.first?.id)
    .sensoryFeedback(.impact(weight: .medium), trigger: sent)
    .task(id: model.projectDirectory) { await loadModels() }
    .sheet(isPresented: $picking) {
      ModelPicker(
        catalog: entry?.catalog,
        canonical: entry?.canonical ?? [:],
        loading: entry?.loading ?? true,
        error: entry?.error,
        current: current,
        onSelect: { model.select($0, draft: draft, catalog: entry?.catalog) },
        onRetry: { Task { await loadModels(force: true) } }
      )
      .presentationDetents([.medium, .large])
      .presentationDragIndicator(.visible)
    }
    .sheet(item: $exported) { file in
      ShareSheet(items: [file.url])
        .presentationDetents([.medium, .large])
    }
    .photosPicker(
      isPresented: $showPhotos, selection: $photos,
      maxSelectionCount: max(1, AttachmentEncoder.maxCount - draft.attachments.count),
      matching: .images)
    .onChange(of: photos) { _, items in
      guard !items.isEmpty else { return }
      photos = []
      Task { await attach(items) }
    }
    .fullScreenCover(isPresented: $showCamera) {
      CameraPicker { image in Task { await attach(image) } }
        .ignoresSafeArea()
    }
    .confirmationDialog(
      "Fork conversation", isPresented: forkPicking, titleVisibility: .visible
    ) {
      Button(sending ? "Forking…" : "Fork from latest") { fork(before: nil) }
      ForEach(model.visibleUserMessages(boundary: nil).reversed().prefix(20), id: \.id) { message in
        Button("Before: \(message.text.isEmpty ? "Attachments" : message.text)") {
          fork(before: message.id)
        }
      }
      Button("Cancel", role: .cancel) { forkDraft = nil }
    } message: {
      Text("Continue in a new thread from the latest state, or fork just before an earlier message.")
    }
    .onChange(of: draft.wantsFocus, initial: true) { _, wants in
      guard wants else { return }
      draft.wantsFocus = false
      focusAtEnd()
    }
    .onChange(of: mentionQuery?.query) { _, query in
      mentions.update(model.client, directory: model.projectDirectory, query: query)
    }
    .onChange(of: commandSearch) { _, searching in
      if searching, let directory = model.projectDirectory {
        Task { await SlashCatalogStore.shared.load(model.client, directory: directory) }
      }
    }
  }

  // MARK: Composer

  /// Like OpenCode's iPhone composer: a Liquid Glass capsule that's one line ("+ Message ↑")
  /// until you focus it or type; then the model row appears under the input.
  private var expanded: Bool {
    focused || draft.hasContent || !draft.attachments.isEmpty || encoding > 0
  }

  private var composer: some View {
    VStack(alignment: .leading, spacing: 0) {
      if !draft.attachments.isEmpty || encoding > 0 {
        AttachmentStrip(attachments: draft.attachments, encoding: encoding) { attachment in
          draft.attachments.removeAll { $0.id == attachment.id }
        }
        .padding(EdgeInsets(top: 4, leading: 6, bottom: 10, trailing: 6))
      }
      // The input keeps one position in both layouts, so it never loses focus as they swap.
      HStack(alignment: .center, spacing: 2) {
        if !expanded {
          plusMenu
        }
        TextField(
          "Message", text: $draft.text, selection: $selection,
          prompt: Text(model.isSideChat ? "Ask a side question" : "Message")
            .foregroundStyle(palette.color("text-tertiary")),
          axis: .vertical
        )
        // The transcript's prose size: the desktop's px scaled 16/14, with Dynamic Type.
        .font(Font(Typography(UITraitCollection.current, chatSize: chatSize).body))
        .foregroundStyle(palette.color("text"))
        .lineLimit(expanded ? 1...8 : 1...1)
        .focused($focused)
        .padding(.vertical, expanded ? 6 : 0)
        .padding(.leading, expanded ? 8 : 0)
        .accessibilityIdentifier("composer.input")
        .onChange(of: draft.text) { dismissedMenu = false }
        if !expanded {
          if model.running { stopButton }
          sendButton
        }
      }
      if expanded {
        footer
          // Compact chrome stops growing past xxxLarge; the controls offer the large content viewer.
          .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
          .transition(.opacity.combined(with: .move(edge: .bottom)))
      }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .frame(minHeight: 52)
    .background {
      // Tapping the composer's empty space focuses the input.
      Color.clear
        .contentShape(.rect(cornerRadius: 26))
        .onTapGesture { focused = true }
    }
    .glassEffect(.regular.interactive(), in: .rect(cornerRadius: expanded ? 24 : 26))
    .animation(.snappy(duration: 0.22), value: expanded)
    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { top in
      // Below the navigation bar, at most the desktop's 320 px.
      menuRoom = min(320, max(132, top - 132))
    }
    .overlay(alignment: .top) {
      menu
        .alignmentGuide(.top) { $0[.bottom] + 8 }
    }
  }

  /// One row, like OpenCode's composer: attach and access in "+", the model and thinking level
  /// as one quiet menu, then Stop and Send. Context usage lives in Session details.
  private var footer: some View {
    HStack(spacing: 2) {
      plusMenu
        .padding(.leading, -10)

      modelMenu
        .layoutPriority(-1)

      Spacer(minLength: 4)

      if model.running {
        stopButton
      }
      sendButton
    }
    .alert("Enable full access?", isPresented: $confirmFullAccess) {
      Button("Cancel", role: .cancel) {}
      Button("Enable full access") { setFullAccess(true) }
    } message: {
      Text(
        "This agent can read and change files outside the project and run commands without approval, including destructive commands and access to secrets. Only enable this for work you trust.\n\nApplies to this thread and new subagents. Existing subagents keep their own permissions. Pending approvals in this thread will be allowed. Your global OpenCode settings stay unchanged; server policies still apply."
      )
    }
  }

  /// "+": attachments, then Full access (the desktop's Permissions control).
  private var plusMenu: some View {
    Menu {
      Button("Photo Library", systemImage: "photo.on.rectangle") { showPhotos = true }
        .disabled(draft.attachments.count >= AttachmentEncoder.maxCount)
      if CameraPicker.available {
        Button("Camera", systemImage: "camera") { showCamera = true }
          .disabled(draft.attachments.count >= AttachmentEncoder.maxCount)
      }
      Divider()
      // The desktop's Permissions control: turning full access on asks first.
      Toggle(isOn: fullAccessBinding) {
        Label("Full access", systemImage: fullAccess ? "bolt.shield" : "shield")
      }
      .disabled(sending || (model.session == nil && model.sessionID != nil))
    } label: {
      Image(systemName: "plus")
        .font(.system(size: 18, weight: .regular))
        .foregroundStyle(palette.color("text-secondary"))
        .overlay(alignment: .topTrailing) {
          if fullAccess {
            // Full access is on: a small reminder, like the desktop's accent Permissions label.
            Image(systemName: "bolt.shield.fill")
              .font(.system(size: 10))
              .foregroundStyle(palette.color("warning"))
              .offset(x: 8, y: -6)
          }
        }
        .frame(width: 44, height: 44)
        .contentShape(.rect)
    }
    .accessibilityShowsLargeContentViewer()
    .accessibilityLabel(fullAccess ? "Attach and permissions, full access on" : "Attach and permissions")
    .accessibilityIdentifier("composer.attach")
  }

  /// "Claude Opus 5.5 · High": choose the model, or the thinking level in place.
  private var modelMenu: some View {
    let variants = currentInfo?.variants?.map(\.id) ?? []
    return Menu {
      Button("Choose model…", systemImage: "cpu") {
        // The keyboard would otherwise return over the sheet's menus.
        focused = false
        picking = true
      }
      .disabled(entry?.catalog == nil)
      if !variants.isEmpty {
        Picker(
          "Thinking",
          selection: Binding(
            get: { current?.thinking },
            set: { variant in
              if let current {
                model.select(current.with(variant: variant), draft: draft, catalog: entry?.catalog)
              }
            })
        ) {
          Text("Default").tag(String?.none)
          ForEach(variants, id: \.self) { Text(thinkingLabel($0)).tag(Optional($0)) }
        }
        .pickerStyle(.inline)
      }
    } label: {
      HStack(spacing: 5) {
        (Text(modelName)
          + Text(variants.isEmpty ? "" : " · \(thinkingLabel(current?.thinking))"))
          .lineLimit(1)
          .truncationMode(.middle)
        Image(systemName: "chevron.down")
          .font(.system(size: 11, weight: .medium))
      }
      .font(.subheadline)
      .foregroundStyle(palette.color("text-tertiary"))
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .disabled(sending || entry?.catalog == nil)
    .accessibilityIdentifier("composer.model")
    .accessibilityLabel("Model")
    .accessibilityValue(modelName)
  }

  private var fullAccess: Bool {
    model.sessionID == nil ? draft.fullAccess : (model.session?.fullAccess ?? false)
  }

  private var fullAccessBinding: Binding<Bool> {
    Binding(
      get: { fullAccess },
      set: { on in
        if on { confirmFullAccess = true } else { setFullAccess(false) }
      })
  }

  private func setFullAccess(_ on: Bool) {
    if model.sessionID == nil {
      draft.fullAccess = on
    } else {
      Task { await model.setFullAccess(on) }
    }
  }

  private var stopButton: some View {
    Button {
      Task { await stop() }
    } label: {
      Image(systemName: "stop")
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(palette.color("text"))
        .frame(width: 36, height: 36)
        .ceramic("chip", shadow: "chip-shadow", border: "chip-border", radius: 12)
        .frame(width: 44, height: 44)
        .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(stopping)
    .accessibilityShowsLargeContentViewer()
    .accessibilityLabel("Stop")
    .accessibilityIdentifier("composer.stop")
  }

  @ViewBuilder private var sendButton: some View {
    let enabled = draft.hasContent && !sending && encoding == 0 && ready
    Button {
      Task { await send() }
    } label: {
      ZStack {
        if sending {
          ProgressView().controlSize(.small).tint(palette.color("on-primary"))
        } else {
          Image(systemName: "arrow.up")
            .font(.system(size: 16, weight: .medium))
        }
      }
      .foregroundStyle(palette.color(enabled || sending ? "on-primary" : "text-tertiary"))
      .frame(width: 36, height: 36)
      .modifier(SendSurface(glazed: enabled || sending))
      .frame(width: 44, height: 44)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .accessibilityShowsLargeContentViewer()
    .accessibilityLabel("Send message")
    .accessibilityHint(model.running ? "Steers the reply that’s running." : "")
    .accessibilityIdentifier("composer.send")
  }

  /// The glaze with its wet highlight, or an unglazed chip while there's nothing to send.
  private struct SendSurface: ViewModifier {
    var glazed: Bool
    @Environment(\.palette) private var palette

    func body(content: Content) -> some View {
      if glazed {
        content
          .background(alignment: .top) {
            UnevenRoundedRectangle(
              topLeadingRadius: 10, bottomLeadingRadius: 6, bottomTrailingRadius: 6,
              topTrailingRadius: 10, style: .continuous
            )
            .fill(palette.gradient("primary-sheen"))
            .frame(height: 36 * 0.42)
            .padding(.horizontal, 4)
            .padding(.top, 2)
          }
          .ceramic("primary-glaze", shadow: "primary-shadow", radius: 12)
      } else {
        content.ceramic("chip", shadow: "chip-shadow", border: "chip-border", radius: 12)
      }
    }
  }

  // MARK: Menus

  /// A bare `/query` while the input has focus.
  private var commandSearch: Bool {
    focused && !dismissedMenu && SlashCommand.isSearch(draft.text)
  }

  /// The caret as a UTF-16 offset, when nothing is selected.
  private var caret: Int {
    let text = draft.text
    guard let indices = selection?.indices, case .selection(let range) = indices else {
      return text.utf16.count
    }
    guard range.isEmpty else { return -1 }
    let index = range.lowerBound
    guard index >= text.startIndex, index <= text.endIndex else { return text.utf16.count }
    return text.utf16.distance(from: text.startIndex, to: index)
  }

  private var mentionQuery: (start: Int, query: String)? {
    guard focused, !dismissedMenu, !SlashCommand.isSearch(draft.text) else { return nil }
    let caret = self.caret
    guard caret >= 0 else { return nil }
    return Mentions.query(draft.text, caret: caret)
  }

  @ViewBuilder private var menu: some View {
    if commandSearch {
      let catalog = model.projectDirectory.flatMap { SlashCatalogStore.shared.entries[$0] }
      let available = (catalog?.commands ?? SlashCommand.local).filter { command in
        // A new thread can't run thread actions, and /new needs the host to navigate.
        guard SlashCommand.localNames.contains(command.name), command.skill == nil else { return true }
        if model.sessionID == nil { return false }
        if model.isSideChat && sideChatHiddenCommands.contains(command.name) { return false }
        return command.name != "new" || navigation.newThread != nil
      }
      let commands = SlashCommand.match(available, String(draft.text.dropFirst()))
      ComposerMenu(
        label: "Slash commands", maxHeight: menuRoom,
        items: commands.map { command in
          .init(id: command.name, title: "/\(command.name)", detail: command.description) {
            choose(command)
          }
        }
      ) {
        if catalog?.commands == nil, catalog?.error == nil {
          ComposerMenuNote(text: "Loading project commands…")
        }
        if catalog?.error != nil {
          ComposerMenuNote(text: "Could not load commands. Retry") {
            if let directory = model.projectDirectory {
              Task { await SlashCatalogStore.shared.load(model.client, directory: directory, force: true) }
            }
          }
        }
        if commands.isEmpty, catalog?.commands != nil || catalog?.error != nil {
          ComposerMenuNote(text: "No matching commands")
        }
      }
    } else if let query = mentionQuery {
      let options = mentions.options(query: query.query, sessionID: model.sessionID)
      ComposerMenu(
        label: "Mentions", maxHeight: menuRoom,
        items: options.map { option in
          .init(
            id: option.id,
            icon: option.kind == .skill
              ? "square.stack.3d.up" : option.kind == .file ? "doc" : "bubble.left.and.bubble.right",
            title: option.label, detail: option.detail
          ) { choose(option, at: query.start) }
        }
      ) {
        if mentions.failed {
          ComposerMenuNote(text: "Some results could not load. Retry") {
            mentions.retry(model.client, directory: model.projectDirectory, query: query.query)
          }
        }
        if options.isEmpty, !mentions.failed {
          ComposerMenuNote(text: mentions.loading ? "Searching…" : "No matches")
        }
      }
    }
  }

  private func focusAtEnd() {
    focused = true
    selection = TextSelection(insertionPoint: draft.text.endIndex)
  }

  private func choose(_ command: SlashCommand) {
    draft.text = "/\(command.name) "
    dismissedMenu = true
    selection = TextSelection(insertionPoint: draft.text.endIndex)
  }

  private func choose(_ option: MentionOption, at start: Int) {
    let units = Array(draft.text.utf16)
    let caret = min(max(self.caret, start), units.count)
    let inserted = "\(option.mention.token) "
    var after = Array(units[caret...])
    if after.first == UInt16(UInt8(ascii: " ")) { after.removeFirst() }
    let before = String(decoding: units[..<start], as: UTF16.self)
    let text = before + inserted + String(decoding: after, as: UTF16.self)
    draft.mention(text, option.mention)
    let offset = (before + inserted).utf16.count
    let index = text.utf16.index(text.startIndex, offsetBy: offset)
    selection = TextSelection(insertionPoint: index)
  }

  // MARK: Derived

  private var ready: Bool { model.sessionID == nil || model.session != nil }

  private var modelName: String {
    if let currentInfo { return currentInfo.name }
    if let current { return current.id }
    if entry?.error != nil { return "Models unavailable" }
    if entry?.catalog == nil { return "Loading models…" }
    return entry?.catalog?.data.isEmpty == false ? "Choose model" : "No models available"
  }

  private var forkPicking: Binding<Bool> {
    Binding { forkDraft != nil } set: { if !$0 { forkDraft = nil } }
  }

  private var notices: [ComposerStatus.Notice] {
    var notices: [ComposerStatus.Notice] = []
    if let sendError {
      notices.append(.init(id: "send", text: sendError) { self.sendError = nil })
    }
    if let attachError {
      notices.append(.init(id: "attach", text: attachError) { self.attachError = nil })
    }
    if let error = model.error {
      notices.append(.init(id: "model", text: error) { model.error = nil })
    }
    return notices
  }

  // MARK: Actions

  private func loadModels(force: Bool = false) async {
    guard let directory = model.projectDirectory else { return }
    await catalogs.load(model.client, directory: directory, force: force)
  }

  private func send() async {
    guard !sending, encoding == 0, draft.hasContent, ready else { return }
    let snapshot = draft.capture()
    if snapshot.text.trimmingCharacters(in: .whitespacesAndNewlines) == "/fork",
      snapshot.attachments.isEmpty, model.sessionID != nil
    {
      focused = false
      forkDraft = snapshot
      return
    }
    await run(snapshot)
  }

  private func fork(before: String?) {
    guard let snapshot = forkDraft else { return }
    Task {
      await run(snapshot, fork: .some(before))
      forkDraft = nil
    }
  }

  private func run(_ snapshot: Draft.Snapshot, fork: String?? = nil) async {
    sending = true
    sent += 1
    sendError = nil
    defer { sending = false }
    let selection = current
    let steering = model.running
    let creating = model.sessionID == nil
    let fullAccess = draft.fullAccess
    if let selection, let directory = model.projectDirectory {
      ModelPreferences.shared.rememberModel(selection, directory: directory)
    }
    do {
      switch try await model.run(snapshot, model: selection, fork: fork) {
      case .sent:
        draft.acknowledge(snapshot)
        if creating, fullAccess { await model.setFullAccess(true) }
        // Like OpenCode's app: a message sent mid-run steers, which waits for blocking calls to
        // end, so move them to the background and let the agent read it at its next step.
        if steering, !model.blockingWork.isEmpty { await moveToBackground() }
      case .acknowledged:
        draft.acknowledge(snapshot)
      case .restored(let text, let attachments, let mentions):
        if draft.restore(snapshot, text: text, attachments: attachments, mentions: mentions) {
          focusAtEnd()
        }
      case .forkPicker:
        forkDraft = snapshot
      case .newThread:
        draft.acknowledge(snapshot)
        navigation.newThread?()
      case .opened(let id):
        draft.acknowledge(snapshot)
        navigation.openSession?(id)
      case .exported(let url):
        draft.acknowledge(snapshot)
        focused = false
        exported = ExportFile(url: url)
      }
    } catch {
      sendError = "\(error.localizedDescription) Your draft is kept."
    }
  }

  private func stop() async {
    guard !stopping else { return }
    stopping = true
    await model.stop()
    stopping = false
  }

  private func moveToBackground() async {
    guard !moving else { return }
    moving = true
    await model.moveToBackground()
    moving = false
  }

  private func attach(_ items: [PhotosPickerItem]) async {
    for item in items {
      encoding += 1
      defer { encoding -= 1 }
      do {
        guard let data = try await item.loadTransferable(type: Data.self) else {
          throw AttachmentEncoder.Failure(errorDescription: "This photo couldn’t be loaded.")
        }
        add(try await AttachmentEncoder.encode(data: data))
      } catch {
        attachError = error.localizedDescription
      }
    }
  }

  private func attach(_ image: UIImage) async {
    encoding += 1
    defer { encoding -= 1 }
    do {
      add(try await AttachmentEncoder.encode(image))
    } catch {
      attachError = error.localizedDescription
    }
  }

  private func add(_ encoded: AttachmentEncoder.Encoded) {
    let total = draft.attachments.reduce(0) { $0 + $1.bytes } + encoded.jpeg.count
    guard draft.attachments.count < AttachmentEncoder.maxCount else {
      attachError = "Attach up to \(AttachmentEncoder.maxCount) photos per message."
      return
    }
    guard total <= AttachmentEncoder.maxTotalBytes else {
      attachError = "Photos must total 80 MB or less per message."
      return
    }
    attachError = nil
    draft.attachments.append(DraftAttachment(encoded))
  }
}
