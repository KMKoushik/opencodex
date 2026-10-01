import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectionSchema, sessionPageSchema } from '@opencodex/contracts';
import { createApp } from './app';
import { OpenCodeBackend } from './opencode';

const cleanups: Array<() => Promise<void>> = [];
let directory: string;

beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'opencodex-test-')));
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  await rm(directory, { recursive: true, force: true });
});

async function upstream(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return `http://127.0.0.1:${address.port}`;
}

describe('gateway and the real OpenCode client', () => {
  it('coalesces concurrent connection requests while discovery is pending', async () => {
    const discovery = Promise.withResolvers<undefined>();
    const calls: boolean[] = [];
    const url = await upstream((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ version: '2.0.19' }));
    });
    const backend = new OpenCodeBackend(async (start) => {
      calls.push(start);
      return start ? { url } : discovery.promise;
    });
    const initial = backend.connection();
    const first = backend.connection(true);
    const second = backend.connection(true);
    discovery.resolve(undefined);
    await Promise.all([initial, first, second]);
    expect(calls).toEqual([false, true]);
  });

  it('discovers without starting a service and explicitly connects on request', async () => {
    const calls: boolean[] = [];
    const url = await upstream((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ version: '2.0.19', pid: 1, urls: [], paths: { tmp: directory } }));
    });
    const app = createApp(
      new OpenCodeBackend(async (start) => {
        calls.push(start);
        return start ? { url } : undefined;
      }),
    );
    const initial = await app.request('http://localhost/api/connection');
    expect(connectionSchema.parse(await initial.json()).status).toBe('disconnected');
    const connected = await app.request('http://localhost/api/connection', { method: 'POST' });
    expect(await connected.json()).toEqual({ status: 'connected', version: '2.0.19' });
    expect(calls).toEqual([false, true]);
  });

  it('passes directory, pagination, and private authentication to OpenCode', async () => {
    let requested: URL | undefined;
    let authorization: string | undefined;
    const url = await upstream((req, res) => {
      requested = new URL(req.url ?? '/', 'http://localhost');
      authorization = req.headers.authorization;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          data: [
            {
              id: 'session-1',
              title: 'Review the workspace',
              location: { directory },
              time: { updated: 42 },
              model: { id: 'test-model' },
            },
          ],
          cursor: { next: 'next-page' },
        }),
      );
    });
    const app = createApp(
      new OpenCodeBackend(async () => ({
        url,
        auth: { type: 'basic', username: 'test', password: 'private' },
      })),
    );
    const query = new URLSearchParams({ directory, cursor: 'page-2' });
    const response = await app.request(`http://localhost/api/sessions?${query}`);
    expect(response.status).toBe(200);
    expect(sessionPageSchema.parse(await response.json())).toEqual({
      sessions: [
        {
          id: 'session-1',
          title: 'Review the workspace',
          directory,
          updatedAt: 42,
          model: 'test-model',
        },
      ],
      nextCursor: 'next-page',
    });
    expect(requested?.pathname).toBe('/api/session');
    expect(requested?.searchParams.get('directory')).toBe(directory);
    expect(requested?.searchParams.get('cursor')).toBe('page-2');
    expect(requested?.searchParams.get('limit')).toBe('50');
    expect(authorization).toBe(`Basic ${Buffer.from('test:private').toString('base64')}`);
  });

  it('keeps upstream failures as errors and does not leak their payloads', async () => {
    const url = await upstream((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ password: 'private', message: 'internal upstream error' }));
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const response = await app.request(
      `http://localhost/api/sessions?${new URLSearchParams({ directory })}`,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: 'Could not load sessions from OpenCode. Please retry.',
    });
  });

  it('delegates prompts without retries and preserves native message pagination', async () => {
    const calls: Array<{ path: string; body: string; auth?: string }> = [];
    const url = await upstream((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        calls.push({ path: req.url!, body, auth: req.headers.authorization });
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/session/session-1') {
          res.end(JSON.stringify({ data: { id: 'session-1', agent: 'plan' } }));
        } else if (req.url?.endsWith('/agent')) {
          res.writeHead(204).end();
        } else if (req.method === 'POST') {
          res.statusCode = 503;
          res.end('{"message":"private upstream detail"}');
        } else
          res.end(
            JSON.stringify({
              data: [{ type: 'user', id: 'message-1', time: { created: 1 }, text: 'hello' }],
              cursor: { next: 'older-page' },
            }),
          );
      });
    });
    const app = createApp(
      new OpenCodeBackend(async () => ({
        url,
        auth: { type: 'basic', username: 'test', password: 'private' },
      })),
    );
    const send = (text: string) =>
      app.request('http://localhost/api/sessions/session-1/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    expect((await send('   ')).status).toBe(400);
    expect(calls).toHaveLength(0);
    const response = await send('hello');
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private');
    expect(calls).toHaveLength(3);
    expect(calls[1]).toMatchObject({
      path: '/api/session/session-1/agent',
      body: '{"agent":"build"}',
    });
    expect(calls[2]).toEqual({
      path: '/api/session/session-1/prompt',
      body: '{"text":"hello"}',
      auth: `Basic ${Buffer.from('test:private').toString('base64')}`,
    });
    const messages = await app.request(
      'http://localhost/api/sessions/session-1/messages?cursor=older-page',
    );
    expect(await messages.json()).toMatchObject({
      data: [{ text: 'hello' }],
      cursor: { next: 'older-page' },
    });
    const requested = new URL(calls[3]!.path, 'http://localhost');
    expect(requested.searchParams.get('cursor')).toBe('older-page');
    expect(requested.searchParams.has('order')).toBe(false);
  });

  it('uses location-scoped native models and persists variant selection through OpenCode', async () => {
    const calls: Array<{ path: string; body: string }> = [];
    const url = await upstream((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        calls.push({ path: req.url!, body });
        if (req.method === 'POST') return res.writeHead(204).end();
        res.setHeader('Content-Type', 'application/json');
        const path = new URL(req.url!, 'http://localhost').pathname;
        if (path === '/api/provider')
          return res.end(
            JSON.stringify({
              location: { directory },
              data: [
                {
                  id: 'provider',
                  name: 'Test Provider',
                  canonical: 'openai',
                  settings: { apiKey: 'private' },
                },
              ],
            }),
          );
        if (path === '/api/agent/build')
          return res.end(
            JSON.stringify({
              location: { directory },
              data: { model: { id: 'reasoner', providerID: 'provider', variant: 'high' } },
            }),
          );
        if (path === '/api/model/default')
          return res.end(
            JSON.stringify({
              location: { directory },
              data: { id: 'fallback', providerID: 'provider' },
            }),
          );
        res.end(
          JSON.stringify({
            location: { directory },
            data: [{ id: 'reasoner', variants: [{ id: 'high' }] }],
          }),
        );
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const response = await app.request(
      `http://localhost/api/models?${new URLSearchParams({ directory })}`,
    );
    const catalog = await response.json();
    expect(catalog).toMatchObject({
      data: [{ variants: [{ id: 'high' }] }],
      defaultModel: { id: 'reasoner', providerID: 'provider', variant: 'high' },
      providers: [{ id: 'provider', name: 'Test Provider', canonical: 'openai' }],
    });
    expect(catalog.providers).toEqual([
      { id: 'provider', name: 'Test Provider', canonical: 'openai' },
    ]);
    const requested = new URL(calls[0]!.path, 'http://localhost');
    expect(requested.pathname).toBe('/api/model');
    expect(requested.searchParams.get('location[directory]')).toBe(directory);
    const select = (model: unknown) =>
      app.request('http://localhost/api/sessions/session-1/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
    expect((await select({ id: 'reasoner' })).status).toBe(400);
    expect(calls).toHaveLength(4);
    const model = { id: 'reasoner', providerID: 'provider', variant: 'high' };
    expect((await select(model)).status).toBe(200);
    expect(calls[4]).toEqual({
      path: '/api/session/session-1/model',
      body: JSON.stringify({ model }),
    });
    expect((await select({ id: 'reasoner', providerID: 'provider' })).status).toBe(200);
    expect(JSON.parse(calls[5]!.body)).toEqual({
      model: { id: 'reasoner', providerID: 'provider' },
    });
  });

  it('rejects a missing backend rather than returning an empty session list', async () => {
    const app = createApp(new OpenCodeBackend(async () => undefined));
    const response = await app.request(
      `http://localhost/api/sessions?${new URLSearchParams({ directory })}`,
    );
    expect(response.status).toBe(503);
  });

  it('rejects an incompatible service version', async () => {
    const url = await upstream((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ version: '1.0.0' }));
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const response = await app.request('http://localhost/api/connection');
    expect(await response.json()).toEqual({
      status: 'disconnected',
      message: 'This app requires OpenCode 2.x.',
    });
  });

  it('forwards event readiness and changes, then rediscovers after a source ends', async () => {
    let discoveries = 0;
    const url = await upstream((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ type: 'server.connected' })}\n\n`);
      res.end(`data: ${JSON.stringify({ type: 'session.updated' })}\n\n`);
    });
    const backend = new OpenCodeBackend(async () => {
      discoveries++;
      return { url };
    });
    const app = createApp(backend);
    const response = await app.request('http://localhost/api/events');
    const body = await response.text();
    expect(body).toContain('event: ready');
    expect(body).toContain('event: opencode');
    expect(body).toContain('"type":"session.updated"');
    expect(body).toContain('event: unavailable');
    for await (const event of backend.events(AbortSignal.timeout(2_000))) {
      expect(['server.connected', 'session.updated']).toContain(event.type);
    }
    expect(discoveries).toBe(2);
  });

  it('aborts upstream subscriptions when the gateway shuts down', async () => {
    const closed = Promise.withResolvers<void>();
    const url = await upstream((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ type: 'server.connected' })}\n\n`);
      res.on('close', () => closed.resolve());
    });
    const shutdown = new AbortController();
    const app = createApp(new OpenCodeBackend(async () => ({ url })), shutdown.signal);
    const response = await app.request('http://localhost/api/events');
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await reader?.read();
    shutdown.abort();
    await closed.promise;
    await reader?.cancel();
  });
});

describe('local gateway boundary', () => {
  it('validates project paths and resolves canonical directories', async () => {
    const app = createApp();
    const resolve = (path: string) =>
      app.request('http://localhost/api/projects/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: path }),
      });
    expect((await resolve('relative/path')).status).toBe(400);
    expect((await resolve(join(directory, 'missing'))).status).toBe(400);
    await writeFile(join(directory, 'file'), 'hello');
    expect((await resolve(join(directory, 'file'))).status).toBe(400);
    const valid = await resolve(directory);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ directory });
  });

  it('rejects cross-origin requests and untrusted hostnames before touching OpenCode', async () => {
    const app = createApp(
      new OpenCodeBackend(async () => {
        throw new Error('Must not resolve');
      }),
    );
    expect(
      (
        await app.request('http://localhost/api/connection', {
          method: 'POST',
          headers: { Origin: 'https://other.example' },
        })
      ).status,
    ).toBe(403);
    expect((await app.request('http://other.example/api/connection')).status).toBe(403);
    expect(
      (
        await app.request('http://localhost/api/connection', {
          headers: { 'Sec-Fetch-Site': 'cross-site' },
        })
      ).status,
    ).toBe(403);
  });
});
