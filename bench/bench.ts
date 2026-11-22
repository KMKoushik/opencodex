#!/usr/bin/env bun
// OpenCodex performance harness. See bench/README.md.
//
//   bun bench/bench.ts --app <OpenCodex.app | binary> [--driver cdp|marker|none] [--runs 3]
//                      [--name label] [--out bench/results/x.json] [--project dir]
//                      [--source-session id] [--model provider/id] [--skip-stream]
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Cdp } from './lib/cdp';
import { connect, forkForBench, longestSession, removeSession, streamPrompt } from './lib/opencode';
import { appTree, cpuDelta, cpuOver, footprint, median, memory, round, snapshot } from './lib/proc';
import { requireIsolatedEnvironment, requireVisibleScreen } from './lib/screen';
import { startFrames, stopFrames, cdpExercise } from './lib/frames';
import { verifyBuild } from './lib/build';
import { seedProfile } from './lib/profile';

const here = dirname(new URL(import.meta.url).pathname);
const { values: opts } = parseArgs({
  options: {
    app: { type: 'string' },
    name: { type: 'string' },
    driver: { type: 'string' },
    runs: { type: 'string', default: '3' },
    out: { type: 'string' },
    project: { type: 'string' },
    'source-session': { type: 'string' },
    model: { type: 'string', default: 'opencode/big-pickle' },
    'idle-ms': { type: 'string', default: '30000' },
    'skip-stream': { type: 'boolean', default: false },
    'headless-safe': { type: 'boolean', default: false },
  },
});
if (!opts.app) throw new Error('--app <path to .app bundle or executable> is required');
requireIsolatedEnvironment();
if (!opts['headless-safe']) requireVisibleScreen();
const appPath = resolve(opts.app);
const isBundle = appPath.endsWith('.app');
const driver = opts.driver ?? (isBundle && !appPath.includes('Rune.app') ? 'cdp' : 'marker');
const name = opts.name ?? basename(appPath).replace(/\.app$/, '');
const runs = Number(opts.runs);
const idleMs = Number(opts['idle-ms']);
const outFile = resolve(opts.out ?? join(here, 'results', `${name}.json`));

const executable = isBundle
  ? join(
      appPath,
      'Contents/MacOS',
      plist(join(appPath, 'Contents/Info.plist'), 'CFBundleExecutable'),
    )
  : appPath;
// Membership is by PID tree plus this exact on-disk path, never by process name, so other
// instances (for example a dev build with identical helper names) are never counted.
const bundlePrefix = isBundle ? `${appPath}/` : undefined;
const build = verifyBuild(appPath, executable);
const winwatch = opts['headless-safe'] ? '' : buildWinwatch();

const STREAM_PROMPT =
  'Do not use any tools, read files, or run commands. Write a detailed technical explanation ' +
  '(about 900 words) of how a CPU cache hierarchy works. Use markdown headings, a bulleted list, ' +
  'one table, and two short Rust code blocks. End your reply with the exact line BENCH-END.';

function plist(file: string, key: string) {
  return Bun.spawnSync(['/usr/libexec/PlistBuddy', '-c', `Print ${key}`, file])
    .stdout.toString()
    .trim();
}

function buildWinwatch() {
  const source = join(here, 'lib/winwatch.swift');
  const binary = join(here, '.build/winwatch');
  if (!existsSync(binary) || statSync(binary).mtimeMs < statSync(source).mtimeMs) {
    mkdirSync(dirname(binary), { recursive: true });
    const result = Bun.spawnSync(['swiftc', '-O', source, '-o', binary], { stderr: 'pipe' });
    if (result.exitCode !== 0) throw new Error(`swiftc failed: ${result.stderr.toString()}`);
  }
  return binary;
}

async function freePort() {
  const server = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const port = server.port;
  server.stop(true);
  return port;
}

// Builds running elsewhere on the machine skew timings and CPU; wait (bounded) for quiet.
async function waitForQuiet(maxMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const busy = busyBackground();
    if (busy.compilerProcesses === 0 && busy.loadAvg1m < cpus().length / 3) break;
    await Bun.sleep(2000);
  }
  return Date.now() - started;
}

