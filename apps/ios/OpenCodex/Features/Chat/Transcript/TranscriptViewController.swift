import Observation
import UIKit

/// Calls back after each layout pass, so the transcript can stay pinned to the end.
final class TranscriptCollectionView: UICollectionView {
  var didLayout: (() -> Void)?

  override func layoutSubviews() {
    super.layoutSubviews()
    didLayout?()
  }
}

/// The chat transcript: a virtualized UICollectionView fed by a diffable data source.
///
/// Snapshots (messages, running, inbox) re-project the timeline; streamed text only updates the
/// rows it belongs to, revealed by a display-link pacer, and only the streaming cell reconfigures.
final class TranscriptViewController: UIViewController, UICollectionViewDelegate,
  UICollectionViewDataSourcePrefetching
{
  /// Scrolling back within this distance of the end resumes following.
  private static let followBand: CGFloat = 40

  private let model: ChatModel
  private let layout = TranscriptLayout()
  private var collectionView: TranscriptCollectionView!
  private var dataSource: UICollectionViewDiffableDataSource<Int, String>!
  private let jump = UIButton(type: .system)

  // Projection
  private let projector = TimelineProjector()
  private let grouper = TurnGrouper()
  private let builder = TranscriptItemBuilder()
  /// Explicit open/closed choices per turn header; otherwise a turn is open only while it works.
  private var overrides: [String: Bool] = [:]
  private var projected: [TimelineRow] = []
  private var grouped: [SessionMessage] = []
  private var rows: [TimelineRow] = []
  /// Text and reasoning part IDs, activity, tool and shell IDs → index in `rows`.
  private var rowIndex: [String: Int] = [:]
  private var segments: [[TranscriptItem]] = []
  private var items: [String: TranscriptItem] = [:]
  private var order: [String] = []
  private var positions: [String: Int] = [:]
  private var gaps: [String: CGFloat] = [:]
  private var estimates: [String: CGFloat] = [:]
  private var typography = Typography.current
  private var theme = TranscriptTheme.fallback
  private var palette: Palette?
  /// The last run's failure from `session.execution.failed`, until the next run starts, like the
  /// desktop's `execution-error` query.
  private var executionError: String?
  /// The session's outcome is from before the run that just started, until a session
  /// snapshot arrives after it ends, so a finished run never re-shows the last failure.
  private var staleOutcome = false
  /// The outcome and side-chat state the footer last showed, to reassemble only on change.
  private var footerState: (failed: Bool, side: Bool) = (false, false)
  private var executionEvents: Subscription?
  private var reconnects: Subscription?
  /// Opens a workspace file a link points at; the SwiftUI host shows it in a sheet.
  var onOpenFile: ((FileLinkTarget) -> Void)?
  /// One ticker for the list: advances working turn headers each second.
  private var ticker: Timer?

  // Streaming
  private var liveKeys: Set<ChatModel.LiveKey> = []
  private var liveText: [String: String] = [:]
  private var snapshotText: [String: String] = [:]
  private var displayed: [String: String] = [:]
  private var pacers: [String: PacedText] = [:]
  private var displayLink: CADisplayLink?
  private let hitches = HitchMonitor()
  private var lastTick: CFTimeInterval = 0

  // Scrolling
  private var following = true
  private var userScrolling = false
  private var animatingToEnd = false
  private var lastOffset: CGFloat = 0
  private var sends = 0
  private var requestingOlder = false
  private var visibleHeight: CGFloat = 0

  init(model: ChatModel) {
    self.model = model
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) { fatalError() }

  deinit {
    MainActor.assumeIsolated {
      displayLink?.invalidate()
      ticker?.invalidate()
      if let fontObserver { NotificationCenter.default.removeObserver(fontObserver) }
    }
  }

  /// The active theme from the SwiftUI environment. A change re-renders the visible rows;
  /// rendered text is cached per theme, so switching back is free.
  func setPalette(_ palette: Palette) {
    self.palette = palette
    guard palette.id != theme.id else { return }
    theme = TranscriptTheme(palette)
    guard isViewLoaded else { return }
    styleChrome()
    var snapshot = dataSource.snapshot()
    snapshot.reconfigureItems(snapshot.itemIdentifiers)
    dataSource.apply(snapshot, animatingDifferences: false)
  }

  private func styleChrome() {
    jump.configuration?.baseForegroundColor = theme.text
    collectionView.indicatorStyle = theme.dark ? .white : .black
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    typography = Typography(traitCollection)
    layout.metrics = { [unowned self] index in
      guard index < order.count else { return nil }
      let id = order[index]
      return .init(id: id, gap: gaps[id] ?? 0, estimate: estimates[id] ?? 44)
    }
    layout.following = { [unowned self] in following }
    collectionView = TranscriptCollectionView(frame: view.bounds, collectionViewLayout: layout)
    collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    collectionView.backgroundColor = .clear
    collectionView.alwaysBounceVertical = true
    collectionView.keyboardDismissMode = .interactive
    collectionView.contentInsetAdjustmentBehavior = .always
    collectionView.delegate = self
    collectionView.prefetchDataSource = self
    collectionView.accessibilityIdentifier = "transcript"
    collectionView.didLayout = { [unowned self] in didLayout() }
    view.addSubview(collectionView)
    configureDataSource()
    configureJumpButton()
    styleChrome()
    sends = model.sends
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (self: TranscriptViewController, _: UITraitCollection) in
      self.typographyChanged()
    }
    // Settings → Appearance → Chat font size, which may change while this chat is open.
    fontObserver = NotificationCenter.default.addObserver(
      forName: UserDefaults.didChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self, ChatFontSize.current != self.typography.chatSize else { return }
        self.typographyChanged()
      }
    }
    observeSnapshot()
    observeLive()
    observeSends()
    observeExecution()
    observeSession()
    liveChanged(reproject: false)
    reproject()
  }

  // MARK: Observation

  private func observeSnapshot() {
    withObservationTracking {
      _ = model.messages
      _ = model.undone
      _ = model.running
      _ = model.inbox
      _ = model.hasOlder
      _ = model.loadingOlder
      _ = model.loaded
    } onChange: { [weak self] in
      Task { @MainActor in
        guard let self else { return }
        self.observeSnapshot()
        self.reproject()
      }
    }
  }

  private func observeExecution() {
    executionEvents = model.events.subscribe { [weak self] event in
      guard let self, let id = self.model.sessionID, event.sessionID == id else { return }
      switch event.type {
      case "session.execution.failed":
        self.executionError = event.data?["error"]?["message"]?.string
        self.assemble(animated: false)
      case "session.execution.started":
        self.staleOutcome = true
        guard self.executionError != nil else { return }
        self.executionError = nil
        self.assemble(animated: false)
      default: break
      }
    }
    // Like the desktop, a reconnect forgets the last failure: the refetched session's outcome
    // still shows the generic footer if the run failed.
    reconnects = model.events.onReconnect { [weak self] in
      guard let self, self.executionError != nil else { return }
      self.executionError = nil
      self.assemble(animated: false)
    }
  }

  /// The footer reads the session's outcome and side-chat state, which change without the
  /// messages changing (the session refetch lands after the run's last messages).
  private func observeSession() {
    withObservationTracking {
      _ = model.session
    } onChange: { [weak self] in
      Task { @MainActor in
        guard let self else { return }
        self.observeSession()
        let wasStale = self.staleOutcome
        if !self.model.running { self.staleOutcome = false }
        let state = (failed: self.model.session?.outcome == "failed", side: self.model.isSideChat)
        guard state != self.footerState || wasStale != self.staleOutcome else { return }
        self.footerState = state
        self.assemble(animated: false)
      }
    }
  }

  private func observeLive() {
    withObservationTracking {
      _ = model.live
    } onChange: { [weak self] in
      Task { @MainActor in
        guard let self else { return }
        self.observeLive()
        self.liveChanged(reproject: true)
      }
    }
  }

  private func observeSends() {
    withObservationTracking {
      _ = model.sends
    } onChange: { [weak self] in
      Task { @MainActor in
        guard let self else { return }
        self.observeSends()
        guard self.model.sends != self.sends else { return }
        self.sends = self.model.sends
        // Sending jumps to the end and resumes following.
        self.setFollowing(true)
        self.scrollToEnd(animated: true)
      }
    }
  }

  // MARK: Projection

  private func reproject() {
    // A reply streams for as long as the chat runs.
    if model.running {
      hitches.begin("stream")
    } else if displayLink == nil && !userScrolling {
      hitches.end()
    }
    let messages = withLiveParts(model.messages, live: liveKeys)
    projected = projector.project(messages)
    grouped = messages
    regroup(animated: false)
  }

  private func regroup(animated: Bool) {
    rows = grouper.group(projected, messages: grouped, running: model.running, overrides: overrides)
    #if DEBUG
      // `-transcriptExpand YES` opens every turn, group, tool and shell, for screenshots.
      if UserDefaults.standard.bool(forKey: "transcriptExpand") {
        for row in rows {
          if case .turn(let turn) = row, !turn.open, overrides[turn.id] == nil {
            overrides[turn.id] = true
            return regroup(animated: animated)
          }
          if case .activity(let activity) = row {
            builder.open.insert(activity.id)
            for entry in activity.entries { builder.open.insert(entry.id) }
          }
          if case .message(.shell(let shell)) = row { builder.open.insert(shell.id) }
        }
      }
    #endif
    rebuild(animated: animated)
  }

  /// Rebuilds every row's items (cheap: Markdown splits are cached) and applies them.
  private func rebuild(animated: Bool) {
    rowIndex.removeAll(keepingCapacity: true)
    segments = rows.enumerated().map { index, row in
      switch row {
      case .text(let text): rowIndex[text.id] = index
      case .activity(let activity):
        rowIndex[activity.id] = index
        for entry in activity.entries { rowIndex[entry.id] = index }
      case .message(let message): rowIndex[message.id] = index
      default: break
      }
      return builder.items(for: row, text: shownText)
    }
    let ids = Set(rowIndex.keys)
    displayed = displayed.filter { ids.contains($0.key) }
    snapshotText = snapshotText.filter { ids.contains($0.key) }
    pacers = pacers.filter { ids.contains($0.key) }
    builder.retain(ids)
    assemble(animated: animated)
  }

  /// The text a part shows now: the paced reveal while streaming, else the longer of the
  /// snapshot and the live overlay. Growth of text already on screen starts a pacer.
  private func shownText(_ id: String, _ snapshot: String, _ paced: Bool) -> String {
    snapshotText[id] = snapshot
    let target =
      if let live = liveText[id], live.utf8.count > snapshot.utf8.count { live } else { snapshot }
    guard paced else {
      pacers[id] = nil
      displayed[id] = nil
      return target
    }
    let text: String
    if var pacer = pacers[id] {
      pacer.retarget(target)
      pacers[id] = pacer.done ? nil : pacer
      text = pacer.text
    } else if let previous = displayed[id], previous != target,
      target.utf8.count > previous.utf8.count, !UIAccessibility.isReduceMotionEnabled,
      target.hasPrefix(previous)
    {
      pacers[id] = PacedText(target: target, shown: previous.utf8.count)
      startTicking()
      text = previous
    } else {
      text = target
    }
    displayed[id] = text
    return text
  }

  private func liveChanged(reproject shouldReproject: Bool) {
    let live = model.live
    var text: [String: String] = [:]
    text.reserveCapacity(live.count)
    for (key, value) in live { text["\(key.messageID):\(key.kind.rawValue):\(key.ordinal)"] = value }
    let changed = text.filter { liveText[$0.key] != $0.value }.map(\.key)
    liveText = text
    let keys = Set(live.keys)
    if keys != liveKeys {
      let unknown = keys.contains { key in
        rowIndex["\(key.messageID):\(key.kind.rawValue):\(key.ordinal)"] == nil
      }
      liveKeys = keys
      if unknown && shouldReproject {
        reproject()
        return
      }
    }
    refresh(changed)
  }

  /// Rebuilds only the rows holding these parts. Content-only changes reconfigure the visible
  /// cells in place; new or removed blocks apply a snapshot.
  private func refresh(_ ids: [String]) {
    let indices = Set(ids.compactMap { rowIndex[$0] })
    guard !indices.isEmpty else { return }
    var structural = false
    for index in indices where index < rows.count {
      let fresh = builder.items(for: rows[index], text: shownText)
      let old = segments[index]
      segments[index] = fresh
      guard fresh.count == old.count,
        zip(fresh, old).allSatisfy({ $0.id == $1.id && $0.kind == $1.kind })
      else {
        structural = true
        continue
      }
      for (item, previous) in zip(fresh, old) where item != previous {
        items[item.id] = item
        update(item)
      }
    }
    if structural { assemble(animated: false) } else { collectionView.layoutIfNeeded() }
  }

  /// Reconfigures one visible cell in place and resizes its row.
  private func update(_ item: TranscriptItem) {
    guard let position = positions[item.id] else { return }
    if position > 0, let previous = items[order[position - 1]] {
      gaps[item.id] = gap(after: previous, item)
    }
    let path = IndexPath(item: position, section: 0)
    guard let cell = collectionView.cellForItem(at: path) as? TranscriptCell else { return }
    configure(cell, item)
    // Resize in this frame rather than through self-sizing on the next pass, so the growing
    // tail is never clipped for a frame.
    let scale = max(1, traitCollection.displayScale)
    let height = (cell.measure(width: collectionView.bounds.width) * scale).rounded(.up) / scale
    layout.setHeight(height, for: item.id)
  }

  private func assemble(animated: Bool) {
    var list: [TranscriptItem] = []
    list.reserveCapacity(segments.reduce(0) { $0 + $1.count } + 4)
    // The desktop's list header: loading, the beginning, or room for the next page.
    if !segments.isEmpty {
      let history: TranscriptItem.History =
        model.loadingOlder ? .loading : model.hasOlder ? .more : .beginning
      list.append(TranscriptItem(id: "history", content: .history(history), row: "history"))
    }
    for segment in segments { list += segment }
    list += builder.pending(model.inbox, known: Set(model.messages.lazy.map(\.id)))
    if model.undone {
      // The desktop's footer note while an undo is staged.
      let note =
        "\(model.isSideChat ? "Side chat" : "Conversation") undone. Use /redo to restore it, or send a message to continue from here."
      list.append(TranscriptItem(id: "undone", content: .note(note), row: "undone"))
    }
    footerState = (model.session?.outcome == "failed", model.isSideChat)
    if !model.running, executionError != nil || (!staleOutcome && model.session?.outcome == "failed") {
      // The desktop's footer alert after a failed run.
      let message = executionError.flatMap { $0.isEmpty ? nil : $0 }
        ?? "The run failed. Check OpenCode’s provider configuration and try again."
      list.append(TranscriptItem(id: "run-failed", content: .failure(message), row: "run-failed"))
    }
    // Diffable data sources require unique IDs; overlapping pages must never crash.
    var seen = Set<String>()
    list = list.filter { seen.insert($0.id).inserted }
    apply(list, animated: animated)
  }

  private func apply(_ list: [TranscriptItem], animated: Bool) {
    var reconfigure: [String] = []
    var reload: [String] = []
    var nextGaps: [String: CGFloat] = [:]
    var nextEstimates: [String: CGFloat] = [:]
    var nextItems: [String: TranscriptItem] = [:]
    var nextPositions: [String: Int] = [:]
    nextGaps.reserveCapacity(list.count)
    nextItems.reserveCapacity(list.count)
    nextPositions.reserveCapacity(list.count)
    for (index, item) in list.enumerated() {
      nextGaps[item.id] = gap(after: index > 0 ? list[index - 1] : nil, item)
      nextItems[item.id] = item
      nextPositions[item.id] = index
      nextEstimates[item.id] =
        if let old = items[item.id], old == item, let known = estimates[item.id] { known } else { estimate(item) }
      if let old = items[item.id], old != item {
        if old.kind == item.kind { reconfigure.append(item.id) } else { reload.append(item.id) }
      }
    }
    let ids = list.map(\.id)
    let orderChanged = ids != order
    let gapsChanged = nextGaps != gaps
    items = nextItems
    positions = nextPositions
    gaps = nextGaps
    estimates = nextEstimates
    updateJump()
    updateTicker(list)
    guard orderChanged || !reconfigure.isEmpty || !reload.isEmpty else {
      if gapsChanged { layout.invalidateLayout() }
      return
    }
    let known = Set(order)
    order = ids
    var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
    snapshot.appendSections([0])
    snapshot.appendItems(ids)
    snapshot.reconfigureItems(reconfigure.filter(known.contains))
    snapshot.reloadItems(reload.filter(known.contains))
    let anchor = following ? nil : captureAnchor()
    dataSource.apply(snapshot, animatingDifferences: animated && !UIAccessibility.isReduceMotionEnabled)
    if gapsChanged && !orderChanged { layout.invalidateLayout() }
    if let anchor, !animated { restore(anchor) }
    if following { scrollToEnd(animated: false) }
  }

  // MARK: Pacing

  private func startTicking() {
    guard displayLink == nil else { return }
    let link = CADisplayLink(target: DisplayLinkTarget { [weak self] link in self?.tick(link) }, selector: #selector(DisplayLinkTarget.tick))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 120, preferred: 60)
    link.add(to: .main, forMode: .common)
    displayLink = link
    lastTick = 0
  }

  private func tick(_ link: CADisplayLink) {
    let elapsed = lastTick == 0 ? 1.0 / 60 : link.timestamp - lastTick
    lastTick = link.timestamp
    var changed: [String] = []
    for (id, var pacer) in pacers {
      if pacer.advance(elapsed) { changed.append(id) }
      pacers[id] = pacer
    }
    if !changed.isEmpty { refresh(changed) }
    pacers = pacers.filter { !$0.value.done }
    if pacers.isEmpty {
      displayLink?.invalidate()
      displayLink = nil
      if !userScrolling && !model.running { hitches.end() }
    }
  }

  // MARK: Cells

  private func configureDataSource() {
    let user = UICollectionView.CellRegistration<BubbleCell, String> { _, _, _ in }
    let text = UICollectionView.CellRegistration<TextBlockCell, String> { _, _, _ in }
    let code = UICollectionView.CellRegistration<CodeBlockCell, String> { _, _, _ in }
    let table = UICollectionView.CellRegistration<TableCell, String> { _, _, _ in }
    let rule = UICollectionView.CellRegistration<RuleCell, String> { _, _, _ in }
    let image = UICollectionView.CellRegistration<ImageBlockCell, String> { _, _, _ in }
    let disclosure = UICollectionView.CellRegistration<DisclosureCell, String> { _, _, _ in }
    let note = UICollectionView.CellRegistration<NoteCell, String> { _, _, _ in }
    dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) {
      [unowned self] collectionView, indexPath, id in
      guard let item = items[id] else {
        return collectionView.dequeueConfiguredReusableCell(using: note, for: indexPath, item: id)
      }
      let cell: TranscriptCell =
        switch item.kind {
        case .user: collectionView.dequeueConfiguredReusableCell(using: user, for: indexPath, item: id)
        case .text: collectionView.dequeueConfiguredReusableCell(using: text, for: indexPath, item: id)
        case .code: collectionView.dequeueConfiguredReusableCell(using: code, for: indexPath, item: id)
        case .table: collectionView.dequeueConfiguredReusableCell(using: table, for: indexPath, item: id)
        case .rule: collectionView.dequeueConfiguredReusableCell(using: rule, for: indexPath, item: id)
        case .image: collectionView.dequeueConfiguredReusableCell(using: image, for: indexPath, item: id)
        case .disclosure:
          collectionView.dequeueConfiguredReusableCell(using: disclosure, for: indexPath, item: id)
        case .note, .copy, .history:
          collectionView.dequeueConfiguredReusableCell(using: note, for: indexPath, item: id)
        }
      configure(cell, item)
      return cell
    }
  }

  private func configure(_ cell: TranscriptCell, _ item: TranscriptItem) {
    cell.indent = item.indent
    switch item.content {
    case .history(let history):
      let text =
        switch history {
        case .loading: "Loading earlier messages…"
        case .beginning: "Beginning of conversation"
        case .more: ""
        }
      (cell as? NoteCell)?.configure(.history, text: text, typography: typography, theme: theme)
    case .user(let prompt):
      guard let cell = cell as? BubbleCell else { return }
      cell.configure(prompt, typography: typography, theme: theme)
      cell.onOpen = { [weak self] image, source, name in self?.preview(image, source, name) }
      cell.onAnnotations = { [weak self] chip in self?.showAnnotations(prompt, from: chip) }
      cell.onShare = { [weak self] text, view in self?.share(text, from: view) }
    case .block(let block, let style):
      let rendered = MarkdownRenderer.shared.render(block, style: style, typography: typography, theme: theme)
      switch (rendered, cell) {
      case (.text(let text), let cell as TextBlockCell):
        cell.configure(text, quote: block.kind == .quote, panel: item.panel, theme: theme)
        cell.onOpenFile = { [weak self] href in self?.openFile(href) }
      case (.code(let language, let code), let cell as CodeBlockCell):
        cell.configure(language: language, code: code, typography: typography, theme: theme)
        cell.onShare = { [weak self] text, view in self?.share(text, from: view) }
      case (.table(let content), let cell as TableCell):
        cell.configure(content)
        cell.onOpenLink = { [weak self] url in self?.openLink(url) }
      case (.rule, let cell as RuleCell):
        cell.configure(theme: theme)
      case (.image(let source, let alt), let cell as ImageBlockCell):
        cell.configure(source: source.flatMap(imageSource), alt: alt, typography: typography, theme: theme)
        cell.onOpen = { [weak self] image, source, name in self?.preview(image, source, name) }
        let id = item.id
        cell.onResize = { [weak self] in self?.resize(id) }
      case (_, let cell as TextBlockCell):
        cell.configure(
          NSAttributedString(
            string: block.source, attributes: [.font: typography.body, .foregroundColor: theme.text]),
          quote: false, panel: item.panel, theme: theme)
      default: break
      }
    case .copy(let text):
      guard let cell = cell as? NoteCell else { return }
      cell.configure(.copy, text: "", typography: typography, theme: theme)
      cell.onCopy = { UIPasteboard.general.string = text }
      cell.onShare = { [weak self] view in self?.share(text, from: view) }
    case .note(let text):
      (cell as? NoteCell)?.configure(.note, text: text, typography: typography, theme: theme)
    case .failure(let text):
      (cell as? NoteCell)?.configure(.failure, text: text, typography: typography, theme: theme)
    case .turn(let turn):
      guard let cell = cell as? DisclosureCell else { return }
      cell.configure(turn: turn, theme: theme, typography: typography)
      cell.onToggle = { [weak self] in self?.toggleTurn(turn) }
    default:
      guard let cell = cell as? DisclosureCell else { return }
      cell.configure(disclosure(item), theme: theme, typography: typography)
      let id = item.id
      cell.onToggle = { [weak self] in self?.toggle(id) }
    }
  }

  private var directory: String? { model.session?.location.directory ?? model.directory }

  /// Rows worded like the desktop's `activity.tsx`, `skill.tsx` and `message.tsx`.
  private func disclosure(_ item: TranscriptItem) -> DisclosureCell.Model {
    switch item.content {
    case .activity(let summary, let active, let errors, let open):
      // The group's chevron is hidden on the desktop; its label alone toggles it.
      return .init(
        chevron: .none, open: open, title: active ? "Working" : summary, detail: active ? summary : nil,
        trailing: errors > 0 ? "\(errors) failed" : nil, trailingColor: theme.error,
        trailingFont: typography.label, accessibilityIdentifier: "transcript.activity")
    case .tool(let tool, let open):
      let kind = Self.iconKind(tool.name)
      let target = target(tool) ?? (tool.name == "question" ? "" : tool.name)
      // `.activity-group .disclosure-chevron { display: none }` hides nested chevrons too.
      var model = DisclosureCell.Model(
        chevron: .none, open: open, icon: kind.symbol, iconTint: kind.tint(theme), title: Self.title(tool),
        titleFont: typography.small, detail: target, detailFont: typography.monoCaption, detailFills: true,
        body: open ? details(tool) : nil, accessibilityIdentifier: "transcript.tool")
      switch tool.state.status {
      case .completed:
        model.statusIcon = "checkmark.circle"
      case .error:
        model.statusIcon = "exclamationmark.circle"
        model.statusTint = theme.error
      case .running:
        model.trailing = "Running…"
        model.spinning = true
      case .streaming:
        model.trailing = "Preparing…"
        model.spinning = true
      }
      return model
    case .skill(let name, let status, let error):
      let verb =
        switch status {
        case .completed: "Used skill"
        case .error: "Failed to load skill"
        default: "Loading skill"
        }
      let title = NSMutableAttributedString(
        string: name.isEmpty ? verb : "\(verb): ",
        attributes: [.font: typography.small, .foregroundColor: theme.textSecondary])
      if !name.isEmpty {
        title.append(
          NSAttributedString(string: name, attributes: [.font: typography.small, .foregroundColor: theme.text]))
      }
      if status == .running || status == .streaming {
        title.append(
          NSAttributedString(string: "…", attributes: [.font: typography.small, .foregroundColor: theme.textSecondary]))
      }
      return .init(
        chevron: .none, expandable: false, icon: "square.stack.3d.up", iconTint: theme.activitySkill, title: title.string,
        attributedTitle: title, titleFont: typography.small, height: typography.px(32), below: error,
        accessibilityIdentifier: "transcript.skill")
    case .thinking(let open, _):
      return .init(
        chevron: .none, open: open, title: "Thinking", titleFont: typography.small,
        accessibilityIdentifier: "transcript.thinking")
    case .shell(let shell, let open):
      var body: NSAttributedString?
      if open {
        body = NSAttributedString(
          string: Self.capped(shell.output?.output ?? ""),
          attributes: [
            .font: typography.monoSmall, .foregroundColor: theme.text, .paragraphStyle: monoParagraph(),
          ])
      }
      return .init(
        open: open, title: shell.command, titleFont: typography.mono, body: body,
        footer: open && shell.output?.truncated == true ? "Output truncated by OpenCode." : nil,
        accessibilityIdentifier: "transcript.shell")
    default:
      return .init(title: "", accessibilityIdentifier: "transcript.row")
    }
  }

  /// `activity.tsx`'s icon families: search, edit, shell, and a file for everything else.
  private enum IconKind {
    case search, edit, shell, read
    var symbol: String {
      switch self {
      case .search: "magnifyingglass"
      case .edit: "square.and.pencil"
      case .shell: "apple.terminal"
      case .read: "doc"
      }
    }
    func tint(_ theme: TranscriptTheme) -> UIColor? {
      switch self {
      case .search: theme.activitySearch
      case .edit: theme.activityEdit
      default: nil
      }
    }
  }

  private static func iconKind(_ name: String) -> IconKind {
    switch ToolKind(name) {
    case .search: .search
    case .edit: .edit
    case .shell: .shell
    default: .read
    }
  }

  /// "Read", "Run", "Question", else the tool's own name, as the desktop shows it.
  private static func title(_ tool: ToolCall) -> String {
    switch ToolKind(tool.name) {
    case .read: "Read"
    case .shell: "Run"
    case .question: "Question"
    default: tool.name
    }
  }

  private func target(_ tool: ToolCall) -> String? {
    guard let value = ["filePath", "path", "command", "pattern", "query"].lazy.compactMap({ tool.input($0) }).first
    else { return nil }
    if let directory, value.hasPrefix(directory + "/") {
      return String(value.dropFirst(directory.count + 1))
    }
    return value.replacingOccurrences(of: "\n", with: " ")
  }

  private static func capped(_ text: String) -> String {
    text.count > 4000 ? text.prefix(4000) + "\n… \(text.count - 4000) more characters" : text
  }

  /// `font: 12px/1.6 var(--font-mono)`.
  private func monoParagraph() -> NSParagraphStyle {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = typography.spacing(typography.monoSmall, ratio: 1.6)
    return paragraph
  }

  /// `ToolDetails`: Input, then the error, then each output.
  private func details(_ tool: ToolCall) -> NSAttributedString {
    let out = NSMutableAttributedString()
    let label: [NSAttributedString.Key: Any] = [.font: typography.caption, .foregroundColor: theme.textTertiary]
    let pre: [NSAttributedString.Key: Any] = [
      .font: typography.monoSmall, .foregroundColor: theme.text, .paragraphStyle: monoParagraph(),
    ]
    // `pre { margin-top: 10px }`.
    let spacer = NSMutableParagraphStyle()
    spacer.minimumLineHeight = 11
    spacer.maximumLineHeight = 11
    let gap = NSAttributedString(string: "\n", attributes: [.font: UIFont.systemFont(ofSize: 4), .paragraphStyle: spacer])
    func section(_ text: String, _ attributes: [NSAttributedString.Key: Any]) {
      out.append(NSAttributedString(string: "\n", attributes: attributes))
      out.append(gap)
      out.append(NSAttributedString(string: text, attributes: attributes))
    }
    out.append(NSAttributedString(string: "Input", attributes: label))
    let input: String =
      switch tool.state.input {
      case .string(let text)?: text
      case let value?: Self.pretty(value)
      case nil: ""
      }
    section(Self.capped(input), pre)
    if tool.state.status == .error, let error = tool.state.error {
      section(error.message, [.font: typography.small, .foregroundColor: theme.error])
    }
    for content in tool.state.content ?? [] {
      if content.type == "text" {
        section(Self.capped((content.text ?? "").trimmingCharacters(in: .newlines)), pre)
      } else {
        section(
          "File output (\(content.mime ?? content.type))",
          [.font: typography.small, .foregroundColor: theme.textTertiary])
      }
    }
    return out
  }

  /// `JSON.stringify(input, null, 2)`.
  private static func pretty(_ value: JSONValue) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
    let text = (try? encoder.encode(value)).flatMap { String(data: $0, encoding: .utf8) } ?? value.text
    // Foundation indents with 2 spaces and writes `"key" : value`.
    return text.replacingOccurrences(of: "\" : ", with: "\": ")
  }

  private static func newlines(_ text: String) -> Int {
    var count = 0
    for byte in text.utf8 where byte == 0x0A { count += 1 }
    return count
  }

  /// Desktop pixels of space above an item, in points.
  private func gap(after previous: TranscriptItem?, _ item: TranscriptItem) -> CGFloat {
    let px = transcriptGap(after: previous, item)
    return px == 0 ? 0 : typography.px(CGFloat(px))
  }

  private func estimate(_ item: TranscriptItem) -> CGFloat {
    let line = typography.lineHeight
    let charsPerLine = max(20, (min(view.bounds.width - 36, 720) / (typography.body.pointSize * 0.5)))
    switch item.content {
    case .user(let prompt):
      return 18 + line * max(1, (CGFloat(prompt.text.count) / (charsPerLine * 0.85)).rounded(.up))
        + (prompt.files.isEmpty ? 0 : 96) + (prompt.annotations.isEmpty ? 0 : 44)
    case .block(let block, let style):
      switch block.kind {
      case .code: return 34 + CGFloat(Self.newlines(block.source) + 1) * line
      case .table: return CGFloat(Self.newlines(block.source)) * (line + 22)
      case .rule: return 13
      case .image: return 180
      default:
        // Wrapped lines from length, plus one per explicit line break.
        let wrapped = (CGFloat(block.source.utf8.count) / charsPerLine).rounded(.up)
        let estimate = max(line, (wrapped + CGFloat(Self.newlines(block.source)) * 0.5) * line)
        return style == .reasoning ? estimate * 0.9 + 12 : estimate
      }
    case .copy: return 32
    case .history: return 50
    case .turn: return typography.px(24)
    case .skill: return typography.px(32)
    case .note: return 18
    case .failure: return line
    default: return 44
    }
  }

  // MARK: Images

  /// `MarkdownImage`'s source: web and data URLs as they are, workspace paths through the
  /// gateway's session image route.
  private func imageSource(_ src: String) -> ImageSource? {
    if src.range(of: #"^(https?:|//)"#, options: [.regularExpression, .caseInsensitive]) != nil {
      let url = URL(string: src.hasPrefix("//") ? "https:" + src : src)
      return url.map { .request(URLRequest(url: $0)) }
    }
    if src.lowercased().hasPrefix("data:image/"), let comma = src.firstIndex(of: ",") {
      return .data(key: src.count > 256 ? "data:\(src.hashValue)" : src, base64: String(src[src.index(after: comma)...]))
    }
    guard let id = model.sessionID else { return nil }
    let path = src.lowercased().hasPrefix("file:") ? src : (src.removingPercentEncoding ?? src)
    let client = model.client
    return .request(client.request(client.url("/sessions/\(id)/image", ["path": path])))
  }

  /// The chip's numbered list, in a popover anchored to it like the desktop's.
  private func showAnnotations(_ prompt: SentPrompt, from chip: UIView) {
    guard let palette, presentedViewController == nil else { return }
    let list = AnnotationsPopover(prompt: prompt, palette: palette, from: chip)
    present(list, animated: true)
  }

  /// The native share sheet for text, anchored to the view that asked (iPad popovers).
  private func share(_ text: String, from view: UIView) {
    guard presentedViewController == nil, !text.isEmpty else { return }
    let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
    sheet.popoverPresentationController?.sourceView = view
    sheet.popoverPresentationController?.sourceRect = view.bounds
    present(sheet, animated: true)
  }

  /// A link from a drawn table, routed like the text views' links.
  private func openLink(_ url: URL) {
    switch url.scheme?.lowercased() {
    case "http", "https", "mailto": UIApplication.shared.open(url)
    case nil, "file": openFile(url.absoluteString)
    default: break
    }
  }

  /// A local file link: the chat's folder resolves relative and absolute paths.
  private func openFile(_ href: String) {
    guard let directory, let target = FileLinkTarget.resolve(href, directory: directory) else { return }
    onOpenFile?(target)
  }

  private func preview(_ image: UIImage?, _ source: ImageSource, _ name: String) {
    let preview = ImagePreviewController(image: image, source: source, name: name, theme: theme)
    present(preview, animated: true)
  }

  /// A row whose content changed size on its own (an image loaded): resize it, keeping what the
  /// reader is looking at in place.
  private func resize(_ id: String) {
    guard let position = positions[id],
      let cell = collectionView.cellForItem(at: IndexPath(item: position, section: 0)) as? TranscriptCell
    else { return }
    let anchor = following ? nil : captureAnchor()
    let scale = max(1, traitCollection.displayScale)
    layout.setHeight((cell.measure(width: collectionView.bounds.width) * scale).rounded(.up) / scale, for: id)
    collectionView.layoutIfNeeded()
    if let anchor, anchor.id != id { restore(anchor) }
  }

  // MARK: Ticker

  /// Runs one 1-second timer while any turn is working, never one per row.
  private func updateTicker(_ list: [TranscriptItem]) {
    let working = list.contains { item in
      if case .turn(let turn) = item.content { turn.status == .working } else { false }
    }
    if working, ticker == nil {
      let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated { self?.tickTurns() }
      }
      timer.tolerance = 0.1
      RunLoop.main.add(timer, forMode: .common)
      ticker = timer
    } else if !working {
      ticker?.invalidate()
      ticker = nil
    }
  }

  private func tickTurns() {
    for cell in collectionView.visibleCells {
      (cell as? DisclosureCell)?.tick()
    }
  }

  // MARK: Toggles

  private func toggleTurn(_ turn: TurnRow) {
    overrides[turn.id] = !turn.open
    // Opening history never pulls the reader back to the newest output.
    setFollowing(false)
    regroup(animated: true)
  }

  private func toggle(_ id: String) {
    if builder.open.contains(id) { builder.open.remove(id) } else { builder.open.insert(id) }
    setFollowing(false)
    rebuild(animated: true)
  }

  // MARK: Scrolling

  private struct Anchor {
    var id: String
    var offset: CGFloat
  }

  private func captureAnchor() -> Anchor? {
    let top = collectionView.contentOffset.y + collectionView.adjustedContentInset.top
    let visible = collectionView.indexPathsForVisibleItems.sorted()
    for path in visible {
      guard let attributes = layout.layoutAttributesForItem(at: path), attributes.frame.maxY > top,
        path.item < order.count
      else { continue }
      return Anchor(id: order[path.item], offset: attributes.frame.minY - collectionView.contentOffset.y)
    }
    return nil
  }

  private func restore(_ anchor: Anchor) {
    collectionView.layoutIfNeeded()
    guard let frame = layout.frame(of: anchor.id) else { return }
    let target = frame.minY - anchor.offset
    if abs(collectionView.contentOffset.y - target) > 0.5 {
      collectionView.contentOffset.y = target
    }
  }

  private var endOffset: CGFloat {
    let inset = collectionView.adjustedContentInset
    return max(-inset.top, collectionView.contentSize.height + inset.bottom - collectionView.bounds.height)
  }

  private func scrollToEnd(animated: Bool) {
    guard collectionView != nil else { return }
    let target = endOffset
    if animated && abs(collectionView.contentOffset.y - target) > 1 && !UIAccessibility.isReduceMotionEnabled {
      animatingToEnd = true
      collectionView.setContentOffset(CGPoint(x: 0, y: target), animated: true)
    } else if abs(collectionView.contentOffset.y - target) > 0.5 {
      collectionView.contentOffset.y = target
    }
  }

  #if DEBUG
    private var debugScrolled = false
  #endif

  private func didLayout() {
    #if DEBUG
      // `-transcriptOffset <points>` opens the chat scrolled that far from the top, for screenshots.
      // Launch arguments arrive as strings, so read it with `double(forKey:)`.
      if !debugScrolled, model.loaded, !order.isEmpty,
        UserDefaults.standard.object(forKey: "transcriptOffset") != nil
      {
        let offset = UserDefaults.standard.double(forKey: "transcriptOffset")
        debugScrolled = true
        setFollowing(false)
        collectionView.contentOffset.y = min(endOffset, -collectionView.adjustedContentInset.top + offset)
        return
      }
    #endif
    let height = collectionView.bounds.height - collectionView.adjustedContentInset.bottom
    if visibleHeight > 0, height != visibleHeight, !following, !userScrolling {
      // The keyboard (or composer) changed the visible height: keep what sits at the bottom
      // in place, so the last visible row stays above the composer while the keyboard moves.
      let target = collectionView.contentOffset.y + visibleHeight - height
      collectionView.contentOffset.y = min(endOffset, max(-collectionView.adjustedContentInset.top, target))
    }
    visibleHeight = height
    if following && !userScrolling && !animatingToEnd { scrollToEnd(animated: false) }
    updateJump()
    loadOlderIfNeeded()
  }

  private func setFollowing(_ value: Bool) {
    guard following != value else { return }
    following = value
    updateJump()
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    hitches.begin("scroll")
    userScrolling = true
    animatingToEnd = false
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate {
      userScrolling = false
      if displayLink == nil && !model.running { hitches.end() }
    }
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    userScrolling = false
    if displayLink == nil && !model.running { hitches.end() }
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    animatingToEnd = false
    if following { scrollToEnd(animated: false) }
  }

  func scrollViewShouldScrollToTop(_ scrollView: UIScrollView) -> Bool {
    setFollowing(false)
    return true
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let offset = scrollView.contentOffset.y
    defer { lastOffset = offset }
    if userScrolling {
      // Following stops on a reading gesture (upward), never on position alone.
      if endOffset - offset <= Self.followBand {
        setFollowing(true)
      } else if offset < lastOffset - 0.5 {
        setFollowing(false)
      }
    }
    loadOlderIfNeeded()
  }

  private func loadOlderIfNeeded() {
    guard model.hasOlder, !model.loadingOlder, !requestingOlder, !order.isEmpty else { return }
    let top = collectionView.contentOffset.y + collectionView.adjustedContentInset.top
    let short = collectionView.contentSize.height < collectionView.bounds.height + 32
    guard top < 1200 || short else { return }
    requestingOlder = true
    Task { [weak self] in
      await self?.model.loadOlder()
      self?.requestingOlder = false
    }
  }

  // MARK: Jump to latest

  private func configureJumpButton() {
    var configuration = UIButton.Configuration.glass()
    configuration.image = UIImage(
      systemName: "arrow.down", withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold))
    configuration.title = "Jump to latest"
    configuration.imagePadding = 6
    configuration.buttonSize = .small
    configuration.cornerStyle = .capsule
    configuration.baseForegroundColor = .label
    jump.configuration = configuration
    jump.accessibilityIdentifier = "transcript.jump"
    jump.alpha = 0
    jump.isHidden = true
    jump.addAction(UIAction { [weak self] _ in
      guard let self else { return }
      self.setFollowing(true)
      self.scrollToEnd(animated: true)
    }, for: .primaryActionTriggered)
    jump.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(jump)
    NSLayoutConstraint.activate([
      jump.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      jump.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
    ])
  }

  private func updateJump() {
    guard collectionView != nil else { return }
    let show = !following && endOffset - collectionView.contentOffset.y > Self.followBand
    guard show == jump.isHidden else { return }
    if show { jump.isHidden = false }
    UIView.animate(withDuration: 0.2) {
      self.jump.alpha = show ? 1 : 0
      self.jump.transform = show ? .identity : CGAffineTransform(translationX: 0, y: 8)
    } completion: { _ in
      if !show && self.jump.alpha == 0 { self.jump.isHidden = true }
    }
  }

  // MARK: Prefetching and traits

  func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
    let typography = typography
    let theme = theme
    let blocks: [(MarkdownBlock, ProseStyle)] = indexPaths.compactMap { path in
      guard path.item < order.count, case .block(let block, let style)? = items[order[path.item]]?.content
      else { return nil }
      return (block, style)
    }
    guard !blocks.isEmpty else { return }
    DispatchQueue.global(qos: .userInitiated).async {
      for (block, style) in blocks {
        let rendered = MarkdownRenderer.shared.render(block, style: style, typography: typography, theme: theme)
        if case .code(let language, let code) = rendered {
          SyntaxHighlighter.shared.warm(
            CodeBlockCell.displayed(code), language: language,
            style: SyntaxHighlighter.Style(typography: typography, theme: theme))
        }
      }
    }
  }

  private var fontObserver: NSObjectProtocol?

  private func typographyChanged() {
    typography = Typography(traitCollection)
    layout.resetHeights()
    var snapshot = dataSource.snapshot()
    snapshot.reconfigureItems(snapshot.itemIdentifiers)
    dataSource.apply(snapshot, animatingDifferences: false)
  }
}

/// Breaks the display link's retain cycle.
private final class DisplayLinkTarget: NSObject {
  let action: (CADisplayLink) -> Void
  init(_ action: @escaping (CADisplayLink) -> Void) { self.action = action }
  @objc func tick(_ link: CADisplayLink) { action(link) }
}
