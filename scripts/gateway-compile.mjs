import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--target'))
  throw new Error('Usage: bun run gateway:compile [--target bun-darwin-x64]');
const target = args[1] ?? 'bun-darwin-arm64';
if (!['bun-darwin-arm64', 'bun-darwin-x64'].includes(target))
  throw new Error('Choose bun-darwin-arm64 or bun-darwin-x64.');
for (const command of [
  ['run', 'plugins:check'],
  ['run', 'canvas'],
  [
    'build',
    '--compile',
    `--target=${target}`,
    '--define',
    'process.env.OPENCODEX_COMPILED="1"',
    './packages/gateway/src/cli.ts',
    '--outfile',
    './packages/gateway/dist/opencodex-gateway',
  ],
]) {
  const result = spawnSync('bun', command, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Bun appends the bundle to its Mach-O runtime; refresh the ad-hoc signature before
// copying it into a .app (whose release signing will replace this signature).
if (process.platform === 'darwin') {
  const result = spawnSync(
    'codesign',
    ['--force', '--sign', '-', 'packages/gateway/dist/opencodex-gateway'],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
