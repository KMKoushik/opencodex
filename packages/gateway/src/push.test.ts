import { generateKeyPairSync, verify } from 'node:crypto';
import { request } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { OpenCodeBackend } from './opencode';
import { Push, type ApnsRequest } from './push';
import { RemoteAccess } from './remote';

const HOST = 'ox.example.test';
const TOKEN = 'ab'.repeat(32);
const cleanups: (() => Promise<unknown> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** A gateway whose remote access, push.json and APNs all live in a temp folder. */
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'opencodex-push-'));
  const shutdown = new AbortController();
  const remote = new RemoteAccess({ file: join(directory, 'remote.json'), served: false });
  const sent: ApnsRequest[] = [];
  const sessions: Record<
    string,
    { id: string; title?: string; parentID?: string; metadata?: Record<string, unknown> }
  > = {
    root: { id: 'root', title: 'Fix the build' },
    child: { id: 'child', parentID: 'root' },
    quiet: { id: 'quiet', title: 'Muted', metadata: { opencodexMuted: true } },
  };
  // Only what push.ts reads: session.get, and an event stream that stays empty.
  const backend = {
    request: (_: AbortSignal, operation: (client: unknown, options: object) => unknown) =>
      operation(
        { session: { get: async ({ sessionID }: { sessionID: string }) => sessions[sessionID] } },
        {},
      ),
    async *events() {},
  } as unknown as OpenCodeBackend;
  const push = new Push(remote, backend, {
    send: async (message) => (sent.push(message), { status: 200 }),
  });
  const app = createApp(backend, shutdown.signal, { remote, push });
  remote.serve(app.fetch, () => () => undefined);
  await remote.start();
  const port = await freePort();
  await remote.configure({ enabled: true, hostname: HOST, port, tunnel: 'external' });
  cleanups.push(
    () => rm(directory, { recursive: true, force: true }),
    () => remote.close(),
    () => shutdown.abort(),
  );
  const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const outgoing = request(
        {
          host: '127.0.0.1',
          port,
          method,
          path,
          headers: { Host: HOST, 'Content-Type': 'application/json', ...headers },
        },
        (response) => {
          let text = '';
          response.on('data', (chunk) => (text += chunk));
          response.on('end', () => resolve({ status: response.statusCode!, body: text }));
        },
      );
      outgoing.on('error', reject);
      outgoing.end(body === undefined ? undefined : JSON.stringify(body));
    });
  const { code } = await remote.createCode();
  const paired = await send(
    'POST',
    '/api/remote/pair',
    { 'User-Agent': 'OpenCodex iOS (iPhone)' },
    { code, client: 'native' },
  );
  const auth = { Authorization: `Bearer ${(JSON.parse(paired.body) as { token: string }).token}` };
  return { directory, remote, push, app, send, auth, sent, signal: shutdown.signal };
}

describe('push notifications', () => {
  it('stores a paired device’s APNs token with the device and drops it on revoke', async () => {
    const { directory, remote, app, send, auth } = await setup();
    const local = await app.request('http://127.0.0.1/api/remote/push-token', {
      method: 'POST',
      body: JSON.stringify({ token: TOKEN, environment: 'development' }),
    });
    expect(local.status).toBe(400);
    expect(
      (
        await send('POST', '/api/remote/push-token', auth, {
          token: 'nope',
          environment: 'development',
        })
      ).status,
    ).toBe(400);

    const registered = await send('POST', '/api/remote/push-token', auth, {
      token: TOKEN,
      environment: 'development',
    });
    expect(JSON.parse(registered.body)).toEqual({ ok: true, active: false });
    const stored = JSON.parse(await readFile(join(directory, 'remote.json'), 'utf8'));
    expect(stored.devices[0].push).toEqual({
      token: TOKEN,
      environment: 'development',
      kinds: { reply: true, question: true, permission: true },
    });
    // The settings screen never shows tokens.
    expect(JSON.stringify(remote.status())).not.toContain(TOKEN);

    await remote.revoke(remote.status().devices[0]!.id);
    expect(await readFile(join(directory, 'remote.json'), 'utf8')).not.toContain(TOKEN);
  });

  it('sends nothing without push.json, then the desktop’s notifications once it exists', async () => {
    const { directory, push, send, auth, sent, signal } = await setup();
    await send('POST', '/api/remote/push-token', auth, {
      token: TOKEN,
      environment: 'development',
    });
    const finished = { type: 'session.execution.succeeded', data: { sessionID: 'root' } };
    await push.handle(finished, signal);
    expect(push.active).toBe(false);
    expect(sent).toEqual([]);

    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    await writeFile(
      join(directory, 'AuthKey.p8'),
      privateKey.export({ type: 'pkcs8', format: 'pem' }),
    );
    await writeFile(
      join(directory, 'push.json'),
      JSON.stringify({
        keyPath: join(directory, 'AuthKey.p8'),
        keyID: 'KEY1234567',
        teamID: 'G5MR932BV5',
        topic: 'com.kmkoushik.opencodex',
      }),
    );
    await push.refresh(signal);
    expect(push.active).toBe(true);

    await push.handle(finished, signal);
    // Subagent replies and muted threads stay quiet; a subagent's question goes to its thread.
    await push.handle(
      { type: 'session.execution.succeeded', data: { sessionID: 'child' } },
      signal,
    );
    await push.handle({ type: 'permission.asked', data: { sessionID: 'quiet' } }, signal);
    await push.handle({ type: 'form.created', data: { form: { sessionID: 'child' } } }, signal);
    expect(sent.map((item) => [item.environment, item.token, item.payload])).toEqual([
      [
        'development',
        TOKEN,
        {
          aps: {
            alert: { title: 'Reply finished', body: 'Fix the build' },
            sound: 'default',
            'thread-id': 'root',
          },
          sessionID: 'root',
          kind: 'reply',
        },
      ],
      [
        'development',
        TOKEN,
        {
          aps: {
            alert: { title: 'Question waiting', body: 'Fix the build' },
            sound: 'default',
            'thread-id': 'root',
          },
          sessionID: 'root',
          kind: 'question',
        },
      ],
    ]);
    // A Live Activity the phone started ends by push when its reply ends.
    await send('POST', '/api/remote/live-activity', auth, {
      sessionID: 'root',
      token: 'cd'.repeat(32),
      environment: 'development',
    });
    await push.handle(
      { type: 'session.execution.interrupted', data: { sessionID: 'root' } },
      signal,
    );
    expect(sent[2]).toMatchObject({
      token: 'cd'.repeat(32),
      headers: {
        'apns-topic': 'com.kmkoushik.opencodex.push-type.liveactivity',
        'apns-push-type': 'liveactivity',
      },
      payload: { aps: { event: 'end', 'content-state': { state: 'stopped' } } },
    });
    const headers = sent[0]!.headers;
    expect(headers).toMatchObject({
      'apns-topic': 'com.kmkoushik.opencodex',
      'apns-push-type': 'alert',
      'apns-collapse-id': 'root',
    });
    const [header, claims, signature] = headers.authorization!.replace('bearer ', '').split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
    });
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString()).iss).toBe('G5MR932BV5');
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature!, 'base64url'),
      ),
    ).toBe(true);
  });
});
