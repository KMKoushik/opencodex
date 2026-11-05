import OSLog
import QuartzCore

/// Opt-in frame pacing check for the transcript (`-transcriptHitches YES`): while the list
/// scrolls or text streams, counts frames that arrive later than 1.5 frame durations and logs a
/// summary when the activity ends. Off by default; it costs nothing unless enabled.
final class HitchMonitor {
  static let enabled = UserDefaults.standard.bool(forKey: "transcriptHitches")
  private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "opencodex", category: "hitches")

  private var link: CADisplayLink?
  private var last: CFTimeInterval = 0
  private var frames = 0
  private var hitches = 0
  private var hitchTime: CFTimeInterval = 0
  private var started: CFTimeInterval = 0
  private var label = ""

  /// Starts measuring an activity (`scroll`, `stream`), if not already measuring.
  func begin(_ label: String) {
    guard Self.enabled, link == nil else { return }
    self.label = label
    frames = 0
    hitches = 0
    hitchTime = 0
    last = 0
    started = CACurrentMediaTime()
    let link = CADisplayLink(target: Target { [weak self] link in self?.frame(link) }, selector: #selector(Target.tick))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
    link.add(to: .main, forMode: .common)
    self.link = link
  }

  func end() {
    guard let link else { return }
    link.invalidate()
    self.link = nil
    let duration = CACurrentMediaTime() - started
    guard duration > 0.2 else { return }
    let summary = String(
      format: "transcript %@: %d hitches in %d frames over %.2fs, hitch time %.1f ms/s", label, hitches, frames,
      duration, hitchTime * 1000 / duration)
    Self.log.notice("\(summary, privacy: .public)")
    print(summary)
  }

  private func frame(_ link: CADisplayLink) {
    defer { last = link.timestamp }
    guard last > 0 else { return }
    frames += 1
    let expected = link.targetTimestamp - link.timestamp
    let actual = link.timestamp - last
    if expected > 0, actual > expected * 1.5 {
      hitches += 1
      hitchTime += actual - expected
    }
  }

  private final class Target: NSObject {
    let action: (CADisplayLink) -> Void
    init(_ action: @escaping (CADisplayLink) -> Void) { self.action = action }
    @objc func tick(_ link: CADisplayLink) { action(link) }
  }
}
