/**
 * OpenCode plugin installed by OpenCodex. It owns the task board: tasks are stored in
 * OpenCode's plugin storage, the gateway reads and edits them through this plugin's RPC,
 * and agents can manage them with the `tasks` skill.
 *
 * The gateway installs this file verbatim into OpenCode's global plugins folder, so it must
 * stay self-contained: no runtime imports. Types below describe only the parts of the V2
 * plugin context this file uses.
 */

import type { Task, TaskBucket, TaskProject } from '@opencodex/contracts';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type RequestOptions = { signal?: AbortSignal };
type ToolInput = Record<string, unknown>;
type Schema = {
  '~standard': { version: 1; vendor: string; validate(value: unknown): { value: unknown } };
};
type Method = { input: Schema; output: Schema; errors: Record<string, Schema> };
type Raise = { error(type: string, message: string): Error };
type Context = {
  location?: { project?: { id?: string; canonical?: string } };
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: Json): Promise<void>;
    remove(key: string): Promise<void>;
    scan(input: {
      prefix: string;
      after?: string;
      limit?: number;
    }): Promise<{ entries: { key: string; value: unknown }[]; next?: string }>;
  };
  rpc: {
    register(
      definition: {
        id: string;
        methods: Record<string, Method>;
        events: Record<string, { schema: Schema }>;
      },
      handlers: Record<string, (input: unknown, raise: Raise) => Promise<Json>>,
    ): Promise<{ events: { emit(name: string, data: Json): Promise<void> } }>;
  };
  skill: {
    transform(
      callback: (draft: {
        add(skill: {
          id: string;
          name: string;
          description: string;
          path: string;
          content: string;
        }): void;
      }) => void,
    ): Promise<unknown>;
  };
  session: {
    get(
      input: { sessionID: string },
      options?: RequestOptions,
    ): Promise<{ projectID: string; location: { directory: string } }>;
    hook(
      name: 'context',
      callback: (event: {
        sessionID: string;
        messages?: unknown[];
        tools: Record<string, unknown>;
      }) => Promise<void> | void,
    ): Promise<unknown>;
  };
  tool: {
    transform(
      callback: (editor: {
        add(tool: {
          name: string;
          description: string;
          input: Record<string, unknown>;
          options?: { codemode: boolean };
          execute: (
            input: ToolInput,
            context: { sessionID: string; signal: AbortSignal },
          ) => Promise<{ content: string }>;
        }): void;
      }) => void,
    ): Promise<unknown>;
  };
};
type Origin = { source: Task['source']; sessionID?: string };

const RPC_ID = 'opencodex.tasks';
const PREFIX = 'task:';
const RETENTION = 14 * 24 * 60 * 60 * 1000;
const MAX_TASKS = 2_000;
const BUCKETS = ['today', 'week', 'someday', 'done'] as const;
const LABELS: Record<TaskBucket, string> = {
  today: 'Today',
  week: 'This week',
  someday: 'Someday',
  done: 'Done',
};
// Present only in the skill body, so finding it in a session's context means the skill loaded.
const MARKER = 'opencodex-tasks-skill';
const TOOLS = ['tasks_list', 'tasks_add', 'tasks_update', 'tasks_delete'];
// Direct tools, not Code Mode catalog entries, so the context hook can hide them.
const OPTIONS = { codemode: false };
const ANY: Schema = {
  '~standard': { version: 1, vendor: 'opencodex', validate: (value) => ({ value }) },
};
const METHOD: Method = { input: ANY, output: ANY, errors: { invalid: ANY, not_found: ANY } };

class TaskError extends Error {
  constructor(
    readonly type: 'invalid' | 'not_found',
    message: string,
  ) {
    super(message);
  }
}

