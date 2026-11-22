import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { median } from './lib/proc';

const locked = process.argv[2] === 'locked';
const mode = locked ? 'locked' : 'visible';
const results = ['electron', 'rune'].map((app) =>
  Array.from({ length: 3 }, (_, i) =>
    JSON.parse(readFileSync(`bench/results/${app}-${mode}-${i + 1}.json`, 'utf8')),
  ),
);
const get = (value: unknown, path: string): number | null => {
  for (const key of path.split('.'))
    value =
      value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const metrics = locked
  ? [
      ['Gateway ready (ms; native marker only)', 'gatewayReadyMs'],
      ['Gateway connected (ms; native marker only)', 'gatewayConnectedMs'],
      ['Sidebar snapshot (ms; native marker only)', 'sidebarSnapshotMs'],
      ['Sidebar DOM inserted (ms; Electron only)', 'sidebarDomMs'],
      ['CDP attached (ms; not gateway readiness)', 'cdpAttachedMs'],
      ['Idle footprint (MiB)', 'memory.footprintMB'],
      ['Idle RSS (MiB; shared pages double-counted)', 'memory.rssMB'],
      ['Idle CPU (% of one core; 10 s)', 'idleCpu.cpuPct'],
      ['App process count (gateway included)', 'memory.processCount'],
      ['Session-open observation CPU (%; 5 s minimum)', 'sessionOpen.cpu.cpuPct'],
      ['Session-open observation footprint (MiB)', 'sessionOpen.memory.footprintMB'],
      ['Session DOM insertion (ms; no presentation)', 'sessionOpen.domMs'],
    ]
  : [
      ['Window visible (ms)', 'startup.windowVisibleMs'],
      ['First meaningful content visible (ms)', 'startup.firstMeaningfulContentVisibleMs'],
      ['Idle footprint (MiB)', 'idle.memory.footprintMB'],
      ['Idle RSS (MiB)', 'idle.memory.rssMB'],
      ['Idle CPU (% of one core)', 'idle.cpu.cpuPct'],
      ['Process count', 'idle.memory.processCount'],
      ['Long session open (ms)', 'longSession.openMs'],
      ['Long session settled (ms)', 'longSession.settledMs'],
      ['Long session footprint (MiB)', 'longSession.memoryAfter10s.footprintMB'],
      ['Scroll frame interval p50 (ms)', 'longSession.scrollFrames.intervalMs.p50'],
      ['Scroll frame interval p95 (ms)', 'longSession.scrollFrames.intervalMs.p95'],
      ['Scroll frame interval p99 (ms)', 'longSession.scrollFrames.intervalMs.p99'],
      ['Typing key-to-frame p95 (ms)', 'longSession.inputFrames.inputToFrameMs.p95'],
      ['Streaming average CPU (%)', 'streaming.avgCpuPct'],
      ['Streaming peak footprint (MiB)', 'streaming.peakFootprintMB'],
      ['Streaming output tokens', 'streaming.outputTokens'],
      ['Streaming frame interval p95 (ms)', 'streaming.frames.intervalMs.p95'],
    ];
const rows = metrics.map(([label, path]) => {
  const values = results.map((files) =>
    median(
      files.flatMap((file) =>
        file.runs.map((run: unknown) => {
          if (
            path!.startsWith('streaming.') &&
            !(run as { streaming?: { succeeded?: boolean } }).streaming?.succeeded
          )
            return NaN;
          return get(run, path!) ?? NaN;
        }),
      ),
    ),
  );
  return `| ${label} | ${values[0] ?? 'unavailable'} | ${values[1] ?? 'unavailable'} |`;
});
rows.push(
  `| On-disk bundle (MiB) | ${results[0]![0].size.totalMB} | ${results[1]![0].size.totalMB} |`,
);
const fixture = JSON.parse(readFileSync('/tmp/ocr-bench/fixture.json', 'utf8'));
const builds = readFileSync('bench/results/builds.json', 'utf8');
const validation = existsSync('bench/results/validation.json')
  ? JSON.parse(readFileSync('bench/results/validation.json', 'utf8'))
  : null;
const machine = results[0]![0].machine ?? validation?.machine;
const text = `# Rune vs Electron — ${locked ? 'locked screen — no presentation' : 'visible benchmark'}

Median of three alternating Electron → Rune runs on the same machine, same builds and isolated fixture. ${locked ? 'No warmup excluded; fresh app profile each invocation, OS caches warm. Locked/occluded rendering is not representative of visible use.' : 'One warmup per invocation excluded. OS caches warm. Frame timing is a software callback proxy, not hardware scanout or photon latency.'}

${machine ? `Machine: ${machine.cpu}, ${machine.cores} cores, macOS ${machine.os}.` : ''}

| Metric | Electron | Rune |
| --- | ---: | ---: |
${rows.join('\n')}

## Provenance and limitations

- Built revision: ${results[0]![0].revision}. Build hashes/versions are in \`builds.json\` (recorded before benchmark-only changes).
- Fixture: ${fixture.messages} messages / 750 turns in the heavy session; ${fixture.sessions} sessions across three Git projects; ${(fixture.payloadBytes / 1048576).toFixed(1)} MiB authored import data. Zero model calls to seed it. Stored under \`/tmp/ocr-bench\`; never the user service or profile.
- Includes one explicitly authored compaction checkpoint: all 1500 conversation messages remain stored; active model context is nine messages (~218 KiB), verified on a disposable fork with no model calls. Both clients get the same three opened project folders in their own preference formats.
- Rune includes its compiled Bun gateway sidecar; Electron includes its gateway in main. OpenCode at port 4989 is external and excluded. RSS double-counts shared pages; footprint may be unavailable without OS privileges.
- Non-presentation milestones differ: native gateway/snapshot markers vs Electron CDP and DOM insertion. Do not compare these as equivalent startup metrics.
- ${locked ? 'No first visible content, settled/render time, frame pacing, input latency or streaming claims. Session-open CPU is a fixed observation window, not completion time; native may defer UI work until unlocked.' : 'Native settled markers differ from DOM row/height stability. Both render paginated history, not all 1500 messages at once. Streaming uses the network/free opencode/big-pickle and can rate-limit: every retry/error/backoff is retained in JSON. A failed stream is not a successful benchmark; inspect streaming.succeeded. Average streaming CPU includes retries/backoff.'}
- Three runs are descriptive, not a statistical significance claim. Raw process breakdowns, background load, quit modes and samples are retained in the six JSON files.

## Run after unlocking

From this worktree, restart the retained isolated service only if needed:

\`\`\`sh
OPENCODEX_FIXTURE=/tmp/ocr-bench OPENCODEX_FIXTURE_SERVICE_PORT=4989 bash apps/rune/tools/isolated.sh opencode
\`\`\`

In another terminal: \`bash bench/run-visible.sh\` runs the full comparison and then video. \`bash bench/run-visible.sh --no-video\` runs just benchmarks; \`bash bench/video.sh\` records just video after a comparison exists.

Unlock, exit full-screen Spaces (Control-Command-F), and keep windows unobstructed. Grant the invoking terminal Accessibility and Screen & System Audio Recording in System Settings → Privacy & Security, then quit/reopen it. The current helper passed both privacy checks; another terminal may need grants. A real CGWindowList probe and every app's window watcher must pass. No privacy grants are bypassed. The isolated service is restarted automatically if needed; no second manual terminal is normally required.

Locked-safe validation: \`bun check\` and \`bun format:check\` passed; Swift capture/input/tiling/probe helpers compiled; synthetic 60 fps H.264 composition, tiling geometry, retry/backoff bookkeeping, and lock/denied-permission refusal paths were tested. Real visible input, capture, full-screen Space behavior and network model streaming remain unexecuted while locked. See \`validation.json\`.

<details><summary>Build manifest</summary>

\`\`\`json
${builds.trim()}
\`\`\`

</details>
`;
mkdirSync('bench/results', { recursive: true });
writeFileSync(`bench/results/${locked ? 'LOCKED' : 'COMPARISON'}.md`, text);
// Plain text is also used for the video's end card; no invented numbers.
writeFileSync(
  'bench/results/endcard.txt',
  `Electron / Rune — ${locked ? 'LOCKED: no presentation' : 'visible median of 3'}\n` +
    rows.map((r) => r.replaceAll('|', '  ')).join('\n'),
);
console.log(text);
