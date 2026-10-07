import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startDesktopToolHost } from './desktop-tool-host';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

it('authenticates local plugin calls and removes its private discovery file on shutdown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'opencodex-desktop-test-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const host = await startDesktopToolHost({
    directory,
    label: 'test',
    handle: async (call) => {
      calls++;
      return { content: [{ type: 'text', text: call.sessionID }] };
    },
  });
  cleanups.push(() => host.close());
  const body = JSON.stringify({ sessionID: 'session-A', method: 'browser.list', input: {} });
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${host.endpoint.token}`,
  };
  expect((await stat(host.path)).mode & 0o777).toBe(0o600);
  expect(JSON.parse(await readFile(host.path, 'utf8')).url).toBe(host.endpoint.url);
  expect((await fetch(`${host.endpoint.url}/call`, { method: 'POST', body })).status).toBe(401);
  expect(
    (
      await fetch(`${host.endpoint.url}/call`, {
        method: 'POST',
        body,
        headers: { ...headers, Origin: 'https://example.com' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${host.endpoint.url}/call`, {
        method: 'POST',
        body: body.replace('browser.list', 'shell'),
        headers,
      })
    ).status,
  ).toBe(400);
  const response = await fetch(`${host.endpoint.url}/call`, { method: 'POST', body, headers });
  expect(await response.json()).toEqual({ content: [{ type: 'text', text: 'session-A' }] });
  expect(calls).toBe(1);
  host.pause();
  expect((await fetch(`${host.endpoint.url}/call`, { method: 'POST', body, headers })).status).toBe(
    409,
  );
  expect(calls).toBe(1);
  host.resume();
  expect((await fetch(`${host.endpoint.url}/call`, { method: 'POST', body, headers })).status).toBe(
    200,
  );
  expect(calls).toBe(2);
  await host.close();
  await expect(stat(host.path)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('propagates an interrupted plugin connection to the native operation without retrying it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'opencodex-desktop-test-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const started = Promise.withResolvers<void>();
  const cancelled = Promise.withResolvers<void>();
  let calls = 0;
  const host = await startDesktopToolHost({
    directory,
    label: 'test',
    handle: async (_call, signal) => {
      calls++;
      started.resolve();
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            cancelled.resolve();
            resolve();
          },
          { once: true },
        ),
      );
      return { content: [] };
    },
  });
  cleanups.push(() => host.close());
  const controller = new AbortController();
  const pending = fetch(`${host.endpoint.url}/call`, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${host.endpoint.token}` },
    body: JSON.stringify({
      sessionID: 'session-A',
      method: 'browser.click',
      input: { tabID: 'test' },
    }),
  }).catch(() => undefined);
  await started.promise;
  controller.abort();
  await cancelled.promise;
  await pending;
  expect(calls).toBe(1);
});

it('cancels partial authenticated bodies on pause and frees capacity after resume', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'opencodex-desktop-test-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const host = await startDesktopToolHost({
    directory,
    label: 'test',
    handle: async () => {
      calls++;
      return { content: [] };
    },
  });
  cleanups.push(() => host.close());
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${host.endpoint.token}`,
  };
  const body = JSON.stringify({ sessionID: 'session-A', method: 'computer.status', input: {} });
  const started = Promise.withResolvers<void>();
  let received = 0;
  let closed = 0;
  const admitted = () => {
    if (++received === 8) started.resolve();
  };
  host.server.on('request', admitted);
  const clients = Array.from({ length: 8 }, () => {
    const client = request(`${host.endpoint.url}/call`, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    });
    client.on('error', () => undefined);
    client.once('close', () => closed++);
    client.write(body.slice(0, -1));
    return client;
  });
  cleanups.push(async () => {
    for (const client of clients) client.destroy();
  });
  await started.promise;
  host.server.off('request', admitted);
  host.pause();
  host.resume();
  await expect.poll(() => closed).toBe(8);
  expect(calls).toBe(0);
  const response = await fetch(`${host.endpoint.url}/call`, { method: 'POST', body, headers });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ content: [] });
  expect(calls).toBe(1);
});