function busyBackground() {
  const procs = snapshot();
  return {
    loadAvg1m: round(loadavg()[0]!, 2),
    compilerProcesses: procs.filter((p) =>
      /\/(rustc|cargo|swift-frontend|clang)( |$)/.test(p.command),
    ).length,
  };
}

type Launch = {
  t0: number;
  pid: number;
  log: string;
  cdp?: Cdp;
  windowAt?: number;
  windowSize?: string;
};

// The harness may itself run under an Electron host that exports ELECTRON_RUN_AS_NODE; an app
// launched with it would start as plain Node. open(1) forwards the caller's environment.
const launchEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('ELECTRON_') && key !== 'NODE_OPTIONS',
  ),
) as Record<string, string>;

async function launch(dataDir: string, extraEnv: Record<string, string>): Promise<Launch> {
  if (snapshot().some((p) => p.command.startsWith(bundlePrefix ?? executable)))
    throw new Error(
      'This exact app path is already running. Close it before benchmarking; existing app instances will never be counted or terminated.',
    );
  const log = join(dataDir, `markers-${Date.now()}.log`);
  const stdoutLog = `${log}.stdout`;
  writeFileSync(log, '');
  const cdpPort = driver === 'cdp' ? await freePort() : undefined;
  // Chromium flags only for Electron; other builds get the profile via OPENCODEX_DATA_DIR.
  const args = cdpPort
    ? [
        `--user-data-dir=${dataDir}`,
        `--remote-debugging-port=${cdpPort}`,
        // Keep rendering at full rate if another window covers this one while the bench runs
        // (Chromium otherwise stops frames for occluded windows and CPU reads artificially low).
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
      ]
    : [];
  const env = {
    ...launchEnv,
    OPENCODEX_BENCH: '1',
    OPENCODEX_BENCH_LOG: log,
    OPENCODEX_BENCH_FRAMES: opts['headless-safe'] ? '0' : '1',
    OPENCODEX_DATA_DIR: dataDir,
    ...extraEnv,
  };
  const existing = new Set(snapshot().map((p) => p.pid));
  const watcher = winwatch ? Bun.spawn([winwatch, executable, '15000'], { stdout: 'pipe' }) : null;
  await Bun.sleep(50); // let the watcher take its first (empty) look before launching
  const t0 = Date.now();
  let pid: number | undefined;
  if (isBundle) {
    // LaunchServices path, same as a Dock/Finder launch; -n forces a new instance.
    Bun.spawn(
      [
        'open',
        '-n',
        '-a',
        appPath,
        '--stdout',
        stdoutLog,
        '--stderr',
        stdoutLog,
        ...Object.entries(env).flatMap(([k, v]) => ['--env', `${k}=${v}`]),
        '--args',
        ...args,
      ],
      { env: launchEnv, stdout: 'ignore', stderr: 'ignore' },
    );
  } else {
    const child = Bun.spawn([executable, ...args], {
      env: { ...launchEnv, ...env },
      stdout: Bun.file(stdoutLog),
      stderr: Bun.file(stdoutLog),
    });
    pid = child.pid;
  }
  for (let i = 0; !pid && i < 3000; i++) {
    pid = snapshot().find((p) => !existing.has(p.pid) && p.command.startsWith(executable))?.pid;
    if (!pid) await Bun.sleep(10);
  }
  if (!pid) throw new Error('App process did not start.');
  const launched: Launch = { t0, pid, log };
  if (watcher)
    void new Response(watcher.stdout).text().then((line) => {
      const [at, , size] = line.trim().split(' ');
      if (at) {
        launched.windowAt = Number(at);
        launched.windowSize = size;
      }
    });
  if (cdpPort) {
    try {
      launched.cdp = await Cdp.attach(cdpPort);
    } catch (error) {
      await quit(launched);
      throw error;
    }
  }
  return launched;
}

async function marker(log: string, event: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = readFileSync(log, 'utf8').match(new RegExp(`OPENCODEX_BENCH ${event} (\\d+)`));
    if (match) return Number(match[1]);
    await Bun.sleep(10);
  }
  return null;
}

async function firstContent(app: Launch) {
  if (driver === 'cdp') {
    // Meaningful content = sidebar session rows fetched from OpenCode and painted.
    const rows = await app.cdp!.paintedWhen('.session-row');
    const fcp = await app.cdp!.eval<number | null>(
      `(() => { const p = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
        return p ? performance.timeOrigin + p.startTime : null; })()`,
    );
    return { at: rows.paintAt, fcpAt: fcp, visibility: rows.visibility };
  }
  if (driver === 'marker')
    return { at: await marker(app.log, 'first_content'), fcpAt: null, visibility: null };
  return { at: null, fcpAt: null, visibility: null };
}

