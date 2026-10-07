import { BrowserWindow, ipcMain } from 'electron';
import { desktopToolChannels, type DesktopToolsBridge } from '@opencodex/contracts/desktop-tools';

/** Only the trusted app's main frame gets setup/status controls; page guests cannot invoke them. */
export function registerDesktopToolHandlers(origin: string, tools: DesktopToolsBridge) {
  function trust(event: Electron.IpcMainInvokeEvent) {
    const frame = event.senderFrame;
    if (
      !BrowserWindow.fromWebContents(event.sender) ||
      !frame ||
      frame !== event.sender.mainFrame ||
      new URL(frame.url).origin !== origin
    )
      throw new Error('Untrusted desktop controls request.');
  }
  ipcMain.handle(desktopToolChannels.status, (event) => {
    trust(event);
    return tools.status();
  });
  ipcMain.handle(desktopToolChannels.copyExtensionPairing, (event) => {
    trust(event);
    return tools.copyExtensionPairing();
  });
  ipcMain.handle(desktopToolChannels.disconnectExtension, (event) => {
    trust(event);
    return tools.disconnectExtension();
  });
  ipcMain.handle(desktopToolChannels.showExtensionFolder, (event) => {
    trust(event);
    return tools.showExtensionFolder();
  });
  ipcMain.handle(desktopToolChannels.openPermissionSettings, (event, kind: unknown) => {
    trust(event);
    if (kind !== 'accessibility' && kind !== 'screenRecording')
      throw new Error('Unknown permission.');
    return tools.openPermissionSettings(kind);
  });
  ipcMain.handle(desktopToolChannels.stop, (event) => {
    trust(event);
    return tools.stop();
  });
  ipcMain.handle(desktopToolChannels.requestPermissions, (event, kind: unknown) => {
    trust(event);
    if (kind !== 'accessibility' && kind !== 'screenRecording')
      throw new Error('Unknown permission.');
    return tools.requestPermissions(kind);
  });
  ipcMain.handle(desktopToolChannels.resume, (event) => {
    trust(event);
    return tools.resume();
  });
}
