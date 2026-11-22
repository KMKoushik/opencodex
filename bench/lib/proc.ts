// Process-tree sampling with stock macOS tools: ps for RSS and cumulative CPU time,
// footprint(1) for phys_footprint (the "Memory" column in Activity Monitor).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Proc = { pid: number; ppid: number; rssKB: number; cpuSec: number; command: string };

function run(cmd: string[]) {
  const result = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
  return result.stdout.toString();
}

// ps prints cumulative CPU time as [[dd-]hh:]mm:ss.ss.
function seconds(value: string) {
  const [days, rest] = value.includes('-') ? value.split('-') : ['0', value];
  return (
    rest!
      .split(':')
      .map(Number)
      .reduce((total, part) => total * 60 + part, 0) +
    Number(days) * 86_400
  );
}

export function snapshot(): Proc[] {
  return run(['ps', '-A', '-o', 'pid=,ppid=,rss=,time=,command='])
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map(([, pid, ppid, rss, time, command]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      rssKB: Number(rss),
      cpuSec: seconds(time!),
      command: command!,
    }));
}

// The app is the root process, its descendants, and anything still running from the app
// bundle (helpers that were reparented to launchd).
export function appTree(rootPid: number, bundlePrefix?: string, procs = snapshot()) {
  const members = new Set([rootPid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const proc of procs) {
      if (!members.has(proc.pid) && members.has(proc.ppid)) {
        members.add(proc.pid);
        changed = true;
      }
    }
  }
  if (bundlePrefix)
    for (const proc of procs) if (proc.command.startsWith(bundlePrefix)) members.add(proc.pid);
  return procs.filter((proc) => members.has(proc.pid));
}

export function label(command: string) {
  const exe = command.split(/\s+--/)[0]!;
  const type = command.match(/--type=(\S+)/)?.[1];
  const utility = command.match(/--utility-sub-type=(\S+)/)?.[1];
  const name = exe.split('/').pop()!;
  return [name, type, utility?.split('.').pop()].filter(Boolean).join(':');
}

/** Sum of phys_footprint across PIDs, in bytes, plus per-PID values. */
export function footprint(pids: number[]) {
  const dir = mkdtempSync(join(tmpdir(), 'ocx-footprint-'));
  try {
    const file = join(dir, 'out.json');
    Bun.spawnSync(['footprint', '--noCategories', '-f', 'bytes', '-j', file, ...pids.map(String)], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    const json = JSON.parse(readFileSync(file, 'utf8')) as {
      processes?: { pid: number; footprint: number }[];
      'total footprint'?: number;
    };
    const per = Object.fromEntries((json.processes ?? []).map((p) => [p.pid, p.footprint]));
    const total = json['total footprint'] ?? Object.values(per).reduce((a, b) => a + b, 0);
    return { totalBytes: total, perPid: per };
  } catch {
    return undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function memory(rootPid: number, bundlePrefix?: string) {
  const tree = appTree(rootPid, bundlePrefix);
  const fp = footprint(tree.map((p) => p.pid));
  return {
    processCount: tree.length,
    rssMB: round(tree.reduce((sum, p) => sum + p.rssKB, 0) / 1024),
    footprintMB: fp ? round(fp.totalBytes / 1048576) : null,
    processes: tree.map((p) => ({
      pid: p.pid,
      kind: label(p.command),
      rssMB: round(p.rssKB / 1024),
      footprintMB: fp?.perPid[p.pid] !== undefined ? round(fp.perPid[p.pid]! / 1048576) : null,
    })),
  };
}

/** Average CPU% (100 = one core) of the tree over `ms`, from cumulative CPU-time deltas. */
export async function cpuOver(
  ms: number,
  rootPid: number,
  bundlePrefix?: string,
  extra: number[] = [],
) {
  const before = snapshot();
  const t0 = performance.now();
  await Bun.sleep(ms);
  const after = snapshot();
  const elapsed = (performance.now() - t0) / 1000;
  return cpuDelta(before, after, elapsed, rootPid, bundlePrefix, extra);
}

export function cpuDelta(
  before: Proc[],
  after: Proc[],
  elapsedSec: number,
  rootPid: number,
  bundlePrefix?: string,
  extra: number[] = [],
) {
  const prior = new Map(before.map((p) => [p.pid, p.cpuSec]));
  const tree = appTree(rootPid, bundlePrefix, after);
  const pct = (p: Proc) => (Math.max(0, p.cpuSec - (prior.get(p.pid) ?? 0)) / elapsedSec) * 100;
  return {
    cpuPct: round(tree.reduce((sum, p) => sum + pct(p), 0)),
    perProcess: tree.map((p) => ({ pid: p.pid, kind: label(p.command), cpuPct: round(pct(p)) })),
    extra: extra.map((pid) => {
      const p = after.find((proc) => proc.pid === pid);
      return { pid, cpuPct: p ? round(pct(p)) : null, rssMB: p ? round(p.rssKB / 1024) : null };
    }),
  };
}

export function round(value: number, digits = 1) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function median(values: number[]) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
}
