/**
 * @opencodex/canvas/server: what a canvas's `server.ts` can use. Its exported async
 * functions run in a separate process started by OpenCodex. The view calls them with
 * `useFn`, the agent with `canvas_run`, and `triggers` on a schedule. Code does the
 * deterministic work; `oc.ask` and `oc.run` bring in OpenCode where judgment is needed.
 */

type Bridge = { request(op: string, input: unknown): Promise<unknown> };

function bridge(): Bridge {
  const value = (globalThis as { __opencodexServer?: Bridge }).__opencodexServer;
  if (!value) throw new Error('@opencodex/canvas/server only works inside a canvas server.');
  return value;
}

type Update<T> = (current: T) => T | Promise<T>;

/**
 * The canvas's data values, the same `data/<key>.json` files the view reads with
 * `useData`. Writes reach every open view live. Share a `types.ts` between `server.ts` and
 * the view so both sides agree on each value's shape.
 */
export const data = {
  /** The stored value, or `fallback` when it doesn't exist yet. */
  async get<T>(key: string, fallback: T): Promise<T> {
    const result = (await bridge().request('data.read', { key })) as { value?: unknown };
    return result.value === undefined ? fallback : (result.value as T);
  },
  /** Replaces the value. */
  async set<T>(key: string, value: T): Promise<void> {
    await bridge().request('data.write', { key, value });
  },
  /**
   * Reads, changes, and writes the value without losing a concurrent change from the view
   * or another function: on a conflict it reruns `change` with the newer value.
   */
  async update<T>(key: string, fallback: T, change: Update<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const current = (await bridge().request('data.read', { key })) as {
        value?: unknown;
        rev: string | null;
      };
      const next = await change(current.value === undefined ? fallback : (current.value as T));
      const result = (await bridge().request('data.write', {
        key,
        value: next,
        rev: current.rev,
      })) as { ok: boolean };
      if (result.ok) return next;
      if (attempt >= 8) throw new Error(`data.update('${key}') kept conflicting; try again.`);
    }
  },
};

export class ShellError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'ShellError';
  }
}

export type ShellOptions = {
  /** Working directory; defaults to the home folder. */
  cwd?: string;
  /** Text written to the command's stdin. */
  input?: string;
  /** Milliseconds before the command is stopped. Default 120000. */
  timeout?: number;
};

/**
 * Runs a command in the user's login shell (so `gh`, `git`, and their PATH work) and
 * returns its stdout. A nonzero exit throws a `ShellError` with stdout and stderr.
 */
export async function sh(command: string, options: ShellOptions = {}): Promise<string> {
  const result = (await bridge().request('sh', { command, ...options })) as {
    code: number | null;
    stdout: string;
    stderr: string;
  };
  if (result.code !== 0)
    throw new ShellError(
      `Command failed (${result.code ?? 'stopped'}): ${command}\n${result.stderr.trim().slice(-2000)}`,
      result.code,
      result.stdout,
      result.stderr,
    );
  return result.stdout;
}

/** Runs a command and parses its stdout as JSON, e.g. `gh pr list --json number,title`. */
sh.json = async function json<T = unknown>(command: string, options?: ShellOptions): Promise<T> {
  const stdout = await sh(command, options);
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`Command output isn’t JSON: ${command}\n${stdout.slice(0, 500)}`);
  }
};

/** A JSON shape that validates values and describes itself to the model. */
export interface Schema<T> {
  readonly json: Record<string, unknown>;
  readonly optional?: boolean;
  parse(value: unknown, path?: string): T;
}
export type Infer<S> = S extends Schema<infer T> ? T : never;
type Shape = Record<string, Schema<unknown>>;
type OptionalKey<S extends Shape> = {
  [K in keyof S]: S[K]['optional'] extends true ? K : never;
}[keyof S];
type ObjectOf<S extends Shape> = {
  [K in Exclude<keyof S, OptionalKey<S>>]: Infer<S[K]>;
} & { [K in OptionalKey<S>]?: Infer<S[K]> } extends infer O
  ? { [K in keyof O]: O[K] }
  : never;

const where = (path: string) => (path ? ` at ${path}` : '');
const described = (json: Record<string, unknown>, description?: string) =>
  description ? { ...json, description } : json;
function primitive<T>(type: string, description?: string): Schema<T> {
  return {
    json: described({ type }, description),
    parse(value, path = '') {
      const ok =
        type === 'integer'
          ? Number.isInteger(value)
          : type === 'number'
            ? typeof value === 'number' && Number.isFinite(value)
            : typeof value === type;
      if (!ok) throw new Error(`Expected ${type}${where(path)}, got ${JSON.stringify(value)}`);
      return value as T;
    },
  };
}

