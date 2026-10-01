import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  MAX_PREVIEW_BYTES,
  workspaceFileInputSchema,
  workspaceWriteSchema,
  projectInputSchema,
  type FileDiffInfo,
  type WorkspaceFile,
} from '@opencodex/contracts';
import { OpenCodeBackend } from './opencode';
import { GatewayError } from './errors';

const version = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const browseInput = projectInputSchema.extend({
  path: workspaceFileInputSchema.shape.path.optional(),
  query: z.string().max(256).optional(),
});
const diffInput = projectInputSchema.extend({
  path: workspaceFileInputSchema.shape.path.optional(),
  mode: z.enum(['working', 'branch']).default('working'),
});

export function workspaceRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  // The pinned V2 API has no per-file diff operation. Share one short-lived,
  // bounded snapshot across file selections instead of fetching every patch again.
  const snapshots = new Map<
    string,
    { expires: number; data: Promise<Map<string, FileDiffInfo>> }
  >();
  const writes = new Map<string, Promise<unknown>>();
  app.get('/files', async (c) => {
    const input = browseInput.safeParse(c.req.query());
    if (!input.success)
      return c.json({ message: 'Choose a project-relative folder or search.' }, 400);
    const { directory, path, query } = input.data;
    return c.json(
      await backend.request(
        c.req.raw.signal,
        async (client, options) =>
          (query
            ? await client.file.find(
                { location: { directory }, query, type: 'file', limit: 200 },
                options,
              )
            : await client.file.list({ location: { directory }, path }, options)
          ).data,
      ),
    );
  });
  app.get('/file', async (c) => {
    const input = workspaceFileInputSchema.safeParse(c.req.query());
    if (!input.success) return c.json({ message: 'Choose a file within the project.' }, 400);
    const { directory, path } = input.data;
    const bytes = await backend.request(c.req.raw.signal, (client, options) =>
      client.file.read({ location: { directory }, path }, options),
    );
    const mime = imageMime(bytes);
    if (mime)
      return c.json({
        kind: 'image',
        bytes: bytes.length,
        uri: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`,
      } satisfies WorkspaceFile);
    const text = decodeText(bytes);
    return c.json(
      text === undefined
        ? ({ kind: 'binary', bytes: bytes.length } satisfies WorkspaceFile)
        : ({
            kind: 'text',
            text,
            bytes: bytes.length,
            version: version(bytes),
          } satisfies WorkspaceFile),
    );
  });
  app.put(
    '/file',
    bodyLimit({
      maxSize: MAX_PREVIEW_BYTES * 6 + 16384,
      onError: (c) => c.json({ message: 'File exceeds the editing limit.' }, 413),
    }),
    async (c) => {
      const input = workspaceWriteSchema.safeParse(await c.req.json().catch(() => null));
      if (!input.success)
        return c.json(
          { message: 'Provide a project-relative file, content, and its original version.' },
          400,
        );
      const { directory, path, text } = input.data;
      const payload = new TextEncoder().encode(text);
      if (payload.length > MAX_PREVIEW_BYTES)
        return c.json({ message: 'File exceeds the 2 MiB editing limit.' }, 413);
      const key = JSON.stringify([directory, path]);
      const previous = writes.get(key);
      const operation = (async () => {
        await previous?.catch(() => undefined);
        return backend.request(c.req.raw.signal, async (client, options) => {
          const current = await client.file.read({ location: { directory }, path }, options);
          if (version(current) !== input.data.version)
            throw new GatewayError(
              'This file changed on disk. Your edits are preserved. Review the disk version before saving.',
              409,
            );
          await client.file.write({ location: { directory }, path, payload }, options);
          snapshots.clear();
          return {
            kind: 'text',
            text,
            bytes: payload.length,
            version: version(payload),
          } satisfies WorkspaceFile;
        });
      })();
      writes.set(key, operation);
      try {
        return c.json(await operation);
      } finally {
        if (writes.get(key) === operation) writes.delete(key);
      }
    },
  );
  app.get('/diff', async (c) => {
    const input = diffInput.safeParse(c.req.query());
    if (!input.success)
      return c.json({ message: 'Choose a changed file and a valid comparison.' }, 400);
    const { directory, path, mode } = input.data;
    const key = JSON.stringify([directory, mode]);
    let snapshot = snapshots.get(key);
    if (!snapshot || snapshot.expires < Date.now()) {
      // At most two repository snapshots; upstream response bytes are bounded too.
      if (snapshots.size >= 2) snapshots.delete(snapshots.keys().next().value!);
      const data = backend.request(AbortSignal.timeout(30_000), async (client, options) => {
        const result = await client.vcs.diff(
          { location: { directory }, mode, context: 3 },
          options,
        );
        return new Map(result.data.map((file) => [file.file, file]));
      });
      snapshot = { expires: Date.now() + 2000, data };
      snapshots.set(key, snapshot);
      const current = snapshot;
      void data.catch(() => {
        if (snapshots.get(key) === current) snapshots.delete(key);
      });
    }
    const files = await snapshot.data;
    if (!path)
      return c.json(
        [...files.values()].map(({ file, additions, deletions, status }) => ({
          file,
          additions,
          deletions,
          status,
        })),
      );
    const file = files.get(path);
    return c.json(file ?? null);
  });
  return { app, invalidate: () => snapshots.clear() };
}

function decodeText(bytes: Uint8Array) {
  if (bytes.includes(0)) return;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function imageMime(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (String.fromCharCode(...bytes.slice(0, 3)) === 'GIF') return 'image/gif';
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
}
