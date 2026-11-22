// Presentation numbers are invalid on a locked console; fail closed on detection errors.
export function requireVisibleScreen() {
  const result = Bun.spawnSync(['ioreg', '-n', 'Root', '-d1', '-a']);
  const parsed = Bun.spawnSync(['plutil', '-extract', 'IOConsoleUsers', 'json', '-o', '-', '-'], {
    stdin: result.stdout,
  });
  if (result.exitCode || parsed.exitCode)
    throw new Error(
      'Cannot verify screen state. Use --headless-safe for non-presentation metrics.',
    );
  const users = JSON.parse(parsed.stdout.toString()) as {
    CGSSessionScreenIsLocked?: boolean;
    kCGSSessionOnConsoleKey?: boolean;
  }[];
  if (!users.some((u) => u.kCGSSessionOnConsoleKey && !u.CGSSessionScreenIsLocked))
    throw new Error(
      'The Mac screen is locked or has no active console. Unlock it and leave the app visible (not behind a full-screen Space), or use --headless-safe.',
    );
}

export function requireIsolatedEnvironment() {
  const home = process.env.HOME;
  if (!home || !home.startsWith('/tmp/ocr-') || !home.endsWith('/home'))
    throw new Error('Bench requires an isolated HOME=/tmp/ocr-<name>/home (see README).');
  const base = home.slice(0, -5);
  for (const name of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME'])
    if (!process.env[name]?.startsWith(`${base}/`))
      throw new Error(`Set isolated ${name} under ${base}.`);
  if (process.env.OPENCODEX_GATEWAY || process.env.OPENCODE_URL)
    throw new Error(
      'Unset OPENCODEX_GATEWAY and OPENCODE_URL: each app must own its gateway and use isolated service discovery.',
    );
}
