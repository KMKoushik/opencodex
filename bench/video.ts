// Real ScreenCaptureKit recording. Synthetic composition testing lives in video.sh --self-test.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connect, forkForBench, removeSession, streamPrompt } from './lib/opencode';
import { Cdp } from './lib/cdp';
import { cdpExercise } from './lib/frames';
import { appTree, snapshot } from './lib/proc';
import { requireIsolatedEnvironment, requireVisibleScreen } from './lib/screen';
import { verifyBuild } from './lib/build';
import { seedProfile } from './lib/profile';

requireIsolatedEnvironment();
requireVisibleScreen();
const fixture = await Bun.file('/tmp/ocr-bench/fixture.json').json();
const { client, url } = await connect();
if (new URL(url).port !== '4989') throw new Error('Wrong fixture service');
const bundles = [
  'apps/desktop/release/mac-arm64/OpenCodex.app',
  'apps/rune/dist/OpenCodex Rune.app',
].map((path) => resolve(path));
for (const [index, bundle] of bundles.entries())
  verifyBuild(bundle, `${bundle}/Contents/MacOS/${index ? 'opencodex' : 'OpenCodex'}`);
for (const bundle of bundles)
  if (snapshot().some((p) => p.command.startsWith(bundle + '/')))
    throw new Error(`Close this exact benchmark bundle first: ${bundle}`);
