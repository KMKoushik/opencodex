import { createRequire } from 'node:module';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { watch, createReadStream } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'node:http';
import signMac from '../apps/desktop/scripts/sign-mac.mjs';

// Signing and installation run on DIFFERENT disposable Macs. The verifier never imports or
// trusts our certificate, avoiding macOS 14's hanging remove-trusted-cert command entirely.
if (process.platform !== 'darwin' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted')
  throw new Error('The native update smoke requires a disposable macOS runner.');
const artifacts = join(process.env.RUNNER_TEMP, 'opencodex-update-fixtures');
const execute = (file, args) =>
  new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
    child.stdin.end();
  });
const zip = (app, archive) =>
  execute('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);

async function verifyRequirements(installed, candidate) {
  const { stdout, stderr } = await execute('/usr/bin/codesign', ['-d', '-r-', installed]);
  const requirement = (stdout + stderr)
    .split('\n')
    .find((line) => line.startsWith('designated => '));
  if (!requirement) throw new Error('The installed smoke app has no designated requirement.');
  await execute('/usr/bin/codesign', [
    '--verify',
    `-R=${requirement.slice('designated => '.length)}`,
    candidate,
  ]);
  console.log('The candidate satisfies the installed app’s designated signing requirement.');
}

async function prepare() {
  if (!process.env.CSC_KEYCHAIN)
    throw new Error('Preparing fixtures requires the signing keychain.');
  const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
  const template = resolve(dirname(require('electron')), '../..');
  const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'opencodex-update-sign-'));
  await mkdir(artifacts);
  const applications = [];
  try {
    for (const [folder, version] of [
      ['installed', '1.0.0'],
      ['candidate', '1.0.1'],
    ]) {
      const app = join(directory, folder, 'OpenCodex Update Smoke.app');
      await mkdir(dirname(app));
      await cp(template, app, { recursive: true, verbatimSymlinks: true });
      for (const [key, value] of [
        ['CFBundleIdentifier', 'dev.opencodex.update-smoke'],
        ['CFBundleName', 'OpenCodex Update Smoke'],
        ['CFBundleVersion', version],
        ['CFBundleShortVersionString', version],
      ])
        await execute('/usr/libexec/PlistBuddy', [
          '-c',
          `Set :${key} ${value}`,
          join(app, 'Contents/Info.plist'),
        ]);
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
const path = require('node:path');
app.setName('OpenCodex Update Smoke');
app.setPath('userData', path.join(app.getPath('appData'), 'OpenCodex Update Smoke'));
const receipt = path.join(app.getPath('userData'), 'receipt.json');
function report(status) { fs.writeFileSync(receipt + '.tmp', JSON.stringify({status, version: app.getVersion()})); fs.renameSync(receipt + '.tmp', receipt); }
app.whenReady().then(() => {
  if (app.getVersion() === '1.0.1') { report('installed'); app.quit(); return; }
  autoUpdater.on('error', error => { report('error: ' + error.message); app.quit(); });
  autoUpdater.on('update-downloaded', () => { report('downloaded'); autoUpdater.quitAndInstall(); });
  const url = fs.readFileSync(path.join(app.getPath('userData'), 'feed.txt'), 'utf8');
  autoUpdater.setFeedURL({url});
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
        }),
      });
      await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
      await zip(app, join(artifacts, `${folder}.zip`));
      console.log(`Signed and archived smoke version ${version}.`);
      applications.push(app);
    }
    await verifyRequirements(...applications);
    // Only the PUBLIC certificate travels to the verifier, never the identity/private key.
    await cp(
      join(process.env.RUNNER_TEMP, 'opencodex-signing/certificate.pem'),
      join(artifacts, 'certificate.pem'),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function verify() {
  if (process.env.CSC_KEYCHAIN || process.env.CSC_LINK)
    throw new Error('Installation must run on a fresh runner with no signing credentials.');
  let trusted = false;
  try {
    await execute('/usr/bin/security', [
      'verify-cert',
      '-p',
      'codeSign',
      '-c',
      join(artifacts, 'certificate.pem'),
    ]);
    trusted = true;
  } catch (error) {
    if (
      error.killed ||
      !/not trusted|TrustFailure/i.test(`${error.stdout ?? ''}${error.stderr ?? ''}`)
    )
      throw error;
    console.log('Confirmed: the fresh runner does not trust the signing certificate.');
  }
  if (trusted)
    throw new Error('The test certificate is unexpectedly trusted on the verification runner.');
  const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'opencodex-update-install-'));
  const profile = join(process.env.HOME, 'Library/Application Support/OpenCodex Update Smoke');
  await mkdir(profile);
  const receipt = join(profile, 'receipt.json');
  let child;
  let output = '';
  const server = createServer((request, response) => {
    if (request.url === '/update.zip') {
      response.setHeader('Content-Type', 'application/zip');
      createReadStream(join(artifacts, 'candidate.zip')).pipe(response);
    } else {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ url: `${feed}/update.zip` }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const feed = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const folder of ['installed', 'candidate']) {
      await execute('/usr/bin/ditto', [
        '-x',
        '-k',
        join(artifacts, `${folder}.zip`),
        join(directory, folder),
      ]);
      await execute('/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        join(directory, folder, 'OpenCodex Update Smoke.app'),
      ]);
    }
    const installed = join(directory, 'installed/OpenCodex Update Smoke.app');
    await verifyRequirements(installed, join(directory, 'candidate/OpenCodex Update Smoke.app'));
    await writeFile(join(profile, 'feed.txt'), feed);
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        watcher.close();
        if (error) reject(error);
        else resolve();
      };
      const watcher = watch(profile, async (_event, file) => {
        if (file !== 'receipt.json' || settled) return;
        try {
          const result = JSON.parse(await readFile(receipt, 'utf8'));
          console.log(`Native updater: ${result.status} (v${result.version}).`);
          if (result.status.startsWith('error:')) finish(new Error(result.status));
          else if (result.status === 'installed' && result.version === '1.0.1') finish();
        } catch (error) {
          finish(error);
        }
      });
      const timeout = setTimeout(
        () => finish(new Error(`Native update did not relaunch version 1.0.1. ${output}`)),
        120_000,
      );
      child = spawn(join(installed, 'Contents/MacOS/Electron'), [], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.on('error', finish);
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (data) => {
          output = (output + data).slice(-10_000);
        });
    });
    console.log(
      'Native self-signed update passed on a fresh, untrusted Mac: 1.0.0 installed and relaunched as 1.0.1.',
    );
  } finally {
    if (child?.exitCode === null) child.kill();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
    await rm(profile, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--prepare') await prepare();
else if (process.argv[2] === '--verify') await verify();
else throw new Error('Choose --prepare (signing runner) or --verify (fresh runner).');
