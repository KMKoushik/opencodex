// Regenerate only when the pinned web Mammoth/DOMPurify dependencies change.
import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const here = import.meta.dirname;
const result = await build({
  entryPoints: [join(here, 'preview-worker.ts')],
  platform: 'browser',
  bundle: true,
  write: false,
  alias: {
    'mammoth/mammoth.browser': join(here, '../../../web/node_modules/mammoth/mammoth.browser.js'),
  },
  minify: true,
});
await writeFile(join(here, 'preview-worker.asset'), result.outputFiles[0].contents);
const client = await build({
  entryPoints: [join(here, 'preview-client.ts')],
  platform: 'browser',
  bundle: true,
  write: false,
  minify: true,
});
await writeFile(join(here, 'preview-client.asset'), client.outputFiles[0].contents);
for (const [source, target] of [
  ['dompurify/dist/purify.min.js', 'preview-sanitizer.asset'],
  ['mammoth/LICENSE', 'MAMMOTH-LICENSE'],
  ['dompurify/LICENSE', 'DOMPURIFY-LICENSE'],
]) {
  await copyFile(join(here, '../../../web/node_modules', source), join(here, target));
}
