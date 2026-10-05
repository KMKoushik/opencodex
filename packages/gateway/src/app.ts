import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import {
  projectInputSchema,
  projectUpdateSchema,
  promptInputSchema,
  sessionActionSchema,
  sessionCreateSchema,
  sessionViewSchema,
  permissionReplySchema,
  formReplySchema,
  modelInputSchema,
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
} from '@opencodex/contracts';
import { OpenCodeBackend } from './opencode';
import { GatewayError } from './errors';
import { resolveProject } from './project';
import { workspaceRoutes } from './workspace';
import { terminalRoutes } from './terminals';
import { shellRoutes } from './shells';
import { imageRoutes } from './images';
import { sessionMetadataRoutes } from './session-metadata';
import { sessionAccessRoutes } from './session-access';
import { attention } from './attention';

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
  app.route('/api/terminals', terminalRoutes(backend));
  app.route('/api/shells', shellRoutes(backend));
  app.route('/api/sessions', imageRoutes(backend));
  app.route('/api/sessions', sessionMetadataRoutes(backend));
  app.route('/api/sessions', sessionAccessRoutes(backend));
  app.get('/api/attention', async (c) => {
    const directories = [...new Set(c.req.queries('directory') ?? [])];
    if (directories.length > 32 || directories.some((item) => !item.trim() || item.length > 4096))
      return c.json({ message: 'Choose up to 32 project directories.' }, 400);
    return c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        attention(client, directories, options),
      ),
    );
  });

  app.post('/api/projects/resolve', async (c) => {
    const input = projectInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Enter a project directory.' }, 400);
    return c.json(await resolveProject(input.data.directory));
  });

  app.get('/api/projects', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) => client.project.list(options)),
    ),
  );

  app.post('/api/projects', async (c) => {
    const input = projectInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Enter a project directory.' }, 400);
    const folder = await resolveProject(input.data.directory);
    return c.json(
      await backend.request(c.req.raw.signal, async (client, options) => {
        // Location discovery registers the project without creating a chat.
        const location = await client.location.get(
          { location: { directory: folder.directory } },
          options,
        );
        const projects = await client.project.list(options);
        const project = projects.find((item) => item.id === location.project.id);
        if (!project)
          throw new GatewayError('The project was not found after opening its folder.', 502);
        return project;
      }),
    );
  });
  app.use('/api/projects/:id', bodyLimit({ maxSize: 2_100_000 }));
  app.patch('/api/projects/:id', async (c) => {
    const input = projectUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        { message: input.error.issues[0]?.message ?? 'Invalid project settings.' },
        400,
      );
    return c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.project.update({ projectID: c.req.param('id'), ...input.data }, options),
      ),
    );
  });

  app.post('/api/sessions', async (c) => {
    const input = sessionCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Choose a project first.' }, 400);
    const project = await resolveProject(input.data.directory);
    return c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.session.create(
          {
            location: { directory: project.directory },
            agent: 'build',
            model: input.data.model,
          },
          options,
        ),
      ),
    );
  });
  app.get('/api/models', async (c) => {
    const input = projectInputSchema.safeParse({ directory: c.req.query('directory') });
    if (!input.success) return c.json({ message: 'Choose a project first.' }, 400);
    return c.json(
      await backend.request(c.req.raw.signal, async (client, options) => {
        const location = { directory: input.data.directory };
        const [models, fallback, build, providers] = await Promise.all([
          client.model.list({ location }, options),
          client.model.default({ location }, options),
          client.agent.get({ location, agentID: 'build' }, options),
          client.provider.list({ location }, options),
        ]);
        return {
          ...models,
          providers: providers.data.map(({ id, name, canonical }) => ({ id, name, canonical })),
          defaultModel:
            build.data.model ??
            (fallback.data ? { id: fallback.data.id, providerID: fallback.data.providerID } : null),
        };
      }),
    );
  });
  app.get('/api/commands', async (c) => {
    const input = projectInputSchema.safeParse({ directory: c.req.query('directory') });
    if (!input.success) return c.json({ message: 'Choose a project first.' }, 400);
    return c.json(
      await backend.request(
        c.req.raw.signal,
        async (client, options) =>
          (await client.command.list({ location: { directory: input.data.directory } }, options))
            .data,
      ),
    );
  });
  app.use('/api/sessions/:id/action', bodyLimit({ maxSize: 8192 }));
  app.post('/api/sessions/:id/action', async (c) => {
    const input = sessionActionSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Invalid session action.' }, 400);
    return c.json(
      await backend.request(c.req.raw.signal, async (client, options) => {
        const sessionID = c.req.param('id');
        if (input.data.action === 'undo' || input.data.action === 'redo') {
          const active = await client.session.active(options);
          if (active[sessionID])
            throw new GatewayError('Stop the current response before undoing or redoing.', 409);
          if (input.data.action === 'undo')
            await client.session.revert.stage(
              { sessionID, messageID: input.data.messageID, files: true },
              options,
            );
          else await client.session.revert.clear({ sessionID }, options);
          return null;
        }
        if (input.data.action === 'fork')
          return client.session.fork({ sessionID, before: input.data.before }, options);
        if (input.data.action === 'compact') await client.session.compact({ sessionID }, options);
        if (input.data.action === 'rename')
          await client.session.update({ sessionID, title: input.data.title }, options);
        return null;
      }),
    );
  });
  app.get('/api/sessions/:id/export', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.session.export({ sessionID: c.req.param('id') }, options),
      ),
    ),
  );
  const workspace = workspaceRoutes(backend);
  app.route('/api/workspace', workspace.app);
  app.get('/api/workspace/:resource', async (c) => {
    const input = projectInputSchema.safeParse({ directory: c.req.query('directory') });
    if (!input.success) return c.json({ message: 'Choose a project first.' }, 400);
    const resource = c.req.param('resource');
    if (!['vcs', 'mcp', 'skills'].includes(resource)) return c.notFound();
    return c.json(
      await backend.request(c.req.raw.signal, async (client, options) => {
        const location = { directory: input.data.directory };
        if (resource === 'vcs') {
          const [info, files] = await Promise.all([
            client.vcs.get({ location }, options),
            client.vcs.status({ location }, options),
          ]);
          return { info: info.data, files: files.data };
        }
        if (resource === 'mcp') return (await client.mcp.list({ location }, options)).data;
        // Skill bodies can be large; this view only needs catalog metadata.
        return (await client.skill.list({ location }, options)).data.map(
          ({ id, name, description }) => ({ id, name, description }),
        );
      }),
    );
  });
  app.post('/api/sessions/:id/model', async (c) => {
    const input = modelInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ message: 'Choose a model and a supported thinking level.' }, 400);
    await backend.request(c.req.raw.signal, (client, options) =>
      client.session.switchModel(
        { sessionID: c.req.param('id'), model: input.data.model },
        options,
      ),
    );
    return c.json({ ok: true });
  });
  app.get('/api/sessions/active', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) => client.session.active(options)),
    ),
  );
  app.get('/api/sessions/:id', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.session.get({ sessionID: c.req.param('id') }, options),
      ),
    ),
  );
  app.use('/api/sessions/:id/view', bodyLimit({ maxSize: 1024 }));
  app.post('/api/sessions/:id/view', async (c) => {
    const input = sessionViewSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ message: 'Choose the observed reply to mark as read.' }, 400);
    await backend.request(c.req.raw.signal, (client, options) =>
      client.session.view({ sessionID: c.req.param('id'), idle: input.data.idle }, options),
    );
    return c.json({ ok: true });
  });
  app.get('/api/sessions/:id/messages', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.message.list(
          { sessionID: c.req.param('id'), limit: 50, cursor: c.req.query('cursor') },
          options,
        ),
      ),
    ),
  );
  app.get('/api/sessions/:id/subagents', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, async (client, options) => {
        const cursor = c.req.query('cursor');
        const parentID = c.req.param('id');
        const pageSize = 100;
        const page = await client.session.list(
          {
            parentID,
            limit: pageSize,
            ...(cursor ? { cursor } : { order: 'asc' as const }),
          },
          options,
        );
        // Native cursors mark an anchor, not whether another page exists.
        // Probe only full pages, preserving OpenCode's opaque cursor unchanged.
        const next =
          page.data.length === pageSize &&
          page.cursor.next &&
          (await client.session.list({ parentID, limit: 1, cursor: page.cursor.next }, options))
            .data.length
            ? page.cursor.next
            : undefined;
        return { ...page, cursor: { ...page.cursor, next } };
      }),
    ),
  );
  app.get('/api/sessions/:id/inbox', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.session.inbox.list({ sessionID: c.req.param('id') }, options),
      ),
    ),
  );
  app.use(
    '/api/sessions/:id/prompt',
    bodyLimit({
      // Allow every valid attachment combination, including base64 expansion and JSON metadata.
      maxSize: MAX_ATTACHMENTS * (Math.ceil(MAX_FILE_BYTES / 3) * 4 + 16_384) + 2_000_000,
      onError: (c) => c.json({ message: 'Message exceeds the attachment request limit.' }, 413),
    }),
  );
  app.post('/api/sessions/:id/prompt', async (c) => {
    const input = promptInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ message: input.error.issues[0]?.message ?? 'Invalid message.' }, 400);
    return c.json(
      await backend.request(c.req.raw.signal, async (client, options) => {
        const sessionID = c.req.param('id');
        const session = await client.session.get({ sessionID }, options);
        // V2 stages undo until the next explicit send; redo clears that stage.
        if (session.revert) await client.session.revert.commit({ sessionID }, options);
        if (session.agent !== 'build')
          await client.session.switchAgent({ sessionID, agent: 'build' }, options);
        const model = input.data.model;
        if (
          model &&
          (session.model?.id !== model.id ||
            session.model?.providerID !== model.providerID ||
            (session.model?.variant ?? 'default') !== (model.variant ?? 'default'))
        ) {
          await client.session.switchModel({ sessionID, model }, options);
        }
        if (input.data.command) {
          await client.session.command(
            { sessionID, name: input.data.command, text: input.data.text, files: input.data.files },
            options,
          );
          return null;
        }
        return client.session.prompt(
          {
            sessionID,
            text: input.data.text,
            files: input.data.files,
            skills: input.data.skill ? [{ id: input.data.skill }] : undefined,
          },
          options,
        );
      }),
    );
  });
  app.post('/api/sessions/:id/interrupt', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.session.interrupt({ sessionID: c.req.param('id') }, options),
      ),
    ),
  );
  app.get('/api/sessions/:id/permissions', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.permission.list({ sessionID: c.req.param('id') }, options),
      ),
    ),
  );
  app.post('/api/sessions/:id/permissions/:requestID', async (c) => {
    const input = permissionReplySchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Choose a permission response.' }, 400);
    await backend.request(c.req.raw.signal, (client, options) =>
      client.permission.reply(
        {
          sessionID: c.req.param('id'),
          requestID: c.req.param('requestID'),
          decision: input.data.decision,
        },
        options,
      ),
    );
    return c.json({ ok: true });
  });
  app.get('/api/sessions/:id/forms', async (c) =>
    c.json(
      await backend.request(c.req.raw.signal, (client, options) =>
        client.session.form.list({ sessionID: c.req.param('id') }, options),
      ),
    ),
  );
  app.post('/api/sessions/:id/forms/:formID', async (c) => {
    const input = formReplySchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Check your answers.' }, 400);
    await backend.request(c.req.raw.signal, (client, options) =>
      client.session.form.reply(
        { sessionID: c.req.param('id'), formID: c.req.param('formID'), answer: input.data.answer },
        options,
      ),
    );
    return c.json({ ok: true });
  });
  app.delete('/api/sessions/:id/forms/:formID', async (c) => {
    await backend.request(c.req.raw.signal, (client, options) =>
      client.session.form.cancel(
        { sessionID: c.req.param('id'), formID: c.req.param('formID') },
        options,
      ),
    );
    return c.json({ ok: true });
  });

  app.get('/api/session-search', async (c) => {
    const search = c.req.query('search')?.trim() ?? '';
    if (search.length > 256) return c.json({ message: 'Search with up to 256 characters.' }, 400);
    return c.json(
      await backend.sessions(
        undefined,
        c.req.query('cursor'),
        c.req.raw.signal,
        search || undefined,
      ),
    );
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
          if (event.type === 'filesystem.changed' || event.type === 'vcs.branch.updated')
            workspace.invalidate();
          await stream.writeSSE({
            event: event.type === 'server.connected' ? 'ready' : 'opencode',
            data: JSON.stringify(event),
            retry: 3000,
          });
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
