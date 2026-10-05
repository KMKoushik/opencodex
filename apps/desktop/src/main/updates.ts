import { app, autoUpdater as nativeUpdater, BrowserWindow } from 'electron';
import updater from 'electron-updater';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { desktopChannels, type DesktopUpdateState } from '@opencodex/contracts/desktop';

export function createUpdates(beforeInstall: () => Promise<void>) {
  const disabledReason = !app.isPackaged
    ? 'Updates are available in installed builds, not development.'
    : process.platform !== 'darwin'
      ? 'In-app updates are currently available on macOS only.'
      : !existsSync(join(process.resourcesPath, 'app-update.yml'))
        ? 'This build has no update feed. Install the latest release manually.'
        : undefined;
  let state: DesktopUpdateState = {
    status: disabledReason ? 'disabled' : 'idle',
    currentVersion: app.getVersion(),
    ...(disabledReason ? { disabledReason } : {}),
  };
  const { autoUpdater } = updater;
  function publish(next: DesktopUpdateState) {
    state = next;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed())
        window.webContents.send(desktopChannels.updateStateChanged, state);
    }
  }
  function fail(error: unknown) {
    console.error('Desktop update failed:', error);
    publish({
      ...state,
      status: state.status === 'installing' ? 'ready' : state.version ? 'available' : 'error',
      percent: undefined,
      error: error instanceof Error ? error.message : 'The update could not be completed.',
    });
  }
  async function check() {
    // One operation at a time. Background checks must not replace a pending download/restart.
    if (!['idle', 'up-to-date', 'error'].includes(state.status)) return;
    publish({ currentVersion: state.currentVersion, status: 'checking' });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      fail(error);
    }
  }
  async function download() {
    if (state.status !== 'available') return;
    publish({ ...state, status: 'downloading', percent: 0, error: undefined });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      fail(error);
    }
  }
  function install() {
    if (state.status !== 'ready') return;
    publish({ ...state, status: 'installing', error: undefined });
    // Only explicit restart stages the ZIP with Squirrel. Ordinary app quit never installs it.
    // Wait for its signature verification before closing the gateway or any windows.
    try {
      nativeUpdater.checkForUpdates();
    } catch (error) {
      fail(error);
    }
  }

  if (!disabledReason) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on('error', fail);
    autoUpdater.on('update-available', (info) => {
      publish({ currentVersion: state.currentVersion, status: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      publish({ currentVersion: state.currentVersion, status: 'up-to-date' });
    });
    autoUpdater.on('download-progress', ({ percent }) => {
      if (state.status !== 'downloading' || !Number.isFinite(percent)) return;
      const next = Math.min(100, Math.max(0, Math.floor(percent)));
      if (next !== state.percent) publish({ ...state, percent: next });
    });
    autoUpdater.on('update-downloaded', (info) => {
      publish({ currentVersion: state.currentVersion, status: 'ready', version: info.version });
    });
    nativeUpdater.on('update-downloaded', () => {
      if (state.status !== 'installing') return;
      void beforeInstall()
        .then(() => autoUpdater.quitAndInstall())
        .catch(fail);
    });
    const startup = setTimeout(() => void check(), 15_000);
    const polling = setInterval(() => void check(), 60 * 60 * 1000);
    startup.unref();
    polling.unref();
    app.once('will-quit', () => {
      clearTimeout(startup);
      clearInterval(polling);
    });
  }
  return { getState: () => state, check, download, install };
}
