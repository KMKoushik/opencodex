import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCanvas, createCanvas, writeValue } from './canvases';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'opencodex-canvases-'));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('canvases', () => {
  it('never overwrites a value the writer has not seen', async () => {
    const { id } = await createCanvas(root, { title: 'Todos' });
    const first = await writeValue(root, id, 'todos', ['a'], null);
    expect(first.ok).toBe(true);
    const base = first.ok ? first.rev : '';
    expect((await writeValue(root, id, 'todos', ['a', 'b'], base)).ok).toBe(true);
    // A second view still holding the first revision gets the current value back instead.
    expect(await writeValue(root, id, 'todos', ['c'], base)).toMatchObject({
      ok: false,
      value: ['a', 'b'],
    });
  });

  it('reports server.ts type errors with their line', { timeout: 30_000 }, async () => {
    const { id, path } = await createCanvas(root, { title: 'Report' });
    expect((await checkCanvas(root, id)).ok).toBe(true);

    await writeFile(
      join(path, 'server.ts'),
      `import { data } from '@opencodex/canvas/server';
export async function total() {
  const rows = await data.get<{ count: number }[]>('rows', []);
  return rows.reduce((sum, row) => sum + row.count.length, 0);
}
`,
    );
    const result = await checkCanvas(root, id);
    expect(result.ok).toBe(false);
    expect(result.report).toMatch(/server\.ts:4:\d+ .*'length'/);
  });
});
