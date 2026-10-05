import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const { load } = createRequire(require.resolve('electron-updater'))('js-yaml');
const directory = 'apps/desktop/release';
const manifests = (await readdir(directory)).filter((name) => name.endsWith('-mac.yml'));
if (!manifests.length) throw new Error('No macOS update manifest was generated.');

for (const manifest of manifests) {
  const info = load(await readFile(join(directory, manifest), 'utf8'));
  if (info.version !== process.env.VERSION || !Array.isArray(info.files))
    throw new Error(`${manifest} has the wrong version or no files.`);
  for (const arch of ['arm64', 'x64']) {
    const name = `OpenCodex-${info.version}-${arch}.zip`;
    if (!info.files.some((file) => file.url === name))
      throw new Error(`${manifest} is missing the ${arch} update ZIP.`);
  }
  for (const file of info.files) {
    if (typeof file.url !== 'string' || basename(file.url) !== file.url)
      throw new Error(`${manifest} contains a non-local artifact URL.`);
    const path = join(directory, file.url);
    const size = (await stat(path)).size;
    const hash = createHash('sha512');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (file.sha512 !== hash.digest('base64') || (file.size !== undefined && file.size !== size))
      throw new Error(`${file.url} does not match its update manifest.`);
  }
}
for (const folder of ['mac-arm64', 'mac']) {
  const app = join(directory, folder, 'OpenCodex.app');
  await promisify(execFile)('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const { stderr } = await promisify(execFile)('/usr/bin/codesign', ['-d', '-vv', app]);
  if (!stderr.includes('Authority=OpenCodex Self-Signed') || stderr.includes('Signature=adhoc'))
    throw new Error(`${folder} was not signed with the stable update identity.`);
}
console.log(
  'Both architectures are signed; all update manifests match the uploaded ZIPs and hashes.',
);
