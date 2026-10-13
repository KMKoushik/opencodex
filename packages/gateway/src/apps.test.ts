import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Apps } from './apps';
import { createCanvas } from './canvases';
import type { OpenCodeBackend } from './opencode';

let root: string;
let apps: Apps;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'opencodex-apps-'));
  apps = new Apps({} as OpenCodeBackend, root, () => {});
});
afterEach(async () => {
  apps.close();
  await rm(root, { recursive: true, force: true });
});

describe('apps', () => {
  it('runs server.ts functions in a child process against the canvas data', async () => {
    const { id, path } = await createCanvas(root, { title: 'Counter' });
    await writeFile(
      join(path, 'server.ts'),
      `import { data, sh } from '@opencodex/canvas/server';
export async function bump(by: number) {
  console.log('bumping', by);
  const echoed = (await sh('echo hi')).trim();
  return { count: await data.update('count', 0, (count) => count + by), echoed };
}
export async function fail() {
  throw new Error('nope');
}
`,
    );
    expect(await apps.describe(id)).toMatchObject({ functions: ['bump', 'fail'], triggers: {} });
    expect(await apps.call(id, 'bump', [2], 'view')).toEqual({ count: 2, echoed: 'hi' });
    expect(await apps.call(id, 'bump', [3], 'view')).toEqual({ count: 5, echoed: 'hi' });
    expect(JSON.parse(await readFile(join(path, 'data', 'count.json'), 'utf8'))).toBe(5);
    await expect(apps.call(id, 'fail', [], 'agent')).rejects.toThrow(/nope[\s\S]*server\.ts:8\b/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const [failed, last] = await apps.runs(id);
    expect(failed).toMatchObject({ fn: 'fail', status: 'error', source: 'agent' });
    expect(last).toMatchObject({ fn: 'bump', status: 'ok', logs: ['bumping 3'] });
  });
});
