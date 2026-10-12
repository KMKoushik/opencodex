import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  canvasCreateSchema,
  canvasDataWriteSchema,
  canvasIDSchema,
  canvasKeySchema,
  type CanvasData,
  type CanvasEvent,
  type CanvasInfo,
  type CanvasSource,
} from '@opencodex/contracts/canvas';
import { GatewayError } from './errors';
import { ALLOWED_IMPORTS, loadTypeScript, testRender, transpile, typeCheck } from './canvas-build';
import { CANVAS_RUNTIME } from './canvas-runtime.generated';

const MANIFEST = 'canvas.json';
const ENTRY = 'app.tsx';
const SOURCE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.(tsx|ts)$/;
const MAX_SOURCE_FILES = 40;
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_VALUE_BYTES = 2 * 1024 * 1024;
const MAX_DATA_BYTES = 16 * 1024 * 1024;

/** Canvases live outside projects: one folder each, edited by the agent's own file tools. */
export const CANVAS_ROOT = join(homedir(), '.opencodex', 'canvases');

const rev = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 16);

function folder(root: string, id: string) {
  if (!canvasIDSchema.safeParse(id).success) throw new GatewayError('Canvas not found.', 404);
  return join(root, id);
}

async function readManifest(directory: string, id: string): Promise<CanvasInfo> {
  let text: string;
  try {
    text = await readFile(join(directory, MANIFEST), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new GatewayError('Canvas not found.', 404);
    throw error;
  }
  let manifest: { title?: unknown; sessionID?: unknown; created?: unknown };
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new GatewayError(`${MANIFEST} isn’t valid JSON.`, 422);
  }
  const updated = await latestChange(directory);
  return {
    id,
    title: typeof manifest.title === 'string' && manifest.title.trim() ? manifest.title.trim() : id,
    path: directory,
    ...(typeof manifest.sessionID === 'string' ? { sessionID: manifest.sessionID } : {}),
    created: typeof manifest.created === 'number' ? manifest.created : updated,
    updated,
  };
}

async function latestChange(directory: string) {
  const entries = await readdir(directory).catch(() => [] as string[]);
  const times = await Promise.all(
    [...entries.filter((name) => SOURCE.test(name) || name === MANIFEST), 'data'].map((name) =>
      stat(join(directory, name)).then(
        (info) => info.mtimeMs,
        () => 0,
      ),
    ),
  );
  return Math.round(Math.max(0, ...times));
}

export async function listCanvases(root: string): Promise<CanvasInfo[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  const canvases = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && canvasIDSchema.safeParse(entry.name).success)
      .map((entry) => readManifest(join(root, entry.name), entry.name).catch(() => undefined)),
  );
  return canvases
    .filter((canvas): canvas is CanvasInfo => Boolean(canvas))
    .sort((a, b) => b.updated - a.updated);
}

const STARTER = (title: string) => `import { Stack, Text, Title } from '@opencodex/canvas';

export default function App() {
  return (
    <Stack>
      <Title>{${JSON.stringify(title)}}</Title>
      <Text muted>Replace this with the canvas.</Text>
    </Stack>
  );
}
`;

export async function createCanvas(root: string, input: { title: string; sessionID?: string }) {
  const slug =
    input.title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'canvas';
  const id = `${slug}-${randomBytes(2).toString('hex')}`;
  const directory = join(root, id);
  await mkdir(join(directory, 'data'), { recursive: true });
  await writeFile(
    join(directory, MANIFEST),
    `${JSON.stringify({ title: input.title, created: Date.now(), ...(input.sessionID ? { sessionID: input.sessionID } : {}) }, null, 2)}\n`,
    { flag: 'wx' },
  );
  await writeFile(join(directory, ENTRY), STARTER(input.title), { flag: 'wx' });
  await writeSdk(root);
  return readManifest(directory, id);
}

/** SDK declarations beside the canvases, so the agent can read exact component props. */
async function writeSdk(root: string) {
  const { CANVAS_TYPES, CANVAS_TYPES_VERSION } = await import('./canvas-types.generated');
  const directory = join(root, '.sdk');
  const marker = join(directory, '.version');
  if ((await readFile(marker, 'utf8').catch(() => '')) === CANVAS_TYPES_VERSION) return;
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const prefix = '/node_modules/@opencodex/canvas/';
  await Promise.all(
    Object.entries(CANVAS_TYPES)
      .filter(([path]) => path.startsWith(prefix) && path.endsWith('.d.ts'))
      .map(([path, text]) => writeFile(join(directory, path.slice(prefix.length)), text)),
  );
  await writeFile(marker, CANVAS_TYPES_VERSION);
}

