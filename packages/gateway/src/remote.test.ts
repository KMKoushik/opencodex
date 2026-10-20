import { request, type IncomingMessage } from 'node:http';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamSSE } from 'hono/streaming';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { OpenCodeBackend } from './opencode';
import { RemoteAccess } from './remote';

const HOST = 'ox.example.test';
const ORIGIN = `https://${HOST}`;
const cleanups: (() => Promise<unknown>)[] = [];

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

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'opencodex-remote-'));
  const remote = new RemoteAccess({ file: join(directory, 'remote.json'), served: false });
  const app = createApp(
    new OpenCodeBackend(async () => ({ url: 'http://127.0.0.1:1' })),
    undefined,
    {
      remote,
    },
  );
  // Registered after the app's /api catch-all, so it lives outside /api; writes still need a device.
  app.post('/test/stream', (c) =>
    streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: 'open' });
      await new Promise((resolve) => stream.onAbort(() => resolve(undefined)));
    }),
  );
  remote.serve(app.fetch, () => () => undefined);
  await remote.start();
  const port = await freePort();
  await remote.configure({ enabled: true, hostname: HOST, port, tunnel: 'external' });
  cleanups.push(
    () => rm(directory, { recursive: true, force: true }),
    () => remote.close(),
  );

  const send = (
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: unknown,
  ) =>
    new Promise<{ status: number; headers: IncomingMessage['headers']; body: string }>(
      (resolve, reject) => {
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
            response.on('end', () =>
              resolve({ status: response.statusCode!, headers: response.headers, body: text }),
            );
          },
        );
        outgoing.on('error', reject);
        outgoing.end(body === undefined ? undefined : JSON.stringify(body));
      },
    );
  const pair = async () => {
    const { code } = await remote.createCode();
    const response = await send('POST', '/api/remote/pair', { Origin: ORIGIN }, { code });
    expect(response.status).toBe(200);
    return response.headers['set-cookie']![0]!.split(';')[0]!;
  };
  return { remote, port, send, pair, directory };
}

describe('remote access', () => {
  it('admits only paired devices on the configured host', async () => {
    const { remote, send } = await setup();
    expect((await send('GET', '/api/remote/session', { Host: 'evil.test' })).status).toBe(421);
    expect((await send('GET', '/api/connection')).status).toBe(401);
    expect((await send('GET', '/')).status).toBe(404);

    const { code } = await remote.createCode();
    const forged = await send(
      'POST',
      '/api/remote/pair',
      { Origin: 'https://evil.test' },
      { code },
    );
    expect(forged.status).toBe(403);
    const paired = await send('POST', '/api/remote/pair', { Origin: ORIGIN }, { code });
    expect(paired.status).toBe(200);
    const setCookie = paired.headers['set-cookie']![0]!;
    expect(setCookie).toMatch(/^__Host-opencodex=[\w-]{43};.*Secure; HttpOnly; SameSite=Strict/);
    const cookie = setCookie.split(';')[0]!;
    expect((await send('POST', '/api/remote/pair', { Origin: ORIGIN }, { code })).status).toBe(400);

    expect(JSON.parse((await send('GET', '/api/remote/session', { Cookie: cookie })).body)).toEqual(
      { remote: true, paired: true },
    );
    // A paired device can use the app but not mint codes or manage other devices.
    expect(
      (await send('POST', '/api/remote/codes', { Cookie: cookie, Origin: ORIGIN })).status,
    ).toBe(403);
    expect(
      (await send('POST', '/api/remote/codes', { Cookie: cookie, Origin: 'https://evil.test' }))
        .status,
    ).toBe(403);
  });

  it('revoking a device closes its open streams and rejects its cookie', async () => {
    const { remote, port, send, pair } = await setup();
    const cookie = await pair();
    const closed = new Promise<void>((resolve, reject) => {
      const outgoing = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/test/stream',
          headers: { Host: HOST, Cookie: cookie, Origin: ORIGIN },
        },
        (response) => {
          expect(response.statusCode).toBe(200);
          response.once('data', () => void remote.revoke(remote.status().devices[0]!.id));
          response.on('close', resolve);
        },
      );
      outgoing.on('error', () => resolve());
      outgoing.setTimeout(5_000, () => reject(new Error('The stream stayed open.')));
      outgoing.end();
    });
    await closed;
    expect((await send('POST', '/test/stream', { Cookie: cookie, Origin: ORIGIN })).status).toBe(
      401,
    );
    expect(remote.status().devices).toEqual([]);
  });

  it('lets only one gateway own the remote settings file', async () => {
    const { remote, pair, directory } = await setup();
    await pair();
    const other = new RemoteAccess({ file: join(directory, 'remote.json'), served: false });
    other.serve(
      () => new Response(),
      () => () => undefined,
    );
    await other.start();
    cleanups.push(() => other.close());
    expect(other.status().listener.state).toBe('failed');
    await expect(other.revoke(other.status().devices[0]!.id)).rejects.toMatchObject({
      status: 409,
    });
    await remote.revoke(remote.status().devices[0]!.id);
    await other.close();
    expect(remote.status().devices).toEqual([]);
  });
});
