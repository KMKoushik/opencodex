import SwiftUI

/// The desktop's `AppIcon`: the app's glyph on a `project-*` tile, its initial when it has none.
struct AppIcon: View {
  let id: String
  let title: String
  let icon: CanvasIcon?
  var size: CGFloat = 20
  @Environment(\.palette) private var palette

  var body: some View {
    let color = icon?.color.flatMap { ProjectIcon.colors.contains($0) ? $0 : nil } ?? fallbackColor
    let shape = RoundedRectangle(cornerRadius: size / 4, style: .continuous)
    ZStack {
      palette.color("project-\(color)")
      if let glyph = icon?.glyph, let symbol = AppGlyphs.available[glyph] {
        Image(systemName: symbol)
          .font(.system(size: size * 0.5, weight: .regular))
      } else {
        Text(title.trimmingCharacters(in: .whitespaces).first.map { String($0).localizedUppercase } ?? "?")
          .font(.system(size: size * 0.62, weight: .medium))
      }
    }
    .foregroundStyle(palette.color("on-project"))
    .frame(width: size, height: size)
    .clipShape(shape)
    .overlay(shape.strokeBorder(palette.color("border-heavy"), lineWidth: 1))
    .accessibilityHidden(true)
  }

  /// Apps without a color keep a stable one (`fallbackColor`), so lists don't read as gray.
  private var fallbackColor: String {
    var hash: UInt32 = 0
    for unit in id.utf16 { hash = hash &* 31 &+ UInt32(unit) }
    let colors = ["blue", "green", "orange", "pink", "purple"]
    return colors[Int(hash % UInt32(colors.count))]
  }
}

/// SF Symbols for the canvas glyph names (`canvas-glyphs.ts`), matched in meaning.
enum AppGlyphs {
  /// Only symbols this OS has; any other glyph falls back to the title's initial.
  static let available = symbols.filter { UIImage(systemName: $0.value) != nil }

