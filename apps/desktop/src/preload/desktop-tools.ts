import { ipcRenderer } from 'electron';
import { desktopToolChannels, type DesktopToolsBridge } from '@opencodex/contracts/desktop-tools';

export const desktopTools: DesktopToolsBridge = {
  status: () => ipcRenderer.invoke(desktopToolChannels.status),
  copyExtensionPairing: () => ipcRenderer.invoke(desktopToolChannels.copyExtensionPairing),
  showExtensionFolder: () => ipcRenderer.invoke(desktopToolChannels.showExtensionFolder),
  disconnectExtension: () => ipcRenderer.invoke(desktopToolChannels.disconnectExtension),
  openPermissionSettings: (kind) =>
    ipcRenderer.invoke(desktopToolChannels.openPermissionSettings, kind),
  stop: () => ipcRenderer.invoke(desktopToolChannels.stop),
  requestPermissions: (kind) => ipcRenderer.invoke(desktopToolChannels.requestPermissions, kind),
  resume: () => ipcRenderer.invoke(desktopToolChannels.resume),
};
