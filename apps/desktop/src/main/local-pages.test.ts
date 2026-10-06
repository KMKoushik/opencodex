import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { createLocalPages } from './local-pages';

it('limits sandboxed HTML previews to regular files in their granted folder and releases grants', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'opencodex-preview-')));
  try {
    const root = join(directory, 'page');
    await mkdir(root);
    await writeFile(join(root, 'report #1.html'), '<h1>Report</h1>');
    await writeFile(join(root, 'style.css'), 'h1 { color: red }');
    await writeFile(join(directory, 'secret.txt'), 'private');
    await symlink(join(directory, 'secret.txt'), join(root, 'escape.txt'));
    const pages = createLocalPages();
    const file = `${pathToFileURL(join(root, 'report #1.html')).href}?view=1#summary`;
    const preview = await pages.grant(1, file);
    expect(pages.owns(1, preview)).toBe(true);
    expect(pages.owns(2, preview)).toBe(false);
    expect(pages.displayURL(preview)).toBe(file);
    expect(await pages.path(preview)).toBe(join(root, 'report #1.html'));
    expect(await pages.path(new URL('style.css', preview).href)).toBe(join(root, 'style.css'));
    for (const path of ['%2e%2e%2fsecret.txt', 'escape.txt', './'])
      await expect(pages.path(new URL(path, preview).href)).rejects.toThrow();
    await expect(pages.grant(1, 'https://example.com/report.html')).rejects.toThrow();
    await expect(pages.grant(1, pathToFileURL(join(root, 'style.css')).href)).rejects.toThrow();
    pages.release(1);
    await expect(pages.path(preview)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
