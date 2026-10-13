/**
 * Runs one canvas's `server.ts` in a child process of the gateway. The gateway sends the
 * transpiled files and calls; data and OpenCode requests go back to it over IPC. `sh`
 * runs here, so a long command never blocks the gateway.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { format } from 'node:util';
import { loadModules } from './loader';
import * as SDK from './server';

type Incoming =
  | { type: 'load'; modules: Record<string, string>; entry: string }
  | { type: 'call'; call: string; name: string; args: unknown[] }
  | { type: 'reply'; id: number; value?: unknown; error?: string };

const send = (message: unknown) => process.send?.(message);
const current = new AsyncLocalStorage<string>();
const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
let nextID = 0;
let exports: Record<string, unknown> = {};

const MAX_OUTPUT = 16 * 1024 * 1024;

function shell(input: { command: string; cwd?: string; input?: string; timeout?: number }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.SHELL || '/bin/sh', ['-c', input.command], {
      cwd: input.cwd || homedir(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const collect = (target: 'stdout' | 'stderr') => (chunk: Buffer) => {
      if (target === 'stdout' && stdout.length < MAX_OUTPUT) stdout += chunk;
      if (target === 'stderr' && stderr.length < MAX_OUTPUT) stderr += chunk;
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    const timer = setTimeout(() => child.kill('SIGTERM'), input.timeout ?? 120_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input.input ?? '');
  });
}

(globalThis as { __opencodexServer?: unknown }).__opencodexServer = {
  request(op: string, input: unknown) {
    if (op === 'sh') return shell(input as { command: string });
    const id = ++nextID;
    send({ type: 'request', id, call: current.getStore(), op, input });
    return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
  },
};

// Console output belongs to the call that printed it, even with several calls in flight.
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const)
  console[level] = (...args: unknown[]) =>
    send({ type: 'log', call: current.getStore(), line: format(...args).slice(0, 4000) });

function message(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.includes('canvas:///'))
    .slice(0, 3)
    .map((line) => line.trim().replace(/canvas:\/\/\//g, ''));
  return [error.message, ...frames].join('\n  ');
}

function triggers(value: unknown) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object') throw new Error('`triggers` must be an object.');
  const result: Record<string, { every: string }> = {};
  for (const [name, trigger] of Object.entries(value)) {
    if (typeof exports[name] !== 'function')
      throw new Error(`triggers.${name} names no exported function.`);
    const every = (trigger as { every?: unknown })?.every;
    if (typeof every !== 'string') throw new Error(`triggers.${name}.every must be like '1h'.`);
    result[name] = { every };
  }
  return result;
}

process.on('message', async (input: Incoming) => {
  if (input.type === 'reply') {
    const pending = waiting.get(input.id);
    waiting.delete(input.id);
    if (input.error !== undefined) pending?.reject(new Error(input.error));
    else pending?.resolve(input.value);
  } else if (input.type === 'load') {
    try {
      exports = loadModules(input.modules, input.entry, {
        '@opencodex/canvas/server': SDK,
      });
      const functions = Object.keys(exports).filter(
        (name) => name !== 'default' && typeof exports[name] === 'function',
      );
      send({ type: 'loaded', functions, triggers: triggers(exports.triggers) });
    } catch (error) {
      send({ type: 'loaded', functions: [], triggers: {}, error: message(error) });
    }
  } else if (input.type === 'call') {
    const fn = exports[input.name];
    if (typeof fn !== 'function') {
      send({ type: 'result', call: input.call, error: `server.ts exports no ${input.name}().` });
      return;
    }
    try {
      const value = await current.run(input.call, () => fn(...input.args));
      send({ type: 'result', call: input.call, value: value === undefined ? null : value });
    } catch (error) {
      send({ type: 'result', call: input.call, error: message(error) });
    }
  }
});

process.on('disconnect', () => process.exit(0));
process.on('unhandledRejection', (error) => console.error('Unhandled:', message(error)));