async function openSession(app: Launch, title: string) {
  let started = Date.now();
  if (driver === 'cdp') {
    // The sidebar lists a few recent sessions per project; expand it if other sessions were
    // updated after the bench fork.
    const click = `(() => {
      const row = [...document.querySelectorAll('.session-row')]
        .find((b) => b.textContent.includes(${JSON.stringify(title)}));
      if (row) { row.click(); return Date.now(); }
      [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Show more')?.click();
      return 0; })()`;
    for (let i = 0; !(started = await app.cdp!.eval<number>(click)); i++) {
      if (i > 250) {
        const rows = await app.cdp!.eval<string>(
          `JSON.stringify([...document.querySelectorAll('.session-row')].map((b) => b.textContent))`,
        );
        throw new Error(`Bench session row not found in the sidebar: ${rows}`);
      }
      await Bun.sleep(40);
    }
    const rows = await app.cdp!.paintedWhen('.timeline-row');
    const settled = await app.cdp!.settled('.timeline-row');
    return {
      ms: (rows.paintAt ?? rows.domAt) - started,
      domMs: rows.domAt - started,
      painted: rows.paintAt !== null,
      visibility: rows.visibility,
      settledMs: settled.at - started,
      renderedRows: settled.count,
    };
  }
  if (driver === 'marker') {
    started = Date.now();
    process.kill(app.pid, 'SIGUSR1');
    const at = await marker(app.log, 'session_loaded');
    const settled = await marker(app.log, 'session_settled', 10_000);
    return {
      ms: at ? at - started : null,
      domMs: null,
      painted: null,
      visibility: null,
      settledMs: settled ? settled - started : null,
      renderedRows: null,
    };
  }
  return {
    ms: null,
    domMs: null,
    painted: null,
    visibility: null,
    settledMs: null,
    renderedRows: null,
  };
}

async function stream(
  app: Launch,
  client: Awaited<ReturnType<typeof connect>>['client'],
  sessionID: string,
  serverPid?: number,
) {
  const frameStart = await startFrames(app.cdp);
  const samples: { t: number; cpuPct: number; rssMB: number; footprintMB?: number }[] = [];
  const first = snapshot();
  let previous = first;
  let previousAt = performance.now();
  const startedAt = previousAt;
  let done = false;
  const sampler = (async () => {
    for (let tick = 0; !done; tick++) {
      await Bun.sleep(1000);
      const now = snapshot();
      const at = performance.now();
      const cpu = cpuDelta(previous, now, (at - previousAt) / 1000, app.pid, bundlePrefix);
      const tree = appTree(app.pid, bundlePrefix, now);
      const fp = tick % 3 === 2 ? footprint(tree.map((p) => p.pid)) : undefined;
      samples.push({
        t: round((at - startedAt) / 1000),
        cpuPct: cpu.cpuPct,
        rssMB: round(tree.reduce((s, p) => s + p.rssKB, 0) / 1024),
        ...(fp ? { footprintMB: round(fp.totalBytes / 1048576) } : {}),
      });
      previous = now;
      previousAt = at;
    }
  })();
  let result: Awaited<ReturnType<typeof streamPrompt>>;
  try {
    result = await streamPrompt(client, sessionID, opts.model!, STREAM_PROMPT);
  } finally {
    done = true;
    await sampler;
  }
  const last = snapshot();
  const overall = cpuDelta(
    first,
    last,
    (performance.now() - startedAt) / 1000,
    app.pid,
    bundlePrefix,
    serverPid ? [serverPid] : [],
  );
  let uiRendered: boolean | null = null;
  const visibility =
    driver === 'cdp' ? await app.cdp!.eval<string>('document.visibilityState') : null;
  if (driver === 'marker') uiRendered = (await marker(app.log, 'reply_rendered', 5000)) !== null;
  if (driver === 'cdp') {
    // The UI receives the reply through its own event stream; confirm it was painted.
    for (let i = 0; i < 100 && !uiRendered; i++) {
      uiRendered = await app.cdp!
        .eval<boolean>(`[...document.querySelectorAll('.timeline-row')].some(row =>
        ${JSON.stringify(result.replyIDs)}.some(id => row.dataset.rowId?.includes(id)) &&
        row.querySelector('.assistant-message')?.innerText.includes('BENCH-END'))`);
      if (!uiRendered) await Bun.sleep(50);
    }
  }
  return {
    ...result,
    frames: await stopFrames(app.log, frameStart, app.cdp),
    model: opts.model,
    uiRenderedReply: uiRendered,
    visibility,
    avgCpuPct: overall.cpuPct,
    peakCpuPct1s: Math.max(...samples.map((s) => s.cpuPct)),
    peakRssMB: Math.max(...samples.map((s) => s.rssMB)),
    peakFootprintMB:
      Math.max(0, ...samples.flatMap((s) => (s.footprintMB ? [s.footprintMB] : []))) || null,
    perProcessAvgCpu: overall.perProcess,
    opencodeServerAvgCpuPct: overall.extra[0]?.cpuPct ?? null,
    samples,
  };
}

