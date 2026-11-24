import type { BrowserWindow, WebContents } from 'electron';
import { desktopChannels } from '@opencodex/contracts/desktop';

/**
 * Cmd+W closes the focused panel's tab, as in T3 Code. Keys typed in a browser page or a
 * canvas frame never reach the app's own listeners, and the terminal reads every key, so
 * the shortcut is taken here, before the default menu's Close Window, for the window and
 * each browser page in it. The renderer closes the window itself when no panel is open.
 */
export function routeCloseTab(window: BrowserWindow, contents: WebContents) {
  if (process.platform !== 'darwin') return;
  contents.on('before-input-event', (event, input) => {
    if (
      input.type !== 'keyDown' ||
      !input.meta ||
      input.control ||
      input.alt ||
      input.shift ||
      input.key.toLowerCase() !== 'w'
    )
      return;
    event.preventDefault();
    // Holding the keys must not close tab after tab and then the window.
    if (!input.isAutoRepeat && !window.webContents.isDestroyed())
      window.webContents.send(desktopChannels.closeTab);
  });
}
