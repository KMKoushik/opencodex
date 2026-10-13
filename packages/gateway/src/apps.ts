import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { OpenCodeClient } from '@opencode/client';
import { APP_SESSION_KEY } from '@opencodex/contracts';
import {
  appModelRefSchema,
  type AppCall,
  type AppInfo,
  type AppModel,
  type AppModelRef,
  type AppModelSource,
  type AppRun,
  type CanvasEvent,
} from '@opencodex/contracts/canvas';
import { GatewayError } from './errors';
import type { OpenCodeBackend } from './opencode';
import { folder, listCanvases, readServerSource, readValue, SERVER, writeValue } from './canvases';
import { CANVAS_SERVER_HOST } from './canvas-runtime.generated';
import { originalLine } from './canvas-build';

type Loaded = { functions: string[]; triggers: Record<string, { every: string }>; error?: string };
type Source = NonNullable<Awaited<ReturnType<typeof readServerSource>>>;
type Request = { id: number; call?: string; op: string; input: Record<string, unknown> };

const IDLE_MS = 2 * 60_000;
const MAX_RUNS = 40;
const MAX_LOG_LINES = 100;
const MAX_CALLS = 50;
const RUN_TIMEOUT = 6 * 60 * 60_000;
const ASK_TIMEOUT = 5 * 60_000;
const MAX_DELAY = 2 ** 31 - 1;

