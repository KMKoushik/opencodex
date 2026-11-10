import { CANVAS_CHANNEL, type CanvasInit, type CanvasTheme } from '@opencodex/contracts/canvas';

/** One console message or uncaught error from a previewed page. */
export type PageLog = { level: 'error' | 'warning' | 'log'; text: string };

export type PageRender = {
  /** The page's height at this width, in CSS pixels. */
  contentHeight: number;
  /** Wider than the frame means the page overflows sideways. */
  scrollWidth: number;
  /** Screenshots from the top, each at most `PREVIEW_TILE` tall. */
  tiles: Buffer[];
  logs: PageLog[];
};

/**
 * Renders the canvas frame shell at `url`, runs `script` in it (which hands the page to the
 * bridge), waits until the bridge reports the page loaded, then measures and captures it.
 * The desktop app passes one that uses Electron's own Chromium.
 */
export type PageRenderer = (input: {
  url: string;
  script: string;
  width: number;
  scheme: 'light' | 'dark';
}) => Promise<PageRender>;

export const PREVIEW_TILE = 1200;
export const PREVIEW_MAX_TILES = 4;
/** How long a page gets to load and settle. */
export const PREVIEW_TIMEOUT = 20_000;

/** What canvas_check renders: the reply column, a phone, and the light theme. */
export const PREVIEW_VARIANTS = [
  { width: 728, scheme: 'dark' },
  { width: 390, scheme: 'dark' },
  { width: 728, scheme: 'light' },
] as const;

const FONTS = {
  '--font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  '--font-mono':
    "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
};

/** OpenCodex's default theme; previews don't depend on which preset the user picked. */
export const PREVIEW_THEMES: Record<'light' | 'dark', CanvasTheme> = {
  dark: {
    scheme: 'dark',
    vars: {
      ...FONTS,
      '--project-gray': '#8b8b93',
      '--project-blue': '#6c9cf0',
      '--project-green': '#5fb98b',
      '--project-orange': '#e3925f',
      '--project-pink': '#e07ab5',
      '--project-purple': '#9d86ec',
      '--surface': '#1a1a1d',
      '--elevated': '#232327',
      '--control': '#2a2a2f',
      '--text': '#ededf0',
      '--text-secondary': '#b4b4bc',
      '--text-tertiary': '#85858f',
      '--border': '#2e2e34',
      '--border-heavy': '#3c3c43',
      '--hover': 'rgba(255, 255, 255, 0.06)',
      '--secondary': '#26262b',
      '--primary': '#ededf0',
      '--on-primary': '#1a1a1d',
      '--accent': '#6c9cf0',
      '--error': '#ff7b72',
      '--success': '#5fd47f',
      '--warning': '#e2b85a',
      '--code-bg': '#202024',
    },
  },
  light: {
    scheme: 'light',
    vars: {
      ...FONTS,
      '--project-gray': '#5e5e5e',
      '--project-blue': '#356fcd',
      '--project-green': '#2f7555',
      '--project-orange': '#b96738',
      '--project-pink': '#b24287',
      '--project-purple': '#674ac2',
      '--surface': '#f9f9f8',
      '--elevated': '#ffffff',
      '--control': '#f1f1ef',
      '--text': '#18181a',
      '--text-secondary': '#55555c',
      '--text-tertiary': '#85858c',
      '--border': '#e4e4e1',
      '--border-heavy': '#d2d2ce',
      '--hover': 'rgba(0, 0, 0, 0.04)',
      '--secondary': '#efefed',
      '--primary': '#18181a',
      '--on-primary': '#ffffff',
      '--accent': '#356fcd',
      '--error': '#c4352b',
      '--success': '#237a3b',
      '--warning': '#b25e09',
      '--code-bg': '#f2f2f0',
    },
  },
};

/** The script that hands a page to the bridge in a top-level preview window. */
export function previewScript(init: Omit<CanvasInit, 'type'>) {
  const message = { channel: CANVAS_CHANNEL, type: 'init', ...init };
  return `window.postMessage(${JSON.stringify(message)}, '*');`;
}

let fallback: Promise<PageRenderer | undefined> | undefined;

/**
 * Outside the desktop app (development, a standalone gateway), previews use Playwright with
 * the installed Chrome when both are available. It's a development dependency, so packaged
 * builds rely on the renderer the desktop app passes in.
 */
export function playwrightRenderer() {
  return (fallback ??= (async () => {
    const name = 'playwright-core';
    try {
      const { chromium } = (await import(
        /* @vite-ignore */ name
      )) as typeof import('playwright-core');
      return (async ({ url, script, width, scheme }) => {
        const browser = await chromium.launch({ channel: 'chrome' });
        try {
          const page = await browser.newPage({
            viewport: { width, height: PREVIEW_TILE },
            colorScheme: scheme,
          });
          const logs: PageLog[] = [];
          page.on('console', (message) => {
            const type = message.type();
            const level = type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'log';
            logs.push({ level, text: message.text() });
          });
          page.on('pageerror', (error) =>
            logs.push({ level: 'error', text: `Uncaught ${error.stack ?? error.message}` }),
          );
          await page.goto(url);
          await page.evaluate(script);
          await page.waitForFunction(
            () => (window as { __opencodexRendered?: number }).__opencodexRendered,
            undefined,
            { timeout: PREVIEW_TIMEOUT },
          );
          await page.waitForTimeout(400);
          const size = await page.evaluate(() => ({
            contentHeight: Math.ceil(document.documentElement.getBoundingClientRect().height),
            scrollWidth: document.documentElement.scrollWidth,
          }));
          const shown = Math.max(1, Math.min(size.contentHeight, PREVIEW_TILE * PREVIEW_MAX_TILES));
          await page.setViewportSize({ width, height: shown });
          await page.waitForTimeout(100);
          const tiles: Buffer[] = [];
          for (let top = 0; top < shown; top += PREVIEW_TILE) {
            const height = Math.min(PREVIEW_TILE, shown - top);
            tiles.push(await page.screenshot({ clip: { x: 0, y: top, width, height } }));
          }
          return { ...size, tiles, logs };
        } finally {
          await browser.close();
        }
      }) satisfies PageRenderer;
    } catch {
      return undefined;
    }
  })());
}
