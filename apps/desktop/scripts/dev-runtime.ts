import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// macOS uses the bundle identity for Mission Control and the Dock, not app.setName().
// Keep Electron's installed bundle intact and reuse a branded copy across dev launches.
export function developmentRuntime() {
  const require = createRequire(import.meta.url);
  const executable: string = require('electron');
  if (process.platform !== 'darwin') return executable;

  const source = resolve(dirname(executable), '../..');
  const { productName } = require('../package.json') as { productName: string };
  const version = createHash('sha256')
    .update(JSON.stringify([1, source, statSync(executable).mtimeMs, productName]))
    .digest('hex')
    .slice(0, 16);
  const cache = fileURLToPath(
    new URL('../node_modules/.cache/opencodex-electron/', import.meta.url),
  );
  const runtime = join(cache, version);
  const bundle = join(runtime, `${productName}.app`);
  const target = join(bundle, 'Contents/MacOS/Electron');
  if (existsSync(target)) return target;

  mkdirSync(cache, { recursive: true });
  const staging = join(cache, `${version}-${process.pid}`);
  const pending = join(staging, `${productName}.app`);
  try {
    cpSync(source, pending, {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    });
    const plist = join(pending, 'Contents/Info.plist');
    for (const [key, value] of Object.entries({
      CFBundleName: productName,
      CFBundleDisplayName: productName,
      CFBundleIdentifier: 'dev.opencodex.app.development',
    })) {
      execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plist]);
    }
    // Keep the executable named Electron so app.isPackaged stays false in dev.
    execFileSync('/usr/bin/codesign', [
      '--force',
      '--deep',
      '--sign',
      '-',
      '--timestamp=none',
      pending,
    ]);
    renameSync(staging, runtime);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return target;
}
