import { app, shell } from 'electron';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { openAppIDs, type OpenApp, type OpenAppID } from '@opencodex/contracts/desktop';

const exec = promisify(execFile);
const commandOptions = { timeout: 5000, maxBuffer: 256 * 1024, encoding: 'utf8' as const };
const catalog: { id: OpenAppID; label: string; bundle: string }[] = [
  { id: 'finder', label: 'Finder', bundle: '/System/Library/CoreServices/Finder.app' },
  { id: 'terminal', label: 'Terminal', bundle: 'Terminal.app' },
  { id: 'ghostty', label: 'Ghostty', bundle: 'Ghostty.app' },
  { id: 'cursor', label: 'Cursor', bundle: 'Cursor.app' },
  { id: 'zed', label: 'Zed', bundle: 'Zed.app' },
  { id: 'vscode', label: 'VS Code', bundle: 'Visual Studio Code.app' },
  { id: 'iterm', label: 'iTerm', bundle: 'iTerm.app' },
];

export const openAppInput = z.object({
  directory: z
    .string()
    .min(1)
    .max(4096)
    .refine(
      (value) => isAbsolute(value) && !value.includes('\0'),
      'Expected an absolute directory.',
    ),
  appID: z.enum(openAppIDs),
});

export const revealFileInput = z.object({
  path: openAppInput.shape.directory,
});

export async function revealFile({ path }: z.infer<typeof revealFileInput>) {
  if (!(await stat(path)).isFile()) throw new Error('Choose a regular file.');
  shell.showItemInFolder(path);
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function bundlePath(bundle: string) {
  const candidates = isAbsolute(bundle)
    ? [bundle]
    : [
        join('/Applications', bundle),
        join(homedir(), 'Applications', bundle),
        join('/System/Applications', bundle),
        join('/System/Applications/Utilities', bundle),
      ];
  for (const path of candidates) if (await exists(path)) return path;
  const { stdout } = await exec('/usr/bin/mdfind', ['-name', bundle], commandOptions);
  for (const path of stdout.trim().split('\n')) {
    if (isAbsolute(path) && path.endsWith(`/${bundle}`) && (await exists(path))) return path;
  }
  return undefined;
}

async function bundleIcon(bundle: string): Promise<string | undefined> {
  // Read the bundle's declared icon, rather than choosing a document-type icon.
  let temporary: string | undefined;
  try {
    const { stdout } = await exec(
      '/usr/bin/plutil',
      ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', join(bundle, 'Contents/Info.plist')],
      commandOptions,
    );
    const name = stdout.trim();
    if (!name || name.includes('/') || name.includes('\\')) return undefined;
    const source = join(
      bundle,
      'Contents/Resources',
      name.endsWith('.icns') ? name : `${name}.icns`,
    );
    temporary = await mkdtemp(join(app.getPath('temp'), 'opencodex-app-icon-'));
    const target = join(temporary, 'icon.png');
    await exec(
      '/usr/bin/sips',
      ['-s', 'format', 'png', '-Z', '32', source, '--out', target],
      commandOptions,
    );
    return `data:image/png;base64,${(await readFile(target)).toString('base64')}`;
  } catch {
    // An unavailable icon must not hide an installed application.
    return undefined;
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

type InstalledApp = OpenApp & { bundle?: string };
let snapshot: { expires: number; value: Promise<InstalledApp[]> } | undefined;

function installedApps() {
  if (snapshot && snapshot.expires > Date.now()) return snapshot.value;
  const value = (async (): Promise<InstalledApp[]> => {
    if (process.platform !== 'darwin')
      return [{ id: 'finder', label: process.platform === 'win32' ? 'Explorer' : 'File Manager' }];
    const result: InstalledApp[] = [];
    // Bound child processes; discovery runs only when the control is mounted.
    for (const entry of catalog) {
      const bundle = await bundlePath(entry.bundle);
      if (bundle)
        result.push({ id: entry.id, label: entry.label, bundle, icon: await bundleIcon(bundle) });
    }
    return result;
  })();
  snapshot = { expires: Date.now() + 5 * 60_000, value };
  void value.catch(() => {
    if (snapshot?.value === value) snapshot = undefined;
  });
  return value;
}

export async function listOpenApps(): Promise<OpenApp[]> {
  return (await installedApps()).map(({ id, label, icon }) => ({ id, label, icon }));
}

export async function openInApp(input: z.infer<typeof openAppInput>) {
  if (!(await stat(input.directory)).isDirectory()) throw new Error('Choose a project directory.');
  const target = (await installedApps()).find((entry) => entry.id === input.appID);
  if (!target) throw new Error('This application is not installed.');
  if (process.platform === 'darwin' && target.bundle) {
    await exec('/usr/bin/open', ['-a', target.bundle, '--', input.directory], commandOptions);
  } else {
    const error = await shell.openPath(input.directory);
    if (error) throw new Error(error);
  }
}
