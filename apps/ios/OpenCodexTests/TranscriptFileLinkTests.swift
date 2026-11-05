import Foundation
import Testing

@testable import OpenCodex

/// The port of the desktop's `resolveFileLink` (`file-link.ts`).
struct TranscriptFileLinkTests {
  private let root = "/work/proj"

  @Test func resolvesPathsInsideAndOutsideTheChatFolder() {
    #expect(
      FileLinkTarget.resolve("/work/proj/src/math.ts", directory: root)
        == FileLinkTarget(directory: root, path: "src/math.ts"))
    #expect(
      FileLinkTarget.resolve("src/../README.md", directory: root)
        == FileLinkTarget(directory: root, path: "README.md"))
    #expect(
      FileLinkTarget.resolve("file:///work/proj/a%20b.md#L3", directory: root)
        == FileLinkTarget(directory: root, path: "a b.md"))
    // Outside the folder: opened from its own folder.
    #expect(
      FileLinkTarget.resolve("/etc/hosts", directory: root) == FileLinkTarget(directory: "/etc", path: "hosts"))
  }

  @Test(arguments: ["https://example.com/a.md", "mailto:a@b.c", "#section", "//cdn/x.js", "src/", "file://host/x"])
  func ignoresWhatIsNotAFile(_ href: String) {
    #expect(FileLinkTarget.resolve(href, directory: root) == nil)
  }
}
