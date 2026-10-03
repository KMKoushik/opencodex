import { app, BrowserWindow, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { startGateway } from '@opencodex/gateway';
import { desktopChannels } from '@opencodex/contracts/desktop';
import { registerNativeHandlers } from './ipc';
import { createPreferences } from './preferences';
import { registerLinkHandlers } from './links';

// Keep existing development preferences when replacing Electron's default display name.
const userData = app.getPath('userData');
app.setName('OpenCodex');
app.setPath('userData', userData);

let gateway: Awaited<ReturnType<typeof startGateway>> | undefined;
let origin: string;
let quitting = false;

async function createWindow() {
  const window = new BrowserWindow({
    title: 'OpenCodex',
    width: 1240,
    height: 840,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#1a1a1d',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 13 } }
      : {}),
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  registerLinkHandlers(window, new URL(origin).origin);
  const sendFullscreen = (fullscreen: boolean) => {
    if (!window.webContents.isDestroyed())
      window.webContents.send(desktopChannels.fullscreenChanged, fullscreen);
  };
  window.on('enter-full-screen', () => sendFullscreen(true));
  window.on('leave-full-screen', () => sendFullscreen(false));
  window.once('ready-to-show', () => window.show());
  await window.loadURL(origin);
}

app
  .whenReady()
  .then(async () => {
    // Packaged builds take the icon from the bundle; show the calico in the Dock during development too.
    if (!app.isPackaged && process.platform === 'darwin')
      app.dock?.setIcon(fileURLToPath(new URL('../../build/icon.png', import.meta.url)));
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      origin = process.env.ELECTRON_RENDERER_URL;
    } else {
      gateway = await startGateway({
        assets: fileURLToPath(new URL('../renderer/', import.meta.url)),
      });
      origin = gateway.url;
    }
    const preferences = createPreferences();
    registerNativeHandlers(new URL(origin).origin, preferences);
    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  })
  .catch(() => {
    dialog.showErrorBox(
      'OpenCodex could not start',
      'The local workspace server could not be started. Please relaunch the app.',
    );
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  // The gateway is app-owned. The shared OpenCode service is not.
  void Promise.allSettled([gateway?.close()]).then(() => app.quit());
});
