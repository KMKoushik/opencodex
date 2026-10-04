import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  SESSION_DONE_KEY,
  SESSION_PINNED_KEY,
  SESSION_UNREAD_KEY,
  sessionFocusSchema,
  sessionMarker,
  sessionUnread,
  sessionUnreadSchema,
} from '@opencodex/contracts';
import type { OpenCodeClient, SessionInfo } from '@opencode/client';
import { GatewayError } from './errors';
import type { OpenCodeBackend } from './opencode';

/** App-owned markers stored in native session metadata; OpenCode persists and broadcasts them. */
export function sessionMetadataRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  const writes = new Map<string, Promise<unknown>>();
  // Metadata updates replace the whole object, so serialize read/modify/write per session.
  async function write<T>(
    sessionID: string,
    signal: AbortSignal,
    change: (
      session: SessionInfo,
      client: OpenCodeClient,
      options: { signal: AbortSignal },
    ) => Promise<{ metadata?: Record<string, string | number | null>; result: T }>,
  ) {
    const previous = writes.get(sessionID);
    const next = (async () => {
      await previous?.catch(() => undefined);
      return backend.request(signal, async (client, options) => {
        const session = await client.session.get({ sessionID }, options);
        const { metadata, result } = await change(session, client, options);
        // OpenCode owns persistence and broadcasts the metadata update to other clients.
        if (metadata)
          await client.session.update(
            { sessionID, metadata: { ...session.metadata, ...metadata } },
            options,
          );
        return result;
      });
    })();
    writes.set(sessionID, next);
    try {
      return await next;
    } finally {
      if (writes.get(sessionID) === next) writes.delete(sessionID);
    }
  }

  app.use('/:id/unread', bodyLimit({ maxSize: 1024 }));
  app.post('/:id/unread', async (c) => {
    const input = sessionUnreadSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Invalid unread action.' }, 400);
    return c.json(
      await write(c.req.param('id'), c.req.raw.signal, async (session) => {
        const current = sessionUnread(session);
        // A late acknowledgment must never remove a newer mark made through this gateway.
        if (input.data.action === 'clear' && current !== input.data.marker)
          return { result: { unread: current ?? null } };
        const unread = input.data.action === 'mark' ? randomUUID() : null;
        return { metadata: { [SESSION_UNREAD_KEY]: unread }, result: { unread } };
      }),
    );
  });

  app.use('/:id/focus', bodyLimit({ maxSize: 1024 }));
  app.post('/:id/focus', async (c) => {
    const input = sessionFocusSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Invalid thread action.' }, 400);
    const action = input.data.action;
    return c.json(
      await write(c.req.param('id'), c.req.raw.signal, async (session, client, options) => {
        let metadata: Record<string, number | null>;
        // Done also unpins and pinning reopens, so a thread has one place in the sidebar.
        if (action === 'pin')
          metadata = { [SESSION_PINNED_KEY]: Date.now(), [SESSION_DONE_KEY]: null };
        else if (action === 'unpin') metadata = { [SESSION_PINNED_KEY]: null };
        else if (action === 'undone') metadata = { [SESSION_DONE_KEY]: null };
        else {
          if ((await client.session.active(options))[session.id])
            throw new GatewayError('Wait for this thread to finish before marking it done.', 409);
          // Record the activity watermark, not a clock time: metadata writes bump `updated`,
          // and only a later idle transition should reopen the thread.
          metadata = {
            [SESSION_DONE_KEY]: session.time.idle ?? session.time.created,
            [SESSION_PINNED_KEY]: null,
          };
        }
        const next = { ...session.metadata, ...metadata };
        return {
          metadata,
          result: {
            pinned: sessionMarker({ metadata: next }, SESSION_PINNED_KEY) ?? null,
            done: sessionMarker({ metadata: next }, SESSION_DONE_KEY) ?? null,
          },
        };
      }),
    );
  });
  return app;
}
