import { createRequire } from 'node:module';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import signMac from '../apps/desktop/scripts/sign-mac.mjs';

// A real two-version install through Electron's Squirrel.Mac, not a mocked updater.
// Run only on a disposable runner: no OpenCode service, personal app, or user data is involved.
if (
  process.platform !== 'darwin' ||
  process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
  !process.env.CSC_KEYCHAIN
)
  throw new Error(
    'The native update smoke requires a disposable, signing-configured macOS runner.',
  );

const runCommand = promisify(execFile);
const execute = (file, args) => runCommand(file, args, { timeout: 60_000 });
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const template = resolve(dirname(require('electron')), '../..');
const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'opencodex-update-smoke-'));
const receipt = join(directory, 'receipt.json');
const archive = join(directory, 'update.zip');
let child;
let output = '';
let trustRemoved = false;
const server = createServer((request, response) => {
  if (request.url === '/update.zip') {
    response.setHeader('Content-Type', 'application/zip');
    createReadStream(archive).pipe(response);
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ url: `${feed}/update.zip` }));
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const feed = `http://127.0.0.1:${server.address().port}`;

try {
  const applications = [];
  for (const [folder, version] of [
    ['installed', '1.0.0'],
    ['candidate', '1.0.1'],
  ]) {
    const app = join(directory, folder, 'OpenCodex Update Smoke.app');
    await mkdir(dirname(app));
    await cp(template, app, { recursive: true, verbatimSymlinks: true });
    const plist = join(app, 'Contents/Info.plist');
    for (const [key, value] of [
      ['CFBundleIdentifier', 'dev.opencodex.update-smoke'],
      ['CFBundleName', 'OpenCodex Update Smoke'],
      ['CFBundleVersion', version],
      ['CFBundleShortVersionString', version],
    ])
      await execute('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
    const resources = join(app, 'Contents/Resources/app');
    await mkdir(resources);
    await writeFile(
      join(resources, 'package.json'),
      JSON.stringify({ name: 'update-smoke', version, main: 'main.cjs' }),
    );
    await writeFile(
      join(resources, 'main.cjs'),
      `const {app,autoUpdater} = require('electron');
const fs = require('node:fs');
app.setName('OpenCodex Update Smoke');
app.setPath('userData', ${JSON.stringify(join(directory, 'userdata'))});
const receipt = ${JSON.stringify(receipt)};
function report(status) { fs.writeFileSync(receipt + '.tmp', JSON.stringify({status, version: app.getVersion()})); fs.renameSync(receipt + '.tmp', receipt); }
app.whenReady().then(() => {
  if (app.getVersion() === '1.0.1') { report('installed'); app.quit(); return; }
  autoUpdater.on('error', error => { report('error: ' + error.message); app.quit(); });
  autoUpdater.on('update-downloaded', () => { report('downloaded'); autoUpdater.quitAndInstall(); });
  autoUpdater.setFeedURL({url: ${JSON.stringify(feed)}, serverType: 'json'});
  autoUpdater.checkForUpdates();
});`,
    );
    await signMac({
      app,
      identity: process.env.CSC_NAME,
      keychain: process.env.CSC_KEYCHAIN,
      platform: 'darwin',
      optionsForFile: () => ({
        entitlements: resolve('apps/desktop/build/entitlements.mac.plist'),
        hardenedRuntime: true,
        timestamp: 'none',
      }),
    });
    await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    console.log(`Signed and verified smoke version ${version}.`);
    applications.push(app);
  }
  // The candidate must satisfy the installed app's actual designated requirement.
  const { stdout, stderr } = await execute('/usr/bin/codesign', ['-d', '-r-', applications[0]]);
  const requirement = (stdout + stderr)
    .split('\n')
    .find((line) => line.startsWith('designated => '));
  if (!requirement) throw new Error('The installed smoke app has no designated requirement.');
  await execute('/usr/bin/codesign', [
    '--verify',
    `-R=${requirement.slice('designated => '.length)}`,
    applications[1],
  ]);
  await execute('/usr/bin/ditto', [
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    applications[1],
    archive,
  ]);
  console.log('The candidate satisfies the installed app’s designated signing requirement.');

  // Match an end user's Mac: the self-signed certificate is NOT a trusted root there.
  await execute('/usr/bin/sudo', [
    'security',
    'remove-trusted-cert',
    '-d',
    join(process.env.RUNNER_TEMP, 'opencodex-signing/certificate.pem'),
  ]);
  trustRemoved = true;
  console.log('Certificate trust removed; launching the installed smoke app.');

  await new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timeout);
      watcher.close();
      if (error) reject(error);
      else resolve();
    };
    const watcher = watch(directory, async (_event, file) => {
      if (file !== 'receipt.json') return;
      const result = JSON.parse(await readFile(receipt, 'utf8'));
      console.log(`Native updater: ${result.status} (v${result.version}).`);
      if (result.status.startsWith('error:')) finish(new Error(result.status));
      else if (result.status === 'installed' && result.version === '1.0.1') finish();
    });
    const timeout = setTimeout(
      () => finish(new Error(`Native update did not relaunch version 1.0.1. ${output}`)),
      120_000,
    );
    child = spawn(join(applications[0], 'Contents/MacOS/Electron'), [], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.on('error', finish);
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (data) => {
        output = (output + data).slice(-10_000);
      });
  });
  console.log(
    'Native self-signed update passed: 1.0.0 downloaded, installed, and relaunched as 1.0.1.',
  );
} catch (error) {
  console.error('Native update smoke failed:', error);
  throw error;
} finally {
  if (child?.exitCode === null) child.kill();
  if (trustRemoved) {
    await execute('/usr/bin/sudo', [
      'security',
      'add-trusted-cert',
      '-d',
      '-r',
      'trustRoot',
      '-p',
      'codeSign',
      '-k',
      process.env.CSC_KEYCHAIN,
      join(process.env.RUNNER_TEMP, 'opencodex-signing/certificate.pem'),
    ]);
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
