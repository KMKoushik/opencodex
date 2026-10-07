import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { JsonValue } from '@opencode/client';
import { taskCreateSchema, taskUpdateSchema, type Task } from '@opencodex/contracts';
import { GatewayError } from './errors';
import type { OpenCodeBackend } from './opencode';
import { installPlugin, pluginStatus, type PluginFile } from './plugin-files';
import { TASKS_PLUGIN } from './tasks-plugin.generated';

const RPC_ID = 'opencodex.tasks';
const PLUGIN: PluginFile = {
  id: RPC_ID,
  file: 'opencodex-tasks.js',
  header: '// OpenCodex tasks plugin',
  source: TASKS_PLUGIN.source,
  feature: 'tasks plugin',
};

/** Tasks live in OpenCode's plugin storage; the installed plugin serves them over native RPC. */
export function taskRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  const call = <T>(signal: AbortSignal, method: string, input: JsonValue = {}) =>
    backend.request(signal, async (client, options) => {
      try {
        return (await client.rpc.call({ rpcID: RPC_ID, method, input }, options)).output as T;
      } catch (error) {
        throw rpcError(error) ?? error;
      }
    });

  app.get('/plugin', async (c) =>
    c.json(await pluginStatus(backend, PLUGIN, undefined, c.req.raw.signal)),
  );
  app.put('/plugin', async (c) => {
    await installPlugin(backend, PLUGIN);
    return c.json({ ok: true });
  });
  app.get('/', async (c) =>
    c.json((await call<{ tasks: Task[] }>(c.req.raw.signal, 'list')).tasks),
  );
  app.use('*', bodyLimit({ maxSize: 32_768 }));
  app.post('/', async (c) => {
    const input = taskCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ message: input.error.issues[0]?.message ?? 'Invalid task.' }, 400);
    return c.json(await call<Task>(c.req.raw.signal, 'create', input.data));
  });
  app.patch('/:id', async (c) => {
    const input = taskUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ message: input.error.issues[0]?.message ?? 'Invalid task.' }, 400);
    return c.json(
      await call<Task>(c.req.raw.signal, 'update', { ...input.data, id: c.req.param('id') }),
    );
  });
  app.delete('/:id', async (c) => {
    await call(c.req.raw.signal, 'remove', { id: c.req.param('id') });
    return c.json({ ok: true });
  });
  return app;
}

function rpcError(error: unknown) {
  if (!(error instanceof Error) || (error as { _tag?: string })._tag !== 'RpcError') return;
  const type = (error as { type?: string }).type;
  if (type === 'not_found') return new GatewayError(error.message, 404);
  if (type === 'invalid') return new GatewayError(error.message, 400);
  if (type === 'rpc.unavailable' || type === 'rpc.method_not_found')
    return new GatewayError('Turn on Tasks to use the task board.', 409);
}
