/**
 * Canvas frame runtime. The frame loads a fixed shell with this script, under the shell's
 * opaque origin and Content-Security-Policy. The host then sends the agent's page, and this
 * script writes it into the frame with `document.open()`, so the page's own markup, styles
 * and scripts run exactly as written while `window.canvas` stays the bridge to the host:
 * saved data, the app's server functions, and links.
 *
 * The page is written once per frame load. Showing it again (values changed outside it, the
 * agent edited it) has the host reload the frame, so its scripts get a fresh realm instead of
 * meeting their own earlier `const` declarations. `document.open()` erases every listener on the
 * window, so the runtime attaches its own again after the write.
 */
import type {
  CanvasInit,
  CanvasTheme,
  FrameMessage,
  HostMessage,
} from '@opencodex/contracts/canvas';
import { annotationOverlay } from './annotation-overlay';

const CHANNEL = 'opencodex-canvas';
const HOST_STYLE = 'opencodex-canvas-host';
type Outgoing = FrameMessage extends infer M
  ? M extends unknown
    ? Omit<M, 'channel'>
    : never
  : never;
const post = (message: Outgoing) =>
  window.parent.postMessage({ channel: CHANNEL, ...message }, '*');

type Events = {
  data: (key: string, value: unknown) => void;
  running: (names: readonly string[]) => void;
  theme: (scheme: 'light' | 'dark') => void;
};
const listeners: { [K in keyof Events]: Set<Events[K]> } = {
  data: new Set(),
  running: new Set(),
  theme: new Set(),
};

let mode: CanvasInit['mode'] = 'panel';
let theme: CanvasTheme = { scheme: 'dark', vars: {} };
let html = '';
const data: Record<string, unknown> = {};
let running: readonly string[] = [];
let shown = false;
let pending: ReturnType<typeof setTimeout> | undefined;
let lastHeight = 0;
let sizes: ResizeObserver | undefined;
let nextCall = 0;
const calls = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
const reported = new Set<string>();

function emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
  for (const listener of listeners[event])
    try {
      (listener as (...values: unknown[]) => void)(...args);
    } catch (error) {
      report(error);
    }
}

/** What the page sees as `window.canvas`. */
const canvas = Object.freeze({
  /** Every saved value by key (`data/<key>.json`); kept current as values change. */
  data,
  get(key: string, fallback?: unknown) {
    return key in data ? data[key] : fallback;
  },
  /** Saves a value, or a function of the current one. Other open views see it live. */
  set(key: string, next: unknown) {
    const value =
      typeof next === 'function' ? (next as (value: unknown) => unknown)(data[key]) : next;
    if (value === undefined) delete data[key];
    else data[key] = value;
    post({ type: 'set', key, value });
  },
  /** Runs an exported function of the canvas's server.ts and resolves with its result. */
  call(name: string, ...args: unknown[]) {
    const call = ++nextCall;
    post({ type: 'call', call, name, args });
    return new Promise<unknown>((resolve, reject) => calls.set(call, { resolve, reject }));
  },
  /** Server functions running now, from any caller: this page, a schedule, the agent. */
  get running() {
    return running;
  },
  get scheme() {
    return theme.scheme;
  },
  /** Opens a web link in the browser, or `{ session }` (from `oc.run`) as a chat. */
  open(target: string | { session: string }) {
    post({ type: 'open', target });
  },
  /**
   * `data` fires for values changed outside this page. Without a `data` listener the page
   * reloads with the new values, which suits pages that read `canvas.data` once.
   */
  on<K extends keyof Events>(event: K, listener: Events[K]) {
    listeners[event].add(listener);
    return () => listeners[event].delete(listener);
  },
});
Object.defineProperty(window, 'canvas', { value: canvas, enumerable: true });

