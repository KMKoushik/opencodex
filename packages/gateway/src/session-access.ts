import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { sessionAccessSchema, sessionFullAccess } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';

export function sessionAccessRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  const writes = new Map<string, Promise<unknown>>();
  app.use('/:id/access', bodyLimit({ maxSize: 1024 }));
  app.post('/:id/access', async (c) => {
    const input = sessionAccessSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Choose an access mode.' }, 400);
    const sessionID = c.req.param('id');
    const previous = writes.get(sessionID);
    const next = (async () => {
      await previous?.catch(() => undefined);
      return backend.request(c.req.raw.signal, async (client, options) => {
        const session = await client.session.get({ sessionID }, options);
        const full = input.data.mode === 'full';
        if (full !== sessionFullAccess(session)) {
          await client.session.update(
            {
              sessionID,
              permissions: full
                ? [...(session.permissions ?? []), { action: '*', resource: '*', effect: 'allow' }]
                : session.permissions!.slice(0, -1),
            },
            options,
          );
        }
        // Updating native rules doesn't settle already-waiting requests. Approve those once,
        // without saving broad project approvals or adding a client-side auto-approval loop.
        if (full) {
          const requests = await client.permission.list({ sessionID }, options);
          for (const request of requests) {
            try {
              await client.permission.reply(
                { sessionID, requestID: request.id, decision: 'once' },
                options,
              );
            } catch (error) {
              // Another client may have answered it. Only ignore a confirmed settled request.
              if (
                (await client.permission.list({ sessionID }, options)).some(
                  (item) => item.id === request.id,
                )
              )
                throw error;
            }
          }
        }
        return { ok: true };
      });
    })();
    writes.set(sessionID, next);
    try {
      return c.json(await next);
    } finally {
      if (writes.get(sessionID) === next) writes.delete(sessionID);
    }
  });
  return app;
}
