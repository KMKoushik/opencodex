import AppKit
import ApplicationServices
import ScreenCaptureKit
import ImageIO
import UniformTypeIdentifiers
import Darwin

// stdout is exclusively the bounded JSON-lines protocol. No diagnostics or image data are logged.
private let maxLineBytes = 128 * 1024
private let identity = "dev.opencodex.computer-control"
private let cancellation = Cancellation()

private final class Cancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    var stopped: Bool { lock.lock(); defer { lock.unlock() }; return value }
    func stop() { lock.lock(); value = true; lock.unlock() }
}

private struct Failure: Error {
    let code: String
    let message: String
    init(_ code: String, _ message: String) { self.code = code; self.message = message }
}

private func checkCancellation() throws {
    if cancellation.stopped { throw Failure("cancelled", "Request cancelled; input is never replayed.") }
}

private func string(_ input: [String: Any], _ key: String, max: Int = 512) throws -> String {
    guard let value = input[key] as? String, !value.isEmpty, value.utf8.count <= max else {
        throw Failure("invalid_input", "\(key) must be a nonempty string of at most \(max) UTF-8 bytes.")
    }
    return value
}

private func number(_ input: [String: Any], _ key: String, limit: Double = 100_000) throws -> Double {
    guard let value = input[key] as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
          value.doubleValue.isFinite, abs(value.doubleValue) <= limit else {
        throw Failure("invalid_input", "\(key) must be a finite number within ±\(Int(limit)).")
    }
    return value.doubleValue
}

private func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success else { return nil }
    return result
}

private func elementAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}

private func textAttribute(_ element: AXUIElement, _ name: String) -> String? {
    guard let value = attribute(element, name) as? String else { return nil }
    return boundedText(value)
}

private func boundedText(_ value: String) -> String {
    String(decoding: value.utf8.prefix(1024), as: UTF8.self)
}

private func bounds(_ element: AXUIElement) -> CGRect? {
    guard let position = attribute(element, kAXPositionAttribute),
          let size = attribute(element, kAXSizeAttribute),
          CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    var dimensions = CGSize.zero
    guard AXValueGetValue(position as! AXValue, .cgPoint, &point),
          AXValueGetValue(size as! AXValue, .cgSize, &dimensions) else { return nil }
    let rect = CGRect(origin: point, size: dimensions)
    return rect.isInfinite || rect.isNull ? nil : rect
}

private func rectJSON(_ rect: CGRect) -> [String: Double] {
    ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height]
}

private struct Reference {
    let element: AXUIElement
    let role: String
}

private struct Snapshot {
    let session: String
    let app: String
    let pid: pid_t
    let launched: Date?
    let created: Date
    let elements: [String: Reference]
}

private final class Controller {
    private var snapshots: [String: Snapshot] = [:]