/** Schema builders for `oc.ask`'s structured answers. Each takes an optional description. */
export const s = {
  string: (description?: string) => primitive<string>('string', description),
  number: (description?: string) => primitive<number>('number', description),
  integer: (description?: string) => primitive<number>('integer', description),
  boolean: (description?: string) => primitive<boolean>('boolean', description),
  enum<const V extends readonly [string, ...string[]]>(
    values: V,
    description?: string,
  ): Schema<V[number]> {
    return {
      json: described({ type: 'string', enum: values }, description),
      parse(value, path = '') {
        if (!values.includes(value as string))
          throw new Error(
            `Expected one of ${values.join(', ')}${where(path)}, got ${JSON.stringify(value)}`,
          );
        return value as V[number];
      },
    };
  },
  array<T>(item: Schema<T>, description?: string): Schema<T[]> {
    return {
      json: described({ type: 'array', items: item.json }, description),
      parse(value, path = '') {
        if (!Array.isArray(value)) throw new Error(`Expected an array${where(path)}`);
        return value.map((entry, index) => item.parse(entry, `${path}[${index}]`));
      },
    };
  },
  object<S extends Shape>(shape: S, description?: string): Schema<ObjectOf<S>> {
    const keys = Object.keys(shape);
    return {
      json: described(
        {
          type: 'object',
          properties: Object.fromEntries(keys.map((key) => [key, shape[key]!.json])),
          required: keys.filter((key) => !shape[key]!.optional),
          additionalProperties: false,
        },
        description,
      ),
      parse(value, path = '') {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error(`Expected an object${where(path)}`);
        const input = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};
        for (const key of keys) {
          const field = shape[key]!;
          if (input[key] === undefined || input[key] === null) {
            if (field.optional) continue;
            throw new Error(`Missing ${path ? `${path}.` : ''}${key}`);
          }
          output[key] = field.parse(input[key], path ? `${path}.${key}` : key);
        }
        return output as ObjectOf<S>;
      },
    };
  },
  optional<T>(schema: Schema<T>): Schema<T | undefined> & { optional: true } {
    return { ...schema, optional: true, parse: (value, path) => schema.parse(value, path) };
  },
};

/**
 * `providerID/modelID`, e.g. `anthropic/claude-haiku-5-5`. Leave it out: by default calls use
 * the model the user picked for the app, or else the model of the chat that made it.
 */
export type Model = string;

export type AskOptions = {
  /** Data the prompt is about; sent as JSON after the prompt. */
  input?: unknown;
  model?: Model;
};

export type RunOptions = {
  /** Folder the agent works in, usually a repository. */
  project: string;
  model?: Model;
  /** Shown in the run log and the session list. */
  title?: string;
  /**
   * Continue the same session on later calls with this key, so the agent remembers earlier
   * work, e.g. `issue-123`. Without it every call starts fresh.
   */
  thread?: string;
  /**
   * OpenCode permission rules for the session, e.g.
   * `{ action: 'bash', resource: 'git push --force*', effect: 'deny' }`. A rule that asks
   * waits until someone answers in the session.
   */
  permissions?: { action: string; resource: string; effect: 'allow' | 'deny' | 'ask' }[];
};

export type RunResult = { text: string; sessionID: string };

/** OpenCode, for the parts code can't decide. */
export const oc = {
  /**
   * One model call without tools: classify, summarize, extract, decide. With `schema` the
   * answer is validated JSON of that shape; a malformed answer is retried once.
   */
  ask: (async (prompt: string, options: AskOptions & { schema?: Schema<unknown> } = {}) => {
    const { schema, ...rest } = options;
    let text = composeAsk(prompt, rest.input, schema);
    for (let attempt = 0; ; attempt++) {
      const answer = (await bridge().request('oc.ask', { prompt: text, model: rest.model })) as {
        text: string;
      };
      if (!schema) return answer.text;
      try {
        return schema.parse(JSON.parse(stripFence(answer.text)));
      } catch (error) {
        if (attempt >= 1)
          throw new Error(
            `oc.ask didn’t return valid JSON: ${(error as Error).message}\n${answer.text.slice(0, 500)}`,
          );
        text = `${composeAsk(prompt, rest.input, schema)}\n\nYour previous answer was invalid (${(error as Error).message}). Answer again with only the JSON.`;
      }
    }
  }) as {
    <T>(prompt: string, options: AskOptions & { schema: Schema<T> }): Promise<T>;
    (prompt: string, options?: AskOptions): Promise<string>;
  },
  /**
   * A full agent session with tools (shell, files, web, MCP) in `project`. Waits until the
   * agent finishes and returns its final message and the session, which the user can open.
   */
  async run(prompt: string, options: RunOptions): Promise<RunResult> {
    return (await bridge().request('oc.run', { prompt, ...options })) as RunResult;
  },
};

function composeAsk(prompt: string, input: unknown, schema?: Schema<unknown>) {
  let text = prompt;
  if (input !== undefined)
    text += `\n\nInput:\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``;
  if (schema)
    text += `\n\nAnswer with only a JSON value matching this JSON Schema, no prose or code fence:\n${JSON.stringify(schema.json)}`;
  return text;
}

function stripFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1]! : trimmed;
}

/** When OpenCodex runs functions on its own, while it's open. Missed runs catch up once. */
export type Trigger = {
  /** Interval like `30m`, `6h`, or `1d`. */
  every: string;
};
export type Triggers = Record<string, Trigger>;
