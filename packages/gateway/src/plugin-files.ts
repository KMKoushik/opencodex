import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SideChatPluginStatus } from '@opencodex/contracts';
import { GatewayError } from './errors';
import type { OpenCodeBackend } from './opencode';

/** A single-file plugin that OpenCodex installs into OpenCode's global plugins folder. */
export type PluginFile = {
  id: string;
  file: string;
  /** First line of every installed version, so OpenCodex never touches files it didn't write. */
  header: string;
  source: string;
  /** What the plugin adds, for the error shown when the service isn't local. */
  feature: string;
};

export async function pluginStatus(
  backend: OpenCodeBackend,
  plugin: PluginFile,
  directory: string | undefined,
  signal: AbortSignal,
): Promise<SideChatPluginStatus> {
  if (!(await backend.localService()))
    return { state: 'unavailable', message: unavailable(plugin).message };
  const path = pluginPath(plugin);
  const [installed, plugins] = await Promise.all([
    readInstalled(path),
    backend.request(signal, (client, options) =>
      client.plugin.list(directory ? { location: { directory } } : undefined, options),
    ),
  ]);
  const loaded = plugins.data.find((item) => item.id === plugin.id);
  const loadedPath = loaded?.source.type === 'local' ? loaded.source.path : undefined;
  if (installed === undefined)
    return loaded ? { state: 'active', path: loadedPath } : { state: 'missing', path };
  if (!installed.startsWith(plugin.header))
    return { state: 'failed', path, message: foreign(path).message };
  if (installed !== plugin.source) return { state: 'outdated', path };
  if (!loaded) return { state: 'loading', path };
  if (loaded.state.status === 'failed')
    return { state: 'failed', path, message: loaded.state.error };
  return { state: 'active', path };
}

export async function installPlugin(backend: OpenCodeBackend, plugin: PluginFile) {
  if (!(await backend.localService())) throw unavailable(plugin);
  const path = pluginPath(plugin);
  const installed = await readInstalled(path);
  if (installed !== undefined && !installed.startsWith(plugin.header)) throw foreign(path);
  await mkdir(dirname(path), { recursive: true });
  // Write beside the target and rename, so OpenCode never loads a partial file.
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, plugin.source, { mode: 0o644, flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function removePlugin(backend: OpenCodeBackend, plugin: PluginFile) {
  if (!(await backend.localService())) throw unavailable(plugin);
  const path = pluginPath(plugin);
  const installed = await readInstalled(path);
  if (installed !== undefined && !installed.startsWith(plugin.header)) throw foreign(path);
  await rm(path, { force: true });
}

/** OpenCode discovers global plugins in its config directory's `plugins` folder. */
function pluginPath(plugin: PluginFile) {
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'opencode',
    'plugins',
    plugin.file,
  );
}

async function readInstalled(path: string) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function foreign(path: string) {
  return new GatewayError(
    `${path} wasn’t installed by OpenCodex, so OpenCodex won’t replace or remove it.`,
    409,
  );
}

function unavailable(plugin: PluginFile) {
  return new GatewayError(
    `The ${plugin.feature} can be installed only when OpenCodex uses the OpenCode service on this machine.`,
    422,
  );
}
