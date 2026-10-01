import { contextBridge, ipcRenderer } from 'electron';
import { desktopChannels, type DesktopBridge } from '@opencodex/contracts/desktop';

const desktop: DesktopBridge = {
  platform: process.platform,
  selectDirectory: () => ipcRenderer.invoke(desktopChannels.selectDirectory),
  getPreferences: () => ipcRenderer.invoke(desktopChannels.getPreferences),
  setPreference: (key, value) => ipcRenderer.invoke(desktopChannels.setPreference, { key, value }),
  listOpenApps: () => ipcRenderer.invoke(desktopChannels.listOpenApps),
  openInApp: (directory, appID) =>
    ipcRenderer.invoke(desktopChannels.openInApp, { directory, appID }),
};

contextBridge.exposeInMainWorld('desktop', desktop);
