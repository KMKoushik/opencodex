import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { SESSION_UNREAD_KEY, sessionUnread, sessionUnreadSchema } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';

export function sessionUnreadRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  const writes = new Map<string, Promise<unknown>>();
  app.use('/:id/unread', bodyLimit({ maxSize: 1024 }));
  app.post('/:id/unread', async (c) => {
    const input = sessionUnreadSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Invalid unread action.' }, 400);
    const sessionID = c.req.param('id');
    const previous = writes.get(sessionID);
    const write = (async () => {
      // A late acknowledgment must never remove a newer mark made through this gateway.
      await previous?.catch(() => undefined);
      return backend.request(c.req.raw.signal, async (client, options) => {
        const session = await client.session.get({ sessionID }, options);
        const current = sessionUnread(session);
        if (input.data.action === 'clear' && current !== input.data.marker)
          return { unread: current ?? null };
        const unread = input.data.action === 'mark' ? randomUUID() : null;
        const metadata = { ...session.metadata, [SESSION_UNREAD_KEY]: unread };
        // OpenCode owns persistence and broadcasts the metadata update to other clients.
        await client.session.update({ sessionID, metadata }, options);
        return { unread };
      });
    })();
    writes.set(sessionID, write);
    try {
      return c.json(await write);
    } finally {
      if (writes.get(sessionID) === write) writes.delete(sessionID);
    }
  });
  return app;
}
