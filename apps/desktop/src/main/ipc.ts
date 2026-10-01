import { BrowserWindow, dialog, ipcMain } from 'electron';
import { desktopChannels } from '@opencodex/contracts/desktop';
import { createPreferences, preferenceInputSchema } from './preferences';

export function registerNativeHandlers(
  allowedOrigin: string,
  preferences: ReturnType<typeof createPreferences>,
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
  ipcMain.handle(desktopChannels.setPreference, (event, input: unknown) => {
    requireWindow(event);
    const { key, value } = preferenceInputSchema.parse(input);
    return preferences.set(key, value);
  });
}
