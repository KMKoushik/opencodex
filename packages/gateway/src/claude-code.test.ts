import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { changeClaudeCodePlugin, claudeCodePluginPath } from './claude-code';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'opencodex-claude-'));
  directories.push(directory);
  return directory;
}

describe('Claude Code plugin installation boundary', () => {
  it('installs and removes only its artifact, preserving configuration and other plugin files', async () => {
    const directory = await fixture();
    const config = '{ // keep my settings\n"plugins": ["my-plugin"]\n}';
    await writeFile(join(directory, 'opencode.jsonc'), config);
    await changeClaudeCodePlugin(directory, true);
    await changeClaudeCodePlugin(directory, true);
    const path = claudeCodePluginPath(directory);
    expect(await readFile(path, 'utf8')).toContain('// OpenCodex Claude Code plugin');
    // The installed bundle must load without its build-time node_modules tree.
    // This catches unresolved UMD relative requires in transitive dependencies.
    expect((await import(pathToFileURL(path).href)).default.id).toBe('opencodex.claude-code');
    await writeFile(join(directory, 'plugins', 'mine.js'), '// unrelated');
    await changeClaudeCodePlugin(directory, false);
    await changeClaudeCodePlugin(directory, false);
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(directory, 'opencode.jsonc'), 'utf8')).toBe(config);
    expect(await readFile(join(directory, 'plugins', 'mine.js'), 'utf8')).toBe('// unrelated');
  });

  it('refuses to replace or remove an installed artifact after somebody edits it', async () => {
    const directory = await fixture();
    await changeClaudeCodePlugin(directory, true);
    const path = claudeCodePluginPath(directory);
    const customized = `${await readFile(path, 'utf8')}\n// my edit`;
    await writeFile(path, customized);
    await expect(changeClaudeCodePlugin(directory, true)).rejects.toThrow('customized plugin');
    await expect(changeClaudeCodePlugin(directory, false)).rejects.toThrow('customized plugin');
    expect(await readFile(path, 'utf8')).toBe(customized);
  });
});
