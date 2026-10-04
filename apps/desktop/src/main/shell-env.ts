import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const NAMES = [
  'PATH',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'SSH_AUTH_SOCK',
  'HOMEBREW_PREFIX',
  'HOMEBREW_CELLAR',
  'HOMEBREW_REPOSITORY',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
] as const;
const MARK = '__OPENCODEX_ENV__';

/**
 * Apps opened from Finder or the Dock inherit launchd's minimal PATH, so the `opencode`
 * command (and tools it runs) installed through a shell profile would not be found.
 * Read the user's login-shell environment once at startup, bounded by a timeout.
 */
export async function loadShellEnvironment() {
  if (process.platform === 'win32') return;
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  const print = NAMES.map((name) => `printf '%s=%s\\0' ${name} "$${name}"`).join('; ');
  const output = await new Promise<string>((resolve) => {
    execFile(
      shell,
      ['-ilc', `printf '${MARK}'; ${print}; printf '${MARK}'`],
      { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 },
      (error, stdout) => resolve(error ? '' : stdout),
    );
  });
  const values = new Map<string, string>();
  const body = output.split(MARK)[1] ?? '';
  for (const pair of body.split('\0')) {
    const index = pair.indexOf('=');
    if (index > 0 && pair.slice(index + 1)) values.set(pair.slice(0, index), pair.slice(index + 1));
  }
  // Common install locations still work when the shell probe fails or times out.
  const fallback = [
    join(homedir(), '.opencode', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(homedir(), '.local', 'bin'),
  ];
  const entries = [values.get('PATH'), process.env.PATH, fallback.join(delimiter)]
    .flatMap((value) => value?.split(delimiter) ?? [])
    .filter(Boolean);
  process.env.PATH = [...new Set(entries)].join(delimiter);
  for (const [name, value] of values)
    if (name !== 'PATH' && !process.env[name]) process.env[name] = value;
}
