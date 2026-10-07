import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, unlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { DesktopToolEndpoint, DesktopToolHandler } from '@opencodex/contracts/desktop-tools';

const MAX_INPUT = 256 * 1024;
const MAX_OUTPUT = 16 * 1024 * 1024;
const callSchema = z
  .object({
    sessionID: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[\w-]+$/),
    method: z.enum([
      'browser.list',
      'browser.claim',
      'browser.release',
      'browser.open',
      'browser.navigate',
      'browser.snapshot',
      'browser.screenshot',
      'browser.click',
      'browser.type',
      'browser.press',
      'browser.scroll',
      'browser.close',
      'browser.console',
      'browser.network',
      'computer.status',
      'computer.list',
      'computer.state',
      'computer.click',
      'computer.type',
      'computer.press',
      'computer.scroll',
      'computer.set_value',
      'computer.drag',
    ]),
    input: z.record(z.string(), z.unknown()),
  })
  .strict();

/** A private capability endpoint for the OpenCode plugin, independent of gateway dev ports. */
export async function startDesktopToolHost(options: {
  label: string;
  handle: DesktopToolHandler;
  directory?: string;
}) {
  const token = randomBytes(32).toString('base64url');
  const authorization = Buffer.from(`Bearer ${token}`);
  const active = new Map<AbortController, string>();
  let closing = false;
  let paused = false;
  let host = '';
  const server = createServer((request, response) => {
    void serve(request, response).catch((error: unknown) => {
      if (!response.headersSent && !response.destroyed)
        reply(response, error instanceof HttpError ? error.status : 500, {
          message: error instanceof Error ? error.message : 'Desktop operation failed.',
        });
      else response.destroy();
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 2_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Desktop endpoint unavailable.');
  host = `127.0.0.1:${address.port}`;
  const endpoint: DesktopToolEndpoint = {
    version: 1,
    pid: process.pid,
    label: options.label,
    url: `http://${host}`,
    token,
  };
  const directory =
    options.directory ??
    join(
      process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
      'opencode',
      'opencodex-desktop',
    );
  const path = join(directory, `${randomUUID()}.json`);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    await writeFile(path, JSON.stringify(endpoint), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    server.closeAllConnections();
    server.close();
    throw error;
  }

  async function serve(request: IncomingMessage, response: ServerResponse) {
    // This API is callable by a local plugin, never by a web page (including app guests).
    if (request.headers.host !== host || request.headers.origin !== undefined)
      throw new HttpError(403, 'Untrusted desktop request.');
    const presented = Buffer.from(request.headers.authorization ?? '');
    if (presented.length !== authorization.length || !timingSafeEqual(presented, authorization))
      throw new HttpError(401, 'Desktop authentication required.');
    if (closing) throw new HttpError(503, 'Desktop controls are closing.');
    if (request.method === 'GET' && request.url === '/health')
      return reply(response, 200, { version: 1, label: options.label });
    if (request.method !== 'POST' || request.url !== '/call')
      throw new HttpError(404, 'Unknown desktop operation.');
    if (paused)
      throw new HttpError(409, 'Desktop controls are paused. Resume them in Settings → General.');
    if (request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
      throw new HttpError(415, 'Expected a JSON desktop request.');
    if (active.size >= 8) throw new HttpError(429, 'Desktop controls are busy.');
    const controller = new AbortController();
    active.set(controller, '');
    const abort = () => controller.abort(new Error('Desktop operation cancelled.'));
    const disconnected = () => {
      if (!response.writableFinished) abort();
    };
    request.once('aborted', abort);
    response.once('close', disconnected);
    const timeout = setTimeout(abort, 60_000);
    timeout.unref();
    try {
      const body = await readBody(request, controller.signal);
      const parsed = callSchema.safeParse(body);
      if (!parsed.success) throw new HttpError(400, 'Invalid desktop operation.');
      const call = parsed.data;
      if ([...active.values()].filter((id) => id === call.sessionID).length >= 4)
        throw new HttpError(429, 'This chat already has four desktop operations running.');
      active.set(controller, call.sessionID);
      controller.signal.throwIfAborted();
      const result = await options.handle(call, controller.signal);
      controller.signal.throwIfAborted();
      reply(response, 200, result);
    } finally {
      clearTimeout(timeout);
      request.off('aborted', abort);
      response.off('close', disconnected);
      active.delete(controller);
    }
  }

  return {
    endpoint,
    path,
    server,
    isPaused: () => paused,
    pause() {
      paused = true;
      for (const controller of active.keys()) controller.abort();
    },
    resume() {
      paused = false;
    },
    abortSession(sessionID: string) {
      for (const [controller, id] of active) if (id === sessionID) controller.abort();
    },
    async close() {
      if (closing) return;
      closing = true;
      for (const controller of active.keys()) controller.abort();
      try {
        await unlink(path).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readBody(request: IncomingMessage, signal: AbortSignal): Promise<unknown> {
  if (Number(request.headers['content-length']) > MAX_INPUT)
    throw new HttpError(413, 'Desktop request is too large.');
  const chunks: Buffer[] = [];
  let bytes = 0;
  const abort = () => request.destroy(new Error('Desktop request cancelled.'));
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) abort();
    for await (const value of request) {
      signal.throwIfAborted();
      const chunk = Buffer.from(value as Uint8Array);
      bytes += chunk.length;
      if (bytes > MAX_INPUT) throw new HttpError(413, 'Desktop request is too large.');
      chunks.push(chunk);
    }
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener('abort', abort);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON desktop request.');
  }
}

function reply(response: ServerResponse, status: number, result: unknown) {
  const body = JSON.stringify(result);
  if (Buffer.byteLength(body) > MAX_OUTPUT)
    throw new HttpError(413, 'Desktop result is too large.');
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}