    func handle(_ method: String, session: String, input: [String: Any]) throws -> [String: Any] {
        try checkCancellation()
        // This method is private to the trusted Settings adapter. Agent/broker methods exclude it.
        if method == "computer.request_permissions" {
            guard session == "desktop-permissions" else { throw Failure("invalid_request", "Permission requests must originate from desktop Settings.") }
            let kind = try string(input, "kind", max: 32)
            let granted: Bool
            switch kind {
            case "accessibility":
                granted = DispatchQueue.main.sync {
                    AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
                }
            case "screenRecording":
                granted = DispatchQueue.main.sync { CGRequestScreenCaptureAccess() }
            default:
                throw Failure("invalid_input", "kind must be accessibility or screenRecording.")
            }
            return ["requested": kind, "granted": granted, "permissionRequestMade": true,
                    "message": "macOS identifies the responsible application for this launch. Enable that app in Privacy & Security, then use Check access in OpenCodex Settings. A macOS-requested relaunch may still be necessary."]
        }
        if method == "computer.status" {
            let accessibility = AXIsProcessTrusted()
            let screenRecording = CGPreflightScreenCaptureAccess()
            let instructions = "Use Request access in OpenCodex Settings. macOS identifies the responsible app: OpenCodex when launched normally, or the terminal/development launcher when started there. Enable the app macOS names in System Settings > Privacy & Security > Accessibility and Screen & System Audio Recording, then use Check access. Relaunch that responsible app if macOS requests it; granting only the helper may not grant its host."
            return [
                "supported": true, "accessibility": accessibility, "screenRecording": screenRecording,
                "platform": "darwin", "minimumOS": "14.0",
                "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
                "helperBundleID": identity,
                "permissions": ["accessibility": accessibility, "screenRecording": screenRecording],
                "permissionPrompted": false,
                "permissionInstructions": instructions,
                "message": accessibility && screenRecording ? "Computer permissions are granted for this launch context." : instructions,
                "coordinates": "Global macOS screen points, origin at the top-left of the primary display; screenshots include window bounds and pixel dimensions.",
                "inputBehavior": "AX actions are preferred. CoreGraphics fallback activates the exact target app and checks foreground ownership and mouse hit targets. No clipboard use.",
                "limits": ["nodes": 512, "depth": 20, "snapshots": 16, "snapshotTTLSeconds": 90, "screenshotMaxPixelsPerSide": 2048],
            ]
        }
        if method == "computer.list" {
            let apps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular && !$0.isTerminated }
            return ["apps": apps.prefix(256).map { app -> [String: Any] in
                ["app": app.bundleIdentifier ?? "", "name": app.localizedName ?? "", "pid": app.processIdentifier, "active": app.isActive]
            }, "truncated": apps.count > 256, "scope": "Running graphical applications; app is the exact bundle identifier."]
        }
        let allowed = ["computer.state", "computer.click", "computer.type", "computer.press", "computer.scroll", "computer.set_value", "computer.drag"]
        guard allowed.contains(method) else { throw Failure("unknown_method", "Unknown computer method: \(method)") }
        guard AXIsProcessTrusted() else { throw Failure("accessibility_denied", "Accessibility permission is not granted for this launch context. Use Request access in OpenCodex Settings and enable the responsible app macOS names (which can be the terminal or development launcher). Then use Check access. This tool call did not request permission.") }
        let appID = try string(input, "app")
        let matches = NSRunningApplication.runningApplications(withBundleIdentifier: appID).filter { !$0.isTerminated }
        guard matches.count == 1, let app = matches.first else {
            throw Failure("app_unavailable", "app must identify exactly one running application by bundle ID.")
        }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 0.25)
        snapshots = snapshots.filter { Date().timeIntervalSince($0.value.created) < 90 }
        if method == "computer.state" { return try state(app, root: root, session: session, input: input) }
        // Any attempted mutation invalidates all sessions' references for this target, even on an uncertain failure.
        defer { snapshots = snapshots.filter { $0.value.app != appID } }
        switch method {
        case "computer.click":
            if input["elementID"] != nil || input["snapshotID"] != nil {
                let element = try reference(input, app: app, session: session)
                var actions: CFArray?
                if AXUIElementCopyActionNames(element, &actions) == .success,
                   let names = actions as? [String], names.contains(kAXPressAction) {
                    try checkCancellation()
                    let result = AXUIElementPerformAction(element, kAXPressAction as CFString)
                    guard result == .success else { throw Failure("ax_action_failed", "AXPress failed (\(result.rawValue)); input was not retried.") }
                    return ["performed": "click", "via": "AXPress", "snapshotsInvalidated": true]
                }
                guard let rect = bounds(element), rect.width > 0, rect.height > 0 else { throw Failure("element_unavailable", "Element has no clickable bounds; request a fresh state.") }
                try click(CGPoint(x: rect.midX, y: rect.midY), app: app)
            } else {
                try click(CGPoint(x: number(input, "x"), y: number(input, "y")), app: app)
            }
        case "computer.set_value":
            let element = try reference(input, app: app, session: session)
            guard let value = input["value"], value is String || value is NSNumber,
                  !(value is String) || (value as! String).utf8.count <= 20_000 else {
                throw Failure("invalid_input", "value must be a string of at most 20000 bytes, a number, or a boolean.")
            }
            var settable = DarwinBoolean(false)
            guard AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success, settable.boolValue else {
                throw Failure("not_settable", "The selected element does not expose a writable AXValue.")
            }
            try checkCancellation()
            let result = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFTypeRef)
            guard result == .success else { throw Failure("ax_action_failed", "AXValue write failed (\(result.rawValue)); input was not retried.") }
            return ["performed": "set_value", "via": "AXValue", "snapshotsInvalidated": true]
        case "computer.type":
            let text = try string(input, "text", max: 20_000)
            if let focused = elementAttribute(root, kAXFocusedUIElementAttribute) {
                var focusedPID: pid_t = 0
                guard AXUIElementGetPid(focused, &focusedPID) == .success, focusedPID == app.processIdentifier else {
                    throw Failure("target_mismatch", "Focused accessibility element does not belong to the requested app.")
                }
                var settable = DarwinBoolean(false)
                if AXUIElementIsAttributeSettable(focused, kAXSelectedTextAttribute as CFString, &settable) == .success, settable.boolValue {
                    try checkCancellation()
                    let result = AXUIElementSetAttributeValue(focused, kAXSelectedTextAttribute as CFString, text as CFString)
                    guard result == .success else { throw Failure("ax_action_failed", "AXSelectedText write failed (\(result.rawValue)); input was not retried.") }
                    return ["performed": "type", "via": "AXSelectedText", "snapshotsInvalidated": true]
                }
            }
            try activate(app)
            let units = Array(text.utf16)
            var offset = 0
            while offset < units.count {
                var end = min(offset + 32, units.count)
                if end < units.count && (0xD800...0xDBFF).contains(units[end - 1]) { end -= 1 }
                let chunk = Array(units[offset..<end])
                try foreground(app)
                guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
                      let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else { throw Failure("event_failed", "Could not allocate keyboard events.") }
                chunk.withUnsafeBufferPointer { buffer in
                    down.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: buffer.baseAddress)
                    up.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: buffer.baseAddress)
                }
                down.post(tap: .cghidEventTap)
                up.post(tap: .cghidEventTap)
                offset = end
            }
        case "computer.press":
            let (code, flags) = try key(try string(input, "key", max: 100))
            try activate(app)
            try foreground(app)
            guard let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true),
                  let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false) else { throw Failure("event_failed", "Could not allocate keyboard events.") }
            down.flags = flags
            up.flags = flags
            down.post(tap: .cghidEventTap)
            up.post(tap: .cghidEventTap)
        case "computer.scroll":
            let dx = try number(input, "deltaX", limit: 10_000)
            let dy = try number(input, "deltaY", limit: 10_000)
            let point: CGPoint
            if input["x"] != nil || input["y"] != nil {
                point = try CGPoint(x: number(input, "x"), y: number(input, "y"))
            } else if let window = elementAttribute(root, kAXFocusedWindowAttribute), let rect = bounds(window) {
                point = CGPoint(x: rect.midX, y: rect.midY)
            } else { throw Failure("invalid_input", "Provide x and y when the app has no accessible focused window.") }
            try activate(app)
            try hit(point, app: app)
            guard let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left),
                  let scroll = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: Int32(-dy), wheel2: Int32(-dx), wheel3: 0) else { throw Failure("event_failed", "Could not allocate scroll events.") }
            move.post(tap: .cghidEventTap)
            scroll.location = point
            try foreground(app)
            scroll.post(tap: .cghidEventTap)
        case "computer.drag":
            let from = try CGPoint(x: number(input, "fromX"), y: number(input, "fromY"))
            let to = try CGPoint(x: number(input, "toX"), y: number(input, "toY"))
            try activate(app)
            try hit(from, app: app)
            try hit(to, app: app)
            guard let down = mouse(.leftMouseDown, from), let up = mouse(.leftMouseUp, to) else { throw Failure("event_failed", "Could not allocate mouse events.") }
            var last = from
            try foreground(app)
            down.post(tap: .cghidEventTap)
            defer { up.location = last; up.post(tap: .cghidEventTap) }
            for step in 1...20 {
                try foreground(app)
                let fraction = Double(step) / 20
                last = CGPoint(x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction)
                guard let event = mouse(.leftMouseDragged, last) else { throw Failure("event_failed", "Could not allocate drag event.") }
                event.post(tap: .cghidEventTap)
                Thread.sleep(forTimeInterval: 0.01)
            }
        default: break
        }
        return ["performed": String(method.dropFirst("computer.".count)), "via": "CoreGraphics", "foregroundFallback": true, "snapshotsInvalidated": true]
    }

    private func reference(_ input: [String: Any], app: NSRunningApplication, session: String) throws -> AXUIElement {
        let snapshotID = try string(input, "snapshotID")
        let elementID = try string(input, "elementID")
        guard let snapshot = snapshots[snapshotID], snapshot.session == session,
              snapshot.app == app.bundleIdentifier, snapshot.pid == app.processIdentifier,
              snapshot.launched == app.launchDate, Date().timeIntervalSince(snapshot.created) < 90,
              let reference = snapshot.elements[elementID] else {
            throw Failure("stale_snapshot", "Snapshot/element is expired, invalidated, or belongs to another session or app. Request computer.state again.")
        }
        var pid: pid_t = 0
        guard AXUIElementGetPid(reference.element, &pid) == .success, pid == app.processIdentifier,
              textAttribute(reference.element, kAXRoleAttribute) == reference.role else {
            throw Failure("stale_element", "The accessibility element is no longer valid. Request computer.state again.")
        }
        return reference.element
    }

    private func state(_ app: NSRunningApplication, root: AXUIElement, session: String, input: [String: Any]) throws -> [String: Any] {
        if let screenshot = input["screenshot"], !(screenshot is NSNumber && CFGetTypeID(screenshot as! NSNumber) == CFBooleanGetTypeID()) {
            throw Failure("invalid_input", "screenshot must be a boolean (default false).")
        }
        let id = UUID().uuidString
        let started = Date()
        var nodes: [[String: Any]] = []
        var references: [String: Reference] = [:]
        var pending: [(AXUIElement, String?, Int)] = [(root, nil, 0)]
        var visited = Set<AXUIElement>()
        var truncated = false
        while let (element, parent, depth) = pending.popLast() {
            try checkCancellation()
            if nodes.count >= 512 || Date().timeIntervalSince(started) > 5 { truncated = true; break }
            if !visited.insert(element).inserted { continue }
            AXUIElementSetMessagingTimeout(element, 0.2)
            guard let role = textAttribute(element, kAXRoleAttribute) else { continue }
            let elementID = String(nodes.count + 1)
            references[elementID] = Reference(element: element, role: role)
            var node: [String: Any] = ["elementID": elementID, "role": role, "depth": depth]
            if let parent { node["parentID"] = parent }
            for (key, name) in [("title", kAXTitleAttribute), ("description", kAXDescriptionAttribute), ("subrole", kAXSubroleAttribute)] {
                if let value = textAttribute(element, name), !value.isEmpty { node[key] = value }
            }
            if node["subrole"] as? String != kAXSecureTextFieldSubrole,
               let value = attribute(element, kAXValueAttribute) {
                if let text = value as? String { node["value"] = boundedText(text) }
                else if let number = value as? NSNumber { node["value"] = number }
            }
            if let rect = bounds(element) { node["bounds"] = rectJSON(rect) }
            if let enabled = attribute(element, kAXEnabledAttribute) as? Bool { node["enabled"] = enabled }
            nodes.append(node)
            var count: CFIndex = 0
            if AXUIElementGetAttributeValueCount(element, kAXChildrenAttribute as CFString, &count) == .success, count > 0 {
                if depth >= 20 { truncated = true; continue }
                let limit = min(count, 64, 512 - nodes.count)
                if limit < count { truncated = true }
                var children: CFArray?
                if limit > 0, AXUIElementCopyAttributeValues(element, kAXChildrenAttribute as CFString, 0, limit, &children) == .success,
                   let children = children as? [AXUIElement] {
                    for child in children.reversed() { pending.append((child, elementID, depth + 1)) }
                }
            }
        }
        guard !nodes.isEmpty else { throw Failure("accessibility_unavailable", "The app did not expose an accessibility tree.") }
        snapshots = snapshots.filter { !($0.value.session == session && $0.value.app == app.bundleIdentifier) }
        if snapshots.count >= 16, let oldest = snapshots.min(by: { $0.value.created < $1.value.created })?.key { snapshots.removeValue(forKey: oldest) }
        snapshots[id] = Snapshot(session: session, app: app.bundleIdentifier!, pid: app.processIdentifier, launched: app.launchDate, created: Date(), elements: references)
        var result: [String: Any] = ["app": app.bundleIdentifier!, "pid": app.processIdentifier, "snapshotID": id, "nodes": nodes, "truncated": truncated, "attributeMaxBytes": 1024, "expiresInSeconds": 90]
        if input["screenshot"] as? Bool == true {
            guard CGPreflightScreenCaptureAccess() else {
                result["screenshotError"] = ["code": "screen_recording_denied", "message": "Screen Recording permission is not granted for this launch context. Use Request access in OpenCodex Settings, enable the responsible app macOS names, then use Check access. No prompt was requested by this tool call."]
                return result
            }
            do { result["screenshot"] = try capture(app) }
            catch let error as Failure { result["screenshotError"] = ["code": error.code, "message": error.message] }
        }
        return result
    }

    private func activate(_ app: NSRunningApplication) throws {
        try checkCancellation()
        if NSWorkspace.shared.frontmostApplication?.processIdentifier != app.processIdentifier {
            guard app.activate(options: [.activateIgnoringOtherApps]) else { throw Failure("activation_failed", "Could not activate the requested application.") }
            for _ in 0..<20 {
                try checkCancellation()
                if NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier { break }
                Thread.sleep(forTimeInterval: 0.025)
            }
        }
        try foreground(app)
    }

    private func foreground(_ app: NSRunningApplication) throws {
        try checkCancellation()
        guard !app.isTerminated, NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else {
            throw Failure("focus_changed", "Target app is no longer foreground. Input stopped and will not be replayed.")
        }
    }

    private func hit(_ point: CGPoint, app: NSRunningApplication) throws {
        try foreground(app)
        let system = AXUIElementCreateSystemWide()
        AXUIElementSetMessagingTimeout(system, 0.25)
        var element: AXUIElement?
        var pid: pid_t = 0
        guard AXUIElementCopyElementAtPosition(system, Float(point.x), Float(point.y), &element) == .success,
              let element, AXUIElementGetPid(element, &pid) == .success, pid == app.processIdentifier else {
            throw Failure("target_mismatch", "Coordinates do not hit the requested app; input was not sent.")
        }
    }

    private func mouse(_ type: CGEventType, _ point: CGPoint) -> CGEvent? {
        CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)
    }

    private func click(_ point: CGPoint, app: NSRunningApplication) throws {
        try activate(app)
        try hit(point, app: app)
        guard let down = mouse(.leftMouseDown, point), let up = mouse(.leftMouseUp, point) else { throw Failure("event_failed", "Could not allocate mouse events.") }
        try foreground(app)
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }

    private func capture(_ app: NSRunningApplication) throws -> [String: Any] {
        let content: SCShareableContent = try wait { done in
            SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { content, error in
                if let content { done(.success(content)) }
                else { done(.failure(Failure("capture_failed", error?.localizedDescription ?? "Cannot enumerate capturable windows."))) }
            }
        }
        try checkCancellation()
        let windows = content.windows.filter { $0.owningApplication?.processID == app.processIdentifier && $0.windowLayer == 0 && $0.frame.width > 1 && $0.frame.height > 1 }
        // CoreGraphics provides front-to-back order; never capture another app or the whole desktop as a fallback.
        let order = (CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []).compactMap { $0[kCGWindowNumber as String] as? UInt32 }
        guard let window = windows.min(by: { (order.firstIndex(of: $0.windowID) ?? Int.max) < (order.firstIndex(of: $1.windowID) ?? Int.max) }) else {
            throw Failure("no_window", "The target has no on-screen capturable window.")
        }
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let config = SCStreamConfiguration()
        let scale = min(2, 2048 / max(window.frame.width, window.frame.height))
        config.width = max(1, Int(window.frame.width * scale))
        config.height = max(1, Int(window.frame.height * scale))
        config.showsCursor = false
        config.ignoreShadowsSingleWindow = true
        config.captureResolution = .best
        let image: CGImage = try wait { done in
            SCScreenshotManager.captureImage(contentFilter: filter, configuration: config) { image, error in
                if let image { done(.success(image)) }
                else { done(.failure(Failure("capture_failed", error?.localizedDescription ?? "ScreenCaptureKit capture failed."))) }
            }
        }
        try checkCancellation()
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { throw Failure("capture_failed", "Cannot encode screenshot.") }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination), data.length <= 8 * 1024 * 1024 else { throw Failure("capture_failed", "Screenshot could not be encoded within the 8 MiB size limit.") }
        return ["mime": "image/png", "base64": (data as Data).base64EncodedString(), "width": image.width, "height": image.height, "bounds": rectJSON(window.frame), "windowID": window.windowID]
    }
}

