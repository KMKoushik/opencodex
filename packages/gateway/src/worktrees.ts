import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { isWorktreeError } from '@opencode/client';
import { sessionWorktreeSchema, worktreeDirectorySchema } from '@opencodex/contracts';
import { OpenCodeBackend } from './opencode';
import { GatewayError } from './errors';

export function worktreeRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  app.use('/sessions/:id/worktree', bodyLimit({ maxSize: 8192 }));
  app.get('/projects/:id/worktrees', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.worktree.list({ projectID: c.req.param('id') }, options),
      ),
    ),
  );
  app.delete('/projects/:id/worktrees', async (c) => {
    const input = worktreeDirectorySchema.safeParse(c.req.query());
    if (!input.success) return c.json({ message: 'Choose a worktree directory.' }, 400);
    await backend.request(c.req.raw.signal, async (client, options) => {
      const projectID = c.req.param('id');
      const directory = input.data.directory;
      const trees = await client.worktree.list({ projectID }, options);
      // Only native Git worktrees can be removed, never the main checkout.
      if (!trees.some((tree) => tree.directory === directory && tree.strategy === 'git'))
        throw new GatewayError('Choose a registered Git worktree, not the local checkout.', 400);
      const [sessions, active, terminals, shells] = await Promise.all([
        client.session.list({ directory, limit: 200 }, options),
        client.session.active(options),
        client.pty.list({ location: { directory } }, options),
        client.shell.list({ location: { directory } }, options),
      ]);
      // Idle chats stay readable as history; Git still refuses to drop uncommitted work.
      if (
        sessions.data.some((session) => active[session.id]) ||
        terminals.data.length ||
        shells.data.some((shell) => shell.status === 'running')
      )
        throw new GatewayError(
          'Stop the chats, terminals, and shells running in this worktree before removing it.',
          409,
        );
      try {
        await client.worktree.remove({ projectID, directory, force: false }, options);
      } catch (error) {
        throw worktreeFailure(error);
      }
    });
    return c.json({ ok: true });
  });
  // Starts a new chat in its own checkout, like Codex/T3's worktree mode: the empty chat keeps
  // its identity and draft, and its first prompt runs in the new worktree.
  app.post('/sessions/:id/worktree', async (c) => {
    const input = sessionWorktreeSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Choose a valid starting branch.' }, 400);
    return c.json(
      await backend.request(c.req.raw.signal, async (client, options) => {
        const sessionID = c.req.param('id');
        const session = await client.session.get({ sessionID }, options);
        const [active, inbox, messages] = await Promise.all([
          client.session.active(options),
          client.session.inbox.list({ sessionID }, options),
          client.message.list({ sessionID, limit: 1 }, options),
        ]);
        if (active[sessionID] || inbox.length || messages.data.length)
          throw new GatewayError('Only a new, empty chat can start in a worktree.', 409);
        let directory: string;
        try {
          ({ directory } = await client.worktree.create(
            {
              projectID: session.projectID,
              from: session.location.directory,
              branch: input.data.branch,
            },
            options,
          ));
        } catch (error) {
          throw worktreeFailure(error);
        }
        try {
          await client.session.move({ sessionID, directory }, options);
        } catch (error) {
          // Nothing uses the fresh checkout yet; don't leave it behind.
          await client.worktree
            .remove({ projectID: session.projectID, directory, force: false }, options)
            .catch(() => undefined);
          throw error;
        }
        // Move is admitted asynchronously, but an idle chat is placed almost immediately.
        for (let attempt = 0; attempt < 40; attempt++) {
          const moved = await client.session.get({ sessionID }, options);
          if (moved.location.directory === directory) return moved;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new GatewayError('OpenCode has not moved this chat into its worktree yet.', 503);
      }),
    );
  });
  return app;
}

function worktreeFailure(error: unknown): unknown {
  // Native tagged errors contain Git's actionable message (dirty tree, bad ref, etc.).
  let cause = error;
  for (let depth = 0; depth < 5; depth++) {
    if (isWorktreeError(cause)) return new GatewayError(cause.data.message, 409);
    if (!(cause instanceof Error)) break;
    cause = cause.cause;
  }
  return error;
}
