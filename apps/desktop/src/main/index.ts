import { app, BrowserWindow, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { startGateway } from '@opencodex/gateway';
import { registerNativeHandlers } from './ipc';
import { createPreferences } from './preferences';

let gateway: Awaited<ReturnType<typeof startGateway>> | undefined;
let origin: string;
let quitting = false;
let preferences: Awaited<ReturnType<typeof createPreferences>> | undefined;

async function createWindow() {
  const window = new BrowserWindow({
    title: 'OpenCodex',
    width: 1240,
    height: 840,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#1b1c1b',
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(origin).origin) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(origin);
}

app
  .whenReady()
  .then(async () => {
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      origin = process.env.ELECTRON_RENDERER_URL;
    } else {
      gateway = await startGateway({
        assets: fileURLToPath(new URL('../renderer/', import.meta.url)),
      });
      origin = gateway.url;
    }
    preferences = await createPreferences(join(app.getPath('userData'), 'preferences.json'));
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
  void Promise.allSettled([gateway?.close(), preferences?.flush()]).then(() => app.quit());
});