/** Theme variables, palette aliases, and a minimal base the page's own CSS overrides. */
function hostCss() {
  const vars = Object.entries(theme.vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  const palette = (name: string, token: string, fallback: string, light: number, dark: number) =>
    `--${name}:light-dark(oklch(from var(${token},${fallback}) ${light} min(c,0.16) h),oklch(from var(${token},${fallback}) ${dark} min(c,0.15) h))`;
  const colors = [
    palette('blue', '--project-blue', '#356fcd', 0.58, 0.7),
    palette('green', '--project-green', '#2f7555', 0.58, 0.72),
    palette('orange', '--project-orange', '#b96738', 0.62, 0.74),
    palette('purple', '--project-purple', '#674ac2', 0.56, 0.7),
    palette('pink', '--project-pink', '#b24287', 0.58, 0.72),
    palette('red', '--error', '#ff7b72', 0.6, 0.72),
    palette('yellow', '--warning', '#e2b85a', 0.7, 0.82),
    '--gray:var(--text-tertiary)',
    '--chart-1:var(--blue)',
    '--chart-2:var(--orange)',
    '--chart-3:var(--green)',
    '--chart-4:var(--purple)',
    '--chart-5:var(--pink)',
    '--chart-6:var(--yellow)',
  ].join(';');
  const inline = mode === 'inline';
  // An inline frame sits on the chat and grows to fit (scrolling inside past the host's
  // cap); a preview renders it on its own.
  const framed = inline && window.parent !== window;
  // One line, so line numbers in the page's error messages match index.html.
  return (
    `:root{${vars};${colors};color-scheme:${theme.scheme}}` +
    `html{background:${framed ? 'transparent' : 'var(--surface)'};color:var(--text);font-family:var(--font-sans);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%${framed ? ';overflow-x:hidden;scrollbar-width:none' : ''}}` +
    (framed ? 'html::-webkit-scrollbar{display:none}' : '') +
    `body{margin:0${inline ? '' : ';padding:24px 28px'}}code,kbd,pre,samp{font-family:var(--font-mono)}`
  );
}

/** The page with the host stylesheet first in its head, in standards mode. */
function compose(page: string) {
  const style = `<style id="${HOST_STYLE}">${hostCss()}</style>`;
  const head = page.match(/<head\b[^>]*>/i);
  if (head) return page.replace(head[0], head[0] + style);
  const root = page.match(/<html\b[^>]*>/i);
  if (root) return page.replace(root[0], root[0] + style);
  return (/^\s*<!doctype/i.test(page) ? '' : '<!doctype html>') + style + page;
}

function render(scroll = 0) {
  sizes?.disconnect();
  document.open();
  document.write(compose(html));
  document.close();
  shown = true;
  attach();
  addEventListener(
    'load',
    () => {
      if (scroll) window.scrollTo(0, scroll);
      void document.fonts.ready.then(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            (window as { __opencodexRendered?: boolean }).__opencodexRendered = true;
          }),
        ),
      );
    },
    { once: true },
  );
  if (mode === 'inline') {
    sizes = new ResizeObserver(() => {
      const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
      if (height !== lastHeight) post({ type: 'size', height: (lastHeight = height) });
    });
    sizes.observe(document.documentElement);
  }
}

/** Asks the host to show the page again with its latest page and values, once per load. */
function reload() {
  if (!shown || pending) return;
  pending = setTimeout(() => post({ type: 'reload', scroll: window.scrollY }), 30);
}

function applyTheme(next: CanvasTheme) {
  theme = next;
  if (!shown) return;
  let style = document.getElementById(HOST_STYLE);
  if (!style) {
    style = document.createElement('style');
    style.id = HOST_STYLE;
    document.head.prepend(style);
  }
  style.textContent = hostCss();
  emit('theme', theme.scheme);
}

function report(error: unknown) {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? 'Unknown error');
  if (reported.has(message) || reported.size >= 10) return;
  reported.add(message);
  post({ type: 'error', message });
}

function receive(event: MessageEvent<HostMessage>) {
  if (event.source !== window.parent || event.data?.channel !== CHANNEL) return;
  const message = event.data;
  switch (message.type) {
    case 'init':
      if (shown) return;
      mode = message.mode;
      theme = message.theme;
      html = message.html;
      Object.assign(data, message.data);
      running = message.running;
      render(message.scroll);
      break;
    case 'theme':
      applyTheme(message.theme);
      break;
    case 'reload':
      reload();
      break;
    case 'data':
      if (message.value === undefined) delete data[message.key];
      else data[message.key] = message.value;
      if (listeners.data.size) emit('data', message.key, message.value);
      else reload();
      break;
    case 'result': {
      const pending = calls.get(message.call);
      calls.delete(message.call);
      if (message.error !== undefined) pending?.reject(new Error(message.error));
      else pending?.resolve(message.value);
      break;
    }
    case 'running':
      running = Object.freeze([...message.names]);
      emit('running', running);
      break;
    case 'annotate':
      void annotationOverlay(message.theme).then(
        (result) => post({ type: 'annotation', result }),
        () => post({ type: 'annotation', result: null }),
      );
      break;
    case 'annotate-end':
      (
        globalThis as { __opencodexAnnotation?: { cancel(): void; close(): void } }
      ).__opencodexAnnotation?.[message.action]();
      break;
  }
}

/** Web links open outside; anything else would navigate the frame away from the page. */
function click(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  const link = (event.target as Element | null)?.closest?.('a[href]');
  if (!(link instanceof HTMLAnchorElement)) return;
  const href = link.getAttribute('href') ?? '';
  if (href.startsWith('#')) return;
  event.preventDefault();
  if (/^https?:/i.test(link.href)) canvas.open(link.href);
}

function attach() {
  addEventListener('message', receive);
  addEventListener('click', click, true);
  addEventListener('error', (event) => report(event.error ?? event.message));
  addEventListener('unhandledrejection', (event) => report(event.reason));
}

attach();
post({ type: 'ready' });
