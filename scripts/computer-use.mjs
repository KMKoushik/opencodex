import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'apps/desktop/native');
const output = join(source, 'out');
const bundle = join(output, 'OpenCodex Computer Control.app');
const executable = join(bundle, 'Contents/MacOS/computer-control');
const check = process.argv.includes('--check');
// The desktop packager emits both architectures; a default build must be safe for either target.
const universal = !process.argv.includes('--host-only');
const identity = process.env.OPENCODEX_COMPUTER_SIGN_IDENTITY || process.env.CSC_NAME || '-';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

if (process.platform !== 'darwin') {
  console.log('Computer helper: macOS-only; skipped on this platform.');
  process.exit(0);
}

const files = ['ComputerControl.swift', 'Info.plist'];
const fingerprint = createHash('sha256');
for (const file of files) fingerprint.update(await readFile(join(source, file)));
fingerprint.update(await readFile(fileURLToPath(import.meta.url)));
fingerprint.update(run('xcrun', ['swiftc', '--version']));
fingerprint.update(`${identity}:${universal ? 'universal' : process.arch}`);
const hash = fingerprint.digest('hex');
const stamp = join(output, 'build.json');
let current;
try {
  current = JSON.parse(await readFile(stamp, 'utf8'));
} catch {
  // The first build has no stamp.
}

if (check && current?.hash !== hash) {
  throw new Error(
    'Native computer helper is missing or stale. Run node scripts/computer-use.mjs first (with the same signing/architecture options).',
  );
}

if (!check && current?.hash !== hash) {
  await mkdir(join(bundle, 'Contents/MacOS'), { recursive: true });
  await copyFile(join(source, 'Info.plist'), join(bundle, 'Contents/Info.plist'));
  const architectures = universal
    ? ['arm64', 'x86_64']
    : [process.arch === 'arm64' ? 'arm64' : 'x86_64'];
  for (const architecture of architectures) {
    run('xcrun', [
      'swiftc',
      '-O',
      '-swift-version',
      '5',
      '-target',
      `${architecture}-apple-macosx14.0`,
      '-module-cache-path',
      join(output, 'module-cache'),
      join(source, 'ComputerControl.swift'),
      '-o',
      join(output, `computer-control-${architecture}`),
      '-framework',
      'AppKit',
      '-framework',
      'ApplicationServices',
      '-framework',
      'ScreenCaptureKit',
      '-framework',
      'ImageIO',
      '-framework',
      'UniformTypeIdentifiers',
    ]);
  }
  if (universal)
    run('xcrun', [
      'lipo',
      '-create',
      ...architectures.map((arch) => join(output, `computer-control-${arch}`)),
      '-output',
      executable,
    ]);
  else await copyFile(join(output, `computer-control-${architectures[0]}`), executable);
  run('codesign', [
    '--force',
    '--sign',
    identity,
    '--identifier',
    'dev.opencodex.computer-control',
    '--options',
    'runtime',
    '--timestamp=none',
    bundle,
  ]);
  await writeFile(stamp, `${JSON.stringify({ hash, identity, architectures }, null, 2)}\n`);
}

run('codesign', ['--verify', '--deep', '--strict', bundle]);
const requests = ['computer.status', 'computer.list'].map((method, index) =>
  JSON.stringify({ id: `smoke-${index}`, sessionID: 'native-protocol-smoke', method, input: {} }),
);
// Keep stdin open until both replies arrive: an EOF-only smoke misses blocking pipe reads.
const responses = await new Promise((resolve, reject) => {
  const child = spawn(executable, [], {
    cwd: dirname(executable),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffered = '';
  let bytes = 0;
  const replies = [];
  const fail = (error) => {
    child.kill('SIGKILL');
    reject(error);
  };
  const timer = setTimeout(
    () => fail(new Error('Native helper live-pipe smoke timed out.')),
    15_000,
  );
  child.once('error', fail);
  child.stdin.on('error', fail);
  child.stderr.resume();
  child.stdout.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > 2 * 1024 * 1024) return fail(new Error('Native smoke exceeded output limit.'));
    buffered += chunk.toString('utf8');
    for (let newline; (newline = buffered.indexOf('\n')) >= 0;) {
      try {
        replies.push(JSON.parse(buffered.slice(0, newline)));
      } catch (error) {
        return fail(error);
      }
      buffered = buffered.slice(newline + 1);
      if (replies.length === 1) child.stdin.write(`${requests[1]}\n`);
      else child.stdin.end();
    }
  });
  child.once('close', (code) => {
    clearTimeout(timer);
    if (code !== 0 || buffered)
      reject(new Error('Native helper smoke ended with an incomplete response.'));
    else resolve(replies);
  });
  child.stdin.write(`${requests[0]}\n`);
});
if (
  responses.length !== 2 ||
  responses[0]?.id !== 'smoke-0' ||
  responses[1]?.id !== 'smoke-1' ||
  typeof responses[0]?.result?.accessibility !== 'boolean' ||
  typeof responses[0]?.result?.screenRecording !== 'boolean' ||
  !Array.isArray(responses[1]?.result?.apps)
)
  throw new Error('Native helper protocol smoke check failed.');
console.log(`Computer helper ${check ? 'checked' : 'built'}: ${executable}`);
console.log(
  `Permissions (no prompts): accessibility=${responses[0].result.accessibility}, screenRecording=${responses[0].result.screenRecording}; running apps=${responses[1].result.apps.length}`,
);
if (identity === '-')
  console.log(
    'Development ad-hoc signature: configure OPENCODEX_COMPUTER_SIGN_IDENTITY or CSC_NAME with a persistent certificate for permission continuity across rebuilds.',
  );
