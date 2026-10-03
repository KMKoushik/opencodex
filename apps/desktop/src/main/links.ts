import { clipboard, dialog, Menu, shell, type BrowserWindow } from 'electron';
import { showTextMenu } from './context-menu';

function isWebLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function registerLinkHandlers(window: BrowserWindow, origin: string) {
  const reportFailure = (message: string, detail?: string) => {
    if (!window.isDestroyed())
      void dialog.showMessageBox(window, { type: 'error', message, detail });
  };
  const openLink = (url: string) => {
    if (!isWebLink(url)) return;
    void shell.openExternal(url).catch(() => {
      reportFailure(
        'Could not open the link in your browser.',
        'You can copy the link and paste it into your browser instead.',
      );
    });
  };

  window.webContents.setWindowOpenHandler(({ url }) => {
    openLink(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === origin) return;
    event.preventDefault();
    openLink(url);
  });
  window.webContents.on('context-menu', (_event, params) => {
    const { linkURL } = params;
    if (params.isEditable || !linkURL) {
      showTextMenu(window, params, openLink);
      return;
    }
    Menu.buildFromTemplate([
      { label: 'Open link', enabled: isWebLink(linkURL), click: () => openLink(linkURL) },
      {
        label: 'Copy link',
        click: () => {
          void clipboard.writeText(linkURL).catch(() => reportFailure('Could not copy the link.'));
        },
      },
    ]).popup({ window });
  });
}
