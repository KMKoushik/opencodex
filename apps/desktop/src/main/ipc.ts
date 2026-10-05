import { BrowserWindow, dialog, ipcMain } from 'electron';
import { desktopChannels } from '@opencodex/contracts/desktop';
import { createPreferences, preferenceInputSchema } from './preferences';
import { listOpenApps, openInApp, openAppInput, revealFile, revealFileInput } from './open-apps';
import type { createUpdates } from './updates';

export function registerNativeHandlers(
  allowedOrigin: string,
  preferences: ReturnType<typeof createPreferences>,
  updates: ReturnType<typeof createUpdates>,
) {
  function requireWindow(event: Electron.IpcMainInvokeEvent) {
    const frame = event.senderFrame;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      !frame ||
      frame !== event.sender.mainFrame ||
      new URL(frame.url).origin !== allowedOrigin
    ) {
      throw new Error('Untrusted native request.');
    }
    return window;
  }
  ipcMain.handle(desktopChannels.getFullscreen, (event) => requireWindow(event).isFullScreen());
  ipcMain.handle(desktopChannels.selectDirectory, async (event) => {
    const window = requireWindow(event);
    const result = await dialog.showOpenDialog(window, {
      title: 'Open project',
      properties: ['openDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(desktopChannels.getPreferences, (event) => {
    requireWindow(event);
    return preferences.get();
  });
  ipcMain.handle(desktopChannels.listOpenApps, (event) => {
    requireWindow(event);
    return listOpenApps();
  });
  ipcMain.handle(desktopChannels.openInApp, (event, input: unknown) => {
    requireWindow(event);
    return openInApp(openAppInput.parse(input));
  });
  ipcMain.handle(desktopChannels.revealFile, (event, input: unknown) => {
    requireWindow(event);
    return revealFile(revealFileInput.parse(input));
  });
  ipcMain.handle(desktopChannels.setPreference, (event, input: unknown) => {
    requireWindow(event);
    const { key, value } = preferenceInputSchema.parse(input);
    return preferences.set(key, value);
  });
  ipcMain.handle(desktopChannels.getUpdateState, (event) => {
    requireWindow(event);
    return updates.getState();
  });
  ipcMain.handle(desktopChannels.checkForUpdates, (event) => {
    requireWindow(event);
    return updates.check();
  });
  ipcMain.handle(desktopChannels.downloadUpdate, (event) => {
    requireWindow(event);
    return updates.download();
  });
  ipcMain.handle(desktopChannels.installUpdate, (event) => {
    requireWindow(event);
    return updates.install();
  });
}
