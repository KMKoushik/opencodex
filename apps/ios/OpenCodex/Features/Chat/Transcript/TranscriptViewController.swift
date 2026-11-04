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

  // Streaming
  private var liveKeys: Set<ChatModel.LiveKey> = []
  private var liveText: [String: String] = [:]
  private var snapshotText: [String: String] = [:]
  private var displayed: [String: String] = [:]
  private var pacers: [String: PacedText] = [:]
  private var displayLink: CADisplayLink?
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
    MainActor.assumeIsolated { displayLink?.invalidate() }
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
    sends = model.sends
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (self: TranscriptViewController, _: UITraitCollection) in
      self.typographyChanged()
    }
    observeSnapshot()
    observeLive()
    observeSends()
    liveChanged(reproject: false)
    reproject()
  }

  // MARK: Observation

  private func observeSnapshot() {
    withObservationTracking {
      _ = model.messages
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
    let messages = withLiveParts(model.messages, live: liveKeys)
    projected = projector.project(messages)
    grouped = messages
    regroup(animated: false)
  }

  private func regroup(animated: Bool) {
    rows = grouper.group(projected, messages: grouped, running: model.running, overrides: overrides)
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
      gaps[item.id] = transcriptGap(after: previous, item)
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
    if model.hasOlder && !segments.isEmpty {
      list.append(TranscriptItem(id: "history", content: .history(loading: model.loadingOlder)))
    }
    for segment in segments { list += segment }
    list += builder.pending(model.inbox, known: Set(model.messages.lazy.map(\.id)))
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
      nextGaps[item.id] = transcriptGap(after: index > 0 ? list[index - 1] : nil, item)
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
    }
  }

  // MARK: Cells

  private func configureDataSource() {
    let user = UICollectionView.CellRegistration<BubbleCell, String> { _, _, _ in }
    let text = UICollectionView.CellRegistration<TextBlockCell, String> { _, _, _ in }
    let code = UICollectionView.CellRegistration<CodeBlockCell, String> { _, _, _ in }
    let table = UICollectionView.CellRegistration<TableCell, String> { _, _, _ in }
    let rule = UICollectionView.CellRegistration<RuleCell, String> { _, _, _ in }
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
    case .history(let loading):
      (cell as? NoteCell)?.configure(.history(loading: loading), text: "", typography: typography)
    case .user(let text, let files, let pending):
      (cell as? BubbleCell)?.configure(text: text, files: files, pending: pending, typography: typography)
    case .block(let block, let style):
      let rendered = MarkdownRenderer.shared.render(block, style: style, typography: typography)
      switch (rendered, cell) {
      case (.text(let text), let cell as TextBlockCell):
        cell.configure(text, quote: block.kind == .quote, indent: item.indent)
      case (.code(let language, let code), let cell as CodeBlockCell):
        cell.configure(language: language, code: code, typography: typography)
      case (.table(let content), let cell as TableCell):
        cell.configure(content)
      case (_, let cell as TextBlockCell):
        cell.configure(
          NSAttributedString(string: block.source, attributes: [.font: typography.body, .foregroundColor: UIColor.label]),
          quote: false, indent: item.indent)
      default: break
      }
    case .copy(let text):
      guard let cell = cell as? NoteCell else { return }
      cell.configure(.copy, text: "", typography: typography)
      cell.onCopy = { UIPasteboard.general.string = text }
    case .note(let text):
      (cell as? NoteCell)?.configure(.note, text: text, typography: typography)
    case .failure(let text):
      (cell as? NoteCell)?.configure(.failure, text: text, typography: typography)
    case .turn(let turn):
      guard let cell = cell as? DisclosureCell else { return }
      cell.configure(turn: turn, typography: typography)
      cell.onToggle = { [weak self] in self?.toggleTurn(turn) }
    default:
      guard let cell = cell as? DisclosureCell else { return }
      cell.configure(disclosure(item), indent: item.indent, typography: typography)
      let id = item.id
      cell.onToggle = { [weak self] in self?.toggle(id) }
    }
  }

  private var directory: String? { model.session?.location.directory ?? model.directory }

  private func disclosure(_ item: TranscriptItem) -> DisclosureCell.Model {
    switch item.content {
    case .activity(let summary, let active, let errors, let open):
      return .init(
        title: active ? "Working" : summary, titleColor: .secondaryLabel,
        detail: active ? summary : nil, trailing: errors > 0 ? "\(errors) failed" : nil,
        status: active ? .running : .none, open: open, accessibilityIdentifier: "transcript.activity")
    case .tool(let tool, let open):
      let kind = ToolKind(tool.name)
      let status: DisclosureCell.Status =
        switch tool.state.status {
        case .completed: .done
        case .error: .failed
        case .running, .streaming: .running
        }
      return .init(
        icon: Self.icon(kind), title: Self.title(tool, kind), titleColor: .label,
        detail: target(tool), detailMono: true, status: status, open: open,
        body: open ? details(tool) : nil, accessibilityIdentifier: "transcript.tool")
    case .skill(let name, let status, let error):
      let title =
        switch status {
        case .completed: "Used skill"
        case .error: "Failed to load skill"
        default: "Loading skill"
        }
      return .init(
        icon: "square.stack.3d.up", title: title, titleColor: .label, detail: name,
        status: status == .error ? .failed : status == .completed ? .none : .running, chevron: false,
        body: error.map { NSAttributedString(string: $0, attributes: [.font: typography.monoSmall, .foregroundColor: UIColor.systemRed]) },
        accessibilityIdentifier: "transcript.skill")
    case .thinking(let active, let open, let empty):
      return .init(
        icon: "brain", title: active ? "Thinking" : "Thought", titleColor: .label,
        status: active ? .running : .none, open: open, chevron: !empty,
        accessibilityIdentifier: "transcript.thinking")
    case .shell(let shell, let open):
      let output = shell.output?.output ?? ""
      var body: NSAttributedString?
      if open {
        var text = Self.capped(output.isEmpty ? "(no output)" : output)
        if shell.output?.truncated == true { text += "\n\nOutput truncated by OpenCode." }
        body = NSAttributedString(string: text, attributes: [.font: typography.monoSmall, .foregroundColor: UIColor.label])
      }
      return .init(
        icon: "terminal", title: "$ \(shell.command)", titleColor: .label, titleMono: true,
        status: shell.status == "running" ? .running : .none, open: open, body: body,
        accessibilityIdentifier: "transcript.shell")
    default:
      return .init(title: "", accessibilityIdentifier: "transcript.row")
    }
  }

  private static func icon(_ kind: ToolKind) -> String {
    switch kind {
    case .read: "doc.text"
    case .search: "magnifyingglass"
    case .shell: "terminal"
    case .edit: "pencil"
    case .question: "questionmark.bubble"
    case .skill: "square.stack.3d.up"
    case .other: "wrench.and.screwdriver"
    }
  }

  private static func title(_ tool: ToolCall, _ kind: ToolKind) -> String {
    switch kind {
    case .read: "Read"
    case .shell: "Run"
    case .question: "Question"
    case .edit: tool.name == "write" || tool.name == "write_file" ? "Write" : "Edit"
    default: tool.name.prefix(1).uppercased() + tool.name.dropFirst()
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

  private func details(_ tool: ToolCall) -> NSAttributedString {
    let out = NSMutableAttributedString()
    let label: [NSAttributedString.Key: Any] = [.font: typography.caption, .foregroundColor: UIColor.secondaryLabel]
    let body: [NSAttributedString.Key: Any] = [.font: typography.monoSmall, .foregroundColor: UIColor.label]
    let input: String =
      if let command = tool.input("command") { command } else { tool.state.input.map(Self.pretty) ?? "" }
    if !input.isEmpty {
      out.append(NSAttributedString(string: "Input\n", attributes: label))
      out.append(NSAttributedString(string: Self.capped(input), attributes: body))
    }
    if let error = tool.state.error {
      if out.length > 0 { out.append(NSAttributedString(string: "\n\n", attributes: body)) }
      out.append(NSAttributedString(string: error.message, attributes: [.font: typography.monoSmall, .foregroundColor: UIColor.systemRed]))
    }
    let output = tool.output
    if !output.isEmpty {
      if out.length > 0 { out.append(NSAttributedString(string: "\n\n", attributes: body)) }
      out.append(NSAttributedString(string: "Output\n", attributes: label))
      out.append(NSAttributedString(string: Self.capped(output.trimmingCharacters(in: .newlines)), attributes: body))
    }
    if out.length == 0 { out.append(NSAttributedString(string: "No details yet", attributes: label)) }
    return out
  }

  private static func pretty(_ value: JSONValue) -> String {
    if case .string(let text) = value { return text }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return (try? encoder.encode(value)).flatMap { String(data: $0, encoding: .utf8) } ?? value.text
  }

  private static func newlines(_ text: String) -> Int {
    var count = 0
    for byte in text.utf8 where byte == 0x0A { count += 1 }
    return count
  }

  private func estimate(_ item: TranscriptItem) -> CGFloat {
    let line = typography.body.lineHeight + typography.bodyLineSpacing
    let charsPerLine = max(20, (min(view.bounds.width - 36, 700) / (typography.body.pointSize * 0.5)))
    switch item.content {
    case .user(let text, _, _):
      return 22 + line * max(1, (CGFloat(text.count) / (charsPerLine * 0.8)).rounded(.up))
    case .block(let block, _):
      switch block.kind {
      case .code: return 60 + CGFloat(Self.newlines(block.source)) * 19
      case .table: return 12 + CGFloat(Self.newlines(block.source)) * 36
      case .rule: return 13
      default:
        // Wrapped lines from length, plus one per explicit line break.
        let wrapped = (CGFloat(block.source.utf8.count) / charsPerLine).rounded(.up)
        return max(line, (wrapped + CGFloat(Self.newlines(block.source)) * 0.5) * line)
      }
    case .copy: return 30
    case .history: return 32
    case .note, .failure: return 20
    default: return 34
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

  private func didLayout() {
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
    userScrolling = true
    animatingToEnd = false
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate { userScrolling = false }
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    userScrolling = false
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
    let blocks: [(MarkdownBlock, ProseStyle)] = indexPaths.compactMap { path in
      guard path.item < order.count, case .block(let block, let style)? = items[order[path.item]]?.content
      else { return nil }
      return (block, style)
    }
    guard !blocks.isEmpty else { return }
    DispatchQueue.global(qos: .userInitiated).async {
      for (block, style) in blocks {
        _ = MarkdownRenderer.shared.render(block, style: style, typography: typography)
      }
    }
  }

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
