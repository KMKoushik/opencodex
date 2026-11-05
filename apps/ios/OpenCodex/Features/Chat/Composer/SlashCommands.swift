import Foundation
import Observation

/// One entry of the `/` menu: a local thread action, a skill, or a server command.
/// Port of the desktop `slash-commands.ts`.
nonisolated struct SlashCommand: Hashable, Identifiable, Sendable {
  var name: String
  var description: String
  /// Set when the entry runs a skill rather than a command.
  var skill: String?
  var id: String { name }

  /// Thread actions the composer runs itself, in the desktop's order.
  static let local: [SlashCommand] = [
    .init(name: "undo", description: "Stage undo of the last turn; apply when you next send"),
    .init(name: "redo", description: "Cancel staged undo and restore the conversation"),
    .init(name: "fork", description: "Fork this conversation into a new thread"),
    .init(name: "new", description: "Start a new thread in this project"),
    .init(name: "compact", description: "Summarize the conversation to free context"),
    .init(name: "rename", description: "Rename this thread · /rename New title"),
    .init(name: "export", description: "Download this conversation as Markdown · /export json"),
  ]
  static let localNames = Set(local.map(\.name))

  /// Exact name, then prefix, then substring, then description matches; at most 50.
  static func match(_ commands: [SlashCommand], _ search: String) -> [SlashCommand] {
    let query = search.lowercased()
    var groups: [[SlashCommand]] = [[], [], [], []]
    for command in commands {
      let name = command.name.lowercased()
      let rank =
        name == query
        ? 0
        : name.hasPrefix(query)
          ? 1
          : name.contains(query)
            ? 2 : command.description.lowercased().contains(query) ? 3 : -1
      // Rank before limiting, so an exact match cannot be buried by description matches.
      if rank >= 0, groups[rank].count < 50 { groups[rank].append(command) }
    }
    return Array(groups.joined().prefix(50))
  }

  /// `/name rest…` → the name and the text after it.
  static func parse(_ text: String) -> (name: String, text: String)? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.hasPrefix("/") else { return nil }
    let body = trimmed.dropFirst()
    let end = body.firstIndex(where: { $0.isWhitespace }) ?? body.endIndex
    let name = body[..<end]
    guard !name.isEmpty, !name.contains("/") else { return nil }
    let rest = body[end...].drop(while: { $0.isWhitespace })
    return (String(name), String(rest))
  }

  /// The draft is a bare `/query` being typed, so the menu should show.
  static func isSearch(_ text: String) -> Bool {
    guard text.hasPrefix("/") else { return false }
    return !text.dropFirst().contains { $0.isWhitespace || $0 == "/" }
  }
}

/// Native command and skill metadata, as `/api/commands` and `/api/workspace/skills` send them.
nonisolated struct CommandInfo: Decodable, Sendable {
  var name: String
  var description: String?
}

nonisolated struct SkillInfo: Decodable, Hashable, Sendable {
  var id: String
  var name: String
  var description: String?
}

nonisolated extension GatewayClient {
  func commands(directory: String) async throws -> [CommandInfo] {
    try await get("/commands", ["directory": directory])
  }
  func skills(directory: String) async throws -> [SkillInfo] {
    try await get("/workspace/skills", ["directory": directory])
  }
}

/// Each project's `/` catalog: local actions, then skills, then server commands. Fetched only
/// while the menu is used, and kept 30 seconds, like the desktop's query.
@Observable
final class SlashCatalogStore {
  static let shared = SlashCatalogStore()

  struct Entry {
    var commands: [SlashCommand]?
    var skills: [SkillInfo]?
    var error: String?
    var loading = false
    var fetched: Date?
  }

  private(set) var entries: [String: Entry] = [:]

  func load(_ client: GatewayClient, directory: String, force: Bool = false) async {
    let entry = entries[directory] ?? Entry()
    if entry.loading { return }
    if !force, let fetched = entry.fetched, Date().timeIntervalSince(fetched) < 30 { return }
    entries[directory, default: Entry()].loading = true
    entries[directory]?.error = nil
    do {
      async let commands = client.commands(directory: directory)
      async let skills = client.skills(directory: directory)
      let (found, skillList) = try await (commands, skills)
      var seen = SlashCommand.localNames
      var merged = SlashCommand.local
      for skill in skillList where seen.insert(skill.name).inserted {
        merged.append(.init(name: skill.name, description: skill.description ?? "Use skill", skill: skill.id))
      }
      for command in found where seen.insert(command.name).inserted {
        merged.append(.init(name: command.name, description: command.description ?? "Run command"))
      }
      entries[directory] = Entry(commands: merged, skills: skillList, fetched: Date())
    } catch {
      // A failed discovery stays visible; it never becomes an empty catalog.
      entries[directory]?.loading = false
      entries[directory]?.error = error.localizedDescription
    }
  }

  /// Skills only, for the `@` menu; shares the slash catalog's fetch.
  func skills(_ directory: String) -> [SkillInfo]? { entries[directory]?.skills }
}
