import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Hono } from 'hono';
import { projectInputSchema, type ClaudeCodeStatus } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';
import { GatewayError } from './errors';
import { CLAUDE_CODE_PLUGIN } from './claude-code-plugin.generated';

const PLUGIN_ID = 'opencodex.claude-code';
const UPSTREAM_ID = '@khalilgharbaoui/opencode-claude-code-plugin';

export function claudeCodeRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  let editing = Promise.resolve();
  const directory = () =>
    process.env.OPENCODE_CONFIG_DIR ||
    join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode');

  app.get('/', async (c) => {
    if (!(await backend.localService()))
      return c.json({ state: 'unavailable', removable: false, message: localOnly().message });
    const input = projectInputSchema.safeParse({ directory: c.req.query('directory') });
    const path = claudeCodePluginPath(directory());
    const [source, plugins] = await Promise.all([
      // A symlink, folder, or oversized file is somebody else's; report it, don't fail.
      readInstalled(path).catch((error: unknown) =>
        error instanceof GatewayError ? null : Promise.reject(error),
      ),
      backend.request(c.req.raw.signal, (client, options) =>
        client.plugin.list(
          input.success ? { location: { directory: input.data.directory } } : undefined,
          options,
        ),
      ),
    ]);
    const loaded = plugins.data.find(
      (item) =>
        item.id === PLUGIN_ID ||
        (item.source.type === 'local' && [path, dirname(path)].includes(item.source.path)),
    );
    const external = plugins.data.some((item) => item.id === UPSTREAM_ID);
    const ours = typeof source === 'string' && managed(source);
    const status: ClaudeCodeStatus = {
      state: source === undefined ? 'missing' : 'loading',
      removable: ours,
      path,
    };
    if (external || (source !== undefined && !ours)) {
      status.state = 'external';
      status.message =
        'An existing or customized Claude Code plugin was found. Manage it in your OpenCode configuration.';
    } else if (source !== undefined && source !== CLAUDE_CODE_PLUGIN.source) {
      status.state = 'outdated';
    } else if (loaded?.state.status === 'failed') {
      status.state = 'failed';
      status.message = loaded.state.error;
    } else if (source === undefined && loaded) {
      status.state = 'loading';
      status.message = 'Waiting for OpenCode to unload the removed plugin…';
    } else if (loaded?.state.status === 'active') {
      status.state = 'active';
    }
    return c.json(status);
  });

  async function change(install: boolean, signal: AbortSignal) {
    if (!(await backend.localService())) throw localOnly();
    if (install) {
      const plugins = await backend.request(signal, (client, options) =>
        client.plugin.list(undefined, options),
      );
      if (plugins.data.some((item) => item.id === UPSTREAM_ID))
        throw new GatewayError(
          'Remove the separately configured Claude Code plugin before enabling this preset.',
          409,
        );
    }
    const next = editing.then(() => changeClaudeCodePlugin(directory(), install));
    editing = next.catch(() => undefined);
    await next;
    return { ok: true };
  }
  app.put('/', async (c) => c.json(await change(true, c.req.raw.signal)));
  app.delete('/', async (c) => c.json(await change(false, c.req.raw.signal)));
  return app;
}

export function claudeCodePluginPath(configDirectory: string) {
  return join(configDirectory, 'plugins', 'opencodex-claude-code', 'index.js');
}

async function readInstalled(path: string) {
  const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!stat) return undefined;
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw foreign(path);
  return readFile(path, 'utf8');
}

// Recognize earlier generated versions without replacing somebody's manual edits.
function managed(source: string) {
  const match = /^\/\/ OpenCodex Claude Code plugin ([a-f0-9]{12})\.[^\n]*\n/.exec(source);
  return Boolean(
    match &&
    createHash('sha256').update(source.slice(match[0].length)).digest('hex').slice(0, 12) ===
      match[1],
  );
}

/** OpenCode watches and loads plugin folders; the gateway only installs the artifact. */
export async function changeClaudeCodePlugin(configDirectory: string, install: boolean) {
  const path = claudeCodePluginPath(configDirectory);
  const before = await readInstalled(path);
  if (before !== undefined && !managed(before)) throw foreign(path);
  if (!install) {
    await rm(path, { force: true });
    await rmdir(dirname(path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error;
    });
    return;
  }
  if (before === CLAUDE_CODE_PLUGIN.source) return;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, CLAUDE_CODE_PLUGIN.source, { flag: 'wx', mode: 0o644 });
    if ((await readInstalled(path)) !== before)
      throw new GatewayError('The Claude Code plugin changed during installation. Retry.', 409);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function foreign(path: string) {
  return new GatewayError(
    `${path} contains a customized plugin. OpenCodex will not replace or remove it.`,
    409,
  );
}

function localOnly() {
  return new GatewayError(
    'Configure Claude Code on the OpenCode server host. Installation here requires a locally discovered service.',
    422,
  );
}