// Callback APIs run while the main run loop stays alive; all blocking AX work is on one background worker.
private final class CompletionBox<T>: @unchecked Sendable {
    let semaphore = DispatchSemaphore(value: 0)
    var result: Result<T, Error>?
}

private func wait<T>(_ start: (@escaping (Result<T, Error>) -> Void) -> Void) throws -> T {
    let box = CompletionBox<T>()
    start { result in box.result = result; box.semaphore.signal() }
    guard box.semaphore.wait(timeout: .now() + 8) == .success, let result = box.result else { throw Failure("capture_timeout", "Screen capture timed out; it was not retried.") }
    return try result.get()
}

private func key(_ input: String) throws -> (CGKeyCode, CGEventFlags) {
    let parts = input.lowercased().split(separator: "+").map(String.init)
    guard let name = parts.last else { throw Failure("invalid_key", "key must be a key name or a shortcut such as cmd+shift+s.") }
    let codes: [String: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11,
        "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23,
        "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35,
        "enter": 36, "return": 36, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44, "n": 45, "m": 46,
        ".": 47, "tab": 48, "space": 49, "`": 50, "backspace": 51, "escape": 53, "esc": 53,
        "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111,
        "home": 115, "pageup": 116, "delete": 117, "end": 119, "pagedown": 121,
        "left": 123, "arrowleft": 123, "right": 124, "arrowright": 124, "down": 125, "arrowdown": 125, "up": 126, "arrowup": 126,
    ]
    var flags: CGEventFlags = []
    for modifier in parts.dropLast() {
        switch modifier {
        case "cmd", "command", "meta": flags.insert(.maskCommand)
        case "ctrl", "control": flags.insert(.maskControl)
        case "alt", "option": flags.insert(.maskAlternate)
        case "shift": flags.insert(.maskShift)
        default: throw Failure("invalid_key", "Unknown key modifier: \(modifier)")
        }
    }
    guard let code = codes[name] else { throw Failure("invalid_key", "Unsupported key name. Use named navigation keys, letters, digits, F1–F12, or computer.type for Unicode text.") }
    return (code, flags)
}

