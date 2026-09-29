import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { projectInputSchema } from '@opencodex/contracts';
import { OpenCodeBackend } from './opencode';
import { GatewayError } from './errors';
import { resolveProject } from './project';

export function createApp(
  backend = new OpenCodeBackend(),
  shutdown = new AbortController().signal,
) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const url = new URL(c.req.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      return c.json({ message: 'This gateway accepts local requests only.' }, 403);
    }
    const origin = c.req.header('origin');
    if ((origin && origin !== url.origin) || c.req.header('sec-fetch-site') === 'cross-site') {
      return c.json({ message: 'Cross-origin requests are not allowed.' }, 403);
    }
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.get('/api/connection', async (c) => c.json(await backend.connection()));
  app.post('/api/connection', async (c) => c.json(await backend.connection(true)));

  app.post('/api/projects/resolve', async (c) => {
    const input = projectInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Enter a project directory.' }, 400);
    return c.json(await resolveProject(input.data.directory));
  });

  app.get('/api/sessions', async (c) => {
    const input = projectInputSchema.safeParse({ directory: c.req.query('directory') });
    if (!input.success) return c.json({ message: 'Choose a project first.' }, 400);
    const project = await resolveProject(input.data.directory);
    return c.json(
      await backend.sessions(project.directory, c.req.query('cursor'), c.req.raw.signal),
    );
  });

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const disconnected = new AbortController();
      stream.onAbort(() => disconnected.abort());
      const signal = AbortSignal.any([disconnected.signal, shutdown]);
      const heartbeat = setInterval(() => {
        void stream.write(': keepalive\n\n').catch(() => disconnected.abort());
      }, 15_000);
      try {
        for await (const event of backend.events(signal)) {
          await stream.writeSSE({ event, data: '{}', retry: 3000 });
        }
        if (!signal.aborted) await stream.writeSSE({ event: 'unavailable', data: '{}' });
      } catch {
        if (!signal.aborted) await stream.writeSSE({ event: 'unavailable', data: '{}' });
      } finally {
        clearInterval(heartbeat);
        disconnected.abort();
      }
    }),
  );

  app.all('/api/*', (c) => c.json({ message: 'Unknown API route.' }, 404));
  app.onError((error, c) =>
    error instanceof GatewayError
      ? c.json({ message: error.message }, error.status)
      : c.json({ message: 'The gateway could not complete this request.' }, 500),
  );
  return app;
}
