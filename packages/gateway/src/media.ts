import { Readable } from 'node:stream';
import { extname } from 'node:path';
import { Hono, type Context } from 'hono';
import { workspaceFileInputSchema } from '@opencodex/contracts';
import { OpenCodeBackend } from './opencode';
import { localFile } from './local-files';

const mediaTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
};

/** Files previewed by streaming host bytes instead of buffering a native `file.read`. */
export function mediaMime(path: string) {
  return mediaTypes[extname(path).toLowerCase()];
}

/** A local web page and the files it loads: markup, styles, scripts, images and fonts. */
const pageTypes: Record<string, string> = {
  ...mediaTypes,
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

export function mediaRoutes(backend: OpenCodeBackend, shutdown: AbortSignal) {
  const app = new Hono();
  app.on(['GET', 'HEAD'], '/media', async (c) => {
    const input = workspaceFileInputSchema.safeParse(c.req.query());
    if (!input.success) return c.json({ message: 'Choose a file within the project.' }, 400);
    const mime = mediaMime(input.data.path);
    if (!mime) return c.json({ message: 'Choose a video or PDF file.' }, 415);
    return serve(c, input.data, mime);
  });
  // The phone renders local HTML previews from these bytes; the desktop's Browser panel reads
  // them from disk itself. Any file here is already readable through native `file.read`. Opened
  // directly in a browser, the page runs in a sandbox with an opaque origin, never the app's.
  app.on(['GET', 'HEAD'], '/page', async (c) => {
    const input = workspaceFileInputSchema.safeParse(c.req.query());
    if (!input.success) return c.json({ message: 'Choose a file within the project.' }, 400);
    c.header('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-modals');
    const mime = pageTypes[extname(input.data.path).toLowerCase()] ?? 'application/octet-stream';
    return serve(c, input.data, mime);
  });

  async function serve(c: Context, input: { directory: string; path: string }, mime: string) {
    await backend.requireLocalFiles();
    const { file, info } = await localFile(input.directory, input.path);
    let handedOff = false;
    try {
      c.header('Content-Type', mime);
      c.header('Accept-Ranges', 'bytes');
      const modified = info.mtime.toUTCString();
      c.header('Last-Modified', modified);
      let start = 0;
      let end = info.size - 1;
      const ifRange = c.req.header('if-range');
      const range = !ifRange || ifRange === modified ? c.req.header('range') : undefined;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2])) {
          start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
          end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
        }
        if (
          !match ||
          (!match[1] && !match[2]) ||
          (!match[1] && Number(match[2]) === 0) ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= info.size
        ) {
          c.header('Content-Range', `bytes */${info.size}`);
          return c.body(null, 416);
        }
        c.header('Content-Range', `bytes ${start}-${end}/${info.size}`);
      }
      c.header('Content-Length', String(Math.max(0, end - start + 1)));
      const status = range ? 206 : 200;
      if (c.req.method === 'HEAD' || info.size === 0) return c.body(null, status);
      const signal = AbortSignal.any([c.req.raw.signal, shutdown]);
      const stream = file.createReadStream({ start, end, highWaterMark: 64 * 1024, signal });
      handedOff = true;
      // Node's default Web strategy counts chunks, not bytes, and can prefetch gigabytes.
      return c.body(
        Readable.toWeb(stream, {
          strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength },
        }) as ReadableStream<Uint8Array>,
        status,
      );
    } finally {
      if (!handedOff) await file.close();
    }
  }

  app.get('/file-location', async (c) => {
    const input = workspaceFileInputSchema.safeParse(c.req.query());
    if (!input.success) return c.json({ message: 'Choose a file within the project.' }, 400);
    await backend.requireLocalFiles();
    const target = await localFile(input.data.directory, input.data.path);
    await target.file.close();
    return c.json({ path: target.path });
  });
  return app;
}