const data = mkdtempSync('/tmp/ocr-bench/video-');
const fork = await forkForBench(client, fixture.sessionID, 'Video — identical heavy review');
const directory = (await client.session.get({ sessionID: fork })).location.directory;
const pids: number[] = [];
let cdp: Cdp | undefined;
let capture: ReturnType<typeof Bun.spawn> | undefined;
const timeline: { phase: string; elapsedMs: number; detail?: unknown }[] = [];
let t0 = Date.now();
const mark = (phase: string, detail?: unknown) => {
  timeline.push({ phase, elapsedMs: Date.now() - t0, detail });
  console.log(phase, detail ?? '');
};
async function command(args: string[]) {
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  if (await proc.exited)
    throw new Error(`${args.join(' ')}: ${await new Response(proc.stderr).text()}`);
}
async function pairedInput(action: 'scroll' | 'type' | 'diff' | 'threads') {
  await Promise.all(pids.map((pid) => command(['bench/.build/input', String(pid), action])));
}
async function openHeavy() {
  process.kill(pids[1]!, 'SIGUSR1');
  let clicked = false;
  for (let i = 0; i < 100 && !clicked; i++) {
    clicked = await cdp!.eval<boolean>(`(() => {
      const row = [...document.querySelectorAll('.session-row')].find(e => e.textContent.includes('Video — identical heavy review'));
      if (row) { row.click(); return true; }
      [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'Show more')?.click(); return false;
    })()`);
    if (!clicked) await Bun.sleep(100);
  }
  if (!clicked) throw new Error('Video fork missing from sidebar');
  await cdp!.paintedWhen('.timeline-row');
  const deadline = Date.now() + 30000;
  while (
    !Bun.file(`${data}/rune.log`).size ||
    !(await Bun.file(`${data}/rune.log`).text()).includes('OPENCODEX_BENCH session_loaded')
  ) {
    if (Date.now() > deadline) throw new Error('Rune heavy session not presented');
    await Bun.sleep(100);
  }
}
try {
  mkdirSync('bench/.build', { recursive: true });
  const movie = resolve('bench/.build/capture.mov');
  if (existsSync(movie)) rmSync(movie);
  capture = Bun.spawn(['bench/.build/capture', movie], { stdout: 'pipe', stderr: 'inherit' });
  const reader = (capture.stdout as ReadableStream<Uint8Array>).getReader();
  const first = await Promise.race([
    reader.read(),
    Bun.sleep(15000).then(() => {
      throw new Error('ScreenCaptureKit did not start');
    }),
  ]);
  if (!new TextDecoder().decode(first.value).includes('READY'))
    throw new Error('Capture failed before READY');
  reader.releaseLock();
  const portServer = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const port = portServer.port;
  portServer.stop(true);
  const existing = new Set(snapshot().map((p) => p.pid));
  t0 = Date.now();
  mark('Cold process launch (warm OS caches); both LaunchServices requests issued together');
  await Promise.all(
    bundles.map(async (bundle, index) => {
      const profile = `${data}/${index}`;
      mkdirSync(profile, { recursive: true });
      seedProfile(profile, directory, index === 1);
      const env = {
        ...process.env,
        OPENCODEX_BENCH: '1',
        OPENCODEX_BENCH_FRAMES: '1',
        OPENCODEX_BENCH_PROJECT: directory,
        OPENCODEX_BENCH_SESSION: fork,
        OPENCODEX_DATA_DIR: profile,
        OPENCODEX_BENCH_LOG: `${data}/${index ? 'rune' : 'electron'}.log`,
      };
      const flags = index ? [] : [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`];
      await command([
        'open',
        '-n',
        '-a',
        bundle,
        ...Object.entries(env)
          .filter((pair): pair is [string, string] => typeof pair[1] === 'string')
          .flatMap(([k, v]) => ['--env', `${k}=${v}`]),
        '--args',
        ...flags,
      ]);
      const deadline = Date.now() + 30000;
      while (!pids[index]) {
        pids[index] =
          snapshot().find(
            (p) => !existing.has(p.pid) && p.command.startsWith(`${bundle}/Contents/MacOS/`),
          )?.pid ?? 0;
        if (Date.now() > deadline) throw new Error('App failed to launch');
        if (!pids[index]) await Bun.sleep(20);
      }
    }),
  );
  cdp = await Cdp.attach(port);
  await cdp.paintedWhen('.session-row');
  await command(['bench/.build/tile', ...pids.map(String)]);
  // Confirm actual on-screen windows, not only successful AX calls.
  await Promise.all(
    bundles.map((bundle, i) =>
      command([
        'bench/.build/winwatch',
        `${bundle}/Contents/MacOS/${i ? 'opencodex' : 'OpenCodex'}`,
        '5000',
      ]),
    ),
  );
  mark('Two equal windows tiled; labels are composited Electron left / Rune right');
  await Bun.sleep(2000);
  mark('Open heavy chat');
  await openHeavy();
  await Bun.sleep(2000);
  mark('Fling scroll top to bottom');
  await Promise.all([
    cdpExercise(cdp, 'scroll', 1200),
    command(['bench/.build/input', String(pids[1]), 'fling']),
  ]);
  mark('Type 30 characters without submitting');
  await Promise.all([
    cdpExercise(cdp, 'type'),
    command(['bench/.build/input', String(pids[1]), 'type']),
  ]);
  mark('Open Changes and index.ts diff');
  await pairedInput('diff');
  await Bun.sleep(3000);
  mark('Rapid thread switching');
  await pairedInput('threads');
  await openHeavy();
  mark('Stream shared free-model reply (same events to both clients)');
  const result = await streamPrompt(
    client,
    fork,
    'opencode/big-pickle',
    'Do not use tools. Explain bounded caches in 350 words, with a heading and Rust example. End with BENCH-END.',
    60_000,
  );
  mark('Stream completed', result);
  if (!result.succeeded)
    throw new Error(
      'Free model failed all retries; attempts retained in video-scenario.json. Rerun when network/rate limit clears.',
    );
  await Bun.sleep(5000);
} finally {
  if (capture) {
    capture.kill('SIGINT');
    await capture.exited;
  }
  cdp?.close();
  for (const pid of pids.filter(Boolean)) {
    const owned = appTree(pid).filter((p) => p.command.startsWith(resolve('apps/') + '/'));
    try {
      const env = Bun.spawnSync(['ps', 'eww', '-p', String(pid)]).stdout.toString();
      if (env.includes('/tmp/ocr-bench')) process.kill(pid, 'SIGTERM');
    } catch {
      /* exited */
    }
    await Bun.sleep(1500);
    for (const p of owned) {
      // Verify identity and isolated environment before signaling remaining processes.
      const current = snapshot().find((now) => now.pid === p.pid && now.command === p.command);
      const env = Bun.spawnSync(['ps', 'eww', '-p', String(p.pid)]).stdout.toString();
      if (current && env.includes('/tmp/ocr-bench'))
        try {
          process.kill(p.pid, 'SIGKILL');
        } catch {
          /* exited */
        }
    }
  }
  await removeSession(client, fork);
  writeFileSync(
    'bench/results/video-scenario.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        launchEpochMs: t0,
        fixture: fixture.sessionID,
        sharedForkDeleted: true,
        timeline,
      },
      null,
      2,
    ),
  );
  rmSync(data, { recursive: true, force: true });
}
