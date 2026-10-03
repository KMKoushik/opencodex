import {
  clipboard,
  dialog,
  Menu,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron';
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
    const { linkURL, mediaType, hasImageContents, x, y } = params;
    if (params.isEditable || (!linkURL && !(mediaType === 'image' && hasImageContents))) {
      showTextMenu(window, params, openLink);
      return;
    }
    const items: MenuItemConstructorOptions[] = [];
    if (mediaType === 'image' && hasImageContents)
      items.push({
        label: 'Copy image',
        click: () => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          try {
            window.webContents.copyImageAt(x, y);
          } catch {
            reportFailure('Could not copy the image.');
          }
        },
      });
    if (linkURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push(
        { label: 'Open link', enabled: isWebLink(linkURL), click: () => openLink(linkURL) },
        {
          label: 'Copy link',
          click: () => {
            void clipboard
              .writeText(linkURL)
              .catch(() => reportFailure('Could not copy the link.'));
          },
        },
      );
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window });
  });
}
