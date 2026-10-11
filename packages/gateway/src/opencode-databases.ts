import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/** OpenCode names its database per release channel; most recently written first. */
export async function opencodeDatabases() {
  const directory = join(
    process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
    'opencode',
  );
  const override = process.env.OPENCODE_DB;
  if (override === ':memory:') return [];
  if (override) return [isAbsolute(override) ? override : join(directory, override)];
  const names = await readdir(directory).catch(() => []);
  const candidates = await Promise.all(
    names
      .filter((name) => /^opencode(-[a-zA-Z0-9._-]+)?\.db$/.test(name))
      .map(async (name) => {
        const path = join(directory, name);
        const times = await Promise.all(
          [path, `${path}-wal`].map((file) =>
            stat(file).then(
              (info) => info.mtimeMs,
              () => 0,
            ),
          ),
        );
        return { path, modified: Math.max(...times) };
      }),
  );
  return candidates.sort((a, b) => b.modified - a.modified).map(({ path }) => path);
}
