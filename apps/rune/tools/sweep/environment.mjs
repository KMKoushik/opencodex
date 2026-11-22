import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
export const root = resolve(import.meta.dirname, '../../../..');
export const fixture = '/tmp/ocr-sweep';
export const base = 'http://127.0.0.1:4507';
export const now = 1795348800000;
export const env = {
  ...process.env,
  // Isolate app/service state, not the installed compiler/toolchain cache.
  RUSTUP_HOME: process.env.RUSTUP_HOME ?? process.env.HOME + '/.rustup',
  CARGO_HOME: process.env.CARGO_HOME ?? process.env.HOME + '/.cargo',
  HOME: fixture + '/home',
  XDG_CONFIG_HOME: fixture + '/home/.config',
  XDG_DATA_HOME: fixture + '/home/.local/share',
  XDG_STATE_HOME: fixture + '/home/.local/state',
  XDG_CACHE_HOME: fixture + '/home/.cache',
  OCR_FIXTURE: fixture,
  OCR_BASE: base,
  OCR_FIXTURE_NOW: String(now),
  OPENCODEX_GATEWAY: base,
  OPENCODEX_DATA_DIR: fixture + '/rune',
};
export function command(bin, args, extra = {}) {
  return execFileSync(bin, args, {
    cwd: root,
    env: { ...env, ...extra },
    timeout: 180000,
    maxBuffer: 20e6,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function pids(port) {
  try {
    return execFileSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return [];
  }
}
function owned(pid) {
  try {
    const argv = execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
    }).trim();
    const expanded = execFileSync('ps', ['eww', '-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
    }).trim();
    // Do not mistake an argv string mentioning HOME for the actual environment.
    return (
      expanded.startsWith(argv) &&
      expanded
        .slice(argv.length)
        .split(/\s+/)
        .includes('HOME=' + fixture + '/home')
    );
  } catch {
    return false;
  }
}
function start(bin, args, log, extra = {}) {
  const fd = openSync(fixture + '/' + log, 'a');
  const child = spawn(bin, args, {
    cwd: root,
    env: { ...env, ...extra },
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  return child;
}
export async function setup() {
  for (const port of [4977, 4507])
    for (const pid of pids(port))
      if (!owned(pid))
        throw new Error(`Port ${port} is owned by a non-sweep process; refusing access.`);
  for (const part of ['home', 'pkg', 'proj']) mkdirSync(fixture + '/' + part, { recursive: true });
  if (!existsSync(fixture + '/pkg/node_modules/.bin/opencode'))
    command('npm', ['install', '--prefix', fixture + '/pkg', '@opencode/cli@2.3.2']);
  if (!pids(4977).length) {
    command(fixture + '/pkg/node_modules/.bin/opencode', ['service', 'set', 'port', '4977']);
    start(fixture + '/pkg/node_modules/.bin/opencode', ['serve', '--service'], 'opencode.log');
  }
  if (!pids(4507).length)
    start(
      'node',
      ['--import', 'tsx', 'packages/gateway/src/cli.ts', '--production'],
      'gateway.log',
      { PORT: '4507' },
    );
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(base + '/api/connection', { method: 'POST' });
      if (r.ok && (await r.json()).status === 'connected') return;
    } catch {
      /* bounded service readiness retry, never render polling */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Isolated gateway did not connect; inspect /tmp/ocr-sweep/*.log');
}
export async function cleanup() {
  // Enumerate actual environments, including PTYs/esbuild children, not names or port guesses.
  const all = execFileSync('ps', ['-axo', 'pid='], { encoding: 'utf8' }).trim().split(/\s+/);
  const isolated = all.filter((pid) => Number(pid) !== process.pid && owned(pid));
  for (const pid of isolated) {
    try {
      if (owned(pid)) process.kill(Number(pid), 'SIGTERM');
    } catch {
      /* already exited */
    }
  }
  await new Promise((r) => setTimeout(r, 500));
  for (const pid of isolated)
    if (owned(pid)) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        /* exited */
      }
    }
  rmSync(fixture, { recursive: true, force: true });
}
export async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!owned(child.pid)) throw new Error('Refusing to stop a process without the sweep HOME');
  child.kill('SIGTERM');
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (owned(child.pid)) child.kill('SIGKILL');
}
