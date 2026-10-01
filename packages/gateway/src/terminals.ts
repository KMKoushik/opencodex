import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { projectInputSchema, terminalUpdateSchema } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';

export function terminalRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  app.use('*', bodyLimit({ maxSize: 8192 }));
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
          (await client.pty.list({ location: { directory: c.req.query('directory')! } }, options))
            .data,
      ),
    ),
  );
  app.post('/', async (c) =>
    c.json(
      await backend.request(
        c.req.raw.signal,
        async (client, options) =>
          (
            await client.pty.create(
              {
                location: { directory: c.req.query('directory')! },
                cwd: c.req.query('directory')!,
              },
              options,
            )
          ).data,
      ),
    ),
  );
  app.patch('/:id', async (c) => {
    const input = terminalUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Invalid terminal dimensions.' }, 400);
    return c.json(
      await backend.request(
        c.req.raw.signal,
        async (client, options) =>
          (
            await client.pty.update(
              {
                ptyID: c.req.param('id'),
                location: { directory: c.req.query('directory')! },
                ...input.data,
              },
              options,
            )
          ).data,
      ),
    );
  });
  app.delete('/:id', async (c) => {
    await backend.request(c.req.raw.signal, (client, options) =>
      client.pty.remove(
        {
          ptyID: c.req.param('id'),
          location: { directory: c.req.query('directory')! },
        },
        options,
      ),
    );
    return c.json({ ok: true });
  });
  return app;
}
