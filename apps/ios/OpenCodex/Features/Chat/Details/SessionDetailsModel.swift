import Foundation
import Observation

/// A snapshot that is loading, loaded, or failed with the gateway's message.
nonisolated enum Loadable<Value> {
  case loading
  case loaded(Value)
  case failed(String)

  var value: Value? {
    if case .loaded(let value) = self { return value }
    return nil
  }
  var error: String? {
    if case .failed(let message) = self { return message }
    return nil
  }
  var isLoading: Bool {
    if case .loading = self { return true }
    return false
  }
}

extension Loadable: Sendable where Value: Sendable {}

/// The Session details sheet's snapshots, like the desktop session panel's queries. Loaded
/// when the sheet opens and refreshed when a run ends or the event stream reconnects, so an
/// idle sheet costs nothing.
@Observable
final class SessionDetailsModel {
  let client: GatewayClient
  let sessionID: String

  private(set) var usage: Loadable<SessionDetails.SessionUsage> = .loading
  /// The first page of direct subagents, as the desktop summary shows.
  private(set) var children: Loadable<[SessionDetails.SessionUsage]> = .loading
  private(set) var moreChildren = false
  /// Every nested subagent, for the cost total.
  private(set) var subagentCosts: Loadable<[SessionDetails.SessionUsage]> = .loading
  private(set) var models: Loadable<[ModelCatalog.Model]> = .loading
  private(set) var project: Loadable<SessionDetails.Project?> = .loading
  private(set) var checkout: SessionDetails.Checkout?
  private(set) var vcs: Loadable<SessionDetails.Vcs> = .loading
  private(set) var mcp: Loadable<[SessionDetails.McpServer]> = .loading
  private(set) var skills: Loadable<[SessionDetails.Skill]> = .loading

  @ObservationIgnored private var directory: String?

  init(client: GatewayClient, sessionID: String) {
    self.client = client
    self.sessionID = sessionID
  }

  /// Loads everything for the chat's checkout. Sections fail independently.
  func load(directory: String, projectID: String?) async {
    let first = self.directory != directory
    self.directory = directory
    async let session: Void = loadSession()
    async let workspace: Void = loadWorkspace(directory: directory, projectID: projectID)
    async let models: Void = first ? loadModels(directory: directory) : ()
    _ = await (session, workspace, models)
  }

  /// What a finished run can change: cost, tokens, subagents and the working tree.
  func refresh() async {
    guard let directory else { return }
    async let session: Void = loadSession()
    async let vcs: Void = loadVcs(directory: directory)
    _ = await (session, vcs)
  }

  private func loadSession() async {
    let client = client
    let id = sessionID
    async let usage = result { try await client.sessionUsage(id) }
    async let page = result { try await client.subagentUsage(id) }
    self.usage = await usage
    let firstPage = await page
    switch firstPage {
    case .loaded(let page):
      children = .loaded(page.data)
      moreChildren = page.cursor?.next != nil
      // Reuse the first page already loaded for the summary rather than fetching it twice.
      subagentCosts = await result {
        try await SessionCost.subagents(of: id) { parent, cursor in
          if parent == id, cursor == nil { return page }
          return try await client.subagentUsage(parent, cursor: cursor)
        }
      }
    case .failed(let message):
      children = .failed(message)
      subagentCosts = .failed(message)
    case .loading: break
    }
  }

  private func loadModels(directory: String) async {
    let client = client
    models = await result { try await client.models(directory: directory).data }
  }

  private func loadWorkspace(directory: String, projectID: String?) async {
    let client = client
    async let projects = result { try await client.checkoutProjects() }
    async let vcs: Void = loadVcs(directory: directory)
    async let mcp = result { try await client.mcpServers(directory: directory) }
    async let skills = result { try await client.projectSkills(directory: directory) }
    switch await projects {
    case .loaded(let list):
      let match = list.first { $0.id == projectID } ?? list.first { $0.canonical == directory }
      project = .loaded(match)
      var checkout = SessionDetails.Checkout(project: match, directory: directory)
      if let match, checkout.canonical != nil, !checkout.local,
        let trees = try? await client.worktreeList(projectID: match.id)
      {
        checkout.removed = !trees.contains { SessionDetails.Checkout.within(directory, $0.directory) }
      }
      self.checkout = checkout
    case .failed(let message): project = .failed(message)
    case .loading: break
    }
    self.mcp = await mcp
    self.skills = await skills
    await vcs
  }

  private func loadVcs(directory: String) async {
    let client = client
    let next = await result { try await client.vcsSummary(directory: directory) }
    // Keep showing the last snapshot while a refresh fails transiently.
    if next.value != nil || vcs.value == nil { vcs = next }
  }

  /// Retries one failed section.
  func retry() async {
    guard let directory else { return }
    await load(directory: directory, projectID: project.value??.id)
    if models.error != nil { await loadModels(directory: directory) }
  }
}

private nonisolated func result<Value: Sendable>(
  _ work: @Sendable () async throws -> Value
) async -> Loadable<Value> {
  do { return .loaded(try await work()) } catch { return .failed(error.localizedDescription) }
}