/** `30m`, `6h`, `1d` → milliseconds; at least a minute. */
export function parseEvery(every: string) {
  const match = every.trim().match(/^(\d+(?:\.\d+)?)\s*(m|h|d)$/);
  if (!match) return undefined;
  const ms = Number(match[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 'm'];
  return ms >= 60_000 ? ms : undefined;
}

/** One running `server.ts`: a child process that loads the files and runs calls. */
class Worker {
  readonly loaded: Promise<Loaded>;
  readonly abort = new AbortController();
  private readonly child: ChildProcess;
  private readonly calls = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  private idle?: ReturnType<typeof setTimeout>;
  private retired = false;
  private stderr = '';
  alive = true;

  constructor(
    readonly version: string,
    source: Source,
    cwd: string,
    private readonly handle: (worker: Worker, request: Request) => Promise<unknown>,
    private readonly log: (call: string | undefined, line: string) => void,
  ) {
    this.child = spawn(process.execPath, ['-e', CANVAS_SERVER_HOST], {
      cwd,
      // Electron runs the gateway; this makes its binary behave as plain Node.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-4000);
    });
    let settle: (value: Loaded) => void = () => {};
    this.loaded = new Promise((resolve) => (settle = resolve));
    this.child.on('message', (message: Record<string, unknown>) => {
      if (message.type === 'loaded') {
        const { functions, triggers, error } = message as unknown as Loaded;
        settle({ functions, triggers, ...(error ? { error } : {}) });
      } else if (message.type === 'log') this.log(message.call as string, String(message.line));
      else if (message.type === 'result') {
        const pending = this.calls.get(message.call as string);
        this.calls.delete(message.call as string);
        if (message.error !== undefined) pending?.reject(new Error(String(message.error)));
        else pending?.resolve(message.value);
        this.settled();
      } else if (message.type === 'request') {
        const request = message as unknown as Request;
        this.handle(this, request).then(
          (value) => this.send({ type: 'reply', id: request.id, value: value ?? null }),
          (error: unknown) =>
            this.send({
              type: 'reply',
              id: request.id,
              error: error instanceof Error ? error.message : String(error),
            }),
        );
      }
    });
    this.child.on('exit', (code, signal) => {
      this.alive = false;
      this.abort.abort();
      const reason = this.retired
        ? 'server.ts stopped.'
        : `server.ts exited (${signal ?? code}).${this.stderr ? `\n${this.stderr.trim()}` : ''}`;
      settle({ functions: [], triggers: {}, error: reason });
      for (const pending of this.calls.values()) pending.reject(new Error(reason));
      this.calls.clear();
    });
    this.send({ type: 'load', modules: source.modules, entry: source.entry });
    this.settled();
  }

  private send(message: unknown) {
    if (this.alive && this.child.connected) this.child.send(message as never);
  }

  call(call: string, name: string, args: unknown[]) {
    clearTimeout(this.idle);
    return new Promise<unknown>((resolve, reject) => {
      this.calls.set(call, { resolve, reject });
      this.send({ type: 'call', call, name, args });
    });
  }

  /** No calls left: stop now if replaced, otherwise after a while idle. */
  private settled() {
    if (this.calls.size) return;
    clearTimeout(this.idle);
    if (this.retired) this.stop();
    else this.idle = setTimeout(() => this.stop(), IDLE_MS);
  }

  /** server.ts changed: let running calls finish in the old version, then stop. */
  retire() {
    this.retired = true;
    this.settled();
  }

  stop() {
    clearTimeout(this.idle);
    this.retired = true;
    if (this.alive) this.child.kill();
  }
}

/**
 * Canvas apps: canvases with a `server.ts`. Runs their functions in a child process per app,
 * records each run in the canvas's `.app/runs.json`, answers their data and OpenCode
 * requests, and fires their triggers while the gateway runs.
 */
export class Apps {
  private readonly workers = new Map<string, Worker>();
  private readonly described = new Map<string, { version: string; loaded: Loaded }>();
  /** Runs in progress, by app and run id. */
  private readonly live = new Map<string, Map<string, AppRun>>();
  private readonly saving = new Map<string, Promise<unknown>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  private readonly announced = new Map<string, ReturnType<typeof setTimeout>>();
  /** A chat's project never changes, so each is looked up once. */
  private readonly projects = new Map<string, Promise<string | undefined>>();
  /** Apps being deleted: late writes from their runs must not recreate the folder. */
  private readonly removed = new Set<string>();
  private scheduling = false;

  constructor(
    private readonly backend: OpenCodeBackend,
    private readonly root: string,
    private readonly publish: (event: CanvasEvent) => void,
  ) {}

  private async source(id: string) {
    const source = await readServerSource(this.root, id);
    if (!source) throw new GatewayError(`This canvas has no ${SERVER}.`, 404);
    return source;
  }

  private worker(id: string, source: Source) {
    const existing = this.workers.get(id);
    if (existing?.alive && existing.version === source.version) return existing;
    existing?.retire();
    const worker = new Worker(
      source.version,
      source,
      folder(this.root, id),
      (worker, request) => this.request(id, worker, request),
      (call, line) => this.log(id, call, line),
    );
    this.workers.set(id, worker);
    return worker;
  }

  /** Functions and triggers of the current server.ts, loading it once per version. */
  async describe(id: string): Promise<Loaded> {
    const source = await this.source(id);
    const cached = this.described.get(id);
    if (cached?.version === source.version) return cached.loaded;
    const loaded = source.errors.length
      ? { functions: [], triggers: {}, error: source.errors.join('\n') }
      : await this.worker(id, source).loaded;
    this.described.set(id, { version: source.version, loaded });
    return loaded;
  }

  async call(id: string, name: string, args: unknown[], origin: AppRun['source']) {
    const source = await this.source(id);
    if (source.errors.length) throw new GatewayError(source.errors.join('\n'), 422);
    const worker = this.worker(id, source);
    const loaded = await worker.loaded;
    this.described.set(id, { version: source.version, loaded });
    if (loaded.error) throw new GatewayError(loaded.error, 422);
    if (!loaded.functions.includes(name))
      throw new GatewayError(
        `server.ts exports no function ${name}(). It exports: ${loaded.functions.join(', ') || 'nothing'}.`,
        404,
      );
    const run: AppRun = {
      id: randomUUID(),
      fn: name,
      source: origin,
      started: Date.now(),
      status: 'running',
      logs: [],
      sessions: [],
    };
    let runs = this.live.get(id);
    if (!runs) this.live.set(id, (runs = new Map()));
    runs.set(run.id, run);
    this.save(id, run);
    try {
      const value = await worker.call(run.id, name, args);
      run.status = 'ok';
      return value;
    } catch (error) {
      run.status = 'error';
      run.error = sourceLines((error as Error).message, source.maps).slice(0, 4000);
      throw new GatewayError(run.error, 422);
    } finally {
      run.ended = Date.now();
      runs.delete(run.id);
      if (!runs.size) this.live.delete(id);
      this.save(id, run);
    }
  }

  running(id: string) {
    return [...new Set([...(this.live.get(id)?.values() ?? [])].map((run) => run.fn))];
  }

  async runs(id: string): Promise<AppRun[]> {
    const stored = await readJSON<AppRun[]>(join(folder(this.root, id), '.app', 'runs.json'), []);
    const live = this.live.get(id);
    // A run the file calls running but no worker has was cut off by a restart.
    return stored.map((run) =>
      run.status === 'running' && !live?.has(run.id)
        ? { ...run, status: 'interrupted' as const }
        : (live?.get(run.id) ?? run),
    );
  }

  async list(): Promise<AppInfo[]> {
    const canvases = await listCanvases(this.root);
    const apps = await Promise.all(
      canvases.map(async (canvas) => {
        if (!(await exists(join(canvas.path, SERVER)))) return undefined;
        const [loaded, runs, projectID] = await Promise.all([
          this.describe(canvas.id).catch((error: Error): Loaded => ({
            functions: [],
            triggers: {},
            error: error.message,
          })),
          this.runs(canvas.id),
          canvas.sessionID ? this.project(canvas.sessionID) : undefined,
        ]);
        const [last] = runs;
        return {
          ...canvas,
          ...loaded,
          running: this.running(canvas.id),
          ...(projectID ? { projectID } : {}),
          ...(last ? { lastRun: withoutLogs(last) } : {}),
          runCount: runs.length,
        };
      }),
    );
    return apps.filter((app): app is AppInfo => Boolean(app));
  }

  private project(sessionID: string) {
    let project = this.projects.get(sessionID);
    if (!project) {
      project = this.backend
        .request(AbortSignal.timeout(10_000), (client, options) =>
          client.session.get({ sessionID }, options),
        )
        .then((session) => session.projectID);
      // A deleted chat or an unreachable OpenCode only hides the project badge; retry later.
      project.catch(() => this.projects.delete(sessionID));
      this.projects.set(sessionID, project);
    }
    return project.catch(() => undefined);
  }

  private log(id: string, call: string | undefined, line: string) {
    const run = call ? this.live.get(id)?.get(call) : undefined;
    if (!run) return;
    run.logs.push(line.slice(0, 1000));
    if (run.logs.length > MAX_LOG_LINES) run.logs.splice(0, run.logs.length - MAX_LOG_LINES);
    this.announce(id);
  }

  /** Coalesces run updates into one event per app every half second. */
  private announce(id: string) {
    if (this.announced.has(id)) return;
    this.announced.set(
      id,
      setTimeout(() => {
        this.announced.delete(id);
        this.publish({ type: 'app', id });
      }, 500),
    );
  }

  /** Writes one run into the app's log, newest first, one write at a time per app. */
  private save(id: string, run: AppRun) {
    const snapshot = structuredClone(run);
    const previous = this.saving.get(id) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (this.removed.has(id)) return;
      const directory = join(folder(this.root, id), '.app');
      const path = join(directory, 'runs.json');
      const runs = await readJSON<AppRun[]>(path, []);
      const index = runs.findIndex((item) => item.id === snapshot.id);
      if (index >= 0) runs[index] = snapshot;
      else runs.unshift(snapshot);
      await writeJSON(directory, path, runs.slice(0, MAX_RUNS));
    });
    const settled = next.catch(() => {});
    this.saving.set(id, settled);
    void settled.then(() => {
      if (this.saving.get(id) === settled) this.saving.delete(id);
      this.publish({ type: 'app', id });
    });
  }

  /** Data and OpenCode requests from a running server.ts. */
  private async request(id: string, worker: Worker, request: Request) {
    const input = request.input;
    const directory = folder(this.root, id);
    switch (request.op) {
      case 'data.read': {
        const key = String(input.key);
        const value = await readValue(directory, key).catch(() => undefined);
        if (!value) return { rev: null };
        return { value: JSON.parse(value.bytes.toString('utf8')), rev: value.rev };
      }
      case 'data.write': {
        const result = await writeValue(
          this.root,
          id,
          String(input.key),
          input.value,
          'rev' in input ? (input.rev as string | null) : undefined,
        );
        return { ok: result.ok };
      }
      case 'oc.ask': {
        const track = this.track(id, request.call, 'ask');
        return track.settle(
          this.opencode(
            worker,
            async (client, options) => {
              const resolved = await this.model(id, client, input.model, undefined, options);
              track.model(resolved);
              return client.generate.text(
                { prompt: String(input.prompt), model: resolved.model },
                options,
              );
            },
            ASK_TIMEOUT,
          ),
        );
      }
      case 'oc.run': {
        const track = this.track(id, request.call, 'run');
        return track.settle(this.ocRun(id, worker, request.call, input, track.model));
      }
      default:
        throw new Error(`Unknown request ${request.op}.`);
    }
  }

  /**
   * Records one model call on its run, so the run log shows which model answered. The run
   * is saved when the model is known and again when the call ends.
   */
  private track(id: string, call: string | undefined, kind: AppCall['kind']) {
    const run = call ? this.live.get(id)?.get(call) : undefined;
    const entry: AppCall = { kind, started: Date.now() };
    if (run) {
      run.calls ??= [];
      run.calls.push(entry);
      if (run.calls.length > MAX_CALLS) run.calls.splice(0, run.calls.length - MAX_CALLS);
    }
    const save = () => {
      if (run && this.live.get(id)?.has(run.id)) this.save(id, run);
    };
    return {
      model: (resolved: { model: AppModelRef; source: AppModelSource }) => {
        entry.model = modelName(resolved.model);
        entry.source = resolved.source;
        save();
      },
      settle: async <T>(result: Promise<T>) => {
        try {
          return await result;
        } catch (error) {
          entry.error = ((error as Error).message || 'Failed.').slice(0, 500);
          throw error;
        } finally {
          entry.ended = Date.now();
          save();
        }
      },
    };
  }

  /** OpenCode calls keep OpenCode's own error message, which server code can act on. */
  private opencode<T>(
    worker: Worker,
    operation: (client: OpenCodeClient, options: { signal: AbortSignal }) => Promise<T>,
    timeout: number,
  ) {
    return this.backend.request(
      worker.abort.signal,
      async (client, options) => {
        try {
          return await operation(client, options);
        } catch (error) {
          throw new GatewayError(
            (error as { message?: string }).message || 'OpenCode request failed.',
            502,
          );
        }
      },
      timeout,
    );
  }

  private async ocRun(
    id: string,
    worker: Worker,
    call: string | undefined,
    input: Record<string, unknown>,
    resolved: (model: { model: AppModelRef; source: AppModelSource }) => void,
  ) {
    const project = typeof input.project === 'string' ? input.project : '';
    if (!project) throw new Error('oc.run needs { project }: the folder the agent works in.');
    if (!(await exists(project))) throw new Error(`oc.run: ${project} doesn’t exist.`);
    const thread = typeof input.thread === 'string' && input.thread ? input.thread : undefined;
    const directory = join(folder(this.root, id), '.app');
    const threadsPath = join(directory, 'threads.json');
    const run = call ? this.live.get(id)?.get(call) : undefined;
    const prompt = String(input.prompt);
    const title =
      typeof input.title === 'string' && input.title.trim()
        ? input.title.trim()
        : prompt.split('\n')[0]!.slice(0, 80);
    return this.opencode(
      worker,
      async (client, options) => {
        let sessionID: string | undefined;
        if (thread) {
          sessionID = (await readJSON<Record<string, string>>(threadsPath, {}))[thread];
          if (sessionID) {
            const existing = await client.session
              .get({ sessionID }, options)
              .catch(() => (sessionID = undefined));
            // A continued thread keeps the model its session started with.
            if (existing?.model) resolved({ model: existing.model, source: 'thread' });
          }
        }
        if (!sessionID) {
          const model = await this.model(id, client, input.model, project, options);
          resolved(model);
          const session = await client.session.create(
            {
              location: { directory: project },
              agent: 'build',
              title,
              model: model.model,
              metadata: {
                [APP_SESSION_KEY]: {
                  canvas: id,
                  ...(call ? { run: call } : {}),
                  ...(thread ? { thread } : {}),
                },
              },
              ...(Array.isArray(input.permissions)
                ? { permissions: input.permissions as never }
                : {}),
            },
            options,
          );
          sessionID = session.id;
          await this.record(id, sessionID);
          if (thread) {
            const threads = await readJSON<Record<string, string>>(threadsPath, {});
            await writeJSON(directory, threadsPath, { ...threads, [thread]: sessionID });
          }
        }
        if (run) {
          run.sessions.push({ id: sessionID, title });
          this.save(id, run);
        }
        await client.session.prompt({ sessionID, text: prompt }, options);
        await client.session.wait({ sessionID }, options);
        const [last] = (
          await client.message.list(
            { sessionID, order: 'desc', limit: 1, type: 'assistant' },
            options,
          )
        ).data;
        if (last?.type !== 'assistant') return { text: '', sessionID };
        if (last.error)
          throw new Error(
            `The agent stopped with an error: ${(last.error as { message?: string }).message ?? JSON.stringify(last.error)}`,
          );
        const text = last.content
          .flatMap((part) => (part.type === 'text' ? [part.text] : []))
          .join('\n')
          .trim();
        return { text, sessionID };
      },
      RUN_TIMEOUT,
    );
  }

  /** Every session an app started, so deleting the app can remove them; runs.json is capped. */
  private async record(id: string, sessionID: string) {
    const previous = this.saving.get(id) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (this.removed.has(id)) return;
      const directory = join(folder(this.root, id), '.app');
      const path = join(directory, 'sessions.json');
      await writeJSON(directory, path, [...(await readJSON<string[]>(path, [])), sessionID]);
    });
    this.saving.set(
      id,
      next.catch(() => {}),
    );
    await next;
  }

  /**
   * Deletes an app or plain canvas: stops its process and triggers, removes the sessions it
   * started (they're hidden from the thread list and would be unreachable), then its folder.
   */
  async remove(id: string) {
    const directory = folder(this.root, id);
    this.clearTimers(id);
    this.workers.get(id)?.stop();
    this.workers.delete(id);
    this.described.delete(id);
    await this.saving.get(id);
    const sessions = new Set(
      await readJSON<string[]>(join(directory, '.app', 'sessions.json'), []),
    );
    for (const run of await this.runs(id))
      for (const session of run.sessions) sessions.add(session.id);
    // Fails before anything is deleted when OpenCode is unreachable, so a retry finds them.
    if (sessions.size)
      await this.backend.request(AbortSignal.timeout(60_000), (client, options) =>
        Promise.all(
          [...sessions].map((sessionID) =>
            client.session.remove({ sessionID }, options).catch(() => {}),
          ),
        ),
      );
    // Permanent: the stopped process can still end calls, and their writes must not
    // recreate the folder.
    this.removed.add(id);
    this.live.delete(id);
    await rm(directory, { recursive: true, force: true });
  }

  /**
   * The model a call uses: `providerID/modelID` named in the code; otherwise the app's own
   * setting; otherwise the model of the chat that made the app, read on every call so the
   * app follows that chat; otherwise OpenCode's default for `directory`.
   */
  private async model(
    id: string,
    client: OpenCodeClient,
    named: unknown,
    directory: string | undefined,
    options: { signal: AbortSignal },
  ): Promise<{ model: AppModelRef; source: AppModelSource }> {
    if (typeof named === 'string' && named.includes('/')) {
      const index = named.indexOf('/');
      return {
        model: { providerID: named.slice(0, index), id: named.slice(index + 1) },
        source: 'code',
      };
    }
    const fallback = await this.defaultModel(id, client, directory, options);
    if (!fallback.model) throw new Error('No model is configured in OpenCode. Pass { model }.');
    return { model: fallback.model, source: fallback.source as AppModelSource };
  }

  private async defaultModel(
    id: string,
    client: OpenCodeClient,
    directory: string | undefined,
    options: { signal: AbortSignal },
  ): Promise<AppModel> {
    const manifest = await readJSON<{ sessionID?: unknown; model?: unknown }>(
      join(folder(this.root, id), 'canvas.json'),
      {},
    );
    const chat =
      typeof manifest.sessionID === 'string'
        ? await client.session
            .get({ sessionID: manifest.sessionID }, options)
            .catch(() => undefined)
        : undefined;
    const where = chat?.location.directory ?? homedir();
    const picked = appModelRefSchema.safeParse(manifest.model);
    if (picked.success) return { model: picked.data, source: 'app', directory: where };
    if (chat?.model) return { model: chat.model, source: 'chat', directory: where };
    const fallback = await client.model.default(
      { location: { directory: directory ?? where } },
      options,
    );
    return fallback.data
      ? {
          model: { providerID: fallback.data.providerID, id: fallback.data.id },
          source: 'default',
          directory: where,
        }
      : { model: null, source: 'none', directory: where };
  }

  /** The model calls use when the code names none, for the app header. */
  appModel(id: string): Promise<AppModel> {
    folder(this.root, id);
    return this.backend.request(AbortSignal.timeout(10_000), (client, options) =>
      this.defaultModel(id, client, undefined, options),
    );
  }

  /** Saves the app's own model in canvas.json; null goes back to the chat's model. */
  async setModel(id: string, model: AppModelRef | null) {
    const directory = folder(this.root, id);
    const path = join(directory, 'canvas.json');
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new GatewayError('Canvas not found.', 404);
      throw new GatewayError('canvas.json isn’t valid JSON.', 422);
    }
    if (model) manifest.model = model;
    else delete manifest.model;
    await writeJSON(directory, path, manifest);
    this.publish({ type: 'app', id });
  }

  /** Runs each app's triggers while the gateway is up; overdue ones run once at start. */
  schedule(subscribe: (listener: (event: CanvasEvent) => void) => () => void) {
    if (this.scheduling) return () => {};
    this.scheduling = true;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const replanSoon = (id: string) => {
      clearTimeout(pending.get(id));
      pending.set(
        id,
        setTimeout(() => {
          pending.delete(id);
          void this.plan(id);
        }, 1_000),
      );
    };
    const all = () =>
      void listCanvases(this.root)
        .then((canvases) => {
          for (const id of this.timers.keys())
            if (!canvases.some((canvas) => canvas.id === id)) this.clearTimers(id);
          for (const canvas of canvases) replanSoon(canvas.id);
        })
        .catch(() => {});
    const unsubscribe = subscribe((event) => {
      if (event.type === 'source') replanSoon(event.id);
      else if (event.type === 'list') all();
    });
    all();
    return () => {
      this.scheduling = false;
      unsubscribe();
      for (const timer of pending.values()) clearTimeout(timer);
      for (const id of [...this.timers.keys()]) this.clearTimers(id);
    };
  }

  private clearTimers(id: string) {
    for (const timer of this.timers.get(id) ?? []) clearTimeout(timer);
    this.timers.delete(id);
  }

  private async plan(id: string) {
    this.clearTimers(id);
    if (!this.scheduling) return;
    if (!(await exists(join(folder(this.root, id), SERVER)))) return;
    const loaded = await this.describe(id).catch(() => undefined);
    const triggers = Object.entries(loaded?.triggers ?? {});
    if (!triggers.length) return;
    const runs = await this.runs(id);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const [name, trigger] of triggers) {
      const every = parseEvery(trigger.every);
      if (!every) continue;
      const last = runs.find((run) => run.fn === name)?.started;
      const delay = last === undefined ? 0 : Math.max(0, last + every - Date.now());
      timers.push(
        setTimeout(
          () => {
            const fire = this.running(id).includes(name)
              ? Promise.resolve()
              : this.call(id, name, [], 'trigger').catch(() => {});
            void fire.then(() => this.plan(id));
          },
          Math.min(delay, MAX_DELAY),
        ),
      );
    }
    this.timers.set(id, timers);
  }

  close() {
    for (const id of [...this.timers.keys()]) this.clearTimers(id);
    for (const worker of this.workers.values()) worker.stop();
    this.workers.clear();
  }
}

const modelName = (model: AppModelRef) =>
  `${model.providerID}/${model.id}${model.variant && model.variant !== 'default' ? `:${model.variant}` : ''}`;

/** A run for the apps list, which refreshes often; the run log loads logs on its own. */
function withoutLogs(run: AppRun): Omit<AppRun, 'logs'> {
  const summary: Partial<AppRun> = { ...run };
  delete summary.logs;
  return summary as Omit<AppRun, 'logs'>;
}

/** `file.ts:line:col` from the transpiled module → the line in the agent's source. */
function sourceLines(message: string, maps: Record<string, string>) {
  return message.replace(/\b([\w.-]+\.tsx?):(\d+):(\d+)/g, (match, file: string, line, column) => {
    // `new Function` puts two lines of its own before the module's code.
    const original = maps[file]
      ? originalLine(maps[file], Number(line) - 2, Number(column) - 1)
      : undefined;
    return original ? `${file}:${original}` : match;
  });
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function readJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(directory: string, path: string, value: unknown) {
  await mkdir(directory, { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