async function readSourceFiles(directory: string) {
  const names = (await readdir(directory)).filter((name) => SOURCE.test(name)).sort();
  if (names.length > MAX_SOURCE_FILES)
    throw new GatewayError(`A canvas can have up to ${MAX_SOURCE_FILES} source files.`, 422);
  const files: Record<string, string> = {};
  for (const name of names) {
    const path = join(directory, name);
    if ((await stat(path)).size > MAX_SOURCE_BYTES)
      throw new GatewayError(`${name} is larger than 512 KB.`, 422);
    files[name] = await readFile(path, 'utf8');
  }
  return files;
}

async function buildSource(directory: string) {
  const files = await readSourceFiles(directory);
  const errors: string[] = [];
  if (!files[ENTRY]) errors.push(`${ENTRY} is missing. It must default-export the view.`);
  const ts = await loadTypeScript();
  const modules = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(
        async ([name, text]) => [name, await transpile(name, text)] as const,
      ),
    ),
  );
  for (const [name, module] of Object.entries(modules)) {
    errors.push(...module.errors);
    for (const { fileName } of ts.preProcessFile(files[name]!, true, true).importedFiles) {
      const local = fileName.startsWith('./') && !fileName.slice(2).includes('/');
      if (!ALLOWED_IMPORTS.has(fileName) && !local)
        errors.push(
          `${name}: can’t import '${fileName}'. Canvases can import react, @opencodex/canvas, and their own files (./name).`,
        );
    }
  }
  return { files, modules, errors };
}

export async function readSource(root: string, id: string): Promise<CanvasSource> {
  const directory = folder(root, id);
  const info = await readManifest(directory, id);
  const { files, modules, errors } = await buildSource(directory);
  const version = createHash('sha256');
  for (const [name, text] of Object.entries(files)) version.update(name).update('\0').update(text);
  return {
    ...info,
    entry: ENTRY,
    modules: Object.fromEntries(Object.entries(modules).map(([name, item]) => [name, item.code])),
    errors,
    version: version.digest('hex').slice(0, 16),
  };
}

/** Every data value with its revision. Unreadable values are reported, not dropped. */
export async function readData(root: string, id: string) {
  const directory = join(folder(root, id), 'data');
  const names = await readdir(directory).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [] as string[];
    throw error;
  });
  const values: CanvasData = {};
  const errors: string[] = [];
  let total = 0;
  for (const name of names.sort()) {
    const key = name.endsWith('.json') ? name.slice(0, -5) : '';
    if (!canvasKeySchema.safeParse(key).success) continue;
    const bytes = await readFile(join(directory, name));
    total += bytes.length;
    if (bytes.length > MAX_VALUE_BYTES || total > MAX_DATA_BYTES) {
      errors.push(`data/${name} is too large to load (values up to 2 MB, 16 MB in total).`);
      continue;
    }
    try {
      values[key] = { value: JSON.parse(bytes.toString('utf8')), rev: rev(bytes) };
    } catch (error) {
      errors.push(`data/${name} isn’t valid JSON: ${(error as Error).message}`);
    }
  }
  return { values, errors };
}