async function quit(app: Launch) {
  app.cdp?.close();
  const owned = new Set(appTree(app.pid, bundlePrefix).map((p) => p.pid));
  // Only signal processes from this launch that still run this app's executable or bundle.
  const remaining = () =>
    snapshot().filter((p) => owned.has(p.pid) && p.command.startsWith(bundlePrefix ?? executable));
  signal([app.pid], 'SIGTERM');
  for (let i = 0; i < 100; i++) {
    if (!remaining().length) return 'graceful';
    await Bun.sleep(100);
  }
  signal(
    remaining().map((p) => p.pid),
    'SIGKILL',
  );
  return 'killed';
}

function signal(pids: number[], name: NodeJS.Signals) {
  for (const pid of pids) {
    try {
      const environment = Bun.spawnSync(['ps', 'eww', '-p', String(pid)]).stdout.toString();
      if (!environment.includes(process.env.HOME!.slice(0, -5))) continue;
      process.kill(pid, name);
    } catch {
      // Already exited.
    }
  }
}

async function main() {
  if (opts['headless-safe']) return headlessSafe();
  const { client, serverPid, url } = await connect();
  if (!opts['source-session'] && !opts.project)
    throw new Error('Pass --project <dir> (longest session is used) or --source-session <id>.');
  const source = opts['source-session']
    ? {
        id: opts['source-session'],
        title: '',
        messages: null as number | null,
        mb: null as number | null,
      }
    : await longestSession(client, opts.project!);
  // The bench fork lives in the source session's project, which the app must show.
  const directory = (await client.session.get({ sessionID: source.id })).location.directory;
  const title = `opencodex-bench ${new Date().toISOString().slice(0, 19)}`;
  const dataDir = mkdtempSync(join(tmpdir(), 'opencodex-bench-'));
  const benchSession = await forkForBench(client, source.id, title).catch((error) => {
    rmSync(dataDir, { recursive: true, force: true });
    throw error;
  });
  const env = {
    OPENCODEX_BENCH_PROJECT: directory,
    OPENCODEX_BENCH_SESSION: benchSession,
  };
  // The Electron build reads the selected project from its electron-store preferences.
  const results: Record<string, unknown>[] = [];
  let warmup: Record<string, unknown> | undefined;
  // 'graceful' when SIGTERM ended the whole tree within 10 s, otherwise 'killed'.
  const quitModes: string[] = [];
  try {
    seedProfile(dataDir, directory, driver === 'marker');
    // Launch 0 primes the fresh profile (Chromium code cache, GPU cache) and the OS file cache.
    for (let index = 0; index <= runs; index++) {
      const waitedForQuietMs = await waitForQuiet();
      const background = { ...busyBackground(), waitedForQuietMs };
      const app = await launch(dataDir, env);
      try {
        const content = await firstContent(app);
        if (!content.at || (content.visibility !== null && content.visibility !== 'visible'))
          throw new Error(
            'Meaningful content was not presented in a visible window; no visible results will be reported.',
          );
        while (!app.windowAt && Date.now() - app.t0 < 15_000) await Bun.sleep(10);
        if (!app.windowAt)
          throw new Error(
            'App has no visible window: unlock the screen and move it out of any full-screen Space. No presentation results will be reported.',
          );
        const startup = {
          windowVisibleMs: app.windowAt ? app.windowAt - app.t0 : null,
          firstContentfulPaintMs: content.fcpAt ? Math.round(content.fcpAt - app.t0) : null,
          // Painted (possibly while the window is still hidden).
          firstMeaningfulContentMs: content.at ? content.at - app.t0 : null,
          // What the user can see: content painted and window on screen.
          firstMeaningfulContentVisibleMs:
            content.at && app.windowAt ? Math.max(content.at, app.windowAt) - app.t0 : null,
          windowSize: app.windowSize,
          visibility: content.visibility,
        };
        console.log(`[${name}] launch ${index}${index === 0 ? ' (warm-up)' : ''}`, startup);
        if (index === 0) {
          warmup = { ...startup, background };

          continue;
        }
        await Bun.sleep(Math.max(0, app.t0 + 10_000 - Date.now()));
        const idleMemory = memory(app.pid, bundlePrefix);
        const idleCpu = await cpuOver(idleMs, app.pid, bundlePrefix, serverPid ? [serverPid] : []);
        console.log(`[${name}] idle`, {
          rssMB: idleMemory.rssMB,
          footprintMB: idleMemory.footprintMB,
          procs: idleMemory.processCount,
          cpuPct: idleCpu.cpuPct,
        });
        const session = await openSession(app, title);
        if (session.ms === null || session.settledMs === null || session.painted === false)
          throw new Error(
            'Long-session presentation/settled milestone missing; keep the app unobstructed.',
          );
        await Bun.sleep(10_000);
        const sessionMemory = memory(app.pid, bundlePrefix);
        const sessionCpu = await cpuOver(10_000, app.pid, bundlePrefix);
        const scrollFrames = await exercise(app, 'scroll');
        const inputFrames = await exercise(app, 'type');
        console.log(`[${name}] long session`, {
          openMs: session.ms,
          domMs: session.domMs,
          visibility: session.visibility,
          settledMs: session.settledMs,
          rssMB: sessionMemory.rssMB,
          footprintMB: sessionMemory.footprintMB,
          cpuPct: sessionCpu.cpuPct,
        });
        const streaming = opts['skip-stream']
          ? null
          : await stream(app, client, benchSession, serverPid);
        if (streaming) {
          console.log(`[${name}] streaming`, {
            durationMs: streaming.durationMs,
            outputTokens: streaming.outputTokens,
            uiRenderedReply: streaming.uiRenderedReply,
            avgCpuPct: streaming.avgCpuPct,
            peakCpuPct1s: streaming.peakCpuPct1s,
            peakRssMB: streaming.peakRssMB,
            peakFootprintMB: streaming.peakFootprintMB,
          });
        }
        await Bun.sleep(5000);
        const afterStreamMemory = streaming ? memory(app.pid, bundlePrefix) : null;
        results.push({
          run: index,
          background,
          startup,
          idle: { memory: idleMemory, cpu: { windowMs: idleMs, ...idleCpu } },
          longSession: {
            scrollFrames,
            inputFrames,
            openMs: session.ms,
            settledMs: session.settledMs,
            domMs: session.domMs,
            painted: session.painted,
            visibility: session.visibility,
            renderedRows: session.renderedRows,
            memoryAfter10s: sessionMemory,
            idleCpuPct10s: sessionCpu.cpuPct,
          },
          streaming,
          afterStreamMemory,
        });
      } finally {
        quitModes.push(await quit(app));
        await Bun.sleep(index === 0 ? 2000 : 3000);
      }
    }
  } finally {
    try {
      await removeSession(client, benchSession);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw run records
  const pick = (fn: (r: any) => number | null | undefined) =>
    median(results.map((r) => fn(r) ?? NaN));
  const output = {
    name,
    revision: build?.revision ?? null,
    build,
    harnessRevision: Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: join(here, '..') })
      .stdout.toString()
      .trim(),
    app: appPath,
    executable,
    driver,
    date: new Date().toISOString(),
    machine: {
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      os: Bun.spawnSync(['sw_vers', '-productVersion']).stdout.toString().trim(),
    },
    opencode: { url, serverPid, sourceSession: source, benchSessionDeleted: true },
    size: diskSize(),
    medians: {
      windowVisibleMs: pick((r) => r.startup.windowVisibleMs),
      firstContentfulPaintMs: pick((r) => r.startup.firstContentfulPaintMs),
      firstMeaningfulContentMs: pick((r) => r.startup.firstMeaningfulContentMs),
      firstMeaningfulContentVisibleMs: pick((r) => r.startup.firstMeaningfulContentVisibleMs),
      idleProcessCount: pick((r) => r.idle.memory.processCount),
      idleRssMB: pick((r) => r.idle.memory.rssMB),
      idleFootprintMB: pick((r) => r.idle.memory.footprintMB),
      idleCpuPct: pick((r) => r.idle.cpu.cpuPct),
      longSessionOpenMs: pick((r) => r.longSession.openMs),
      longSessionSettledMs: pick((r) => r.longSession.settledMs),
      longSessionRssMB: pick((r) => r.longSession.memoryAfter10s.rssMB),
      longSessionFootprintMB: pick((r) => r.longSession.memoryAfter10s.footprintMB),
      longSessionIdleCpuPct: pick((r) => r.longSession.idleCpuPct10s),
      streamDurationMs: pick((r) => r.streaming?.durationMs),
      streamAvgCpuPct: pick((r) => r.streaming?.avgCpuPct),
      streamPeakCpuPct1s: pick((r) => r.streaming?.peakCpuPct1s),
      streamPeakRssMB: pick((r) => r.streaming?.peakRssMB),
      streamPeakFootprintMB: pick((r) => r.streaming?.peakFootprintMB),
      opencodeServerStreamAvgCpuPct: pick((r) => r.streaming?.opencodeServerAvgCpuPct),
      afterStreamRssMB: pick((r) => r.afterStreamMemory?.rssMB),
      afterStreamFootprintMB: pick((r) => r.afterStreamMemory?.footprintMB),
    },
    warmup,
    quitModes,
    runs: results,
  };
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ size: output.size, medians: output.medians }, null, 2));
  console.log(`Wrote ${outFile}`);
}

