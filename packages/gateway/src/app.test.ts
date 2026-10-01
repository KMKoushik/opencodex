import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachmentLimitError, connectionSchema, sessionPageSchema } from '@opencodex/contracts';
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
  it('stages undo while idle and commits a staged revert before admitting the next prompt', async () => {
    let active = true;
    const calls: string[] = [];
    const url = await upstream((req, res) => {
      const path = new URL(req.url!, 'http://localhost').pathname;
      calls.push(path);
      res.setHeader('Content-Type', 'application/json');
      if (path.endsWith('/active'))
        return res.end(JSON.stringify({ data: active ? { s: {} } : {} }));
      if (path === '/api/session/s')
        return res.end(
          JSON.stringify({ data: { id: 's', agent: 'build', revert: { messageID: 'm' } } }),
        );
      if (path.endsWith('/stage')) return res.end(JSON.stringify({ data: { messageID: 'm' } }));
      if (path.endsWith('/prompt')) return res.end(JSON.stringify({ data: { id: 'prompt' } }));
      res.writeHead(204).end();
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const post = (path: string, body: unknown) =>
      app.request(`http://localhost/api/sessions/s/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await post('action', { action: 'undo', messageID: 'm' })).status).toBe(409);
    expect(calls).toEqual(['/api/session/active']);
    active = false;
    expect((await post('action', { action: 'undo', messageID: 'm' })).status).toBe(200);
    calls.length = 0;
    expect((await post('prompt', { text: 'Try another approach' })).status).toBe(200);
    expect(calls).toEqual([
      '/api/session/s',
      '/api/session/s/revert/commit',
      '/api/session/s/prompt',
    ]);
  });
  it('delegates command discovery, command input and fork boundaries to the native client', async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    const url = await upstream((req, res) => {
      const path = new URL(req.url!, 'http://localhost');
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
        calls.push({ path: path.pathname, body });
        res.setHeader('Content-Type', 'application/json');
        if (path.pathname === '/api/command') {
          expect(path.searchParams.get('location[directory]')).toBe(directory);
          res.end(JSON.stringify({ data: [{ name: 'review', description: 'Review changes' }] }));
        } else if (path.pathname.endsWith('/fork'))
          res.end(JSON.stringify({ data: { id: 'forked' } }));
        else if (req.method === 'GET')
          res.end(JSON.stringify({ data: { id: 's', agent: 'build' } }));
        else res.writeHead(204).end();
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const catalog = await app.request(
      `http://localhost/api/commands?${new URLSearchParams({ directory })}`,
    );
    expect(await catalog.json()).toEqual([{ name: 'review', description: 'Review changes' }]);
    const invoke = (path: string, body: unknown) =>
      app.request(`http://localhost/api/sessions/s/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await invoke('prompt', { command: 'review', text: 'the latest changes' })).status).toBe(
      200,
    );
    expect(calls.find((call) => call.path.endsWith('/command') && call.body)?.body).toEqual({
      name: 'review',
      text: 'the latest changes',
    });
    expect(
      await (await invoke('action', { action: 'fork', before: 'message-boundary' })).json(),
    ).toEqual({ id: 'forked' });
    expect(calls.find((call) => call.path.endsWith('/fork'))?.body).toEqual({
      before: 'message-boundary',
    });
    const count = calls.length;
    expect((await invoke('action', { action: 'rename', title: ' ' })).status).toBe(400);
    expect(calls).toHaveLength(count);
  });
  it('reads and saves native files with a version check, preserving conflicts and limiting previews', async () => {
    let content = Buffer.from('original\r\n');
    let writes = 0;
    const url = await upstream((req, res) => {
      const path = new URL(req.url!, 'http://localhost');
      expect(path.searchParams.get('location[directory]')).toBe(directory);
      if (path.pathname === '/api/fs/read/huge.txt') {
        res.writeHead(200, { 'Content-Length': 3 * 1024 * 1024 });
        res.end(Buffer.alloc(3 * 1024 * 1024));
        return;
      }
      if (path.pathname === '/api/fs/read/huge-stream.txt') {
        res.write(Buffer.alloc(1536 * 1024));
        res.end(Buffer.alloc(1536 * 1024));
        return;
      }
      if (path.pathname === '/api/fs/read/file.txt') {
        res.end(content);
        return;
      }
      if (path.pathname === '/api/experimental/fs/write') {
        expect(path.searchParams.get('path')).toBe('file.txt');
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          writes++;
          content = Buffer.concat(chunks);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ location: { directory }, data: { path: 'file.txt' } }));
        });
        return;
      }
      res.writeHead(404).end();
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const read = (path: string) =>
      app.request(
        `http://localhost/api/workspace/file?${new URLSearchParams({ directory, path })}`,
      );
    const file = await (await read('file.txt')).json();
    expect(file).toMatchObject({ kind: 'text', text: 'original\r\n' });
    const save = (text: string) =>
      app.request('http://localhost/api/workspace/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, path: 'file.txt', version: file.version, text }),
      });
    const saved = await save('edited\r\n');
    expect(saved.status).toBe(200);
    expect(content.toString()).toBe('edited\r\n');
    expect((await save('stale edit')).status).toBe(409);
    expect(writes).toBe(1);
    expect((await read('../outside')).status).toBe(400);
    expect((await read('huge.txt')).status).toBe(413);
    expect((await read('huge-stream.txt')).status).toBe(413);
  });

  it('shares native diff snapshots but transfers only metadata or the requested patch', async () => {
    let calls = 0;
    const diffs = ['a.ts', 'b.ts'].map((file) => ({
      file,
      patch: `@@ -1 +1 @@\n-old\n+${file}\n`,
      additions: 1,
      deletions: 1,
      status: 'modified',
    }));
    const url = await upstream((req, res) => {
      expect(new URL(req.url!, 'http://localhost').pathname).toBe('/api/vcs/diff');
      calls++;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ location: { directory }, data: diffs }));
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const get = (path?: string) =>
      app.request(
        `http://localhost/api/workspace/diff?${new URLSearchParams({ directory, mode: 'working', ...(path ? { path } : {}) })}`,
      );
    const metadata = await (await get()).json();
    expect(metadata).toEqual(
      diffs.map(({ file, additions, deletions, status }) => ({
        file,
        additions,
        deletions,
        status,
      })),
    );
    const [a, b] = await Promise.all([get('a.ts'), get('b.ts')]);
    expect(await a.json()).toEqual(diffs[0]);
    expect(await b.json()).toEqual(diffs[1]);
    expect(calls).toBe(1);
  });
  it('reads location-scoped session panel data and keeps skill bodies out of the response', async () => {
    const calls: string[] = [];
    let fail = false;
    const info = { provider: 'git', branch: { current: 'main' } };
    const files = [{ file: 'index.ts', additions: 12, deletions: 3, status: 'modified' }];
    const servers = [{ name: 'docs', status: { status: 'connected' } }];
    const skills = [
      {
        id: 'review',
        name: 'Review',
        description: 'Review code',
        path: '/private/skill',
        content: 'Large skill body',
      },
    ];
    const url = await upstream((req, res) => {
      const path = new URL(req.url!, 'http://localhost');
      calls.push(path.pathname);
      expect(path.searchParams.get('location[directory]')).toBe(directory);
      res.setHeader('Content-Type', 'application/json');
      if (fail) {
        res.statusCode = 500;
        res.end(JSON.stringify({ message: 'Native VCS failed' }));
        return;
      }
      const data = {
        '/api/vcs': info,
        '/api/vcs/status': files,
        '/api/mcp': servers,
        '/api/skill': skills,
      }[path.pathname];
      expect(data).toBeDefined();
      res.end(JSON.stringify({ location: { directory }, data }));
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const get = (resource: string) =>
      app.request(
        `http://localhost/api/workspace/${resource}?${new URLSearchParams({ directory })}`,
      );
    const [vcs, mcp, catalog] = await Promise.all([get('vcs'), get('mcp'), get('skills')]);
    expect(await vcs.json()).toEqual({ info, files });
    expect(await mcp.json()).toEqual(servers);
    expect(await catalog.json()).toEqual([
      { id: 'review', name: 'Review', description: 'Review code' },
    ]);
    expect(calls.sort()).toEqual(['/api/mcp', '/api/skill', '/api/vcs', '/api/vcs/status']);
    expect((await app.request('http://localhost/api/workspace/vcs')).status).toBe(400);
    expect((await get('unknown')).status).toBe(404);
    fail = true;
    expect((await get('vcs')).status).toBe(502);
  });
  it('registers project folders and forwards metadata edits through the native client', async () => {
    const calls: string[] = [];
    let update: unknown;
    let resolvedDirectory: string | null = null;
    const project = {
      id: 'project-1',
      canonical: directory,
      name: 'Example',
      icon: { color: 'orange' },
      commands: { start: 'bun dev' },
      time: { created: 1, updated: 1, active: 1 },
      sandboxes: [],
    };
    const url = await upstream(async (req, res) => {
      const path = new URL(req.url!, 'http://localhost');
      calls.push(`${req.method} ${path.pathname}`);
      res.setHeader('Content-Type', 'application/json');
      if (path.pathname === '/api/location') {
        resolvedDirectory = path.searchParams.get('location[directory]');
        return res.end(
          JSON.stringify({
            directory,
            project: { id: project.id, directory, canonical: directory },
          }),
        );
      }
      if (req.method === 'PATCH') {
        let body = '';
        for await (const chunk of req) body += chunk;
        update = JSON.parse(body);
        return res.end(JSON.stringify({ ...project, ...(update as object) }));
      }
      res.end(JSON.stringify([project]));
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const added = await app.request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory }),
    });
    expect(await added.json()).toEqual(project);
    expect(resolvedDirectory).toBe(directory);
    const input = { name: 'Renamed', icon: { color: 'purple', override: '' } };
    const saved = await app.request('http://localhost/api/projects/project-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ...project, ...input });
    expect(update).toEqual(input);
    expect(calls).toEqual([
      'GET /api/location',
      'GET /api/project',
      'PATCH /api/project/project-1',
    ]);
    const invalid = await app.request('http://localhost/api/projects/project-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, icon: { color: '', override: 'file:///private/icon.png' } }),
    });
    expect(invalid.status).toBe(400);
    expect(calls).toHaveLength(3);
  });
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

  it('applies the final draft model only at send and stops if switching fails', async () => {
    const calls: string[] = [];
    let model = { id: 'reasoner', providerID: 'provider', variant: 'default' };
    let fail = false;
    const url = await upstream((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        calls.push(req.url!);
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET')
          return res.end(JSON.stringify({ data: { id: 'session-1', agent: 'build', model } }));
        if (req.url?.endsWith('/model')) {
          if (fail) {
            res.writeHead(503).end('{}');
            return;
          }
          model = JSON.parse(body).model;
          res.writeHead(204).end();
          return;
        }
        res.end(JSON.stringify({ data: { id: 'input-1' } }));
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const send = (variant?: string) =>
      app.request('http://localhost/api/sessions/session-1/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'hello',
          model: { id: 'reasoner', providerID: 'provider', variant },
        }),
      });
    expect((await send()).status).toBe(200);
    expect(calls.splice(0)).toEqual(['/api/session/session-1', '/api/session/session-1/prompt']);
    expect((await send('high')).status).toBe(200);
    expect(model.variant).toBe('high');
    expect(calls.splice(0)).toEqual([
      '/api/session/session-1',
      '/api/session/session-1/model',
      '/api/session/session-1/prompt',
    ]);
    fail = true;
    expect((await send('low')).status).toBe(502);
    expect(calls).toEqual(['/api/session/session-1', '/api/session/session-1/model']);
  });

  it('passes attachment-only prompts through the native API and rejects invalid attachments before admission', async () => {
    const calls: object[] = [];
    const url = await upstream((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET')
          return res.end(JSON.stringify({ data: { id: 'session-1', agent: 'build' } }));
        calls.push(JSON.parse(body));
        res.end(JSON.stringify({ data: { id: 'accepted' } }));
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const send = (files: object[]) =>
      app.request('http://localhost/api/sessions/session-1/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '', files }),
      });
    const files = [
      { name: 'notes.txt', uri: 'data:text/plain;base64,aGVsbG8=' },
      { name: 'image.png', uri: 'data:image/png;base64,AQID' },
    ];
    expect((await send(files)).status).toBe(200);
    expect(calls).toEqual([{ text: '', files }]);
    expect((await send([])).status).toBe(400);
    expect((await send([{ name: 'secret', uri: 'file:///private/file' }])).status).toBe(400);
    expect((await send(Array.from({ length: 100 }, () => files[0]!))).status).toBe(200);
    expect((await send(Array.from({ length: 101 }, () => files[0]!))).status).toBe(400);
    expect(calls).toHaveLength(2);
    const image = { name: 'image.png', size: 10 * 1024 * 1024, image: true };
    const document = { name: 'document.pdf', size: 50 * 1024 * 1024, image: false };
    expect(
      attachmentLimitError([...Array.from({ length: 8 }, () => image), document]),
    ).toBeUndefined();
    expect(attachmentLimitError(Array.from({ length: 100 }, () => document))).toBeUndefined();
    expect(attachmentLimitError(Array.from({ length: 9 }, () => image))).toContain('80 MiB');
    expect(attachmentLimitError([{ ...image, size: image.size + 1 }])).toContain('10 MiB');
    expect(attachmentLimitError([{ ...document, size: document.size + 1 }])).toContain('50 MiB');
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
