import SwiftUI
import UIKit

/// Where the composer's thread actions navigate. The screen that hosts the chat sets it:
/// `/new` opens a new thread in the project, `/fork` opens the forked thread.
struct ComposerNavigation {
  var newThread: (() -> Void)?
  var openSession: ((String) -> Void)?
}

extension EnvironmentValues {
  @Entry var composerNavigation = ComposerNavigation()
}

/// The prompt input with every field the gateway takes (`promptInputSchema`).
nonisolated struct ComposerPrompt: Encodable, Sendable {
  var text: String
  var model: ModelRef?
  var files: [GatewayClient.Prompt.File]?
  var command: String?
  var skill: String?
  var mentions: [PromptMention]?

  var isPlain: Bool { command == nil && skill == nil && (mentions ?? []).isEmpty }
}

/// What a composer action failed on, worded like the desktop.
nonisolated struct ComposerFailure: LocalizedError {
  var errorDescription: String?
  init(_ message: String) { errorDescription = message }
}

// MARK: - Gateway routes

nonisolated extension GatewayClient {
  struct SessionAction: Encodable {
    var action: String
    var before: String?
    var messageID: String?
    var title: String?
  }

  /// `fork` answers with the new thread; the other actions with the updated thread or null.
  func action(_ id: String, _ action: SessionAction) async throws -> SessionInfo? {
    try await post("/sessions/\(id)/action", action, as: SessionInfo?.self)
  }

  /// The finished export file's bytes.
  func export(_ id: String, format: String) async throws -> Data {
    var request = request(url("/sessions/\(id)/export", ["format": format]))
    request.timeoutInterval = 60
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else {
      let message = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
      throw GatewayError(
        status: status, message: message ?? "The gateway could not export this thread.")
    }
    return data
  }

  struct Revert: Decodable, Sendable {
    struct Stage: Decodable, Sendable { var messageID: String? }
    var revert: Stage?
  }
  /// The thread's staged undo, which the phone's `SessionInfo` doesn't decode.
  func revert(_ id: String) async throws -> Revert { try await get("/sessions/\(id)") }

  /// The newest page's user messages with their attachment bytes and mentions, for undo.
  func sentMessages(_ id: String) async throws -> [SentMessage] {
    try await get("/sessions/\(id)/messages", as: SentPage.self).data.filter { $0.type == "user" }
  }
}

