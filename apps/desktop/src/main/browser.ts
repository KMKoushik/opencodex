import {
  clipboard,
  Menu,
  net,
  session,
  shell,
  webContents,
  type BrowserWindow,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import {
  browserPartition,
  browserFileScheme,
  desktopChannels,
  type BrowserAnnotation,
} from '@opencodex/contracts/desktop';
import { textMenuItems } from './context-menu';
import { annotationOverlay } from './annotation-overlay';
import { createLocalPages } from './local-pages';

const localPages = createLocalPages();

// `navigator.clipboard.writeText()` needs this in both the request and check handlers.
const allowedPermissions = new Set(['clipboard-sanitized-write']);

const isWebURL = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

let profileReady = false;
function prepareProfile() {
  if (profileReady) return;
  profileReady = true;
  const profile = session.fromPartition(browserPartition);
  profile.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(allowedPermissions.has(permission)),
  );
  profile.setPermissionCheckHandler((_contents, permission) => allowedPermissions.has(permission));
  profile.protocol.handle(browserFileScheme, async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response(null, { status: 405 });
    try {
      const path = await localPages.path(request.url);
      return await net.fetch(pathToFileURL(path).href, {
        method: request.method,
        bypassCustomProtocolHandlers: true,
      });
    } catch {
      return new Response('The local preview file could not be loaded.', { status: 404 });
    }
  });
}

/**
 * Browser panel pages are `<webview>` guests of the app window. Every guest is forced into
 * the browser profile with a locked-down, script-free host configuration, whatever the
 * renderer asked for; guests can only show web pages and never reach the app's bridge.
 */
export function registerBrowser(window: BrowserWindow) {
  prepareProfile();
  const embedder = window.webContents;
  embedder.on('will-attach-webview', (event, preferences, params) => {
    if (
      params.partition !== browserPartition ||
      (params.src && params.src !== 'about:blank' && !isWebURL(params.src))
    ) {
      event.preventDefault();
      return;
    }
    delete preferences.preload;
    delete (params as { preload?: string }).preload;
    params.allowpopups = 'true';
    Object.assign(preferences, {
      partition: browserPartition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      // Chromium's PDF viewer for PDFs opened in a browser tab.
      plugins: true,
      spellcheck: true,
    });
  });
  embedder.on('did-attach-webview', (_event, guest) => {
    const openTab = (url: string) => {
      if ((isWebURL(url) || localPages.owns(guest.id, url)) && !embedder.isDestroyed())
        embedder.send(desktopChannels.browserOpenTab, {
          webContentsId: guest.id,
          url: localPages.displayURL(url),
        });
    };
    guest.setWindowOpenHandler(({ url }) => {
      openTab(url);
      return { action: 'deny' };
    });
    const restrict = (event: Electron.Event, url: string) => {
      if (!isWebURL(url) && url !== 'about:blank' && !localPages.owns(guest.id, url))
        event.preventDefault();
    };
    guest.on('will-navigate', restrict);
    guest.on('will-redirect', restrict);
    guest.on('dom-ready', () => {
      if (!localPages.owns(guest.id, guest.getURL())) return;
      // A browser canvas is white by default, not the dark host behind the transparent guest.
      // Normal user-origin CSS stays below the document's own author styles in the cascade.
      void guest
        .insertCSS('html { background-color: #fff; }', { cssOrigin: 'user' })
        .catch(() => undefined);
    });
    guest.once('destroyed', () => localPages.release(guest.id));
    guest.on('context-menu', (_event, params) => {
      const items = guestMenu(window, guest, params, openTab);
      if (items.length) Menu.buildFromTemplate(items).popup({ window });
    });
  });
}

function guestMenu(
  window: BrowserWindow,
  guest: WebContents,
  params: Electron.ContextMenuParams,
  openTab: (url: string) => void,
) {
  const openExternal = (url: string) => {
    if (isWebURL(url)) void shell.openExternal(url).catch(() => undefined);
  };
  const items: MenuItemConstructorOptions[] = [];
  const group = (entries: MenuItemConstructorOptions[]) => {
    if (!entries.length) return;
    if (items.length) items.push({ type: 'separator' });
    items.push(...entries);
  };
  const { linkURL, mediaType, hasImageContents, srcURL, x, y } = params;
  if (linkURL && (isWebURL(linkURL) || localPages.owns(guest.id, linkURL)))
    group([
      { label: 'Open Link in New Tab', click: () => openTab(linkURL) },
      ...(isWebURL(linkURL)
        ? [{ label: 'Open Link in System Browser', click: () => openExternal(linkURL) }]
        : []),
      { label: 'Copy Link', click: () => clipboard.writeText(localPages.displayURL(linkURL)) },
    ]);
  if (mediaType === 'image' && hasImageContents)
    group([
      { label: 'Copy Image', click: () => !guest.isDestroyed() && guest.copyImageAt(x, y) },
      ...(isWebURL(srcURL)
        ? [{ label: 'Copy Image Address', click: () => clipboard.writeText(srcURL) }]
        : []),
    ]);
  group(textMenuItems(window, guest, params, (url) => openTab(url)));
  if (!linkURL && !params.isEditable && !params.selectionText.trim()) {
    const history = guest.navigationHistory;
    group([
      { label: 'Back', enabled: history.canGoBack(), click: () => history.goBack() },
      { label: 'Forward', enabled: history.canGoForward(), click: () => history.goForward() },
      { label: 'Reload', click: () => guest.reload() },
    ]);
  }
  group([{ label: 'Inspect Element', click: () => guest.inspectElement(x, y) }]);
  return items;
}