function du(path: string) {
  return Number(Bun.spawnSync(['du', '-sk', path]).stdout.toString().split('\t')[0]) * 1024;
}

function diskSize() {
  const mb = (bytes: number) => round(bytes / 1048576);
  if (!isBundle) return { totalMB: mb(du(appPath)) };
  const parts = Object.fromEntries(
    [
      ['frameworksMB', 'Contents/Frameworks'],
      ['appAsarMB', 'Contents/Resources/app.asar'],
      ['executableMB', `Contents/MacOS/${basename(executable)}`],
      ['gatewayMB', 'Contents/Resources/opencodex-gateway'],
    ]
      .filter(([, rel]) => existsSync(join(appPath, rel!)))
      .map(([key, rel]) => [key, mb(du(join(appPath, rel!)))]),
  );
  const files = Number(
    Bun.spawnSync(['sh', '-c', `find "${appPath}" -type f | wc -l`])
      .stdout.toString()
      .trim(),
  );
  return { totalMB: mb(du(appPath)), ...parts, fileCount: files };
}

await main();

async function exercise(app: Launch, action: 'scroll' | 'type') {
  requireVisibleScreen();
  const started = await startFrames(app.cdp);
  if (app.cdp) await cdpExercise(app.cdp, action);
  else {
    const binary = join(here, '.build/input');
    const source = join(here, 'lib/input.swift');
    if (!existsSync(binary) || statSync(binary).mtimeMs < statSync(source).mtimeMs) {
      mkdirSync(dirname(binary), { recursive: true });
      const built = Bun.spawnSync(['swiftc', '-O', source, '-o', binary]);
      if (built.exitCode) throw new Error(built.stderr.toString());
    }
    const child = Bun.spawn([binary, String(app.pid), action], { stderr: 'pipe' });
    if (await child.exited) throw new Error(await new Response(child.stderr).text());
  }
  await Bun.sleep(250);
  const result = await stopFrames(app.log, started, app.cdp);
  if (action === 'scroll' && result.intervalMs.samples < 2)
    throw new Error('No scrolling frames presented; keep the transcript visible.');
  if (action === 'type' && !result.inputToFrameMs.samples)
    throw new Error('No key-to-frame samples: check composer focus and input permission.');
  return result;
}

