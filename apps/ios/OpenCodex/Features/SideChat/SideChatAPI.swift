import Foundation

/// The most side chats one chat keeps (`MAX_SIDE_CHATS`).
let maxSideChats = 8

nonisolated extension GatewayClient {
  /// The main chat's side chats, oldest first.
  func sideChats(_ mainID: String) async throws -> [SessionInfo] {
    try await get("/sessions/\(mainID)/side-chats")
  }
  /// Forks the main chat into a guarded side chat; the gateway prepares it before returning.
  func createSideChat(_ mainID: String) async throws -> SessionInfo {
    try await post("/sessions/\(mainID)/side-chats")
  }
  func deleteSideChat(_ mainID: String, _ sideID: String) async throws -> OK {
    try await delete("/sessions/\(mainID)/side-chats/\(sideID)")
  }
  /// The live context plugin, which lets side chats read the main chat's latest progress.
  func sideChatPlugin(directory: String?) async throws -> PluginStatus {
    try await get("/side-chat-plugin", ["directory": directory])
  }
}

extension SessionInfo {
  /// The main chat a side chat was forked from (`opencodexSideChat.parentID`).
  var sideChatParent: String? { metadata?["opencodexSideChat"]?["parentID"]?.string }
}

// MARK: - Hooks for the chat (see the integration note)

extension ChatModel {
  /// A side chat: its composer says "Ask a side question", keeps only /undo, /redo and
  /// /compact, and its transcript hides the history it inherited from the main chat.
  var isSideChat: Bool { session?.sideChatParent != nil }
}

/// The desktop's `SIDE_CHAT_HIDDEN_COMMANDS`: every local command but /undo, /redo, /compact.
let sideChatHiddenCommands: Set<String> = ["fork", "new", "rename", "export", "side"]
