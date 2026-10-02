import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { z } from 'zod';
import { OpenCodeBackend } from './opencode';

const imageInput = z.object({
  path: z
    .string()
    .min(1)
    .max(4096)
    .refine((path) => !path.includes('\0')),
});

export function imageRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  app.get('/:id/image', async (c) => {
    const input = imageInput.safeParse(c.req.query());
    if (!input.success) return c.json({ message: 'Provide an image path.' }, 400);
    let path = input.data.path;
    if (/^file:/i.test(path)) {
      try {
        path = fileURLToPath(path);
      } catch {
        return c.json({ message: 'Invalid local image URL.' }, 400);
      }
    }
    if (path.includes('\0') || (!isAbsolute(path) && /^[a-z][a-z\d+.-]*:/i.test(path)))
      return c.json({ message: 'Provide a local image path.' }, 400);
    const bytes = await backend.request(c.req.raw.signal, async (client, options) => {
      const session = await client.session.get({ sessionID: c.req.param('id') }, options);
      const absolute = resolve(session.location.directory, path);
      // Native reads are location-relative. Generated previews can live outside the
      // project (e.g. in a temporary directory), so scope the read to their parent.
      return client.file.read(
        { location: { directory: dirname(absolute) }, path: basename(absolute) },
        options,
      );
    });
    const mime = imageMime(bytes);
    if (!mime) return c.json({ message: 'This file is not a supported image.' }, 415);
    c.header('Content-Type', mime);
    c.header('Cache-Control', 'private, max-age=60');
    c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    return c.body(Buffer.from(bytes));
  });
  return app;
}

export function imageMime(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (String.fromCharCode(...bytes.slice(0, 3)) === 'GIF') return 'image/gif';
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  if (isSvg(bytes)) return 'image/svg+xml';
}

function isSvg(bytes: Uint8Array) {
  const start = new TextDecoder().decode(bytes.slice(0, 4096));
  return /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(start);
}
