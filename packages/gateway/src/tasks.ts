import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { JsonValue } from '@opencode/client';
import type { z } from 'zod';
import type { CanvasTasks } from '@opencodex/contracts/canvas';
import {
  taskCreateSchema,
  taskPrompt,
  taskStartSchema,
  taskUpdateSchema,
  type ModelRef,
  type SessionInfo,
  type Task,
  type TaskProject,
} from '@opencodex/contracts';
import { GatewayError } from './errors';
import type { OpenCodeBackend } from './opencode';
import { installPlugin, pluginStatus, type PluginFile } from './plugin-files';
import { TASKS_PLUGIN } from './tasks-plugin.generated';

const RPC_ID = 'opencodex.tasks';
export const TASKS_PLUGIN_FILE: PluginFile = {
  id: RPC_ID,
  file: 'opencodex-tasks.js',
  header: '// OpenCodex tasks plugin',
  source: TASKS_PLUGIN.source,
  feature: 'tasks plugin',
};

/** How a task's agent chat is opened: the same session creation and send as the composer. */
export type TaskChats = {
  create(signal: AbortSignal, directory: string, model?: ModelRef): Promise<SessionInfo>;
  prompt(signal: AbortSignal, sessionID: string, text: string, model?: ModelRef): Promise<unknown>;
};

export type TaskService = ReturnType<typeof createTaskService>;

/**
 * Tasks live in OpenCode's plugin storage; the installed plugin serves them over native RPC.
 * The routes, canvas servers, and previews all go through these operations.
 */
export function createTaskService(backend: OpenCodeBackend, chats: TaskChats) {
  const call = <T>(signal: AbortSignal, method: string, input: JsonValue = {}) =>
    backend.request(signal, async (client, options) => {
      try {
        return (await client.rpc.call({ rpcID: RPC_ID, method, input }, options)).output as T;
      } catch (error) {
        throw rpcError(error) ?? error;
      }
    });

  // Pages name a project by folder or name; the plugin stores the native project.
  const resolve = async (signal: AbortSignal, value: TaskProject | string | null | undefined) => {
    if (typeof value !== 'string') return value;
    const projects = await backend.request(signal, (client, options) =>
      client.project.list(options),
    );
    const project =
      projects.find((item) => item.canonical === value) ??
      projects.find((item) => item.name === value) ??
      projects.find((item) => item.canonical.split(/[\\/]/).at(-1) === value);
    if (!project) throw new GatewayError(`No project matches “${value}”.`, 400);
    return { id: project.id, directory: project.canonical } satisfies TaskProject;
  };

  const invalid = (error: z.ZodError) =>
    new GatewayError(error.issues[0]?.message ?? 'Invalid task.', 400);

  const service = {
    list: async (signal: AbortSignal) => (await call<{ tasks: Task[] }>(signal, 'list')).tasks,
    /** The board for a canvas page: its tasks, or why it can't be read. */
    snapshot: (signal: AbortSignal): Promise<CanvasTasks> =>
      service.list(signal).then(
        (tasks) => ({ tasks }),
        (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
      ),
    async create(signal: AbortSignal, value: unknown) {
      const input = taskCreateSchema.safeParse(value);
      if (!input.success) throw invalid(input.error);
      const project = await resolve(signal, input.data.project);
      return call<Task>(signal, 'create', json({ ...input.data, project }));
    },
    async update(signal: AbortSignal, id: string, value: unknown) {
      const input = taskUpdateSchema.safeParse(value);
      if (!input.success) throw invalid(input.error);
      const project = await resolve(signal, input.data.project);
      return call<Task>(signal, 'update', json({ ...input.data, project, id }));
    },
    async remove(signal: AbortSignal, id: string) {
      await call(signal, 'remove', { id });
      return { ok: true as const };
    },
    /**
     * Starts an agent on the task: a new chat in its project whose first message is the
     * task. The chat is linked before the send, so a failed send still leaves it on the card.
     */
    async start(signal: AbortSignal, id: string, value: unknown = {}) {
      const input = taskStartSchema.safeParse(value ?? {});
      if (!input.success) throw new GatewayError('Choose a model.', 400);
      const task = (await service.list(signal)).find((item) => item.id === id);
      if (!task) throw new GatewayError('That task no longer exists.', 404);
      if (!task.project) throw new GatewayError('Choose a project for the agent to work in.', 400);
      if (task.bucket === 'done') throw new GatewayError('Reopen the task first.', 400);
      const session = await chats.create(signal, task.project.directory, input.data.model);
      const updated = await call<Task>(signal, 'update', {
        id,
        assignee: 'agent',
        workSessionID: session.id,
        ...(task.bucket === 'today' ? {} : { bucket: 'today' }),
      });
      await chats.prompt(signal, session.id, taskPrompt(task), input.data.model);
      return { task: updated, session };
    },
  };
  return service;
}

export function taskRoutes(backend: OpenCodeBackend, tasks: TaskService) {
  const app = new Hono();
  const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => null);

  app.get('/plugin', async (c) =>
    c.json(await pluginStatus(backend, TASKS_PLUGIN_FILE, undefined, c.req.raw.signal)),
  );
  app.put('/plugin', async (c) => {
    await installPlugin(backend, TASKS_PLUGIN_FILE);
    return c.json({ ok: true });
  });
  app.get('/', async (c) => c.json(await tasks.list(c.req.raw.signal)));
  app.use('*', bodyLimit({ maxSize: 32_768 }));
  app.post('/', async (c) => c.json(await tasks.create(c.req.raw.signal, await body(c))));
  app.patch('/:id', async (c) =>
    c.json(await tasks.update(c.req.raw.signal, c.req.param('id'), await body(c))),
  );
  app.post('/:id/start', async (c) =>
    c.json(await tasks.start(c.req.raw.signal, c.req.param('id'), await body(c))),
  );
  app.delete('/:id', async (c) => c.json(await tasks.remove(c.req.raw.signal, c.req.param('id'))));
  return app;
}

/** Validated input; undefined fields are dropped on the way, as JSON drops them. */
const json = (value: object) => value as JsonValue;

function rpcError(error: unknown) {
  if (!(error instanceof Error) || (error as { _tag?: string })._tag !== 'RpcError') return;
  const type = (error as { type?: string }).type;
  if (type === 'not_found') return new GatewayError(error.message, 404);
  if (type === 'invalid') return new GatewayError(error.message, 400);
  if (type === 'rpc.unavailable' || type === 'rpc.method_not_found')
    return new GatewayError('Turn on Tasks to use the task board.', 409);
}
