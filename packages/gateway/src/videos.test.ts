import { mkdtemp, mkdir, open, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp } from './app';
import { OpenCodeBackend } from './opencode';

let directory: string;
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'opencodex-video-')));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const backend = () => new OpenCodeBackend(async () => ({ url: 'http://127.0.0.1:1' }));
const url = (route: string, path = 'clip.mp4', root = directory) =>
  `http://localhost/api/workspace/${route}?${new URLSearchParams({ directory: root, path })}`;

it('previews a large video without buffering it, and streams seek/suffix ranges with correct headers', async () => {
  const size = 512 * 1024 * 1024;
  const file = await open(join(directory, 'clip.mp4'), 'w');
  await file.truncate(size);
  await file.write(Buffer.from('tail'), 0, 4, size - 4);
  await file.close();
  const app = createApp(backend());
  expect(await (await app.request(url('file'))).json()).toEqual({
    kind: 'video',
    mime: 'video/mp4',
    bytes: size,
  });
  const head = await app.request(url('video'), { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(head.headers.get('content-length')).toBe(String(size));
  expect(await head.text()).toBe('');
  for (const range of [`bytes=${size - 4}-`, 'bytes=-4', `bytes=${size - 4}-${size + 100}`]) {
    const response = await app.request(url('video'), { headers: { Range: range } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes ${size - 4}-${size - 1}/${size}`);
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('tail');
  }
  for (const range of [`bytes=${size}-`, 'bytes=3-2', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=-']) {
    const response = await app.request(url('video'), { headers: { Range: range } });
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe(`bytes */${size}`);
  }
  await writeFile(join(directory, 'small.webm'), 'full');
  const full = await app.request(url('video', 'small.webm'), {
    headers: { Range: 'bytes=0-1', 'If-Range': 'stale' },
  });
  expect(full.status).toBe(200);
  expect(await full.text()).toBe('full');
  const cancelled = await app.request(url('video'));
  const reader = cancelled.body!.getReader();
  expect((await reader.read()).value?.byteLength).toBeLessThanOrEqual(64 * 1024);
  await reader.cancel();
});

it('keeps reads and reveal targets within the canonical directory, including symlinks', async () => {
  await mkdir(join(directory, 'project'));
  await writeFile(join(directory, 'outside.mp4'), 'secret');
  await writeFile(join(directory, 'project', 'clip.mp4'), 'clip');
  await symlink(join(directory, 'outside.mp4'), join(directory, 'project', 'escape.mp4'));
  await symlink(join(directory, 'project', 'clip.mp4'), join(directory, 'project', 'inside.mp4'));
  const app = createApp(backend());
  for (const route of ['file', 'video', 'file-location']) {
    expect(
      (await app.request(url(route, '../outside.mp4', join(directory, 'project')))).status,
    ).toBe(400);
    expect((await app.request(url(route, 'escape.mp4', join(directory, 'project')))).status).toBe(
      403,
    );
    expect((await app.request(url(route, 'missing.mp4'))).status).toBe(404);
  }
  expect(
    await (
      await app.request(url('file-location', 'inside.mp4', join(directory, 'project')))
    ).json(),
  ).toEqual({ path: join(directory, 'project', 'clip.mp4') });
  expect((await app.request(url('video', 'project.mp4'))).status).toBe(404);
  expect((await app.request(url('video', 'outside.txt'))).status).toBe(415);
});

it('never substitutes host files for external service files, and requires a connected local service', async () => {
  await writeFile(join(directory, 'clip.mp4'), 'local');
  for (const service of [
    new OpenCodeBackend(async () => ({ url: 'https://remote.example' })),
    new OpenCodeBackend(async () => ({ url: 'http://127.0.0.1:1' }), false),
    new OpenCodeBackend(async () => undefined),
  ]) {
    const app = createApp(service);
    for (const route of ['file', 'video', 'file-location']) {
      const response = await app.request(url(route));
      expect([422, 503]).toContain(response.status);
      expect(await response.json()).toHaveProperty('message');
    }
  }
});
