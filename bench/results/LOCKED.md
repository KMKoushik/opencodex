# Rune vs Electron — locked screen — no presentation

Median of three alternating Electron → Rune runs on the same machine, same builds and isolated fixture. No warmup excluded; fresh app profile each invocation, OS caches warm. Locked/occluded rendering is not representative of visible use.

Machine: Apple M5 Pro, 18 cores, macOS 27.2.

| Metric | Electron | Rune |
| --- | ---: | ---: |
| Gateway ready (ms; native marker only) | unavailable | 330 |
| Gateway connected (ms; native marker only) | unavailable | 342 |
| Sidebar snapshot (ms; native marker only) | unavailable | 356 |
| Sidebar DOM inserted (ms; Electron only) | 459 | unavailable |
| CDP attached (ms; not gateway readiness) | 327 | unavailable |
| Idle footprint (MiB) | 212.8 | 119.8 |
| Idle RSS (MiB; shared pages double-counted) | 499.5 | 218.9 |
| Idle CPU (% of one core; 10 s) | 0.2 | 0.5 |
| App process count (gateway included) | 4 | 2 |
| Session-open observation CPU (%; 5 s minimum) | 8 | 1.4 |
| Session-open observation footprint (MiB) | 409.8 | 125.8 |
| Session DOM insertion (ms; no presentation) | 409 | unavailable |
| On-disk bundle (MiB) | 346.4 | 122.1 |

## Provenance and limitations

- Built revision: 6c74d6769f70f6fb7c32b95957827e3b7c4d1d42. Build hashes/versions are in `builds.json` (recorded before benchmark-only changes).
- Fixture: 1501 messages / 750 turns in the heavy session; 39 sessions across three Git projects; 40.9 MiB authored import data. Zero model calls to seed it. Stored under `/tmp/ocr-bench`; never the user service or profile.
- Includes one explicitly authored compaction checkpoint: all 1500 conversation messages remain stored; active model context is nine messages (~218 KiB), verified on a disposable fork with no model calls. Both clients get the same three opened project folders in their own preference formats.
- Rune includes its compiled Bun gateway sidecar; Electron includes its gateway in main. OpenCode at port 4989 is external and excluded. RSS double-counts shared pages; footprint may be unavailable without OS privileges.
- Non-presentation milestones differ: native gateway/snapshot markers vs Electron CDP and DOM insertion. Do not compare these as equivalent startup metrics.
- No first visible content, settled/render time, frame pacing, input latency or streaming claims. Session-open CPU is a fixed observation window, not completion time; native may defer UI work until unlocked.
- Three runs are descriptive, not a statistical significance claim. Raw process breakdowns, background load, quit modes and samples are retained in the six JSON files.

## Run after unlocking

From this worktree, restart the retained isolated service only if needed:

```sh
OPENCODEX_FIXTURE=/tmp/ocr-bench OPENCODEX_FIXTURE_SERVICE_PORT=4989 bash apps/rune/tools/isolated.sh opencode
```

In another terminal: `bash bench/run-visible.sh` runs the full comparison and then video. `bash bench/run-visible.sh --no-video` runs just benchmarks; `bash bench/video.sh` records just video after a comparison exists.

Unlock, exit full-screen Spaces (Control-Command-F), and keep windows unobstructed. Grant the invoking terminal Accessibility and Screen & System Audio Recording in System Settings → Privacy & Security, then quit/reopen it. The current helper passed both privacy checks; another terminal may need grants. A real CGWindowList probe and every app's window watcher must pass. No privacy grants are bypassed. The isolated service is restarted automatically if needed; no second manual terminal is normally required.

Locked-safe validation: `bun check` and `bun format:check` passed; Swift capture/input/tiling/probe helpers compiled; synthetic 60 fps H.264 composition, tiling geometry, retry/backoff bookkeeping, and lock/denied-permission refusal paths were tested. Real visible input, capture, full-screen Space behavior and network model streaming remain unexecuted while locked. See `validation.json`.

<details><summary>Build manifest</summary>

```json
[
  {
    "app": "apps/desktop/release/mac-arm64/OpenCodex.app",
    "version": "0.1.0",
    "revision": "6c74d6769f70f6fb7c32b95957827e3b7c4d1d42",
    "allocatedMiB": 346.4609375,
    "executableSHA256": "835fe6b0da2bb7fb0a6bf84974d2820e58c84deca936743c1bbf99dffa66566f",
    "resources": [
      {
        "path": "Contents/Resources/app.asar",
        "sha256": "a1214ed722056c8c71a99da1688a2b1de98517f7d34553f42fa6c1d479022c35"
      }
    ],
    "runtime": {
      "framework": "Electron",
      "version": "44.4.5"
    }
  },
  {
    "app": "apps/rune/dist/OpenCodex Rune.app",
    "version": "0.1.0",
    "revision": "6c74d6769f70f6fb7c32b95957827e3b7c4d1d42",
    "allocatedMiB": 122.06640625,
    "executableSHA256": "09658c05578779ce2bfafd67d7bb0dde93247ab71b8c589a783513048b943e6a",
    "resources": [
      {
        "path": "Contents/Resources/opencodex-gateway",
        "sha256": "91bc20be4c8892fca0a5b44f790eb8fa6d7f7e8d1e7762a8db2c9cf444cc5fd0"
      }
    ],
    "runtime": {
      "framework": "Rune",
      "revision": "7286a3c5fe525bcbdb5a1188a4046ff4eff5f0de"
    }
  }
]
```

</details>