export default {
  id: RPC_ID,
  async setup(ctx: Context) {
    async function all() {
      const tasks: Task[] = [];
      const expired: string[] = [];
      const cutoff = Date.now() - RETENTION;
      let after: string | undefined;
      do {
        const page = await ctx.storage.scan({ prefix: PREFIX, after, limit: 1000 });
        for (const { key, value } of page.entries) {
          const task = value as Task;
          if (task.bucket === 'done' && (task.time.completed ?? task.time.moved) < cutoff)
            expired.push(key);
          else tasks.push(task);
        }
        after = page.next;
      } while (after);
      // Deleting on read keeps retention exact without a timer.
      await Promise.all(expired.map((key) => ctx.storage.remove(key)));
      return tasks;
    }

    async function find(id: string) {
      const task = (await ctx.storage.get(PREFIX + id)) as Task | undefined;
      if (!task) throw new TaskError('not_found', 'That task no longer exists.');
      return task;
    }

    function last(tasks: Task[], bucket: TaskBucket) {
      return tasks.reduce(
        (max, task) => (task.bucket === bucket ? Math.max(max, task.order) : max),
        0,
      );
    }

    async function save(task: Task) {
      await ctx.storage.set(PREFIX + task.id, task as unknown as Json);
      await rpc.events.emit('changed', { id: task.id });
      return task;
    }

    async function create(input: Record<string, unknown>, origin: Origin) {
      const tasks = await all();
      if (tasks.length >= MAX_TASKS)
        throw new TaskError('invalid', `The board holds up to ${MAX_TASKS} tasks.`);
      const bucket = openBucket(input.bucket) ?? 'today';
      const now = Date.now();
      return save({
        id: `tsk_${now.toString(36)}${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
        title: title(input.title),
        ...(input.notes ? { notes: notes(input.notes) } : {}),
        bucket,
        order: last(tasks, bucket) + 1,
        ...(input.project ? { project: project(input.project) } : {}),
        source: origin.source,
        ...(origin.sessionID ? { sessionID: origin.sessionID } : {}),
        time: { created: now, updated: now, moved: now },
      });
    }

    async function update(id: string, input: Record<string, unknown>) {
      const task = { ...(await find(id)) };
      const now = Date.now();
      if (input.title !== undefined) task.title = title(input.title);
      if (input.notes !== undefined) {
        const text = notes(input.notes);
        if (text) task.notes = text;
        else delete task.notes;
      }
      if (input.project !== undefined) {
        if (input.project === null) delete task.project;
        else task.project = project(input.project);
      }
      const bucket = input.bucket === undefined ? task.bucket : bucketOf(input.bucket);
      if (bucket !== task.bucket) {
        if (bucket === 'done') {
          task.reopen = task.bucket as Exclude<TaskBucket, 'done'>;
          task.time.completed = now;
        } else {
          delete task.reopen;
          delete task.time.completed;
        }
        task.bucket = bucket;
        task.time.moved = now;
        if (typeof input.order !== 'number') task.order = last(await all(), bucket) + 1;
      }
      if (typeof input.order === 'number' && Number.isFinite(input.order)) task.order = input.order;
      task.time = { ...task.time, updated: now };
      return save(task);
    }

    async function remove(id: string) {
      await find(id);
      await ctx.storage.remove(PREFIX + id);
      await rpc.events.emit('changed', { id });
    }

    const handle =
      (run: (input: Record<string, unknown>) => Promise<Json>) =>
      async (input: unknown, raise: Raise) => {
        try {
          return await run(
            input && typeof input === 'object' ? (input as Record<string, unknown>) : {},
          );
        } catch (error) {
          if (error instanceof TaskError) throw raise.error(error.type, error.message);
          throw error;
        }
      };
    const rpc = await ctx.rpc.register(
      {
        id: RPC_ID,
        methods: { list: METHOD, create: METHOD, update: METHOD, remove: METHOD },
        events: { changed: { schema: ANY } },
      },
      {
        list: handle(async () => ({ tasks: (await all()) as unknown as Json })),
        create: handle(
          async (input) => (await create(input, { source: 'user' })) as unknown as Json,
        ),
        update: handle(async (input) => (await update(String(input.id), input)) as unknown as Json),
        remove: handle(async (input) => {
          await remove(String(input.id));
          return { ok: true };
        }),
      },
    );

    await ctx.skill.transform((draft) => {
      draft.add({
        id: 'tasks',
        name: 'tasks',
        description:
          'Use only when the user explicitly asks to see or change their personal task list (Today, This week, Someday). Not for planning or tracking steps of the current work.',
        path: new URL(import.meta.url).pathname,
        content: SKILL,
      });
    });

    async function chatProject(sessionID: string, signal: AbortSignal): Promise<TaskProject> {
      const session = await ctx.session.get({ sessionID }, { signal });
      const current = ctx.location?.project;
      return {
        id: session.projectID,
        directory:
          current?.id === session.projectID && current.canonical
            ? current.canonical
            : session.location.directory,
      };
    }
    async function projectInput(value: unknown, sessionID: string, signal: AbortSignal) {
      if (value === 'current') return chatProject(sessionID, signal);
      if (value === 'none') return null;
      return undefined;
    }
    const tool =
      (
        run: (
          input: ToolInput,
          context: { sessionID: string; signal: AbortSignal },
        ) => Promise<string>,
      ) =>
      async (input: ToolInput, context: { sessionID: string; signal: AbortSignal }) => {
        try {
          return { content: await run(input, context) };
        } catch (error) {
          if (error instanceof TaskError) return { content: `Error: ${error.message}` };
          throw error;
        }
      };
    const projectField = {
      type: 'string',
      enum: ['current', 'none'],
      description:
        "'current' links the task to this chat's project; 'none' leaves it without a project.",
    };
    const bucketField = {
      type: 'string',
      enum: ['today', 'week', 'someday'],
      description: "'today', 'week' (this week), or 'someday'.",
    };

    await ctx.tool.transform((editor) => {
      editor.add({
        name: 'tasks_list',
        options: OPTIONS,
        description: "List the user's tasks with their IDs, grouped by list.",
        input: {
          type: 'object',
          additionalProperties: false,
          properties: {
            includeDone: {
              type: 'boolean',
              description: 'Include tasks completed in the last two weeks. Defaults to false.',
            },
          },
        },
        execute: tool(async (input) => describe(await all(), input.includeDone === true)),
      });
      editor.add({
        name: 'tasks_add',
        options: OPTIONS,
        description: "Add a task to the user's task list.",
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'list'],
          properties: {
            title: { type: 'string', description: 'Short, actionable title.' },
            notes: { type: 'string', description: 'Optional details.' },
            list: bucketField,
            project: projectField,
          },
        },
        execute: tool(async (input, context) => {
          const task = await create(
            {
              title: input.title,
              notes: input.notes,
              bucket: input.list,
              project: await projectInput(input.project, context.sessionID, context.signal),
            },
            { source: 'agent', sessionID: context.sessionID },
          );
          return `Added "${task.title}" to ${LABELS[task.bucket]} (id: ${task.id}).`;
        }),
      });
      editor.add({
        name: 'tasks_update',
        options: OPTIONS,
        description:
          "Edit, move, complete, or reopen one of the user's tasks. Move it to 'done' to complete it.",
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Task ID from tasks_list.' },
            title: { type: 'string' },
            notes: {
              type: 'string',
              description: 'Replaces the notes; an empty string clears them.',
            },
            list: {
              ...bucketField,
              enum: [...BUCKETS],
              description: `${bucketField.description} Use 'done' to complete it.`,
            },
            project: projectField,
          },
        },
        execute: tool(async (input, context) => {
          const task = await update(String(input.id), {
            title: input.title,
            notes: input.notes,
            bucket: input.list,
            project: await projectInput(input.project, context.sessionID, context.signal),
          });
          return `Updated "${task.title}" (${LABELS[task.bucket]}).`;
        }),
      });
      editor.add({
        name: 'tasks_delete',
        options: OPTIONS,
        description:
          "Delete one of the user's tasks permanently. Prefer completing it unless the user asks to delete it.",
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: { type: 'string', description: 'Task ID from tasks_list.' } },
        },
        execute: tool(async (input) => {
          const task = await find(String(input.id));
          await remove(task.id);
          return `Deleted "${task.title}".`;
        }),
      });
    });

    // Sessions that loaded the skill, and how many context messages were already searched.
    const enabled = new Set<string>();
    const searched = new Map<string, number>();
    await ctx.session.hook('context', (event) => {
      if (!enabled.has(event.sessionID)) {
        const messages = event.messages ?? [];
        // Compaction can shorten the context; search it again from the start.
        let start = searched.get(event.sessionID) ?? 0;
        if (start > messages.length) start = 0;
        if (messages.slice(start).some((message) => JSON.stringify(message).includes(MARKER))) {
          enabled.add(event.sessionID);
          searched.delete(event.sessionID);
        } else {
          if (searched.size >= 500 && !searched.has(event.sessionID))
            searched.delete(searched.keys().next().value!);
          searched.set(event.sessionID, messages.length);
        }
      }
      if (enabled.has(event.sessionID)) return;
      for (const name of TOOLS) delete event.tools[name];
    });
  },
};

function title(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new TaskError('invalid', 'Enter a task title.');
  if (text.length > 500) throw new TaskError('invalid', 'Keep task titles under 500 characters.');
  return text;
}

function notes(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > 10_000) throw new TaskError('invalid', 'Keep notes under 10,000 characters.');
  return text;
}

function bucketOf(value: unknown): TaskBucket {
  if (BUCKETS.includes(value as TaskBucket)) return value as TaskBucket;
  throw new TaskError('invalid', "Choose 'today', 'week', 'someday', or 'done'.");
}

function openBucket(value: unknown) {
  if (value === undefined) return undefined;
  const bucket = bucketOf(value);
  if (bucket === 'done') throw new TaskError('invalid', 'New tasks start in an open list.');
  return bucket;
}

function project(value: unknown): TaskProject {
  const input = value as Partial<TaskProject>;
  if (typeof input?.id !== 'string' || !input.id || typeof input.directory !== 'string')
    throw new TaskError('invalid', 'Choose a project.');
  return { id: input.id, directory: input.directory };
}

function describe(tasks: Task[], done: boolean) {
  const today = new Date().setHours(0, 0, 0, 0);
  const lines: string[] = [];
  for (const bucket of BUCKETS) {
    if (bucket === 'done' && !done) continue;
    const items = tasks
      .filter((task) => task.bucket === bucket)
      .sort((a, b) =>
        bucket === 'done' ? (b.time.completed ?? 0) - (a.time.completed ?? 0) : a.order - b.order,
      );
    lines.push(`${LABELS[bucket]} (${items.length})`);
    for (const task of items) {
      const details = [`id: ${task.id}`];
      if (task.project)
        details.push(`project: ${task.project.directory.split(/[\\/]/).filter(Boolean).at(-1)}`);
      const late = Math.round(
        (today - new Date(task.time.moved).setHours(0, 0, 0, 0)) / 86_400_000,
      );
      if (bucket === 'today' && late > 0)
        details.push(`delayed ${late} day${late === 1 ? '' : 's'}`);
      lines.push(`- ${task.title} (${details.join(', ')})`);
      if (task.notes) lines.push(`  Notes: ${task.notes.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  }
  return lines.join('\n');
}

const SKILL = `<!-- ${MARKER} -->
# Tasks

The user keeps a personal task board in OpenCodex with three open lists and a Done list:

- **Today**: what they plan to do today. Tasks left over from earlier days stay here and show as delayed.
- **This week** (\`week\`): later this week.
- **Someday**: no date yet.
- **Done**: completed tasks. They are deleted automatically two weeks after completion.

Tasks may belong to a project. Use \`project: "current"\` only when the task is about the project this chat is working in, or when the user asks for it.

Tools (available once this skill is loaded):

- \`tasks_list\` shows tasks with their IDs. Call it before updating or deleting so you use the right ID.
- \`tasks_add\` adds a task. If the user doesn't say when, use \`someday\`.
- \`tasks_update\` renames, edits notes, moves between lists, or completes a task (\`list: "done"\`). Moving a done task to an open list reopens it.
- \`tasks_delete\` deletes a task. Prefer completing a task unless the user asks to delete it.

Only change tasks the user asked about. After changing tasks, briefly confirm what changed.`;
