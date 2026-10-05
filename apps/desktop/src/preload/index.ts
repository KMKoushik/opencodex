import { contextBridge, ipcRenderer } from 'electron';
import { desktopChannels, type DesktopBridge } from '@opencodex/contracts/desktop';

const desktop: DesktopBridge = {
  platform: process.platform,
  getFullscreen: () => ipcRenderer.invoke(desktopChannels.getFullscreen),
  onFullscreenChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, fullscreen: boolean) =>
      callback(fullscreen);
    ipcRenderer.on(desktopChannels.fullscreenChanged, listener);
    return () => ipcRenderer.removeListener(desktopChannels.fullscreenChanged, listener);
  },
  selectDirectory: () => ipcRenderer.invoke(desktopChannels.selectDirectory),
  getPreferences: () => ipcRenderer.invoke(desktopChannels.getPreferences),
  setPreference: (key, value) => ipcRenderer.invoke(desktopChannels.setPreference, { key, value }),
  listOpenApps: () => ipcRenderer.invoke(desktopChannels.listOpenApps),
  openInApp: (directory, appID) =>
    ipcRenderer.invoke(desktopChannels.openInApp, { directory, appID }),
  getUpdateState: () => ipcRenderer.invoke(desktopChannels.getUpdateState),
  onUpdateStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) =>
      callback(state);
    ipcRenderer.on(desktopChannels.updateStateChanged, listener);
    return () => ipcRenderer.removeListener(desktopChannels.updateStateChanged, listener);
  },
  checkForUpdates: () => ipcRenderer.invoke(desktopChannels.checkForUpdates),
  downloadUpdate: () => ipcRenderer.invoke(desktopChannels.downloadUpdate),
  installUpdate: () => ipcRenderer.invoke(desktopChannels.installUpdate),
};

contextBridge.exposeInMainWorld('desktop', desktop);
