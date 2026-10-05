import { Hono } from 'hono';
import { projectInputSchema } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';

/** Observe and stop OpenCode-owned commands; never start a second shell runtime. */
export function shellRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    const input = projectInputSchema.safeParse({ directory: c.req.query('directory') });
    if (!input.success) return c.json({ message: 'Choose a project directory.' }, 400);
    await next();
  });
  app.get('/', async (c) =>
    c.json(
      await backend.request(
        c.req.raw.signal,
        async (client, options) =>
          (await client.shell.list({ location: { directory: c.req.query('directory')! } }, options))
            .data,
      ),
    ),
  );
  app.get('/:id', async (c) =>
    c.json(
      await backend.request(
        c.req.raw.signal,
        async (client, options) =>
          (
            await client.shell.get(
              { id: c.req.param('id'), location: { directory: c.req.query('directory')! } },
              options,
            )
          ).data,
      ),
    ),
  );
  app.get('/:id/output', async (c) => {
    const raw = c.req.query('cursor');
    const cursor = raw === undefined ? undefined : Number(raw);
    if (raw !== undefined && (!/^\d+$/.test(raw) || !Number.isSafeInteger(cursor)))
      return c.json({ message: 'Invalid shell output cursor.' }, 400);
    return c.json(
      await backend.request(
        c.req.raw.signal,
        async (client, options) =>
          (
            await client.shell.output(
              {
                id: c.req.param('id'),
                location: { directory: c.req.query('directory')! },
                cursor,
                limit: 65_536,
              },
              options,
            )
          ).data,
      ),
    );
  });
  app.delete('/:id', async (c) => {
    await backend.request(c.req.raw.signal, (client, options) =>
      client.shell.remove(
        { id: c.req.param('id'), location: { directory: c.req.query('directory')! } },
        options,
      ),
    );
    return c.json({ ok: true });
  });
  return app;
}
