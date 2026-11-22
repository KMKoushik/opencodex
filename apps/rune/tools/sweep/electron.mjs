/* global window, document */
// Real development main/preload; no replacement desktop bridge or gateway mocks.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { base, root, fixture, env, command, stopProcess } from './environment.mjs';
import { prepare } from './web.mjs';

export function installElectron() {
  const require = createRequire(root + '/apps/desktop/package.json');
  try {
    return require('electron');
  } catch {
    command('node', [root + '/apps/desktop/node_modules/electron/install.js']);
    return (
      root +
      '/apps/desktop/node_modules/electron/dist/' +
      readFileSync(root + '/apps/desktop/node_modules/electron/path.txt', 'utf8').trim()
    );
  }
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return [49374, 4977, 4507].includes(port) ? freePort() : port;
}
export async function launchElectron(
  playwright,
  executablePath,
  extras,
  state,
  theme,
  width,
  height,
) {
  const userData = fixture + `/electron/${state}-${theme}-${width}x${height}`;
  const launcher = userData + '/launcher';
  mkdirSync(launcher, { recursive: true });
  // The finite bootstrap only controls the genuine BrowserWindow's size/visibility.
  // The actual compiled app main creates the window, loads its own preload and
  // registers every production IPC handler. Package identity/version are preserved.
  const pkg = JSON.parse(readFileSync(root + '/apps/desktop/package.json', 'utf8'));
  writeFileSync(
    launcher + '/package.json',
    JSON.stringify({ name: pkg.name, version: pkg.version, main: 'index.cjs' }),
  );
  writeFileSync(
    launcher + '/index.cjs',
    `const {app,nativeTheme}=require('electron');
nativeTheme.themeSource=${JSON.stringify(theme)};
app.on('browser-window-created',(_,window)=>{
  window.setContentSize(${width},${height});
  window.webContents.setBackgroundThrottling(false);
  window.on('show',()=>window.hide());
  window.webContents.once('did-finish-load',()=>require('node:fs').writeFileSync(${JSON.stringify(userData + '/runtime.json')},JSON.stringify({versions:process.versions,contentSize:window.getContentSize(),visible:window.isVisible(),userData:app.getPath('userData')})));
});
import(${JSON.stringify('file://' + root + '/apps/desktop/out/main/index.js')}).catch(error=>{console.error(error);app.exit(1)});
`,
  );
  const launchEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith('ELECTRON_') && key !== 'NODE_OPTIONS'),
  );
  const port = await freePort();
  const fd = openSync(userData + '/electron.log', 'a');
  const child = spawn(
    executablePath,
    [
      launcher,
      '--user-data-dir=' + userData,
      '--force-device-scale-factor=2',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=' + port,
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],
    { cwd: root, env: { ...launchEnv, ELECTRON_RENDERER_URL: base }, stdio: ['ignore', fd, fd] },
  );
  closeSync(fd);
  let browser;
  const close = async () => {
    try {
      await browser?.close();
    } finally {
      await stopProcess(child);
    }
  };
  try {
    let endpoint;
    for (let attempt = 0; attempt < 300; attempt++) {
      if (child.exitCode !== null)
        throw new Error('Electron exited before CDP readiness; see ' + userData + '/electron.log');
      try {
        const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        endpoint = version.webSocketDebuggerUrl;
        if (endpoint) break;
      } catch {
        /* bounded CDP readiness */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!endpoint) throw new Error('Electron CDP did not start; see ' + userData + '/electron.log');
    browser = await playwright.chromium.connectOverCDP(endpoint, { timeout: 15000 });
    const context = browser.contexts()[0];
    let page = context.pages().find((page) => page.url().startsWith(base)) ?? context.pages()[0];
    if (!page) page = await context.waitForEvent('page', { timeout: 15000 });
    await page.waitForURL(base + '/');
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await prepare(context, extras, state);
    await page.waitForFunction(() => typeof window.desktop?.getPreferences === 'function');
    const folders = [{ name: 'atlas-api', directory: extras.project.canonical }];
    await page.evaluate(
      async ({ folders, state }) => {
        await window.desktop.setPreference(
          'projects',
          JSON.stringify(state === 'home-no-project' ? [] : folders),
        );
        await window.desktop.setPreference(
          'project',
          state === 'home-no-project' ? null : JSON.stringify(folders[0]),
        );
        await window.desktop.setPreference('threadView', 'projects');
      },
      { folders, state },
    );
    const runtime = JSON.parse(readFileSync(userData + '/runtime.json', 'utf8'));
    if (runtime.visible || runtime.contentSize[0] !== width || runtime.contentSize[1] !== height)
      throw new Error('Actual Electron window/preload mismatch: ' + JSON.stringify(runtime));
    return {
      app: { close },
      page,
      context,
      cdp,
      versions: runtime.versions,
      async capture(path) {
        const evidence = await page.evaluate(() => ({
          bridge:
            typeof window.desktop?.getUpdateState === 'function' &&
            typeof window.desktop?.onBrowserOpenTab === 'function',
          width: window.innerWidth,
          height: window.innerHeight,
          scale: window.devicePixelRatio,
          visibility: document.visibilityState,
        }));
        if (
          !evidence.bridge ||
          evidence.width !== width ||
          evidence.height !== height ||
          evidence.scale !== 2
        )
          throw new Error('Electron bridge/viewport mismatch: ' + JSON.stringify(evidence));
        const image = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: false,
        });
        writeFileSync(path, Buffer.from(image.data, 'base64'));
        return {
          ...evidence,
          mainContentSize: runtime.contentSize,
          windowHidden: !runtime.visible,
          mainModule: root + '/apps/desktop/out/main/index.js',
          userData: runtime.userData,
        };
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
