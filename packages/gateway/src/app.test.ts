import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  attachmentLimitError,
  connectionSchema,
  MAX_FILE_BYTES,
  promptInputSchema,
  sessionPageSchema,
} from '@opencodex/contracts';
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
  it('enables native full access, settles current approvals once, and restores prior session rules', async () => {
    const original = [{ action: 'shell', resource: 'git push *', effect: 'deny' }];
    let permissions = original;
    let pending = [
      {
        id: 'perm_external',
        sessionID: 'ses_access',
        action: 'external_directory',
        resources: ['/outside/*'],
      },
    ];
    const writes: unknown[] = [];
    const replies: unknown[] = [];
    let fail = false;
    const url = await upstream((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') {
        return res.end(
          JSON.stringify({
            data: req.url!.endsWith('/permission') ? pending : { id: 'ses_access', permissions },
          }),
        );
      }
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const input = JSON.parse(body);
        if (req.method === 'PATCH') {
          expect(req.url).toBe('/api/session/ses_access');
          expect(Object.keys(input)).toEqual(['permissions']);
          if (fail) return res.writeHead(500).end();
          permissions = input.permissions;
          writes.push(input);
        } else {
          expect(req.url).toBe('/api/session/ses_access/permission/perm_external/reply');
          replies.push(input);
          pending = [];
        }
        res.writeHead(204).end();
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const access = (mode: string) =>
      app.request('http://localhost/api/sessions/ses_access/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    expect((await access('always')).status).toBe(400);
    expect(writes).toEqual([]);
    fail = true;
    expect((await access('full')).status).toBe(502);
    expect(replies).toEqual([]);
    fail = false;
    expect((await access('full')).status).toBe(200);
    expect(permissions).toEqual([...original, { action: '*', resource: '*', effect: 'allow' }]);
    expect(replies).toEqual([{ decision: 'once' }]);
    expect((await access('full')).status).toBe(200);
    expect(writes).toHaveLength(1);
    expect((await access('default')).status).toBe(200);
    expect(permissions).toEqual(original);
    expect(writes).toHaveLength(2);
    expect(replies).toHaveLength(1);
  });
  it('observes native shell commands with bounded output and delegates explicit stops', async () => {
    const calls: string[] = [];
    let failed = false;
    const shell = {
      id: 'sh_fixture',
      status: 'running',
      command: 'bun dev',
      metadata: { sessionID: 'ses_fixture' },
    };
    const output = { output: 'Ready\n', cursor: 6, size: 6, truncated: false };
    const url = await upstream((req, res) => {
      const path = new URL(req.url!, 'http://localhost');
      expect(path.searchParams.get('location[directory]')).toBe(directory);
      calls.push(`${req.method} ${path.pathname}`);
      if (failed) return res.writeHead(500).end();
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'DELETE') return res.writeHead(204).end();
      if (path.pathname.endsWith('/output')) {
        expect(path.searchParams.get('cursor')).toBe('0');
        expect(path.searchParams.get('limit')).toBe('65536');
        return res.end(JSON.stringify({ location: { directory }, data: output }));
      }
      res.end(
        JSON.stringify({
          location: { directory },
          data: path.pathname === '/api/shell' ? [shell] : shell,
        }),
      );
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const path = `/api/shells?${new URLSearchParams({ directory })}`;
    expect((await app.request('http://localhost/api/shells')).status).toBe(400);
    expect(await (await app.request(`http://localhost${path}`)).json()).toEqual([shell]);
    const command = `http://localhost/api/shells/sh_fixture?${new URLSearchParams({ directory })}`;
    expect(await (await app.request(command)).json()).toEqual(shell);
    const log = `http://localhost/api/shells/sh_fixture/output?${new URLSearchParams({ directory })}`;
    expect((await app.request(`${log}&cursor=-1`)).status).toBe(400);
    expect((await app.request(`${log}&cursor=1.5`)).status).toBe(400);
    expect(await (await app.request(`${log}&cursor=0&limit=9999999`)).json()).toEqual(output);
    expect(calls).toEqual([
      'GET /api/shell',
      'GET /api/shell/sh_fixture',
      'GET /api/shell/sh_fixture/output',
    ]);
    expect((await app.request(command, { method: 'DELETE' })).status).toBe(200);
    expect(calls.at(-1)).toBe('DELETE /api/shell/sh_fixture');
    failed = true;
    expect((await app.request(`http://localhost${path}`)).status).toBe(502);
  });
  it('acknowledges only the observed idle transition through the native view API', async () => {
    const calls: unknown[] = [];
    let failed = false;
    const url = await upstream((req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toBe('/api/session/ses_read/view');
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        calls.push(JSON.parse(Buffer.concat(chunks).toString()));
        if (failed) return res.writeHead(500).end();
        res.writeHead(204).end();
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const view = (body: unknown) =>
      app.request('http://localhost/api/sessions/ses_read/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await view({})).status).toBe(400);
    expect((await view({ idle: -1 })).status).toBe(400);
    expect((await view({ idle: '100' })).status).toBe(400);
    expect(calls).toEqual([]);
    const response = await view({ idle: 100 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calls).toEqual([{ idle: 100 }]);
    failed = true;
    expect((await view({ idle: 200 })).status).toBe(502);
    expect(calls).toEqual([{ idle: 100 }, { idle: 200 }]);
  });
  it('persists manual unread marks through native metadata without losing other fields or clearing a newer mark', async () => {
    let metadata: Record<string, unknown> = { otherClient: { pinned: true } };
    const writes: unknown[] = [];
    let failed = false;
    const url = await upstream((req, res) => {
      expect(req.url).toBe('/api/session/ses_read');
      if (req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(
          JSON.stringify({ data: { id: 'ses_read', metadata, time: { idle: 100, viewed: 100 } } }),
        );
      }
      expect(req.method).toBe('PATCH');
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const input = JSON.parse(body);
        expect(Object.keys(input)).toEqual(['metadata']);
        writes.push(input);
        if (failed) return res.writeHead(500).end();
        metadata = input.metadata;
        res.writeHead(204).end();
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const unread = (body: unknown) =>
      app.request('http://localhost/api/sessions/ses_read/unread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await unread({ action: 'clear' })).status).toBe(400);
    const first = await (await unread({ action: 'mark' })).json();
    expect(first.unread).toEqual(expect.any(String));
    const [marked, acknowledged] = await Promise.all([
      unread({ action: 'mark' }),
      unread({ action: 'clear', marker: first.unread }),
    ]);
    const second = await marked.json();
    expect(second.unread).not.toBe(first.unread);
    expect(await acknowledged.json()).toEqual(second);
    expect(writes).toHaveLength(2);
    expect(metadata).toEqual({ otherClient: { pinned: true }, opencodexUnread: second.unread });
    expect(await (await unread({ action: 'clear', marker: second.unread })).json()).toEqual({
      unread: null,
    });
    expect(metadata).toEqual({ otherClient: { pinned: true }, opencodexUnread: null });
    failed = true;
    expect((await unread({ action: 'mark' })).status).toBe(502);
    expect(metadata.opencodexUnread).toBeNull();
  });
  it('pins and marks threads done through native metadata, keeping other fields', async () => {
    let metadata: Record<string, unknown> = { opencodexUnread: 'mark', otherClient: true };
    let running = false;
    const url = await upstream((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/session/active')
        return res.end(JSON.stringify({ data: running ? { ses_focus: { type: 'running' } } : {} }));
      expect(req.url).toBe('/api/session/ses_focus');
      if (req.method === 'GET')
        return res.end(
          JSON.stringify({
            data: { id: 'ses_focus', metadata, time: { created: 10, updated: 900, idle: 50 } },
          }),
        );
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        metadata = JSON.parse(body).metadata;
        res.writeHead(204).end();
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const focus = (action: string) =>
      app.request('http://localhost/api/sessions/ses_focus/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    expect((await focus('archive')).status).toBe(400);
    const pinned = await (await focus('pin')).json();
    expect(pinned).toEqual({ pinned: expect.any(Number), done: null });
    // Done records the last run, not the bumped update time, and replaces the pin.
    expect(await (await focus('done')).json()).toEqual({ pinned: null, done: 50 });
    expect(metadata).toEqual({
      opencodexUnread: 'mark',
      otherClient: true,
      opencodexPinned: null,
      opencodexDone: 50,
    });
    running = true;
    expect((await focus('done')).status).toBe(409);
    expect(await (await focus('undone')).json()).toEqual({ pinned: null, done: null });
  });
  it('guards a forked side chat before returning it, and deletes the fork if setup fails', async () => {
    const rule = { action: 'shell', resource: 'git push *', effect: 'deny' };
    const sessions: Record<string, Record<string, unknown>> = {
      ses_main: { id: 'ses_main', metadata: { opencodexPinned: 5, otherClient: true } },
    };
    const calls: string[] = [];
    let failInstructions = true;
    const url = await upstream((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      const path = req.url!.split('?')[0]!;
      calls.push(`${req.method} ${path}`);
      const id = path.split('/')[3]!;
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if (req.method === 'GET' && path === '/api/session')
          return res.end(
            JSON.stringify({
              data: Object.values(sessions).map((session) => ({
                ...session,
                location: { directory },
                time: { created: 1, updated: 1 },
              })),
              cursor: {},
            }),
          );
        if (path.endsWith('/message'))
          return res.end(JSON.stringify({ data: [{ id: 'msg_1' }], cursor: {} }));
        if (path.endsWith('/fork')) {
          sessions.ses_side = {
            id: 'ses_side',
            metadata: sessions.ses_main!.metadata,
            permissions: [rule],
          };
          return res.end(JSON.stringify({ data: sessions.ses_side }));
        }
        if (path.includes('/instructions/entries/')) {
          expect(path).toBe(
            '/api/experimental/session/ses_side/instructions/entries/opencodex.side-chat',
          );
          expect(JSON.parse(body).value).toContain('reference context only');
          return res.writeHead(failInstructions ? 500 : 204).end();
        }
        if (req.method === 'PATCH') sessions[id] = { ...sessions[id], ...JSON.parse(body) };
        if (req.method === 'DELETE') delete sessions[id];
        if (req.method !== 'GET') return res.writeHead(204).end();
        if (!sessions[id])
          return res
            .writeHead(404)
            .end(JSON.stringify({ _tag: 'SessionNotFoundError', sessionID: id, message: 'gone' }));
        res.end(JSON.stringify({ data: sessions[id] }));
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const start = () =>
      app.request('http://localhost/api/sessions/ses_main/side-chats', { method: 'POST' });

    expect((await start()).status).toBe(502);
    expect(sessions.ses_side).toBeUndefined();
    expect(calls).toContain('DELETE /api/session/ses_side');
    expect(sessions.ses_main!.metadata).toEqual({ opencodexPinned: 5, otherClient: true });

    failInstructions = false;
    const created = await start();
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ id: 'ses_side', title: 'Side chat' });
    expect(sessions.ses_side).toMatchObject({
      metadata: {
        otherClient: true,
        opencodexPinned: null,
        opencodexSideChat: { parentID: 'ses_main' },
      },
      permissions: [
        rule,
        { action: 'edit', resource: '*', effect: 'ask' },
        { action: 'subagent', resource: '*', effect: 'deny' },
      ],
    });
    expect(sessions.ses_main!.metadata).toEqual({
      opencodexPinned: 5,
      otherClient: true,
      opencodexSideChats: ['ses_side'],
    });
    const list = await app.request('http://localhost/api/sessions/ses_main/side-chats');
    expect((await list.json()).map((session: { id: string }) => session.id)).toEqual(['ses_side']);
    const sidebar = await app.request(`http://localhost/api/sessions?directory=${directory}`);
    expect(
      sessionPageSchema.parse(await sidebar.json()).sessions.map((session) => session.id),
    ).toEqual(['ses_main']);
    expect(
      (await app.request('http://localhost/api/sessions/ses_side/side-chats', { method: 'POST' }))
        .status,
    ).toBe(409);

    // Deleting elsewhere leaves a stale ID; listing skips it and deleting here prunes it.
    delete sessions.ses_side;
    expect(
      await (await app.request('http://localhost/api/sessions/ses_main/side-chats')).json(),
    ).toEqual([]);
    const removed = await app.request(
      'http://localhost/api/sessions/ses_main/side-chats/ses_side',
      {
        method: 'DELETE',
      },
    );
    expect(removed.status).toBe(200);
    expect(sessions.ses_main!.metadata).toMatchObject({ opencodexSideChats: [] });

    // Side chats deleted by another client don't hold places toward the limit.
    sessions.ses_main!.metadata = {
      opencodexSideChats: Array.from({ length: 8 }, (_, index) => `ses_gone${index}`),
    };
    expect((await start()).status).toBe(200);
    expect(sessions.ses_main!.metadata).toEqual({ opencodexSideChats: ['ses_side'] });
  });
  it('lists child sessions with native pagination and reads their transcripts without mutations', async () => {
    const calls: string[] = [];
    const limits: number[] = [];
    const child = {
      id: 'child',
      parentID: 'parent',
      title: 'Explore the code',
      agent: 'explore',
      outcome: 'succeeded',
      location: { directory },
    };
    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      ...child,
      id: `child-${index}`,
    }));
    let total = 2;
    const messages = { data: [{ id: 'message', type: 'user', text: 'Explore' }], cursor: {} };
    const url = await upstream((req, res) => {
      expect(req.method).toBe('GET');
      const path = new URL(req.url!, 'http://localhost');
      calls.push(path.pathname);
      res.setHeader('Content-Type', 'application/json');
      if (path.pathname === '/api/session') {
        expect(path.searchParams.get('parentID')).toBe('parent');
        expect(path.searchParams.has('directory')).toBe(false);
        const cursor = path.searchParams.get('cursor');
        limits.push(Number(path.searchParams.get('limit')));
        expect(path.searchParams.get('order')).toBe(cursor ? null : 'asc');
        if (cursor) expect(cursor).toBe('after-hundred');
        const data = cursor ? (total > 100 ? [child] : []) : fullPage.slice(0, total);
        return res.end(
          JSON.stringify({ data, cursor: { next: cursor ? 'at-end' : 'after-hundred' } }),
        );
      }
      if (path.pathname === '/api/session/child') return res.end(JSON.stringify({ data: child }));
      if (path.pathname === '/api/session/child/message') return res.end(JSON.stringify(messages));
      res.writeHead(404).end();
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const get = async (path: string) => {
      const response = await app.request(`http://localhost/api/sessions/${path}`);
      expect(response.status).toBe(200);
      return response.json();
    };
    // The native service returns a cursor even for two terminal results.
    expect(await get('parent/subagents')).toEqual({ data: fullPage.slice(0, 2), cursor: {} });
    expect(calls).toHaveLength(1);
    total = 100;
    expect(await get('parent/subagents')).toEqual({ data: fullPage, cursor: {} });
    expect(calls).toHaveLength(3);
    total = 101;
    expect(await get('parent/subagents')).toEqual({
      data: fullPage,
      cursor: { next: 'after-hundred' },
    });
    expect(calls).toHaveLength(5);
    // Continue with the verified cursor; the last short page has no more button.
    expect(await get('parent/subagents?cursor=after-hundred')).toEqual({
      data: [child],
      cursor: {},
    });
    expect(limits).toEqual([100, 100, 1, 100, 1, 100]);
    expect(await get('child')).toEqual(child);
    expect(await get('child/messages')).toEqual(messages);
    expect(calls).toEqual([
      '/api/session',
      '/api/session',
      '/api/session',
      '/api/session',
      '/api/session',
      '/api/session',
      '/api/session/child',
      '/api/session/child/message',
    ]);
  });
  it('creates sessions with the inherited model and variant through the native API', async () => {
    const calls: unknown[] = [];
    const url = await upstream((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        expect(req.url).toBe('/api/session');
        const body = JSON.parse(Buffer.concat(chunks).toString());
        calls.push(body);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { id: 'new', ...body } }));
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const create = (model?: unknown) =>
      app.request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, model }),
      });
    const model = { id: 'reasoner', providerID: 'provider', variant: 'high' };
    const response = await create(model);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ model });
    expect((await create()).status).toBe(200);
    expect(calls).toEqual([
      { location: { directory }, agent: 'build', model },
      { location: { directory }, agent: 'build' },
    ]);
    expect((await create({ id: '' })).status).toBe(400);
    expect(calls).toHaveLength(2);
  });
  it('removes only idle native Git worktrees without force and preserves actionable Git failures', async () => {
    const tree = `${directory}/isolated`;
    let occupied = 'chat';
    let dirty = false;
    const writes: unknown[] = [];
    const url = await upstream((req, res) => {
      const path = new URL(req.url!, 'http://localhost');
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') {
        if (path.pathname === '/api/worktree') {
          expect(path.searchParams.get('projectID')).toBe('project');
          return res.end(JSON.stringify([{ directory }, { directory: tree, strategy: 'git' }]));
        }
        if (path.pathname === '/api/session')
          return res.end(JSON.stringify({ data: [{ id: 'chat' }], cursor: {} }));
        if (path.pathname === '/api/session/active')
          return res.end(JSON.stringify({ data: occupied === 'chat' ? { chat: {} } : {} }));
        if (path.pathname === '/api/pty')
          return res.end(
            JSON.stringify({ data: occupied === 'terminal' ? [{ id: 'terminal' }] : [] }),
          );
        if (path.pathname === '/api/shell')
          return res.end(
            JSON.stringify({ data: occupied === 'shell' ? [{ status: 'running' }] : [] }),
          );
        throw new Error(`Unexpected request: ${req.url}`);
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const input = JSON.parse(body);
        writes.push(input);
        if (dirty)
          return res.writeHead(400).end(
            JSON.stringify({
              name: 'WorktreeError',
              data: { message: 'Worktree contains uncommitted changes', forceRequired: true },
            }),
          );
        res.writeHead(204).end();
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const remove = (target: string) =>
      app.request(
        `http://localhost/api/projects/project/worktrees?${new URLSearchParams({ directory: target, force: 'true' })}`,
        { method: 'DELETE' },
      );
    expect((await remove(directory)).status).toBe(400);
    expect((await remove('/unrelated')).status).toBe(400);
    for (const state of ['chat', 'terminal', 'shell']) {
      occupied = state;
      expect((await remove(tree)).status).toBe(409);
    }
    expect(writes).toEqual([]);
    occupied = '';
    dirty = true;
    const failed = await remove(tree);
    expect(failed.status).toBe(409);
    expect(await failed.json()).toEqual({ message: 'Worktree contains uncommitted changes' });
    dirty = false;
    expect((await remove(tree)).status).toBe(200);
    expect(writes).toEqual(Array(2).fill({ projectID: 'project', directory: tree, force: false }));
  });
  it('starts an empty chat in a new native worktree, keeping its identity, and cleans up a failed move', async () => {
    const tree = '/opencode/worktree/project/gentle-meadow';
    let location = { directory };
    let history: unknown[] = [{ id: 'msg' }];
    let failMove = true;
    const writes: Array<[string, unknown]> = [];
    const url = await upstream((req, res) => {
      const path = new URL(req.url!, 'http://localhost').pathname;
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') {
        if (path === '/api/session/chat')
          return res.end(JSON.stringify({ data: { id: 'chat', projectID: 'project', location } }));
        if (path === '/api/session/active') return res.end(JSON.stringify({ data: {} }));
        if (path === '/api/session/chat/inbox') return res.end(JSON.stringify({ data: [] }));
        if (path === '/api/session/chat/message')
          return res.end(JSON.stringify({ data: history, cursor: {} }));
        throw new Error(`Unexpected request: ${req.url}`);
      }
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const input = JSON.parse(body);
        writes.push([path, input]);
        if (path.endsWith('/move')) {
          if (failMove) return res.writeHead(500).end();
          location = { directory: input.directory };
          return res.writeHead(204).end();
        }
        if (path === '/api/worktree' && req.method === 'POST')
          return res.end(JSON.stringify({ directory: tree }));
        res.writeHead(204).end();
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const start = (branch?: string) =>
      app.request('http://localhost/api/sessions/chat/worktree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch }),
      });
    expect((await start('--force')).status).toBe(400);
    expect((await start('main')).status).toBe(409);
    expect(writes).toEqual([]);
    history = [];
    expect((await start('main')).status).toBe(502);
    expect(writes.map(([path]) => path)).toEqual([
      '/api/worktree',
      '/api/session/chat/move',
      '/api/worktree',
    ]);
    expect(writes[0]![1]).toEqual({ projectID: 'project', from: directory, branch: 'main' });
    expect(writes[2]![1]).toEqual({ projectID: 'project', directory: tree, force: false });
    failMove = false;
    const started = await start('main');
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({ id: 'chat', location: { directory: tree } });
  });
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

  it('previews local chat images through bounded native reads, without serving non-image files', async () => {
    const reads: Array<{ directory: string | null; path: string }> = [];
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8ioAAAAASUVORK5CYII=',
      'base64',
    );
    const url = await upstream((req, res) => {
      const path = new URL(req.url!, 'http://localhost');
      expect(req.headers.authorization).toBe(
        `Basic ${Buffer.from('image:test').toString('base64')}`,
      );
      if (path.pathname === '/api/session/s') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ data: { id: 's', location: { directory } } }));
      }
      const file = decodeURIComponent(path.pathname.slice('/api/fs/read/'.length));
      reads.push({ directory: path.searchParams.get('location[directory]'), path: file });
      if (file === 'large.png') {
        res.write(Buffer.alloc(1536 * 1024));
        return res.end(Buffer.alloc(1536 * 1024));
      }
      if (file === 'logo.svg')
        return res.end('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      if (file === 'secret.png') return res.end('<html>not an image</html>');
      if (file === 'missing.png') return res.writeHead(404).end();
      res.end(png);
    });
    const app = createApp(
      new OpenCodeBackend(async () => ({
        url,
        auth: { type: 'basic', username: 'image', password: 'test' },
      })),
    );
    const get = (path: string, headers?: Record<string, string>) =>
      app.request(`http://localhost/api/sessions/s/image?${new URLSearchParams({ path })}`, {
        headers,
      });
    const relative = await get('art/preview with spaces.png');
    expect(relative.status).toBe(200);
    expect(relative.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await relative.arrayBuffer())).toEqual(png);
    expect(reads.at(-1)).toEqual({
      directory: join(directory, 'art'),
      path: 'preview with spaces.png',
    });
    const outside = join(dirname(directory), 'outside image.png');
    expect((await get(outside)).status).toBe(200);
    expect(reads.at(-1)).toEqual({ directory: dirname(directory), path: 'outside image.png' });
    expect((await get(pathToFileURL(outside).href)).status).toBe(200);
    expect(reads.at(-1)?.path).toBe('outside image.png');
    const svg = await get('logo.svg');
    expect(svg.headers.get('content-type')).toBe('image/svg+xml');
    expect(svg.headers.get('content-security-policy')).toContain('sandbox');
    expect(svg.headers.get('x-content-type-options')).toBe('nosniff');
    const workspaceSvg = await app.request(
      `http://localhost/api/workspace/file?${new URLSearchParams({ directory, path: 'logo.svg' })}`,
    );
    expect(await workspaceSvg.json()).toMatchObject({
      kind: 'image',
      uri: expect.stringMatching(/^data:image\/svg\+xml;base64,/),
    });
    expect((await get('secret.png')).status).toBe(415);
    expect((await get('large.png')).status).toBe(413);
    expect((await get('missing.png')).status).toBe(502);
    const count = reads.length;
    expect((await get('https://example.com/image.png')).status).toBe(400);
    expect((await get('file://other-host/image.png')).status).toBe(400);
    expect((await get('file:///bad%00.png')).status).toBe(400);
    expect((await get('image.png', { origin: 'https://other.example' })).status).toBe(403);
    expect(reads).toHaveLength(count);
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
              time: { created: 10, updated: 42, idle: 40, viewed: 20 },
              metadata: { opencodexUnread: 'manual-mark', opencodexPinned: 30 },
              model: { id: 'test-model' },
              fork: {
                sessionID: 'source-session',
                boundary: { type: 'through', messageID: 'last-message' },
              },
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
          time: { created: 10, idle: 40, viewed: 20 },
          unread: 'manual-mark',
          pinned: 30,
          model: 'test-model',
          fork: { sessionID: 'source-session' },
        },
      ],
      nextCursor: 'next-page',
    });
    expect(requested?.pathname).toBe('/api/session');
    expect(requested?.searchParams.get('directory')).toBe(directory);
    expect(requested?.searchParams.get('cursor')).toBe('page-2');
    expect(requested?.searchParams.get('limit')).toBe('50');
    expect(authorization).toBe(`Basic ${Buffer.from('test:private').toString('base64')}`);
    const search = await app.request(
      'http://localhost/api/session-search?search=Review&cursor=page-2',
    );
    expect(search.status).toBe(200);
    expect(requested?.searchParams.get('search')).toBe('Review');
    expect(requested?.searchParams.get('cursor')).toBe('page-2');
    expect(requested?.searchParams.get('directory')).toBeNull();
    expect(requested?.searchParams.get('parentID')).toBe('null');
    expect(requested?.searchParams.get('limit')).toBe('50');
    expect(
      (await app.request(`http://localhost/api/session-search?search=${'a'.repeat(257)}`)).status,
    ).toBe(400);
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
    expect(
      (await send([{ name: 'broken.bin', uri: 'data:application/octet-stream;base64,AAA' }]))
        .status,
    ).toBe(400);
    expect((await send(Array.from({ length: 100 }, () => files[0]!))).status).toBe(200);
    expect((await send(Array.from({ length: 101 }, () => files[0]!))).status).toBe(400);
    expect(calls).toHaveLength(2);
    const image = { name: 'image.png', size: 10 * 1024 * 1024, image: true };
    const document = { name: 'document.pdf', size: 20 * 1024 * 1024, image: false };
    expect(
      attachmentLimitError([...Array.from({ length: 8 }, () => image), document]),
    ).toBeUndefined();
    expect(attachmentLimitError(Array.from({ length: 100 }, () => document))).toBeUndefined();
    expect(attachmentLimitError(Array.from({ length: 9 }, () => image))).toContain('80 MiB');
    expect(attachmentLimitError([{ ...image, size: image.size + 1 }])).toContain('10 MiB');
    expect(attachmentLimitError([{ ...document, size: document.size + 1 }])).toContain('20 MiB');
    // Validate real maximum-size payloads: repeated regex groups can overflow V8's stack.
    expect(
      promptInputSchema.safeParse({
        text: '',
        files: [
          {
            name: 'large.bin',
            uri: `data:application/octet-stream;base64,${Buffer.alloc(MAX_FILE_BYTES).toString('base64')}`,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('stages binary attachments with native writes before prompts and commands, preserving bytes and safe paths', async () => {
    const writes: Array<{ path: string; data: Buffer }> = [];
    const prompts: Array<{ text: string; files: Array<{ name: string; uri: string }> }> = [];
    let failWrite = false;
    const url = await upstream((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET')
          return res.end(
            JSON.stringify({ data: { id: 'session-1', agent: 'build', location: { directory } } }),
          );
        if (new URL(req.url!, 'http://localhost').pathname === '/api/experimental/fs/write') {
          if (failWrite) {
            res.writeHead(503).end('{}');
            return;
          }
          const target = new URL(req.url!, 'http://localhost');
          expect(target.searchParams.get('location[directory]')).toBe(directory);
          const path = target.searchParams.get('path')!;
          writes.push({ path, data: Buffer.concat(chunks) });
          return res.end(
            JSON.stringify({ location: { directory }, data: { path: join(directory, path) } }),
          );
        }
        prompts.push(JSON.parse(Buffer.concat(chunks).toString()));
        if (req.url?.endsWith('/command')) {
          res.writeHead(204).end();
          return;
        }
        res.end(JSON.stringify({ data: { id: 'accepted' } }));
      });
    });
    const app = createApp(new OpenCodeBackend(async () => ({ url })));
    const bytes = Buffer.from([0x50, 0x4b, 3, 4, 0, 255, 128, 1]);
    const image = { name: 'image.png', uri: 'data:image/png;base64,AQID' };
    const send = (command?: string) =>
      app.request('http://localhost/api/sessions/session-1/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Inspect these files',
          command,
          files: [
            {
              name: '../../Power of attorney.docx',
              uri: `data:application/octet-stream;base64,${bytes.toString('base64')}`,
            },
            image,
          ],
        }),
      });
    expect((await send()).status).toBe(200);
    expect(writes).toHaveLength(2);
    expect(writes[0]!.data.toString()).toBe('*\n');
    expect(writes[1]!.path).toMatch(
      /^\.opencode\/opencodex-attachments\/[\da-f-]+\/1-Power of attorney\.docx$/,
    );
    expect(writes[1]!.data).toEqual(bytes);
    expect(prompts[0]!.files).toEqual([
      {
        name: '../../Power of attorney.docx',
        uri: pathToFileURL(join(directory, writes[1]!.path)).href,
      },
      image,
    ]);
    expect(prompts[0]!.text).toContain(
      JSON.stringify({
        name: '../../Power of attorney.docx',
        path: join(directory, writes[1]!.path),
      }),
    );
    expect((await send('review')).status).toBe(200);
    expect(prompts[1]!.text).toContain(join(directory, writes[3]!.path));
    expect(writes[3]!.path).not.toBe(writes[1]!.path);
    failWrite = true;
    expect((await send()).status).toBe(502);
    expect(prompts).toHaveLength(2);
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
      res.write(`data: ${JSON.stringify({ type: 'shell.created' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'shell.exited' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'shell.deleted' })}\n\n`);
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
    for (const type of ['shell.created', 'shell.exited', 'shell.deleted'])
      expect(body).toContain(`"type":"${type}"`);
    expect(body).toContain('event: unavailable');
    for await (const event of backend.events(AbortSignal.timeout(2_000))) {
      expect([
        'server.connected',
        'session.updated',
        'shell.created',
        'shell.exited',
        'shell.deleted',
      ]).toContain(event.type);
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
