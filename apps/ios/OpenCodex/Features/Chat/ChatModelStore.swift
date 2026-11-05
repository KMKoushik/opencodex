import Foundation

/// Recently opened chats, kept in memory so going back and opening one again is instant, like
/// T3 Code's thread retention: the last 8, for 5 minutes after they leave the screen. A kept
/// model refetches its snapshots when it reopens.
final class ChatModelStore {
  static let shared = ChatModelStore()

  static let limit = 8
  static let lifetime: TimeInterval = 5 * 60

  private struct Entry {
    let model: ChatModel
    var used: Date
  }
  private var entries: [String: Entry] = [:]

  private static func key(_ client: GatewayClient, _ id: String) -> String {
    "\(client.base.absoluteString)|\(id)"
  }

  /// The kept model for a thread, or a new one.
  func model(client: GatewayClient, events: EventHub, sessionID id: String) -> ChatModel {
    let now = Date.now
    entries = entries.filter { now.timeIntervalSince($0.value.used) < Self.lifetime }
    let key = Self.key(client, id)
    if let entry = entries[key], entry.model.client.token == client.token, entry.model.events === events {
      entries[key]?.used = now
      return entry.model
    }
    let model = ChatModel(client: client, events: events, sessionID: id)
    keep(model, key: key, now: now)
    return model
  }

  /// Keeps a chat, e.g. a draft that has just been created, or one leaving the screen.
  func release(_ model: ChatModel) {
    guard let id = model.sessionID else { return }
    keep(model, key: Self.key(model.client, id), now: .now)
  }

  func remove(client: GatewayClient, sessionID id: String) {
    entries[Self.key(client, id)] = nil
  }

  func removeAll() { entries = [:] }

  private func keep(_ model: ChatModel, key: String, now: Date) {
    entries[key] = Entry(model: model, used: now)
    while entries.count > Self.limit, let oldest = entries.min(by: { $0.value.used < $1.value.used }) {
      entries[oldest.key] = nil
    }
  }
}
