import { readFile, rm, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { OpenCodeBackend } from './opencode';
import { unedited } from './plugin-files';

/**
 * OpenCode 2.2.3 ships a native Claude Agent provider, so OpenCodex no longer bundles its
 * Claude Code bridge. Older versions installed that bridge into OpenCode's config; remove an
 * unedited copy once Claude Agent is connected, so nobody loses Claude before switching.
 */
export async function retireClaudeCodeBridge(backend: OpenCodeBackend) {
  const path = join(
    process.env.OPENCODE_CONFIG_DIR ||
      join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode'),
    'plugins',
    'opencodex-claude-code',
    'index.js',
  );
  const source = await readFile(path, 'utf8').catch(() => undefined);
  if (!source?.startsWith('// OpenCodex Claude Code plugin ') || !unedited(source)) return;
  if ((await backend.connection()).status !== 'connected' || !(await backend.localService()))
    return;
  const claude = await backend
    .request(AbortSignal.timeout(5_000), (client, options) =>
      client.integration.get({ integrationID: 'claude-agent' }, options),
    )
    .catch(() => undefined);
  if (!claude?.data.connections.length) return;
  await rm(path, { force: true });
  await rmdir(dirname(path)).catch(() => undefined);
}