async function headlessSafe() {
  // No fork, prompt, window metrics, or frame claims in this subset.
  const { url, serverPid } = await connect();
  const dataDir = mkdtempSync(join(tmpdir(), 'opencodex-bench-'));
  const results = [];
  const quitModes = [];
  if (opts.project) seedProfile(dataDir, opts.project, driver === 'marker');
  try {
    for (let i = 0; i < runs; i++) {
      const waitedForQuietMs = await waitForQuiet();
      const background = { ...busyBackground(), waitedForQuietMs };
      const app = await launch(dataDir, {
        ...(opts.project ? { OPENCODEX_BENCH_PROJECT: opts.project } : {}),
        ...(opts['source-session'] ? { OPENCODEX_BENCH_SESSION: opts['source-session'] } : {}),
      });
      try {
        const cdpAttachedMs = app.cdp ? Date.now() - app.t0 : null;
        const ready = driver === 'marker' ? await marker(app.log, 'gateway_ready', 30000) : null;
        const connected =
          driver === 'marker' ? await marker(app.log, 'gateway_connected', 60000) : null;
        if (driver === 'marker' && (!ready || !connected))
          throw new Error('Sidecar failed to connect; inspect gateway.log');
        const sidebar = driver === 'marker' ? await marker(app.log, 'sidebar_loaded', 30000) : null;
        if (driver === 'marker' && !sidebar)
          throw new Error('Gateway connected but sidebar snapshot did not load.');
        const sidebarDomMs = app.cdp
          ? (await app.cdp.paintedWhen('.session-row')).domAt - app.t0
          : null;
        await Bun.sleep(10000);
        const idleMemory = memory(app.pid, bundlePrefix);
        const idleCpu = await cpuOver(idleMs, app.pid, bundlePrefix);
        let sessionOpen = null;
        if (opts['source-session']) {
          const before = snapshot();
          const started = performance.now();
          let domMs: number | null = null;
          if (app.cdp) {
            const title = (
              await (await connect()).client.session.get({ sessionID: opts['source-session'] })
            ).title;
            const beforeClick = Date.now();
            let clicked = false;
            for (let attempt = 0; attempt < 100 && !clicked; attempt++) {
              clicked = await app.cdp.eval<boolean>(`(() => {
                const row = [...document.querySelectorAll('.session-row')].find(e => e.textContent.includes(${JSON.stringify(title)}));
                if (row) { row.click(); return true; }
                [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Show more')?.click(); return false;
              })()`);
              if (!clicked) await Bun.sleep(100);
            }
            if (!clicked)
              throw new Error(
                'Heavy session absent from sidebar: ' +
                  (await app.cdp.eval('document.body.innerText')),
              );
            domMs = (await app.cdp.paintedWhen('.timeline-row')).domAt - beforeClick;
          } else process.kill(app.pid, 'SIGUSR1');
          await Bun.sleep(5000);
          const elapsedMs = performance.now() - started;
          sessionOpen = {
            observationMs: round(elapsedMs),
            domMs,
            cpu: cpuDelta(before, snapshot(), elapsedMs / 1000, app.pid, bundlePrefix),
            memory: memory(app.pid, bundlePrefix),
            note: 'Five-second non-presentation observation, not time to visible or settled content. Native completion is not measurable while locked.',
          };
        }
        results.push({
          background,
          cdpAttachedMs,
          sidebarDomMs,
          gatewayReadyMs: ready ? ready - app.t0 : null,
          gatewayConnectedMs: connected ? connected - app.t0 : null,
          sidebarSnapshotMs: sidebar ? sidebar - app.t0 : null,
          memory: idleMemory,
          idleCpu,
          sessionOpen,
        });
      } finally {
        quitModes.push(await quit(app));
        if (serverPid) process.kill(serverPid, 0); // Externally-owned service must survive.
      }
    }
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
  const output = {
    name,
    revision: build?.revision ?? null,
    build,
    harnessRevision: Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: join(here, '..') })
      .stdout.toString()
      .trim(),
    mode: 'locked screen — no presentation; memory/CPU/size/non-presentation milestones only',
    opencode: { url, serverPid },
    quitModes,
    opencodeSurvivedQuit: serverPid ? true : null,
    size: diskSize(),
    runs: results,
  };
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}