async function readValue(directory: string, key: string) {
  try {
    const bytes = await readFile(join(directory, 'data', `${key}.json`));
    return { bytes, rev: rev(bytes) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

const writes = new Map<string, Promise<unknown>>();

/**
 * Compare-and-swap write of one value. A stale `rev` returns the current value instead of
 * overwriting a change the writer hasn't seen.
 */
export function writeValue(
  root: string,
  id: string,
  key: string,
  value: unknown,
  base: string | null,
): Promise<{ ok: true; rev: string } | { ok: false; value: unknown; rev: string | null }> {
  const directory = folder(root, id);
  if (!canvasKeySchema.safeParse(key).success)
    throw new GatewayError('Data keys use letters, numbers, - and _.', 400);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_VALUE_BYTES)
    throw new GatewayError('Canvas values can be up to 2 MB.', 413);
  const path = join(directory, 'data', `${key}.json`);
  const previous = writes.get(path) ?? Promise.resolve();
  const next = previous.then(async () => {
    // Only the folder's existence matters here; the full manifest read stats every file.
    await stat(join(directory, MANIFEST)).catch((error: NodeJS.ErrnoException) => {
      throw error.code === 'ENOENT' ? new GatewayError('Canvas not found.', 404) : error;
    });
    const current = await readValue(directory, key);
    if ((current?.rev ?? null) !== base) {
      let latest: unknown;
      try {
        latest = current ? JSON.parse(current.bytes.toString('utf8')) : undefined;
      } catch {
        latest = undefined;
      }
      return { ok: false as const, value: latest, rev: current?.rev ?? null };
    }
    await mkdir(join(directory, 'data'), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, text, { flag: 'wx' });
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
    return { ok: true as const, rev: rev(text) };
  });
  const settled = next.catch(() => {});
  writes.set(path, settled);
  void settled.then(() => {
    if (writes.get(path) === settled) writes.delete(path);
  });
  return next;
}

/** Validates, type-checks, transpiles, and test-renders a canvas; a report for the agent. */
export async function checkCanvas(root: string, id: string) {
  const directory = folder(root, id);
  const info = await readManifest(directory, id);
  const problems: string[] = [];
  const { files, modules, errors } = await buildSource(directory);
  problems.push(...errors);
  const data = await readData(root, id);
  problems.push(...data.errors);
  const types = files[ENTRY] ? await typeCheck(files) : [];
  const values = Object.fromEntries(
    Object.entries(data.values).map(([key, item]) => [key, item.value]),
  );
  const render = !errors.length && files[ENTRY] ? testRender(modules, ENTRY, values) : undefined;
  const sections: string[] = [];
  if (problems.length)
    sections.push(`Problems:\n${problems.map((line) => `- ${line}`).join('\n')}`);
  if (types.length)
    sections.push(`Type errors (${types.length}):\n${types.map((line) => `- ${line}`).join('\n')}`);
  if (render?.error) sections.push(`Render error with the saved data:\n${render.error}`);
  if (render?.warnings.length)
    sections.push(`Render warnings:\n${render.warnings.map((line) => `- ${line}`).join('\n')}`);
  if (render?.html !== undefined && !render.html.trim())
    sections.push('The view rendered nothing. Return visible content from App.');
  const ok = !problems.length && !types.length && Boolean(render?.html?.trim());
  const link = `[${info.title.replace(/[[\]]/g, '')}](canvas:${id})`;
  return {
    ok,
    report: ok
      ? [
          `Canvas check passed: "${info.title}" (${id}). Types, build, and a test render with its saved data all succeeded.`,
          ...sections,
          `Show it to the user by putting this line in your final reply, on its own line:\n${link}`,
        ].join('\n\n')
      : [
          `Canvas check failed for "${info.title}" (${id}). Fix these and run canvas_check again.`,
          ...sections,
        ].join('\n\n'),
  };
}

/** Watches the canvases folder and reports changes, while anyone is listening. */
export function createCanvasWatcher(directory: string) {
  const listeners = new Set<(event: CanvasEvent) => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let watcher: FSWatcher | undefined;
  const emit = (event: CanvasEvent) => {
    for (const listener of listeners) listener(event);
  };
  const changed = (directory: string, file: string) => {
    const parts = file.split(/[\\/]/);
    const id = parts[0]!;
    if (!canvasIDSchema.safeParse(id).success) return;
    if (parts.length === 1) return emit({ type: 'list' });
    if (parts[1] === 'data' && parts.length === 3 && parts[2]!.endsWith('.json')) {
      const key = parts[2]!.slice(0, -5);
      if (!canvasKeySchema.safeParse(key).success) return;
      void readValue(join(directory, id), key).then(
        (value) => emit({ type: 'data', id, key, rev: value?.rev ?? null }),
        () => {},
      );
      return;
    }
    if (parts.length === 2 && (SOURCE.test(parts[1]!) || parts[1] === MANIFEST)) {
      emit({ type: 'source', id });
      if (parts[1] === MANIFEST) emit({ type: 'list' });
    }
  };
  const start = async () => {
    await mkdir(directory, { recursive: true });
    if (!listeners.size || watcher) return;
    watcher = watch(directory, { recursive: true }, (_, file) => {
      if (!file || file.endsWith('.tmp') || file.startsWith('.')) return;
      clearTimeout(timers.get(file));
      // Editors and atomic writes touch a file several times; report the settled change.
      timers.set(
        file,
        setTimeout(() => {
          timers.delete(file);
          changed(directory, file);
        }, 40),
      );
    });
    watcher.on('error', () => {
      watcher?.close();
      watcher = undefined;
    });
  };
  return {
    subscribe(listener: (event: CanvasEvent) => void) {
      listeners.add(listener);
      void start().catch(() => {});
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        watcher?.close();
        watcher = undefined;
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
      };
    },
  };
}

const FRAME = (version: string) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<div id="root"></div>
<script src="/api/canvas-runtime/runtime.js?v=${version}"></script>
</body>
</html>
`;

/** Public, static runtime files the sandboxed frame loads; they carry no user data. */
export function canvasRuntimeRoutes() {
  const app = new Hono();
  app.get('/frame.html', (c) => {
    const origin = new URL(c.req.url).origin;
    c.header(
      'Content-Security-Policy',
      `default-src 'none'; script-src ${origin} 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-ancestors ${origin}; base-uri 'none'; form-action 'none'`,
    );
    return c.html(FRAME(CANVAS_RUNTIME.version));
  });
  app.get('/runtime.js', (c) => {
    c.header('Content-Type', 'text/javascript; charset=utf-8');
    if (c.req.query('v') === CANVAS_RUNTIME.version)
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    return c.body(CANVAS_RUNTIME.source);
  });
  return app;
}

export function canvasRoutes() {
  const app = new Hono();
  app.get('/', async (c) => {
    return c.json(await listCanvases(CANVAS_ROOT));
  });
  app.use('/', bodyLimit({ maxSize: 8192 }));
  app.post('/', async (c) => {
    const input = canvasCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Give the canvas a title.' }, 400);
    return c.json(await createCanvas(CANVAS_ROOT, input.data));
  });
  app.get('/:id', async (c) => c.json(await readSource(CANVAS_ROOT, c.req.param('id'))));
  app.delete('/:id', async (c) => {
    const directory = folder(CANVAS_ROOT, c.req.param('id'));
    await readManifest(directory, c.req.param('id'));
    await rm(directory, { recursive: true, force: true });
    return c.json({ ok: true });
  });
  app.get('/:id/data', async (c) => c.json(await readData(CANVAS_ROOT, c.req.param('id'))));
  app.get('/:id/data/:key', async (c) => {
    const directory = folder(CANVAS_ROOT, c.req.param('id'));
    const key = c.req.param('key');
    if (!canvasKeySchema.safeParse(key).success) return c.json({ message: 'Unknown value.' }, 404);
    const value = await readValue(directory, key);
    if (!value) return c.json({ value: null, rev: null });
    try {
      return c.json({ value: JSON.parse(value.bytes.toString('utf8')), rev: value.rev });
    } catch {
      return c.json({ message: `data/${key}.json isn’t valid JSON.` }, 422);
    }
  });
  app.use('/:id/data/:key', bodyLimit({ maxSize: MAX_VALUE_BYTES + 4096 }));
  app.put('/:id/data/:key', async (c) => {
    const input = canvasDataWriteSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ message: 'Send a JSON value and its revision.' }, 400);
    const result = await writeValue(
      CANVAS_ROOT,
      c.req.param('id'),
      c.req.param('key'),
      input.data.value,
      input.data.rev,
    );
    return result.ok
      ? c.json({ rev: result.rev })
      : c.json(
          { message: 'This value changed in the meantime.', value: result.value, rev: result.rev },
          409,
        );
  });
  app.post('/:id/check', async (c) => c.json(await checkCanvas(CANVAS_ROOT, c.req.param('id'))));
  return app;
}

/**
 * Lets the canvas plugin inside OpenCode find a running gateway: one file per gateway
 * process, removed when it closes or exits.
 */
export function registerGateway(url: string) {
  const directory = join(homedir(), '.opencodex', 'gateways');
  const path = join(directory, `${process.pid}.json`);
  mkdirSync(directory, { recursive: true });
  // Gateways that crashed never removed their file; drop those so the plugin skips them.
  for (const name of readdirSync(directory)) {
    const pid = Number(name.replace(/\.json$/, ''));
    if (Number.isInteger(pid) && pid !== process.pid && !running(pid))
      rmSync(join(directory, name), { force: true });
  }
  writeFileSync(path, JSON.stringify({ url, pid: process.pid }));
  const unregister = () => rmSync(path, { force: true });
  process.once('exit', unregister);
  return () => {
    process.off('exit', unregister);
    unregister();
  };
}

function running(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
