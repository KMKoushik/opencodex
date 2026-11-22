// Run with bun after changing the pinned web DOCX converter dependencies.
import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const here = import.meta.dirname;
const result = await build({
  entryPoints: [join(here, '../../../web/src/features/workbench/docx.worker.ts')],
  platform: 'browser',
  bundle: true,
  write: false,
  minify: true,
  alias: {
    'mammoth/mammoth.browser': join(here, '../../../web/node_modules/mammoth/mammoth.browser.js'),
  },
});
await writeFile(join(here, 'preview-worker.asset'), result.outputFiles[0].contents);
for (const [source, target] of [
  ['dompurify/dist/purify.min.js', 'preview-sanitizer.asset'],
  ['mammoth/LICENSE', 'MAMMOTH-LICENSE'],
  ['dompurify/LICENSE', 'DOMPURIFY-LICENSE'],
]) {
  await copyFile(join(here, '../../../web/node_modules', source), join(here, target));
}
