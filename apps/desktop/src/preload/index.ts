import { contextBridge, ipcRenderer } from 'electron';
import { desktopChannels, type DesktopBridge } from '@opencodex/contracts/desktop';

const desktop: DesktopBridge = {
  platform: process.platform,
  selectDirectory: () => ipcRenderer.invoke(desktopChannels.selectDirectory),
  getPreferences: () => ipcRenderer.invoke(desktopChannels.getPreferences),
  setPreference: (key, value) => ipcRenderer.invoke(desktopChannels.setPreference, { key, value }),
};

contextBridge.exposeInMainWorld('desktop', desktop);
