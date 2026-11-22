// Prints "<unix_ms> <pid> <width>x<height>" once an on-screen, normal-layer window at least
// 200x200 points appears whose owning process runs the given executable. Exits 1 on timeout.
// Uses only window bounds and owner PIDs, which need no Screen Recording permission.
//
//   winwatch <absolute-executable-path> [timeout-ms]
import CoreGraphics
import Darwin
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else {
  FileHandle.standardError.write("usage: winwatch <executable> [timeout-ms]\n".data(using: .utf8)!)
  exit(2)
}
let target = URL(fileURLWithPath: args[1]).resolvingSymlinksInPath().path
let timeout = args.count > 2 ? Double(args[2])! / 1000 : 60
let start = Date()
var paths: [pid_t: String] = [:]

func path(of pid: pid_t) -> String {
  if let cached = paths[pid] { return cached }
  var buffer = [CChar](repeating: 0, count: Int(MAXPATHLEN) * 4)
  let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
  let value = length > 0 ? URL(fileURLWithPath: String(cString: buffer)).resolvingSymlinksInPath().path : ""
  paths[pid] = value
  return value
}

while Date().timeIntervalSince(start) < timeout {
  let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
  for window in windows {
    guard (window[kCGWindowLayer as String] as? Int) == 0,
      let pid = window[kCGWindowOwnerPID as String] as? pid_t,
      let bounds = window[kCGWindowBounds as String] as? [String: Double],
      let width = bounds["Width"], let height = bounds["Height"],
      width >= 200, height >= 200,
      path(of: pid) == target
    else { continue }
    print("\(Int64(Date().timeIntervalSince1970 * 1000)) \(pid) \(Int(width))x\(Int(height))")
    exit(0)
  }
  usleep(5_000)
}
exit(1)
