import { app } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { release } from 'node:os';
import { fileURLToPath } from 'node:url';
import type {
  DesktopToolCall,
  DesktopToolHandler,
  DesktopToolResult,
} from '@opencodex/contracts/desktop-tools';

const maxRequestBytes = 128 * 1024;
const maxResponseBytes = 16 * 1024 * 1024;
const maxPending = 32;
const requestTimeout = 35_000;
const permissionRequestTimeout = 120_000;

type Pending = {
  id: string;
  line: string;
  signal: AbortSignal;
  resolve: (value: DesktopToolResult) => void;
  reject: (reason: Error) => void;
  abort: () => void;
  timeout: number;
  timer?: ReturnType<typeof setTimeout>;
};

function textResult(value: unknown): DesktopToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function result(value: unknown): DesktopToolResult {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid computer helper response.');
  const { screenshot, ...metadata } = value as Record<string, unknown>;
  if (!screenshot) return textResult(metadata);
  if (typeof screenshot !== 'object' || Array.isArray(screenshot))
    throw new Error('Invalid computer helper screenshot.');
  const { base64, mime, ...image } = screenshot as Record<string, unknown>;
  if (
    mime !== 'image/png' ||
    typeof base64 !== 'string' ||
    base64.length > 12 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw new Error('Invalid computer helper screenshot encoding.');
  return {
    content: [
      { type: 'text', text: JSON.stringify({ ...metadata, screenshot: { ...image, mime } }) },
      { type: 'file', uri: `data:image/png;base64,${base64}`, mime, name: 'computer-state.png' },
    ],
  };
}

/** One worker and one in-flight request: cancellation discards the worker and every AX reference. */
export function createComputerControl(): {
  handle: DesktopToolHandler;
  requestPermissions: (kind: 'accessibility' | 'screenRecording') => Promise<void>;
  close: () => Promise<void>;
} {
  const executable = join(
    app.isPackaged
      ? join(process.resourcesPath, 'native')
      : fileURLToPath(new URL('../../native/out/', import.meta.url)),
    'OpenCodex Computer Control.app',
    'Contents',
    'MacOS',
    'computer-control',
  );
  const queue: Pending[] = [];
  let worker: ChildProcessWithoutNullStreams | undefined;
  let active: Pending | undefined;
  let stopping = false;
  let closed = false;
  let permissionSetup = false;
  let exitPromise: Promise<void> = Promise.resolve();
  let killTimer: ReturnType<typeof setTimeout> | undefined;

  function finish(pending: Pending, error?: Error, response?: DesktopToolResult) {
    pending.signal.removeEventListener('abort', pending.abort);
    clearTimeout(pending.timer);
    if (active === pending) active = undefined;
    if (error) pending.reject(error);
    else pending.resolve(response!);
  }

  function stopWorker() {
    if (!worker || stopping) return;
    stopping = true;
    const child = worker;
    // Native TERM handling releases an in-progress drag. A stuck AX/capture call has a hard stop.
    child.kill('SIGTERM');
    child.stdin.end();
    killTimer = setTimeout(() => child.kill('SIGKILL'), 1_000);
    killTimer.unref();
  }

  function failWorker(message: string) {
    if (active) finish(active, new Error(message));
    stopWorker();
  }

  function startWorker() {
    const child = spawn(executable, [], {
      cwd: dirname(executable),
      stdio: ['pipe', 'pipe', 'pipe'],
      // No shell, DYLD overrides, or inherited language/runtime injection into the native helper.
      env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    });
    worker = child;
    let chunks: Buffer[] = [];
    let bytes = 0;
    exitPromise = new Promise<void>((resolve) => {
      child.once('close', () => {
        clearTimeout(killTimer);
        if (active) finish(active, new Error('Computer helper exited; input was not replayed.'));
        worker = undefined;
        stopping = false;
        chunks = [];
        resolve();
        pump();
      });
    });
    child.once('error', () => {
      failWorker(
        'Computer helper could not start. Run computer-use:build on macOS and check the helper installation.',
      );
    });
    child.stdin.on('error', () =>
      failWorker('Computer helper connection closed; input was not replayed.'),
    );
    // Drain stderr without logging potentially sensitive framework diagnostics or binary data.
    child.stderr.on('data', () => undefined);
    child.stdout.on('data', (chunk: Buffer) => {
      if (stopping) return;
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset);
        const piece = chunk.subarray(offset, newline < 0 ? chunk.length : newline);
        bytes += piece.length;
        if (bytes > maxResponseBytes) {
          failWorker('Computer helper response exceeded its size limit.');
          return;
        }
        chunks.push(piece);
        if (newline < 0) return;
        const line = Buffer.concat(chunks, bytes).toString('utf8');
        chunks = [];
        bytes = 0;
        offset = newline + 1;
        try {
          const response = JSON.parse(line) as {
            id?: unknown;
            result?: unknown;
            error?: { code?: unknown; message?: unknown };
          };
          if (!active || response.id !== active.id) throw new Error('Unexpected helper response.');
          if (response.error) {
            if (typeof response.error.message !== 'string')
              throw new Error('Invalid helper error.');
            finish(active, new Error(`${String(response.error.code)}: ${response.error.message}`));
          } else finish(active, undefined, result(response.result));
          pump();
        } catch {
          failWorker('Computer helper returned an invalid response; input was not replayed.');
          return;
        }
      }
    });
  }

  function pump() {
    if (closed || stopping || active || !queue.length) return;
    const next = queue.shift()!;
    if (next.signal.aborted) {
      finish(next, new Error('Computer request cancelled before execution.'));
      pump();
      return;
    }
    active = next;
    if (!worker) startWorker();
    next.timer = setTimeout(() => {
      if (active === next) failWorker('Computer request timed out; input was not replayed.');
    }, next.timeout);
    worker!.stdin.write(next.line);
  }

  const dispatch: DesktopToolHandler = async (call: DesktopToolCall, signal: AbortSignal) => {
    if (closed) throw new Error('Computer control is closed.');
    if (signal.aborted) throw new Error('Computer request cancelled before execution.');
    if (process.platform !== 'darwin' || Number.parseInt(release(), 10) < 23) {
      if (call.method === 'computer.status')
        return textResult({
          supported: false,
          accessibility: false,
          screenRecording: false,
          message: 'Computer control requires macOS 14 or later.',
        });
      throw new Error('Computer control requires macOS 14 or later.');
    }
    if (queue.length + Number(Boolean(active)) >= maxPending)
      throw new Error('Computer control queue is full.');
    const id = randomUUID();
    const line = `${JSON.stringify({ id, sessionID: call.sessionID, method: call.method, input: call.input })}\n`;
    if (Buffer.byteLength(line) > maxRequestBytes)
      throw new Error('Computer request exceeds 128 KiB.');
    try {
      return await new Promise<DesktopToolResult>((resolve, reject) => {
        const pending: Pending = {
          id,
          line,
          signal,
          timeout:
            call.method === 'computer.request_permissions'
              ? permissionRequestTimeout
              : requestTimeout,
          resolve,
          reject,
          abort: () => {
            if (active === pending) {
              finish(
                pending,
                new Error(
                  'Computer request cancelled; partial input may have occurred and is not replayed.',
                ),
              );
              stopWorker();
            } else {
              const index = queue.indexOf(pending);
              if (index >= 0) queue.splice(index, 1);
              finish(pending, new Error('Computer request cancelled before execution.'));
            }
          },
        };
        signal.addEventListener('abort', pending.abort, { once: true });
        queue.push(pending);
        pump();
      });
    } catch (error) {
      if (call.method !== 'computer.status' || signal.aborted) throw error;
      return textResult({
        supported: false,
        accessibility: false,
        screenRecording: false,
        message: error instanceof Error ? error.message : 'Computer helper unavailable.',
      });
    }
  };

  const handle: DesktopToolHandler = (call, signal) => {
    if (call.method === 'computer.request_permissions')
      return Promise.reject(
        new Error('Permission requests are available only from trusted desktop Settings.'),
      );
    if (permissionSetup)
      return Promise.reject(
        new Error('Computer permission setup is in progress. Try again after it finishes.'),
      );
    return dispatch(call, signal);
  };

  function beginPermissionSetup() {
    if (closed) throw new Error('Computer control is closed.');
    if (permissionSetup || active || queue.length || stopping)
      throw new Error(
        'Computer control is busy. Wait for current operations to finish before checking or requesting access.',
      );
    permissionSetup = true;
  }

  return {
    handle,
    async requestPermissions(kind) {
      if (kind !== 'accessibility' && kind !== 'screenRecording')
        throw new Error('Unknown computer permission kind.');
      beginPermissionSetup();
      try {
        // Reuse the actual adapter/launch context, with fresh TCC caches before requesting.
        stopWorker();
        await exitPromise;
        await dispatch(
          {
            sessionID: 'desktop-permissions',
            method: 'computer.request_permissions',
            input: { kind },
          },
          new AbortController().signal,
        );
      } finally {
        // A permission dialog can change capture access. The next normal call starts fresh.
        stopWorker();
        await exitPromise;
        permissionSetup = false;
      }
    },
    async close() {
      closed = true;
      for (const pending of queue.splice(0))
        finish(pending, new Error('Computer control is closing.'));
      if (active) finish(active, new Error('Computer control is closing; input was not replayed.'));
      stopWorker();
      await exitPromise;
    },
  };
}