private func emit(_ response: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: response, options: [.sortedKeys]) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
}

private func serve() {
    let controller = Controller()
    var buffered = Data()
    var inputBytes = [UInt8](repeating: 0, count: 4096)
    while !cancellation.stopped {
        // Foundation read(upToCount:) waits to fill a pipe buffer on macOS; POSIX read handles live requests.
        let count = Darwin.read(STDIN_FILENO, &inputBytes, inputBytes.count)
        if count < 0 && errno == EINTR { continue }
        guard count > 0 else { break }
        buffered.append(contentsOf: inputBytes.prefix(count))
        while let newline = buffered.firstIndex(of: 10) {
            let line = buffered.prefix(upTo: newline)
            guard line.count <= maxLineBytes else { exit(65) }
            let copy = Data(line)
            buffered.removeSubrange(...newline)
            var id = ""
            do {
                guard let request = try JSONSerialization.jsonObject(with: copy) as? [String: Any] else { throw Failure("invalid_request", "Expected a JSON object.") }
                id = try string(request, "id")
                let method = try string(request, "method")
                let session = try string(request, "sessionID")
                guard let input = request["input"] as? [String: Any] else { throw Failure("invalid_request", "input must be an object.") }
                let result = try controller.handle(method, session: session, input: input)
                emit(["id": id, "result": result])
            } catch let error as Failure {
                emit(["id": id, "error": ["code": error.code, "message": error.message]])
            } catch {
                emit(["id": id, "error": ["code": "invalid_request", "message": "Malformed helper request."]])
            }
            if cancellation.stopped { exit(0) }
        }
        if buffered.count > maxLineBytes { exit(65) }
    }
    exit(0)
}

signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
signal(SIGPIPE, SIG_IGN)
let terminate = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
terminate.setEventHandler { cancellation.stop() }
terminate.resume()
let interrupt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
interrupt.setEventHandler { cancellation.stop() }
interrupt.resume()
DispatchQueue.global(qos: .userInitiated).async { serve() }
RunLoop.main.run()
