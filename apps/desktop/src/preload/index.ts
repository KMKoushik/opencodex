import { contextBridge, ipcRenderer } from 'electron';
import { desktopChannels, type DesktopBridge } from '@opencodex/contracts/desktop';
import { desktopTools } from './desktop-tools';

const desktop: DesktopBridge = {
  tools: desktopTools,
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
  revealFile: (path) => ipcRenderer.invoke(desktopChannels.revealFile, { path }),
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
  onBrowserOpenTab: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, request: Parameters<typeof callback>[0]) =>
      callback(request);
    ipcRenderer.on(desktopChannels.browserOpenTab, listener);
    return () => ipcRenderer.removeListener(desktopChannels.browserOpenTab, listener);
  },
  annotateBrowserPage: (webContentsId, theme) =>
    ipcRenderer.invoke(desktopChannels.annotateBrowserPage, { webContentsId, theme }),
  loadBrowserFile: (webContentsId, url) =>
    ipcRenderer.invoke(desktopChannels.loadBrowserFile, { webContentsId, url }),
  cancelBrowserAnnotation: (webContentsId) =>
    ipcRenderer.invoke(desktopChannels.cancelBrowserAnnotation, { webContentsId }),
  onBrowserControl: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, intent: Parameters<typeof callback>[0]) =>
      callback(intent);
    ipcRenderer.on(desktopChannels.browserControl, listener);
    return () => ipcRenderer.removeListener(desktopChannels.browserControl, listener);
  },
  registerBrowserControl: (input) =>
    ipcRenderer.invoke(desktopChannels.registerBrowserControl, input),
};

contextBridge.exposeInMainWorld('desktop', desktop);