// Electron uses world 999 for preload isolation; the overlay gets a world of its own.
const ANNOTATION_WORLD = 1307;
const cssValue = z.string().max(200);
const annotateInput = z.object({
  webContentsId: z.number().int().positive(),
  theme: z.object({
    primary: cssValue,
    onPrimary: cssValue,
    surface: cssValue,
    text: cssValue,
    muted: cssValue,
    border: cssValue,
    font: cssValue,
  }),
});
const cancelInput = annotateInput.pick({ webContentsId: true });
const rect = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1).max(16384),
  height: z.number().int().min(1).max(16384),
});
// The guest renderer computes the result; treat it as untrusted.
const overlayResult = z
  .object({
    annotation: z.object({
      url: z.string().max(8192),
      title: z.string().max(300),
      comment: z.string().max(4000),
      elements: z
        .array(
          z.object({
            tag: z.string().max(100),
            selector: z.string().max(500),
            text: z.string().max(200),
            html: z.string().max(500),
          }),
        )
        .max(20),
      regions: z.number().int().min(0).max(50),
      drawings: z.number().int().min(0).max(50),
    }),
    crop: rect.nullable(),
  })
  .nullable();

/** A browser panel page hosted by `window`, never another window's page or another profile. */
export function browserGuest(window: BrowserWindow, id: number) {
  const guest = webContents.fromId(id);
  if (
    !guest ||
    guest.isDestroyed() ||
    guest.getType() !== 'webview' ||
    guest.hostWebContents !== window.webContents ||
    guest.session !== session.fromPartition(browserPartition)
  )
    throw new Error('Choose a browser panel page.');
  return guest;
}

const browserFileInput = z.object({
  webContentsId: z.number().int().positive(),
  url: z.string().max(8192),
});
export async function loadBrowserFile(window: BrowserWindow, input: unknown) {
  const { webContentsId, url } = browserFileInput.parse(input);
  const guest = browserGuest(window, webContentsId);
  const target = await localPages.grant(guest.id, url);
  if (guest.isDestroyed()) {
    localPages.release(guest.id);
    return;
  }
  await guest.loadURL(target);
}

/** Settles with null if the page navigates away, crashes, or closes before `task` settles. */
function whilePageStays<T>(guest: WebContents, task: Promise<T>) {
  return new Promise<T | null>((resolve, reject) => {
    const settle = (result: () => void) => {
      guest.off('did-start-navigation', navigated);
      guest.off('render-process-gone', gone);
      guest.off('destroyed', gone);
      result();
    };
    const gone = () => settle(() => resolve(null));
    const navigated = (
      details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
    ) => {
      if (details.isMainFrame && !details.isSameDocument) gone();
    };
    guest.on('did-start-navigation', navigated);
    guest.on('render-process-gone', gone);
    guest.on('destroyed', gone);
    task.then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error)),
    );
  });
}

async function screenshot(guest: WebContents, crop: z.infer<typeof rect> | null) {
  let timer: Parameters<typeof clearTimeout>[0];
  // A wedged compositor never settles `capturePage`; the comment still attaches without it.
  const image = await Promise.race([
    guest.capturePage(crop ?? undefined).catch(() => undefined),
    new Promise<undefined>((resolve) => (timer = setTimeout(resolve, 5000))),
  ]).finally(() => clearTimeout(timer));
  if (!image || image.isEmpty()) return;
  const { width, height } = image.getSize();
  const scale = Math.min(1, 2000 / Math.max(width, height));
  return (
    scale < 1
      ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale) })
      : image
  ).toDataURL();
}

export async function annotateBrowserPage(
  window: BrowserWindow,
  input: unknown,
): Promise<BrowserAnnotation | null> {
  const { webContentsId, theme } = annotateInput.parse(input);
  const guest = browserGuest(window, webContentsId);
  const code = `(${annotationOverlay.toString()})(${JSON.stringify(theme)})`;
  const result = overlayResult.parse(
    (await whilePageStays(
      guest,
      guest.executeJavaScriptInIsolatedWorld(ANNOTATION_WORLD, [{ code }], true),
    )) ?? null,
  );
  if (!result) return null;
  try {
    return {
      ...result.annotation,
      url: localPages.displayURL(result.annotation.url),
      screenshot: await screenshot(guest, result.crop),
    };
  } finally {
    await closeOverlay(guest, 'close');
  }
}

export async function cancelBrowserAnnotation(window: BrowserWindow, input: unknown) {
  await closeOverlay(browserGuest(window, cancelInput.parse(input).webContentsId), 'cancel');
}

function closeOverlay(guest: WebContents, action: 'cancel' | 'close') {
  if (guest.isDestroyed()) return;
  return guest
    .executeJavaScriptInIsolatedWorld(ANNOTATION_WORLD, [
      { code: `globalThis.__opencodexAnnotation?.${action}()` },
    ])
    .then(
      () => undefined,
      () => undefined,
    );
}
