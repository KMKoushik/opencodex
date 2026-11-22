import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia
import Darwin

// Requests 60 fps from ScreenCaptureKit. Actual source frame rate is retained by ffprobe.
final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {
    let writer: AVAssetWriter
    let input: AVAssetWriterInput
    var started = false
    var frames = 0
    init(path: String, width: Int, height: Int) throws {
        writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: path), fileType: .mov)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000, AVVideoExpectedSourceFrameRateKey: 60]
        ])
        input.expectsMediaDataInRealTime = true
        writer.add(input)
        super.init()
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, buffer.isValid, CMSampleBufferGetImageBuffer(buffer) != nil else { return }
        if !started {
            guard writer.startWriting() else { fputs("Capture writer failed\n", stderr); exit(5) }
            writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(buffer))
            started = true
        }
        if input.isReadyForMoreMediaData { if input.append(buffer) { frames += 1 } }
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("ScreenCaptureKit stopped: \(error)\n", stderr); exit(6)
    }
}

@main struct Capture {
    static func main() async throws {
        guard CommandLine.arguments.count == 2 else { exit(2) }
        guard CGPreflightScreenCaptureAccess() else {
            fputs("Grant the invoking terminal Screen & System Audio Recording in System Settings > Privacy & Security, then reopen it.\n", stderr); exit(3)
        }
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }) else { exit(4) }
        let width = 1920
        let height = Int((Double(width) * Double(display.height) / Double(display.width)) / 2) * 2
        let recorder = try Recorder(path: CommandLine.arguments[1], width: width, height: height)
        let config = SCStreamConfiguration()
        config.width = width; config.height = height
        config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
        config.queueDepth = 6; config.showsCursor = true
        let stream = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: config, delegate: recorder)
        let queue = DispatchQueue(label: "bench.capture")
        try stream.addStreamOutput(recorder, type: .screen, sampleHandlerQueue: queue)
        signal(SIGINT, SIG_IGN)
        signal(SIGTERM, SIG_IGN)
        let stopped = DispatchSemaphore(value: 0)
        let signals = [SIGINT, SIGTERM].map { number -> DispatchSourceSignal in
            let source = DispatchSource.makeSignalSource(signal: number, queue: .global())
            source.setEventHandler { stopped.signal() }; source.resume(); return source
        }
        try await stream.startCapture()
        print("READY 60fps-requested \(width)x\(height)"); fflush(stdout)
        await withCheckedContinuation { continuation in
            DispatchQueue.global().async { stopped.wait(); continuation.resume() }
        }
        try await stream.stopCapture()
        queue.sync { recorder.input.markAsFinished() }
        await recorder.writer.finishWriting()
        guard recorder.started, recorder.writer.status == .completed else {
            fputs("No capture frames / writer failure: \(String(describing: recorder.writer.error))\n", stderr); exit(7)
        }
        print("Captured \(recorder.frames) source samples.")
        withExtendedLifetime(signals) {}
    }
}