  static let symbols: [String: String] = [
    // General
    "activity": "waveform.path.ecg", "alert": "exclamationmark.triangle", "check": "checkmark",
    "star": "star", "heart": "heart", "fire": "flame", "flag": "flag", "bookmark": "bookmark",
    "notification": "bell", "flash": "bolt", "target": "scope", "award": "rosette",
    "crown": "crown", "sparkles": "sparkles", "idea": "lightbulb", "eye": "eye", "pin": "pin",
    "tag": "tag", "home": "house", "settings": "gearshape", "filter": "line.3.horizontal.decrease",
    "refresh": "arrow.clockwise", "magic-wand": "wand.and.stars", "thumbs-up": "hand.thumbsup",
    "smile": "face.smiling", "info": "info.circle", "help": "questionmark.circle",
    "puzzle": "puzzlepiece", "search": "magnifyingglass",
    // Development
    "code": "chevron.left.forwardslash.chevron.right", "terminal": "terminal", "bug": "ladybug",
    "test": "testtube.2", "pull-request": "arrow.triangle.pull", "git-branch": "arrow.triangle.branch",
    "git-commit": "smallcircle.filled.circle", "git-merge": "arrow.triangle.merge",
    "git-fork": "arrow.branch", "github": "chevron.left.forwardslash.chevron.right",
    "database": "cylinder.split.1x2", "server": "server.rack", "api": "curlybraces",
    "cpu": "cpu", "webhook": "point.3.connected.trianglepath.dotted",
    "source-code": "curlybraces.square", "file-code": "doc.text", "package": "shippingbox",
    "robot": "cpu.fill", "ai": "brain", "layers": "square.3.layers.3d", "browser": "safari",
    "workflow": "flowchart", "algorithm": "function", "variable": "x.squareroot",
    "plug": "powerplug", "npm": "shippingbox.fill", "rocket": "paperplane",
    // Devices
    "cloud": "cloud", "globe": "globe", "monitor": "display", "laptop": "laptopcomputer",
    "smartphone": "iphone", "wifi": "wifi", "link": "link", "hard-drive": "internaldrive",
    "power": "power", "battery": "battery.75percent", "gauge": "gauge.with.dots.needle.50percent",
    "router": "wifi.router", "keyboard": "keyboard", "printer": "printer", "qr-code": "qrcode",
    "satellite": "antenna.radiowaves.left.and.right",
    // Data
    "chart": "chart.bar", "chart-line": "chart.xyaxis.line", "analytics": "chart.bar.xaxis",
    "pie-chart": "chart.pie", "dashboard": "square.grid.2x2", "table": "tablecells",
    "trend-up": "chart.line.uptrend.xyaxis", "trend-down": "chart.line.downtrend.xyaxis",
    "calculator": "plusminus", "percent": "percent", "presentation": "rectangle.on.rectangle",
    "pulse": "waveform", "scatter": "chart.dots.scatter", "grid": "square.grid.3x3",
    "kanban": "rectangle.split.3x1", "chart-bubble": "circle.grid.cross", "radar": "dot.radiowaves.left.and.right",
    "chart-histogram": "chart.bar.xaxis",
    // Money
    "dollar": "dollarsign", "euro": "eurosign", "pound": "sterlingsign", "bitcoin": "bitcoinsign",
    "credit-card": "creditcard", "wallet": "wallet.bifold", "bank": "building.columns",
    "invoice": "doc.plaintext", "receipt": "receipt", "cart": "cart", "shopping-bag": "bag",
    "store": "storefront", "briefcase": "briefcase", "coins": "dollarsign.circle",
    "piggy-bank": "banknote", "gift": "gift", "ticket": "ticket", "discount": "tag.circle",
    "handshake": "hands.clap", "safe": "lock.square",
    // Communication
    "chat": "bubble.left", "mail": "envelope", "inbox": "tray", "send": "paperplane",
    "phone": "phone", "video": "video", "mic": "mic", "megaphone": "megaphone",
    "comment": "text.bubble", "share": "square.and.arrow.up", "at": "at",
    "rss": "dot.radiowaves.up.forward", "slack": "number", "discord": "gamecontroller",
    "translate": "character.bubble", "bubble-chat": "bubble.left.and.bubble.right",
    "voice": "waveform",
    // People
    "users": "person.2", "user": "person", "user-add": "person.badge.plus",
    "user-check": "person.badge.shield.checkmark", "team": "person.3", "contact": "person.crop.rectangle",
    "id-card": "person.text.rectangle", "graduation": "graduationcap", "support": "headset",
    "user-search": "person.crop.circle.badge.questionmark",
    // Time
    "calendar": "calendar", "clock": "clock", "alarm": "alarm", "timer": "timer",
    "hourglass": "hourglass", "history": "clock.arrow.circlepath", "checklist": "checklist",
    "task": "square.and.pencil", "task-done": "checkmark.square", "calendar-check": "calendar.badge.checkmark",
    // Documents
    "file": "doc", "book": "book.closed", "note": "note.text", "notebook": "book",
    "news": "newspaper", "pen": "pencil.tip", "pencil": "pencil", "clipboard": "clipboard",
    "archive": "archivebox", "folder": "folder", "image": "photo", "camera": "camera",
    "music": "music.note", "film": "film", "palette": "paintpalette", "brush": "paintbrush",
    "quote": "quote.opening", "attachment": "paperclip", "pdf": "doc.richtext",
    "license": "checkmark.seal",
    // Security
    "shield": "shield", "lock": "lock", "unlock": "lock.open", "key": "key",
    "fingerprint": "touchid", "password": "key.horizontal", "security-check": "checkmark.shield",
    "spam": "exclamationmark.octagon",
    // Places
    "map": "map", "location": "mappin.and.ellipse", "compass": "safari", "truck": "truck.box",
    "plane": "airplane", "car": "car", "train": "tram", "ship": "ferry", "building": "building.2",
    "factory": "building", "hospital": "cross.case", "school": "graduationcap",
    // Tools
    "tools": "wrench.and.screwdriver", "wrench": "wrench.adjustable", "hammer": "hammer",
    "magnet": "magnifyingglass.circle", "scissors": "scissors", "ruler": "ruler",
    "toggle": "switch.2", "sliders": "slider.horizontal.3", "paint-bucket": "paintbrush.pointed",
    "brick": "square.stack.3d.up",
    // Nature
    "sun": "sun.max", "moon": "moon", "rain": "cloud.rain", "snow": "snowflake",
    "thermometer": "thermometer.medium", "leaf": "leaf", "tree": "tree", "earth": "globe.europe.africa",
    "mountain": "mountain.2", "droplet": "drop", "flower": "camera.macro", "recycle": "arrow.3.trianglepath",
    // Lifestyle
    "coffee": "cup.and.saucer", "pizza": "fork.knife", "game": "gamecontroller", "dice": "dice",
    "headphones": "headphones", "party": "party.popper", "cake": "birthday.cake",
    "dumbbell": "dumbbell", "medicine": "pills", "brain": "brain.head.profile", "atom": "atom",
    "dna": "allergens", "book-open": "book", "heart-pulse": "heart.text.square",
  ]
}
