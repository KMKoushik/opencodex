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

  it('reports type errors and render errors with the saved data', { timeout: 30_000 }, async () => {
    const { id, path } = await createCanvas(root, { title: 'Report' });
    expect((await checkCanvas(root, id)).ok).toBe(true);

    await writeFile(
      join(path, 'app.tsx'),
      `import { Stat, useData } from '@opencodex/canvas';
type Row = { name: string; tags: string[] };
export default function App() {
  const [rows] = useData<Row[]>('rows', []);
  return <Stat label="Tags" value={rows.map((row) => row.tags.join(', ')).join(' ')} tone="loud" />;
}
`,
    );
    await writeFile(join(path, 'data', 'rows.json'), '[{ "name": "a" }]');
    const result = await checkCanvas(root, id);
    expect(result.ok).toBe(false);
    expect(result.report).toMatch(/app\.tsx:5:\d+ .*"loud"/);
    expect(result.report).toMatch(/Render error[\s\S]*reading 'join'[\s\S]*at app\.tsx:5/);
  });
});
