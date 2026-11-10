import { BrowserWindow } from 'electron';
import {
  PREVIEW_MAX_TILES,
  PREVIEW_TILE,
  PREVIEW_TIMEOUT,
  type PageLog,
  type PageRenderer,
} from '@opencodex/gateway';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Renders canvas previews with Electron's own Chromium, so packaged apps need no browser
 * installed. Each preview gets a hidden offscreen window in an in-memory session; the page
 * can't open windows or navigate, and the frame shell's CSP limits what it loads.
 */
export const renderCanvasPreview: PageRenderer = async ({ url, script, width, scheme }) => {
  const window = new BrowserWindow({
    show: false,
    width,
    height: PREVIEW_TILE,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'canvas-preview',
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => event.preventDefault());
  const logs: PageLog[] = [];
  contents.on('console-message', (event) => {
    const { level, message } = event;
    // Development builds warn about the shell's CSP in every window; it isn't the page's.
    if (level === 'debug' || message.includes('Electron Security Warning')) return;
    logs.push({ level: level === 'info' ? 'log' : level, text: message });
  });
  try {
    await window.loadURL(url);
    // Before any page is loaded the debugger never answers; the canvas is written after this.
    contents.debugger.attach();
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme }],
    });
    await contents.executeJavaScript(script);
    const deadline = Date.now() + PREVIEW_TIMEOUT;
    while (!(await contents.executeJavaScript('window.__opencodexRendered || 0'))) {
      if (Date.now() > deadline) throw new Error('The page didn’t finish loading in 20 seconds.');
      await delay(100);
    }
    // Let charts and fonts settle after the load event.
    await delay(400);
    const size = (await contents.executeJavaScript(
      '({ contentHeight: Math.ceil(document.documentElement.getBoundingClientRect().height), scrollWidth: document.documentElement.scrollWidth })',
    )) as { contentHeight: number; scrollWidth: number };
    const shown = Math.max(1, Math.min(size.contentHeight, PREVIEW_TILE * PREVIEW_MAX_TILES));
    window.setContentSize(width, shown);
    await delay(200);
    const tiles: Buffer[] = [];
    for (let top = 0; top < shown; top += PREVIEW_TILE) {
      const height = Math.min(PREVIEW_TILE, shown - top);
      tiles.push((await contents.capturePage({ x: 0, y: top, width, height })).toPNG());
    }
    return { ...size, tiles, logs };
  } finally {
    window.destroy();
  }
};
