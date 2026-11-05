import XCTest

@testable import OpenCodex

nonisolated final class WorkspaceLogicTests: XCTestCase {
  /// The unified gutter, hunk gaps and the paired-line highlight, from a real gateway patch.
  func testDiffLines() {
    let patch = """
      diff --git a/src/lib/math.ts b/src/lib/math.ts
      --- a/src/lib/math.ts
      +++ b/src/lib/math.ts
      @@ -4,8 +4,11 @@ export function add(a: number, b: number) {
       }
       
       export function multiply(a: number, b: number): number {
      -  const result = a * b; // keep it simple
      -  return result;
      +  return a * b;
       }
       
      -export const PI = 3.14159;
      +export const PI = Math.PI;
      +
      +export function subtract(a: number, b: number) {
      +  return a - b;
      +}
      @@ -20,2 +23,2 @@
      -old
      +new

      """
    let lines = DiffParser.parse(patch, trailingContext: true).lines
    XCTAssertEqual(lines.first?.kind, .separator(count: 3))
    XCTAssertEqual(lines.last?.kind, .separator(count: nil))
    XCTAssertTrue(lines.contains { $0.kind == .separator(count: 8) }, "Lines 12–19 are collapsed")

    let removed = lines.filter { $0.kind == .removed }
    let added = lines.filter { $0.kind == .added }
    XCTAssertEqual(removed.map(\.number), [7, 8, 11, 20])
    XCTAssertEqual(added.map(\.number), [7, 10, 11, 12, 13, 14, 23])
    // `return result;` pairs with `return a * b;`, not the dissimilar first removal.
    XCTAssertNil(removed[0].changed)
    XCTAssertEqual(removed[1].changed, 9..<15)
    XCTAssertEqual(added[0].changed, 9..<14)
  }

  /// Changes trees open every folder, flatten single-folder chains and sort folders first.
  func testChangesTree() {
    let rows = WorkspaceTree.rows(
      paths: ["src/old.js", "src/lib/math.ts", "docs/guide/intro.md", "README.md"],
      statuses: ["src/old.js": .deleted, "README.md": .modified], flatten: true)
    XCTAssertEqual(
      rows.map(\.name), ["docs/guide", "intro.md", "src", "lib", "math.ts", "old.js", "README.md"])
    XCTAssertEqual(rows.map(\.depth), [0, 1, 0, 1, 2, 1, 0])
    XCTAssertEqual(rows.first { $0.name == "old.js" }?.status, .deleted)
    XCTAssertEqual(rows.filter(\.changed).map(\.path), ["src"])

    let collapsed = WorkspaceTree.rows(
      paths: ["src/lib/math.ts", "README.md"], statuses: [:], collapsed: ["src/lib"], flatten: true)
    XCTAssertEqual(collapsed.map(\.name), ["src/lib", "README.md"])
  }
}
