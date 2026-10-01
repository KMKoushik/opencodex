import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { expect, it } from 'vitest';
import { createApp } from './app';
import { OpenCodeBackend } from './opencode';
import { attachTerminalSockets } from './terminal-sockets';

it('delegates PTY lifecycle and dimensions through the native location-scoped API', async () => {
  const calls: { method: string; path: string; directory: string | null; body: string }[] = [];
  const terminal = {
    id: 'pty_test',
    title: 'Shell',
    command: '/bin/sh',
    args: [],
    cwd: '/project',
    status: 'running',
    pid: 123,
  };
  const upstream = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    calls.push({
      method: req.method!,
      path: url.pathname,
      directory: url.searchParams.get('location[directory]'),
      body: Buffer.concat(chunks).toString(),
    });
    if (req.method === 'DELETE') {
      res.writeHead(204).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        location: { directory: '/project' },
        data: req.method === 'GET' ? [terminal] : terminal,
      }),
    );
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  const app = createApp(
    new OpenCodeBackend(async () => ({ url: `http://127.0.0.1:${address.port}` })),
  );
  const request = (path: string, method: string, body?: unknown) =>
    app.request(`http://localhost/api/terminals${path}?directory=/project`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    expect(await (await request('', 'POST')).json()).toEqual(terminal);
    expect(await (await request('', 'GET')).json()).toEqual([terminal]);
    expect((await request('/pty_test', 'PATCH', { size: { rows: 30, cols: 100 } })).status).toBe(
      200,
    );
    expect((await request('/pty_test', 'DELETE')).status).toBe(200);
    expect(calls.map(({ method, path, directory }) => ({ method, path, directory }))).toEqual([
      { method: 'POST', path: '/api/pty', directory: '/project' },
      { method: 'GET', path: '/api/pty', directory: '/project' },
      { method: 'PUT', path: '/api/pty/pty_test', directory: '/project' },
      { method: 'DELETE', path: '/api/pty/pty_test', directory: '/project' },
    ]);
    expect(JSON.parse(calls[0]!.body)).toEqual({ cwd: '/project' });
    expect(JSON.parse(calls[2]!.body)).toEqual({ size: { rows: 30, cols: 100 } });
    expect((await request('/pty_test', 'PATCH', { size: { rows: 0, cols: 100 } })).status).toBe(
      400,
    );
    expect((await app.request('http://localhost/api/terminals')).status).toBe(400);
    expect(calls).toHaveLength(4);
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

it('checks WebSocket origins and privately exchanges native tickets, preserving text and binary replay frames', async () => {
  let tickets = 0;
  const upstream = createServer((req, res) => {
    expect(req.url).toContain('/api/pty/pty_test/connect-token');
    expect(req.headers['x-opencode-ticket']).toBe('1');
    expect(req.headers.authorization).toMatch(/^Basic /);
    tickets++;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        location: { directory: '/project' },
        data: { ticket: 'one-use-ticket', expires_in: 30 },
      }),
    );
  });
  const native = new WebSocketServer({ server: upstream });
  native.on('connection', (socket, request) => {
    const url = new URL(request.url!, 'http://localhost');
    expect(url.searchParams.get('ticket')).toBe('one-use-ticket');
    expect(url.searchParams.get('cursor')).toBe('27');
    expect(url.searchParams.get('location[directory]')).toBe('/project');
    socket.send('retained output');
    socket.send(Buffer.from('\0{"cursor":42}'), { binary: true });
    socket.on('message', (data) => socket.send(`echo:${data.toString()}`));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  const gateway = createServer();
  const close = attachTerminalSockets(
    gateway,
    new OpenCodeBackend(async () => ({
      url: `http://127.0.0.1:${address.port}`,
      auth: { type: 'basic', username: 'opencode', password: 'private' },
    })),
  );
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const bound = gateway.address();
  if (!bound || typeof bound === 'string') throw new Error('Missing address');
  const origin = `http://127.0.0.1:${bound.port}`;
  const url =
    origin.replace('http:', 'ws:') + '/api/terminals/pty_test/connect?directory=/project&cursor=27';
  try {
    const bad = new WebSocket(url, { origin: 'https://untrusted.example' });
    bad.on('error', () => {});
    const [, response] = await once(bad, 'unexpected-response');
    expect(response.statusCode).toBe(403);
    bad.terminate();
    expect(tickets).toBe(0);
    const browser = new WebSocket(url, { origin });
    const received: { data: string; binary: boolean }[] = [];
    browser.on('message', (data, binary) => received.push({ data: data.toString(), binary }));
    await once(browser, 'open');
    browser.send('pwd\r');
    await expect
      .poll(() => received)
      .toEqual([
        { data: 'retained output', binary: false },
        { data: '\0{"cursor":42}', binary: true },
        { data: 'echo:pwd\r', binary: false },
      ]);
    expect(tickets).toBe(1);
    const ended = once(browser, 'close');
    close();
    await ended;
  } finally {
    close();
    for (const socket of native.clients) socket.terminate();
    native.close();
    await Promise.all([
      new Promise<void>((resolve) => gateway.close(() => resolve())),
      new Promise<void>((resolve) => upstream.close(() => resolve())),
    ]);
  }
});
