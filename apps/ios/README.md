# OpenCodex for iPhone

A native SwiftUI/UIKit client for an OpenCodex gateway. The phone runs no agent: it pairs with
the computer's **Settings → Remote access** and uses the same `/api` routes as the desktop UI,
through the Cloudflare tunnel, with a bearer device token kept in the Keychain.

## Build

```sh
brew install xcodegen
cd apps/ios
xcodegen generate          # OpenCodex.xcodeproj is generated, not committed
open OpenCodex.xcodeproj
```

For a real iPhone, create `Config/Local.xcconfig` (gitignored) with `DEVELOPMENT_TEAM = <team ID>`.

## Layout

- `OpenCodex/Core`: gateway client, Codable models, the shared event stream (`EventHub`),
  Keychain and pairing (`ConnectionStore`). Models decode leniently; unknown message kinds
  become `.other`. `LocalCache` keeps the gateway's raw JSON for the thread list and recently
  used threads in `Library/Caches`, so screens draw at once over the tunnel and then refresh.
- `Features/Chat/ChatModelStore.swift`: the last eight opened chats stay in memory for five
  minutes, so going back and reopening one is instant.
- `OpenCodex/Features/<Screen>`: one folder per screen. `Chat/ChatModel.swift` owns one chat's
  snapshots, the streamed-text overlay, and its actions; the transcript, composer and request
  cards read it.
- `OpenCodex/Features/Chat/Transcript`: a port of the web timeline projection
  (`TimelineModel.swift`) drawn by a `UICollectionView` with a small custom layout that keeps
  the visible row anchored when older pages load. Answers are one row per top-level Markdown
  block, so long replies stay virtualized and streaming re-renders only the last block; a
  `CADisplayLink` pacer reveals streamed words steadily.
- `OpenCodexTests`: decoding of real gateway responses in `Fixtures/`, and the timeline projection.
- `OpenCodexUITests`: screen flows against a live loopback gateway, including `FlowTests`: new chat → send → approve the edit → the file exists → the reply finishes.

## Testing against an isolated OpenCode

The simulator shares the Mac's network, so it can use a loopback gateway, which needs no token:

```sh
# an isolated OpenCode (temporary XDG_* dirs, OPENCODE_SERVER_PASSWORD) on :4799, then
OPENCODE_URL=http://127.0.0.1:4799 OPENCODE_PASSWORD=… bun run --cwd packages/gateway dev
```

Launch arguments:

- `-gateway http://127.0.0.1:4310`: skip pairing and use that gateway.
- `-session <id>`: open that chat on launch.
- `-reset`: forget the saved gateway and token.

Never point tests at your own OpenCode service.
