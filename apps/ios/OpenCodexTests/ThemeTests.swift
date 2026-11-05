import Testing
import UIKit

@testable import OpenCodex

/// The exported desktop tokens parse to the same colors the web UI paints.
struct ThemeTests {
  @Test func desktopTokensParse() throws {
    let light = try #require(ThemeCatalog.shared.palettes.first { $0.id == "opencodex-light" })
    var (r, g, b, a) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
    light.ui("surface").getRed(&r, green: &g, blue: &b, alpha: &a)
    #expect([r, g, b].map { Int(($0 * 255).rounded()) } == [0xf9, 0xf9, 0xf8])
    light.ui("border").getRed(&r, green: &g, blue: &b, alpha: &a)
    #expect(abs(a - 0.078) < 0.001)
    #expect(light.shadows("composer-shadow").count == 4)
    #expect(light.shadows("composer-shadow").first?.inset == true)
    #expect(ThemeCatalog.shared.palettes.count == 23)
  }
}