/// A sent user message as OpenCode stores it, read only to restore it on undo.
nonisolated struct SentMessage: Decodable, Sendable {
  struct File: Decodable, Sendable {
    struct Source: Decodable, Sendable { var type: String }
    var data: String?
    var mime: String?
    var name: String?
    var description: String?
    var source: Source?
    var mention: PromptMention.Range?
  }
  struct Skill: Decodable, Sendable {
    var id: String
    var mention: PromptMention.Range?
  }
  var id: String
  var type: String
  var text: String?
  var files: [File]?
  var skills: [Skill]?

  /// Port of `sentMentions`: mentioned files, chats and skills return as draft mentions.
  var mentions: [DraftMention] {
    let files: [DraftMention] = (files ?? []).compactMap { file in
      guard let token = file.mention?.text else { return nil }
      if file.source?.type == "uri" { return .file(path: String(token.dropFirst()), token: token) }
      guard let description = file.description,
        let match = description.range(of: #"\(([^()\s]+)\)$"#, options: .regularExpression)
      else { return nil }
      return .chat(id: String(description[match].dropFirst().dropLast()), token: token)
    }
    let skills: [DraftMention] = (skills ?? []).compactMap { skill in
      skill.mention.map { .skill(id: skill.id, token: $0.text) }
    }
    return files + skills
  }
}

private nonisolated struct SentPage: Decodable, Sendable { var data: [SentMessage] }

// MARK: - Running a draft

extension ChatModel {
  /// What a send did, for the composer to acknowledge, restore or navigate.
  enum SendResult {
    case sent
    case acknowledged
    case restored(text: String, attachments: [DraftAttachment], mentions: [DraftMention])
    case forkPicker
    case newThread
    case opened(String)
    case exported(URL)
  }

  /// Port of the desktop chat's send mutation: local `/` actions run here; server commands
  /// and skills go out as the prompt's `command`/`skill`; everything else is a prompt.
  ///
  /// `fork` is nil until the user picks where to fork from: `.some(nil)` is the latest state,
  /// `.some(id)` just before that message.
  func run(
    _ snapshot: Draft.Snapshot, model selection: ModelRef?, fork: String?? = nil
  ) async throws -> SendResult {
    let slash = SlashCommand.parse(snapshot.text)
    if let slash, SlashCommand.localNames.contains(slash.name) {
      guard let id = sessionID else {
        throw ComposerFailure("/\(slash.name) needs a thread. Send a message first.")
      }
      return try await runLocal(slash, id: id, snapshot: snapshot, fork: fork)
    }

    var command: SlashCommand?
    if let slash, let directory = projectDirectory {
      let catalogs = SlashCatalogStore.shared
      await catalogs.load(client, directory: directory, force: true)
      if let error = catalogs.entries[directory]?.error { throw ComposerFailure(error) }
      command = catalogs.entries[directory]?.commands?.first { $0.name == slash.name }
      if command == nil {
        throw ComposerFailure("Unknown command /\(slash.name). Type / to see available commands.")
      }
    }
    let text = (slash != nil ? slash!.text : snapshot.text)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard text.utf16.count <= 200_000 else {
      throw ComposerFailure("The draft is too long. Shorten it before sending.")
    }
    let mentions = Mentions.prompt(text, snapshot.mentions)
    let prompt = ComposerPrompt(
      text: text, model: selection,
      files: snapshot.attachments.isEmpty
        ? nil : snapshot.attachments.map { .init(name: $0.name, uri: $0.uri) },
      command: command?.skill == nil ? command?.name : nil,
      skill: command?.skill,
      mentions: mentions.isEmpty ? nil : mentions)
    try await send(prompt)
    return .sent
  }

  /// Sends a full prompt. `ChatModel.send` takes only text and files, so prompts with a
  /// command, skill or mentions post directly once the thread exists; the events that follow
  /// refresh the chat.
  func send(_ prompt: ComposerPrompt) async throws {
    guard let id = sessionID, !prompt.isPlain else {
      if sessionID == nil, prompt.command != nil || prompt.skill != nil {
        throw ComposerFailure("Send a message first, then run this command.")
      }
      try await send(prompt.text, model: prompt.model, files: prompt.files ?? [])
      return
    }
    _ = try await client.post("/sessions/\(id)/prompt", prompt, as: JSONValue.self)
  }

  private func runLocal(
    _ slash: (name: String, text: String), id: String, snapshot: Draft.Snapshot,
    fork: String??
  ) async throws -> SendResult {
    let arguments = slash.text.trimmingCharacters(in: .whitespacesAndNewlines)
    if slash.name != "undo", slash.name != "redo", !snapshot.attachments.isEmpty {
      throw ComposerFailure("Send or remove attached context before running a thread action.")
    }
    // `/export json` picks the format; every other action but rename takes no arguments.
    if slash.name != "rename", slash.name != "export", !arguments.isEmpty {
      throw ComposerFailure("/\(slash.name) does not take arguments.")
    }
    switch slash.name {
    case "fork":
      // Like the desktop, a bare /fork first asks where to fork from.
      guard let before = fork else { return .forkPicker }
      let forked = try await action(id, .init(action: "fork", before: before))
      return forked.map { .opened($0.id) } ?? .acknowledged
    case "new":
      return .newThread
    case "compact":
      _ = try await action(id, .init(action: "compact"))
    case "undo", "redo":
      guard !running else {
        throw ComposerFailure("Stop the current response before undoing or redoing.")
      }
      let boundary = try await client.revert(id).revert?.messageID
      if slash.name == "redo" {
        guard boundary != nil else { throw ComposerFailure("There is nothing to redo.") }
        _ = try await action(id, .init(action: "redo"))
      } else {
        return try await undo(id, boundary: boundary)
      }
    case "rename":
      guard !arguments.isEmpty else { throw ComposerFailure("Enter a title after /rename.") }
      _ = try await action(id, .init(action: "rename", title: String(arguments.prefix(256))))
    case "export":
      let format = arguments.lowercased() == "json" ? "json" : "markdown"
      return .exported(try await export(id, format: format))
    default:
      break
    }
    await load()
    return .acknowledged
  }

  /// The user messages still visible: everything before a staged undo.
  func visibleUserMessages(boundary: String?) -> [UserMessage] {
    var users: [UserMessage] = []
    for message in messages {
      if message.id == boundary { break }
      if case .user(let user) = message { users.append(user) }
    }
    return users
  }

  private func action(_ id: String, _ action: GatewayClient.SessionAction) async throws -> SessionInfo? {
    try await client.action(id, action)
  }

  /// Port of `undoDraft`: prepares the undone prompt before staging, then stages the undo.
  private func undo(_ id: String, boundary: String?) async throws -> SendResult {
    guard let message = visibleUserMessages(boundary: boundary).last else {
      throw ComposerFailure("No earlier user message is loaded. Load earlier history to undo.")
    }
    guard message.text.utf16.count <= 200_000 else {
      throw ComposerFailure("This message is too long to restore into the composer.")
    }
    let sent = try? await client.sentMessages(id).first { $0.id == message.id }
    // Mentioned files and chats return as mentions; OpenCode reads them again on the next send.
    let files = (sent?.files ?? []).filter { $0.mention == nil && $0.data != nil }
    guard files.count <= AttachmentEncoder.maxCount else {
      throw ComposerFailure("Attach up to \(AttachmentEncoder.maxCount) photos per message.")
    }
    let attachments = await Self.restore(files).map {
      DraftAttachment(
        name: $0.name, uri: $0.uri, bytes: $0.bytes,
        thumbnail: $0.thumbnail.flatMap(UIImage.init(data:)) ?? UIImage())
    }
    guard attachments.reduce(0, { $0 + $1.bytes }) <= AttachmentEncoder.maxTotalBytes else {
      throw ComposerFailure("Photos must total 80 MB or less per message.")
    }
    _ = try await action(id, .init(action: "undo", messageID: message.id))
    await load()
    return .restored(text: message.text, attachments: attachments, mentions: sent?.mentions ?? [])
  }

  private nonisolated struct Restored: Sendable {
    var name: String
    var uri: String
    var bytes: Int
    var thumbnail: Data?
  }

  /// Decodes undone attachments off the main actor; images get a thumbnail.
  @concurrent private static func restore(_ files: [SentMessage.File]) async -> [Restored] {
    files.compactMap { file in
      guard let base64 = file.data, let bytes = Data(base64Encoded: base64) else { return nil }
      let mime = file.mime ?? "application/octet-stream"
      let image = mime.hasPrefix("image/") ? UIImage(data: bytes) : nil
      let thumbnail = image?.preparingThumbnail(of: CGSize(width: 180, height: 180))?
        .jpegData(compressionQuality: 0.7)
      return Restored(
        name: file.name ?? "attachment", uri: "data:\(mime);base64,\(base64)",
        bytes: bytes.count, thumbnail: thumbnail)
    }
  }

  /// Saves the export under a title-based name in the temporary folder, for the share sheet.
  private func export(_ id: String, format: String) async throws -> URL {
    let data = try await client.export(id, format: format)
    let base = (session?.title ?? "").lowercased()
      .replacingOccurrences(of: #"[^\p{L}\p{N}_-]+"#, with: "-", options: .regularExpression)
      .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    let name = String((base.isEmpty ? id : base).prefix(80))
    let url = FileManager.default.temporaryDirectory
      .appending(path: "\(name).\(format == "markdown" ? "md" : "json")")
    try data.write(to: url, options: .atomic)
    return url
  }
}

/// The system share sheet, for exported threads.
struct ShareSheet: UIViewControllerRepresentable {
  let url: URL
  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: [url], applicationActivities: nil)
  }
  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
