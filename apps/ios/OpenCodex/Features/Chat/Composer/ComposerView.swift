import PhotosUI
import SwiftUI

/// The message composer: a growing input, attachments, the model chip, and Send/Steer/Stop.
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

  @State private var sending = false
  @State private var stopping = false
  @State private var moving = false
  @State private var encoding = 0
  @State private var sendError: String?
  @State private var attachError: String?
  @State private var sent = 0
  @State private var picking = false
  @State private var showPhotos = false
  @State private var showCamera = false
  @State private var photos: [PhotosPickerItem] = []
  @State private var confirmFullAccess = false
  @FocusState private var focused: Bool

  private var catalogs: ModelCatalogStore { .shared }
  private var entry: ModelCatalogStore.Entry? {
    model.projectDirectory.flatMap { catalogs.entries[$0] }
  }
  private var current: ModelRef? { model.currentModel(draft: draft, catalog: entry?.catalog) }

  private enum Primary { case send, steer, stop, idle }
  private var primary: Primary {
    if draft.hasContent { return model.running ? .steer : .send }
    return model.running ? .stop : .idle
  }

  var body: some View {
    VStack(spacing: 6) {
      ComposerStatus(
        running: model.running,
        blocking: model.blockingWork,
        pending: model.inbox.count,
        moving: moving,
        errors: notices,
        onBackground: { Task { await moveToBackground() } })
      VStack(alignment: .leading, spacing: 0) {
        if !draft.attachments.isEmpty || encoding > 0 {
          AttachmentStrip(attachments: draft.attachments, encoding: encoding) { attachment in
            draft.attachments.removeAll { $0.id == attachment.id }
          }
        }
        TextField("Message", text: $draft.text, axis: .vertical)
          .font(.body)
          .lineLimit(1...8)
          .focused($focused)
          .padding(.horizontal, 16)
          .padding(.top, 13)
          .padding(.bottom, 6)
          .accessibilityIdentifier("composer.input")
        toolbar
          // Compact chrome stops growing past xxxLarge; the controls offer the large content viewer.
          .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
          .padding(.horizontal, 8)
          .padding(.bottom, 8)
      }
      .background {
        // Tapping the composer's empty space focuses the input.
        Color.clear
          .contentShape(.rect(cornerRadius: 26))
          .onTapGesture { focused = true }
      }
      .glassEffect(.regular, in: .rect(cornerRadius: 26))
    }
    .padding(.horizontal, 10)
    .padding(.bottom, 6)
    .animation(.snappy(duration: 0.2), value: model.running)
    .animation(.snappy(duration: 0.2), value: notices.map(\.id))
    .animation(.snappy(duration: 0.2), value: draft.attachments.count + encoding)
    .sensoryFeedback(.impact(weight: .medium), trigger: sent)
    .task(id: model.projectDirectory) { await loadModels() }
    .sheet(isPresented: $picking) {
      ModelPicker(
        catalog: entry?.catalog,
        loading: entry?.loading ?? true,
        error: entry?.error,
        current: current,
        onSelect: { model.select($0, draft: draft, catalog: entry?.catalog) },
        onRetry: { Task { await loadModels(force: true) } }
      )
      .presentationDetents([.medium, .large])
      .presentationDragIndicator(.visible)
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
    .alert("Enable full access?", isPresented: $confirmFullAccess) {
      Button("Cancel", role: .cancel) {}
      Button("Enable Full Access", role: .destructive) {
        Task { await model.setFullAccess(true) }
      }
    } message: {
      Text(
        "Everything in this chat is approved automatically. The agent can change files outside the project and run commands without asking, including destructive ones. Pending approvals will be allowed. Only enable this for work you trust."
      )
    }
  }

  // MARK: Toolbar

  private var toolbar: some View {
    HStack(spacing: 4) {
      Menu {
        Button("Photo Library", systemImage: "photo.on.rectangle") { showPhotos = true }
        if CameraPicker.available {
          Button("Camera", systemImage: "camera") { showCamera = true }
        }
      } label: {
        Image(systemName: "plus")
          .font(.body.weight(.medium))
          .frame(width: 34, height: 34)
          .contentShape(.circle)
      }
      .foregroundStyle(.primary)
      .disabled(draft.attachments.count >= AttachmentEncoder.maxCount)
      .accessibilityShowsLargeContentViewer()
      .accessibilityLabel("Attach")
      .accessibilityIdentifier("composer.attach")

      ModelChip(name: modelName, thinking: thinking) {
        // The keyboard would otherwise return over the sheet's menus.
        focused = false
        picking = true
      }

      Spacer(minLength: 4)

      if model.session?.fullAccess == true {
        Image(systemName: "exclamationmark.shield.fill")
          .font(.subheadline)
          .foregroundStyle(.orange)
          .accessibilityLabel("Full access is on")
      }
      moreMenu
      primaryButton
    }
  }

  private var moreMenu: some View {
    Menu {
      Section {
        Toggle(isOn: fullAccess) {
          Label("Full access", systemImage: "exclamationmark.shield")
          Text(
            model.sessionID == nil
              ? "Available after the first message"
              : "Approve everything in this chat")
        }
        .disabled(model.sessionID == nil || model.session == nil)
      }
    } label: {
      Image(systemName: "ellipsis")
        .font(.body.weight(.medium))
        .frame(width: 34, height: 34)
        .contentShape(.circle)
    }
    .foregroundStyle(.primary)
    .accessibilityShowsLargeContentViewer()
    .accessibilityLabel("More")
    .accessibilityIdentifier("composer.more")
  }

  private var fullAccess: Binding<Bool> {
    Binding {
      model.session?.fullAccess ?? false
    } set: { on in
      if on {
        confirmFullAccess = true
      } else {
        Task { await model.setFullAccess(false) }
      }
    }
  }

  @ViewBuilder private var primaryButton: some View {
    let stop = primary == .stop
    Button {
      if stop {
        Task { await self.stop() }
      } else {
        Task { await send() }
      }
    } label: {
      ZStack {
        if sending || stopping {
          ProgressView().controlSize(.small).tint(.white)
        } else {
          Image(systemName: stop ? "stop.fill" : "arrow.up")
            .font(.system(size: stop ? 13 : 16, weight: .bold))
            .contentTransition(.symbolEffect(.replace))
        }
      }
      .foregroundStyle(primary == .idle ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.white))
      .frame(width: 34, height: 34)
      .background(
        primary == .idle ? AnyShapeStyle(.fill.tertiary) : AnyShapeStyle(.tint), in: .circle)
      .contentShape(.circle)
    }
    .buttonStyle(.plain)
    .disabled(primary == .idle || sending || stopping || encoding > 0)
    .accessibilityShowsLargeContentViewer()
    .accessibilityLabel(stop ? "Stop" : primary == .steer ? "Send now" : "Send")
    .accessibilityHint(primary == .steer ? "Steers the reply that’s running." : "")
    .accessibilityIdentifier(stop ? "composer.stop" : "composer.send")
  }

  // MARK: Derived

  private var modelName: String {
    if let current {
      return entry?.catalog?.data.first { $0.ref.key == current.key }?.name ?? current.id
    }
    if entry?.error != nil { return "Models unavailable" }
    return entry?.catalog == nil ? "Loading…" : "Choose model"
  }

  private var thinking: String? {
    guard let current,
      let variants = entry?.catalog?.data.first(where: { $0.ref.key == current.key })?.variants,
      !variants.isEmpty
    else { return nil }
    return thinkingLabel(current.thinking)
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
    guard !sending, encoding == 0, draft.hasContent else { return }
    let snapshot = draft.capture()
    let text = snapshot.text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard text.count <= 200_000 else {
      sendError = "The draft is too long. Shorten it before sending."
      return
    }
    sending = true
    sent += 1
    sendError = nil
    defer { sending = false }
    let selection = current
    let steering = model.running
    if let selection, let directory = model.projectDirectory {
      ModelPreferences.shared.rememberModel(selection, directory: directory)
    }
    do {
      try await model.send(
        text, model: selection,
        files: snapshot.attachments.map { .init(name: $0.name, uri: $0.uri) })
      draft.acknowledge(snapshot)
      // Like OpenCode's app: a message sent mid-run steers, which waits for blocking calls to
      // end, so move them to the background and let the agent read it at its next step.
      if steering, !model.blockingWork.isEmpty { await moveToBackground() }
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
