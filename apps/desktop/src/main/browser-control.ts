import { randomUUID } from 'node:crypto';
import { nativeImage, webContents, type BrowserWindow, type WebContents } from 'electron';
import { z } from 'zod';
import { desktopChannels, type BrowserControlIntent } from '@opencodex/contracts/desktop';
import type { DesktopToolHandler, DesktopToolResult } from '@opencodex/contracts/desktop-tools';
import { browserGuest } from './browser';

const id = z.string().min(1).max(200);
const registration = z.discriminatedUnion('type', [
  z.object({ type: z.literal('host') }),
  z.object({
    type: z.literal('ready'),
    sessionID: id,
    tabID: id,
    webContentsId: z.number().int().positive(),
    requestID: id.optional(),
  }),
  z.object({ type: z.literal('ack'), requestID: id, error: z.string().max(1000).optional() }),
  z.object({ type: z.literal('sync'), sessionID: id, tabIDs: z.array(id).max(12) }),
  z.object({ type: z.literal('takeover'), sessionID: id, paused: z.boolean() }),
]);
const inputSchema = z.object({
  backend: z.literal('embedded').optional(),
  tabID: id.optional(),
  url: z.string().max(8192).optional(),
  expectedOrigin: z.string().min(1).max(8192).optional(),
  generation: z.number().int().nonnegative().optional(),
  selector: z.string().min(1).max(2000).optional(),
  elementID: id.optional(),
  snapshotID: id.optional(),
  x: z.number().finite().min(0).max(32768).optional(),
  y: z.number().finite().min(0).max(32768).optional(),
  text: z.string().max(100000).optional(),
  key: z.string().max(100).optional(),
  deltaX: z.number().finite().min(-10000).max(10000).optional(),
  deltaY: z.number().finite().min(-10000).max(10000).optional(),
});
type Tab = {
  id: string;
  sessionID: string;
  window: BrowserWindow;
  url: string;
  guest?: WebContents;
  generation: number;
  snapshot?: { id: string; generation: number; nodes: Map<string, number> };
  operation?: AbortController;
  controlled?: boolean;
  expectedOrigin?: string;
  logs: string[];
  requests: string[];
  consoleEnabled?: boolean;
  networkEnabled?: boolean;
  dispose?: () => void;
};
type Pending = { tab: Tab; resolve: () => void; reject: (error: Error) => void };
const text = (value: unknown): DesktopToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
});
function url(value: string | undefined) {
  if (value === 'about:blank' || !value) return 'about:blank';
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error('Browser tools accept HTTP(S) URLs only.');
  return parsed.href;
}
function ring(values: string[], value: unknown) {
  values.push(JSON.stringify(value).slice(0, 4000));
  if (values.length > 100) values.shift();
}
function origin(value: string) {
  if (value === 'about:blank') return value;
  return new URL(value).origin;
}
function assertOrigin(guest: WebContents, expected: string) {
  if (origin(guest.getURL()) !== expected)
    throw new Error(
      `Browser origin changed to ${origin(guest.getURL())}. List tabs and approve the current origin before retrying.`,
    );
}
function screenshotURL(data: string) {
  const image = nativeImage.createFromBuffer(Buffer.from(data, 'base64'));
  if (image.isEmpty()) throw new Error('The browser returned an empty screenshot.');
  const { width, height } = image.getSize();
  const pixels = image.toBitmap();
  // Webview canvases can be transparent even with CDP's background override. Flatten
  // premultiplied BGRA onto the browser's white canvas so black text remains readable.
  for (let index = 0; index < pixels.length; index += 4) {
    const white = 255 - pixels[index + 3]!;
    if (!white) continue;
    pixels[index] = Math.min(255, pixels[index]! + white);
    pixels[index + 1] = Math.min(255, pixels[index + 1]! + white);
    pixels[index + 2] = Math.min(255, pixels[index + 2]! + white);
    pixels[index + 3] = 255;
  }
  return nativeImage.createFromBitmap(pixels, { width, height }).toDataURL();
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('Browser command stopped.'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

class BrowserControl {
  private windows = new Set<BrowserWindow>();
  private tabs = new Map<string, Tab>();
  private pending = new Map<string, Pending>();
  private paused = new Set<string>();

  attachWindow(window: BrowserWindow) {
    if (this.windows.has(window)) return;
    this.windows.add(window);
    const contents = window.webContents;
    const clear = () => {
      this.windows.delete(window);
      for (const tab of this.tabs.values()) if (tab.window === window) this.remove(tab);
      window.off('closed', clear);
      contents.off('render-process-gone', clear);
      contents.off('did-start-navigation', navigation);
    };
    const navigation = (
      event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
    ) => {
      if (event.isMainFrame && !event.isSameDocument) clear();
    };
    window.once('closed', clear);
    contents.on('render-process-gone', clear);
    contents.on('did-start-navigation', navigation);
  }

  register(window: BrowserWindow, raw: unknown) {
    const input = registration.parse(raw);
    if (input.type === 'host') {
      this.attachWindow(window);
      return;
    }
    if (!this.windows.has(window)) throw new Error('Browser host is not ready.');
    if (input.type === 'sync') {
      for (const tab of this.tabs.values())
        if (
          tab.window === window &&
          tab.sessionID === input.sessionID &&
          !input.tabIDs.includes(tab.id)
        )
          this.remove(tab);
      return;
    }
    if (input.type === 'takeover') {
      if (
        ![...this.tabs.values()].some(
          (tab) => tab.window === window && tab.sessionID === input.sessionID,
        )
      )
        throw new Error('No browser tabs for this session.');
      if (input.paused) this.paused.add(input.sessionID);
      else this.paused.delete(input.sessionID);
      for (const tab of this.tabs.values())
        if (tab.window === window && tab.sessionID === input.sessionID) {
          if (input.paused) tab.operation?.abort(new Error('Browser control stopped by the user.'));
          this.send(tab, {
            type: 'activity',
            sessionID: tab.sessionID,
            tabID: tab.id,
            method: null,
            paused: input.paused,
          });
        }
      return;
    }
    if (input.type === 'ack') {
      const pending = this.pending.get(input.requestID);
      if (!pending || pending.tab.window !== window) return;
      if (input.error) pending.reject(new Error(input.error));
      else if (pending.tab.guest && !pending.tab.guest.isDestroyed()) pending.resolve();
      return;
    }
    const guest = browserGuest(window, input.webContentsId);
    let tab = this.tabs.get(input.tabID);
    if (tab && (tab.sessionID !== input.sessionID || tab.window !== window))
      throw new Error('Tab belongs to another session.');
    if (!tab) {
      if (this.tabs.size >= 64) throw new Error('Browser tab limit reached. Close a tab first.');
      tab = {
        id: input.tabID,
        sessionID: input.sessionID,
        window,
        url: guest.getURL(),
        generation: 0,
        logs: [],
        requests: [],
      };
      this.tabs.set(tab.id, tab);
    }
    if ([...this.tabs.values()].some((other) => other !== tab && other.guest === guest))
      throw new Error('Guest already registered.');
    if (tab.guest && tab.guest !== guest && tab.operation)
      throw new Error('Browser target changed during a command.');
    if (tab.guest !== guest) this.bind(tab, guest);
    if (tab.controlled || this.paused.has(tab.sessionID))
      this.send(tab, {
        type: 'activity',
        sessionID: tab.sessionID,
        tabID: tab.id,
        method: null,
        paused: this.paused.has(tab.sessionID),
      });
    if (input.requestID) {
      const pending = this.pending.get(input.requestID);
      if (pending?.tab === tab) pending.resolve();
    }
  }

  private bind(tab: Tab, guest: WebContents) {
    tab.dispose?.();
    tab.guest = guest;
    tab.generation++;
    tab.snapshot = undefined;
    tab.consoleEnabled = false;
    tab.networkEnabled = false;
    const navigation = (
      event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
    ) => {
      if (!event.isMainFrame) return;
      tab.generation++;
      tab.snapshot = undefined;
      if (tab.expectedOrigin && origin(event.url) !== tab.expectedOrigin) {
        tab.operation?.abort(
          new Error(
            'Navigation left the approved browser origin. Approve the new origin before retrying.',
          ),
        );
        guest.stop();
      }
    };
    const navigated = () => {
      if (origin(tab.url) !== origin(guest.getURL())) {
        tab.logs.length = 0;
        tab.requests.length = 0;
      }
      tab.url = guest.getURL();
    };
    const restrict = (event: Electron.Event, target: string) => {
      if (!tab.expectedOrigin || origin(target) === tab.expectedOrigin) return;
      event.preventDefault();
      tab.operation?.abort(
        new Error(
          'Navigation left the approved browser origin. Approve the new origin before retrying.',
        ),
      );
    };
    const gone = () => {
      tab.generation++;
      tab.snapshot = undefined;
      tab.guest = undefined;
      tab.operation?.abort(new Error('Browser page closed or crashed.'));
      tab.dispose?.();
    };
    const message = (_event: Electron.Event, method: string, params: Record<string, unknown>) => {
      if (tab.consoleEnabled && method === 'Runtime.consoleAPICalled') {
        const args = params.args as { value?: unknown; description?: string }[] | undefined;
        ring(tab.logs, {
          type: params.type,
          args: args
            ?.slice(0, 20)
            .map((arg) => String(arg.value ?? arg.description ?? '').slice(0, 1000)),
        });
      }
      if (tab.consoleEnabled && method === 'Runtime.exceptionThrown')
        ring(tab.logs, { exception: params.exceptionDetails });
      if (tab.networkEnabled && method === 'Network.requestWillBeSent') {
        const request = params.request as { url?: string; method?: string };
        ring(tab.requests, {
          event: 'request',
          id: params.requestId,
          url: request.url,
          method: request.method,
        });
      }
      if (tab.networkEnabled && method === 'Network.responseReceived') {
        const response = params.response as { url?: string; status?: number; mimeType?: string };
        ring(tab.requests, {
          event: 'response',
          id: params.requestId,
          url: response.url,
          status: response.status,
          mime: response.mimeType,
        });
      }
      if (tab.networkEnabled && method === 'Network.loadingFailed')
        ring(tab.requests, { event: 'failed', id: params.requestId, error: params.errorText });
    };
    const detached = () => {
      tab.snapshot = undefined;
      tab.consoleEnabled = false;
      tab.networkEnabled = false;
      tab.operation?.abort(new Error('Browser debugger detached. Retry the command.'));
    };
    guest.on('did-start-navigation', navigation);
    guest.on('will-navigate', restrict);
    guest.on('will-redirect', restrict);
    guest.on('did-navigate', navigated);
    guest.on('did-navigate-in-page', navigated);
    guest.once('destroyed', gone);
    guest.once('render-process-gone', gone);
    guest.debugger.on('message', message);
    guest.debugger.on('detach', detached);
    tab.dispose = () => {
      guest.off('did-start-navigation', navigation);
      guest.off('will-navigate', restrict);
      guest.off('will-redirect', restrict);
      guest.off('did-navigate', navigated);
      guest.off('did-navigate-in-page', navigated);
      guest.off('destroyed', gone);
      guest.off('render-process-gone', gone);
      guest.debugger.off('message', message);
      guest.debugger.off('detach', detached);
      if (!guest.isDestroyed() && guest.debugger.isAttached()) guest.debugger.detach();
      tab.dispose = undefined;
    };
  }

  private send(tab: Tab, intent: BrowserControlIntent) {
    if (!tab.window.isDestroyed() && !tab.window.webContents.isDestroyed())
      tab.window.webContents.send(desktopChannels.browserControl, intent);
  }
  private remove(tab: Tab) {
    tab.operation?.abort(new Error('Browser tab closed.'));
    tab.dispose?.();
    this.tabs.delete(tab.id);
    if (![...this.tabs.values()].some((other) => other.sessionID === tab.sessionID))
      this.paused.delete(tab.sessionID);
    for (const pending of this.pending.values())
      if (pending.tab === tab) pending.reject(new Error('Browser tab closed.'));
  }
  close() {
    for (const tab of this.tabs.values()) this.remove(tab);
    this.windows.clear();
    this.paused.clear();
  }
  canHandle() {
    return this.windows.size > 0;
  }
  private describe(tab: Tab) {
    const guest = tab.guest;
    return {
      tabID: tab.id,
      generation: tab.generation,
      url: guest?.getURL() ?? tab.url,
      origin: origin(guest?.getURL() ?? tab.url),
      title: guest?.getTitle() ?? '',
      mounted: Boolean(guest),
      paused: this.paused.has(tab.sessionID),
    };
  }

  handle: DesktopToolHandler = async (call, outerSignal) => {
    outerSignal.throwIfAborted();
    const input = inputSchema.parse(call.input);
    if (call.method === 'browser.list')
      return text({
        tabs: [...this.tabs.values()]
          .filter((tab) => tab.sessionID === call.sessionID)
          .map((tab) => this.describe(tab)),
      });
    const allowed = [
      'open',
      'navigate',
      'snapshot',
      'screenshot',
      'click',
      'type',
      'press',
      'scroll',
      'close',
      'console',
      'network',
    ];
    const method = call.method.replace(/^browser\./, '');
    if (!call.method.startsWith('browser.') || !allowed.includes(method))
      throw new Error('Unknown browser method.');
    if (this.paused.has(call.sessionID))
      throw new Error('Browser control is paused. The user must resume it in the browser panel.');
    const destination = method === 'open' || method === 'navigate' ? url(input.url) : undefined;
    const expectedOrigin = input.expectedOrigin
      ? origin(input.expectedOrigin)
      : method === 'open' && destination
        ? origin(destination)
        : undefined;
    if (!expectedOrigin)
      throw new Error(
        'expectedOrigin is required for browser tab operations. Approve the tab origin before retrying.',
      );
    if (method === 'open' && destination && origin(destination) !== expectedOrigin)
      throw new Error('The destination does not match the approved browser origin.');
    let tab: Tab;
    if (method === 'open') {
      const window = [...this.windows].find((window) => !window.isDestroyed());
      if (!window) throw new Error('Open the desktop app to use its embedded browser.');
      if (
        this.tabs.size >= 64 ||
        [...this.tabs.values()].filter((tab) => tab.sessionID === call.sessionID).length >= 12
      )
        throw new Error('Browser tab limit reached. Close a tab first.');
      tab = {
        id: `tab_${randomUUID()}`,
        sessionID: call.sessionID,
        window,
        url: url(input.url),
        generation: 0,
        logs: [],
        requests: [],
      };
      this.tabs.set(tab.id, tab);
    } else {
      const found = input.tabID && this.tabs.get(input.tabID);
      if (!found || found.sessionID !== call.sessionID)
        throw new Error('Unknown tab for this session. Use browser.list or browser.open.');
      tab = found;
    }
    if (method === 'close') {
      if (origin(tab.guest?.getURL() ?? tab.url) !== expectedOrigin)
        throw new Error(
          'Browser origin changed. List tabs and approve the current origin before retrying.',
        );
      this.send(tab, { type: 'close', sessionID: tab.sessionID, tabID: tab.id });
      this.remove(tab);
      return text({ closed: tab.id });
    }
    if (tab.operation) throw new Error('This browser tab already has a command in progress.');
    const controller = new AbortController();
    const signal = AbortSignal.any([outerSignal, controller.signal, AbortSignal.timeout(30000)]);
    tab.operation = controller;
    tab.controlled = true;
    tab.expectedOrigin = expectedOrigin;
    let previouslyFocused: WebContents | null | undefined;
    const requestID = randomUUID();
    try {
      const mounted = new Promise<void>((resolve, reject) =>
        this.pending.set(requestID, { tab, resolve, reject }),
      );
      this.send(tab, {
        type: 'mount',
        requestID,
        tabID: tab.id,
        sessionID: tab.sessionID,
        url: tab.url,
      });
      await abortable(mounted, signal);
      this.pending.delete(requestID);
      if (input.generation !== undefined && input.generation !== tab.generation)
        throw new Error('Stale tab generation. Take a fresh snapshot.');
      this.send(tab, {
        type: 'activity',
        sessionID: tab.sessionID,
        tabID: tab.id,
        method: call.method,
        paused: false,
      });
      const guest = tab.guest!;
      guest.setBackgroundThrottling(false);
      if (guest.getURL() === 'about:blank' && guest.isLoadingMainFrame()) {
        let loaded!: () => void;
        const settled = new Promise<void>((resolve) => {
          loaded = resolve;
          guest.once('did-stop-loading', loaded);
        });
        try {
          await abortable(settled, signal);
        } finally {
          guest.off('did-stop-loading', loaded);
        }
      }
      if (method !== 'open') {
        if (guest.getURL() === 'about:blank' && tab.url !== 'about:blank') {
          if (origin(tab.url) !== expectedOrigin)
            throw new Error('The saved tab URL does not match the approved browser origin.');
          await abortable(guest.loadURL(tab.url), signal);
        }
        assertOrigin(guest, expectedOrigin);
      }
      // navigate approves the current origin and the explicit destination URL separately.
      const operationOrigin = destination ? origin(destination) : expectedOrigin;
      if (destination) {
        tab.expectedOrigin = operationOrigin;
        await abortable(guest.loadURL(destination), signal);
      }
      assertOrigin(guest, operationOrigin);
      const command = async <T = Record<string, unknown>>(
        method: string,
        params?: Record<string, unknown>,
      ): Promise<T> => {
        signal.throwIfAborted();
        assertOrigin(guest, operationOrigin);
        if (!guest.debugger.isAttached()) guest.debugger.attach('1.3');
        const result = await abortable(
          guest.debugger.sendCommand(method, params) as Promise<T>,
          signal,
        );
        assertOrigin(guest, operationOrigin);
        return result;
      };
      if (method === 'open') return text(this.describe(tab));
      if (method === 'navigate') {
        return text(this.describe(tab));
      }
      if (method === 'snapshot') {
        const generation = tab.generation;
        const result = await command<{ nodes: AXNode[] }>('Accessibility.getFullAXTree', {
          depth: 12,
        });
        if (generation !== tab.generation)
          throw new Error('Page navigated during snapshot. Retry.');
        const nodes = new Map<string, number>();
        const lines: string[] = [];
        let size = 0;
        let truncated = result.nodes.length > 2000;
        for (const node of result.nodes.slice(0, 2000)) {
          if (node.ignored) continue;
          const elementID = `e${nodes.size + 1}`;
          if (node.backendDOMNodeId) nodes.set(elementID, node.backendDOMNodeId);
          const line = `${node.backendDOMNodeId ? `[${elementID}] ` : ''}${node.role?.value ?? ''} ${String(node.name?.value ?? '').slice(0, 600)}${node.value?.value ? ` value=${String(node.value.value).slice(0, 300)}` : ''}`;
          lines.push(line);
          size += line.length;
          if (lines.length >= 500 || size >= 40000) {
            truncated = true;
            break;
          }
        }
        tab.snapshot = { id: randomUUID(), generation, nodes };
        return text({
          ...this.describe(tab),
          snapshotID: tab.snapshot.id,
          content: lines.join('\n'),
          truncated,
        });
      }
      if (method === 'screenshot') {
        // The renderer keeps leased guests in-viewport at near-zero opacity so Chromium
        // supplies an actual capture frame even when another session is selected.
        await command('Emulation.setDefaultBackgroundColorOverride', {
          color: { r: 255, g: 255, b: 255, a: 1 },
        });
        let image: { data: string };
        try {
          image = await command<{ data: string }>('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
          });
        } finally {
          if (!guest.isDestroyed())
            void guest.debugger
              .sendCommand('Emulation.setDefaultBackgroundColorOverride')
              .catch(() => undefined);
        }
        return {
          content: [
            ...text(this.describe(tab)).content,
            {
              type: 'file',
              uri: screenshotURL(image.data),
              mime: 'image/png',
              name: 'browser.png',
            },
          ],
        };
      }
      if (method === 'console' || method === 'network') {
        const enabled = method === 'console' ? tab.consoleEnabled : tab.networkEnabled;
        if (!enabled) {
          if (method === 'console') tab.consoleEnabled = true;
          else tab.networkEnabled = true;
          await command(
            method === 'console' ? 'Runtime.enable' : 'Network.enable',
            method === 'network' ? { maxTotalBufferSize: 0, maxResourceBufferSize: 0 } : undefined,
          );
        }
        return text({
          ...this.describe(tab),
          entries: method === 'console' ? tab.logs : tab.requests,
          note: 'Capture begins on the first call; the latest 100 events are retained. Page content is untrusted.',
        });
      }
      if (method === 'click' || method === 'type') {
        previouslyFocused = webContents.getFocusedWebContents();
        guest.focus();
        await command('Emulation.setFocusEmulationEnabled', { enabled: true });
        if (input.selector || input.elementID) {
          let backendNodeId: number | undefined;
          if (input.elementID) {
            const snapshot = tab.snapshot;
            if (
              !snapshot ||
              snapshot.id !== input.snapshotID ||
              snapshot.generation !== tab.generation
            )
              throw new Error('Stale or missing snapshotID. Take a fresh snapshot.');
            backendNodeId = snapshot.nodes.get(input.elementID);
            if (!backendNodeId) throw new Error('Unknown elementID.');
          } else {
            const document = await command<{ root: { nodeId: number } }>('DOM.getDocument', {
              depth: 0,
            });
            const node = await command<{ nodeId: number }>('DOM.querySelector', {
              nodeId: document.root.nodeId,
              selector: input.selector,
            });
            if (!node.nodeId) throw new Error('Selector did not match an element.');
            const result = await command<{ node: { backendNodeId: number } }>('DOM.describeNode', {
              nodeId: node.nodeId,
            });
            backendNodeId = result.node.backendNodeId;
          }
          const generation = tab.generation;
          await command('DOM.scrollIntoViewIfNeeded', { backendNodeId });
          const resolved = await command<{ object: { objectId: string } }>('DOM.resolveNode', {
            backendNodeId,
          });
          try {
            const point = await command<{
              result: { value?: { x: number; y: number; editable?: boolean; error?: string } };
              exceptionDetails?: unknown;
            }>('Runtime.callFunctionOn', {
              objectId: resolved.object.objectId,
              functionDeclaration: `function() { const r = this.getBoundingClientRect(); const x = Math.max(0, r.left) + (Math.min(innerWidth, r.right) - Math.max(0, r.left)) / 2; const y = Math.max(0, r.top) + (Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / 2; const hit = this.ownerDocument.elementFromPoint(x,y); if (!this.isConnected || !r.width || !r.height || !hit || (hit !== this && !this.contains(hit))) return {error:'Element is hidden or covered.'}; return {x,y,editable:this.isContentEditable || this.matches('input,textarea')}; }`,
              returnByValue: true,
            });
            if (point.exceptionDetails || !point.result.value || point.result.value.error)
              throw new Error(point.result.value?.error ?? 'Element is unavailable.');
            if (generation !== tab.generation)
              throw new Error('Page navigated. Take a fresh snapshot.');
            input.x = point.result.value.x;
            input.y = point.result.value.y;
            // Native focus is explicit for background webviews; mouse events remain
            // trusted CDP events, rather than a page-script .click() substitute.
            if (point.result.value.editable) await command('DOM.focus', { backendNodeId });
          } finally {
            if (!guest.isDestroyed())
              void guest.debugger
                .sendCommand('Runtime.releaseObject', { objectId: resolved.object.objectId })
                .catch(() => undefined);
          }
        }
        if (input.x !== undefined && input.y !== undefined) {
          const mouse = {
            x: input.x,
            y: input.y,
            button: 'left',
            clickCount: 1,
          };
          try {
            await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...mouse });
            await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...mouse });
          } finally {
            if (signal.aborted && !guest.isDestroyed())
              void guest.debugger
                .sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...mouse })
                .catch(() => undefined);
          }
        } else if (method === 'click')
          throw new Error('Click requires a selector, elementID with snapshotID, or x/y.');
        if (method === 'type') {
          if (input.text === undefined) throw new Error('Type requires text.');
          const editable = await command<{ result: { value?: boolean } }>('Runtime.evaluate', {
            expression: `(() => { const e = document.activeElement; return !!e && !e.disabled && !e.readOnly && (e.isContentEditable || e.tagName === 'TEXTAREA' || (e.tagName === 'INPUT' && !['button','submit','reset','checkbox','radio','hidden','file','range','color'].includes(e.type))); })()`,
            returnByValue: true,
          });
          if (!editable.result.value) throw new Error('Focus an editable field before typing.');
          // Electron's Input.insertText routes through the embedder's native text-input
          // client and can silently discard input in a background guest. Invoke Chromium's
          // native editing command on this guest's focused element instead: it preserves
          // selection, undo and real input events without assigning value or faking events.
          const target = await command<{ result: { objectId?: string } }>('Runtime.evaluate', {
            expression: 'document.activeElement',
          });
          const objectId = target.result.objectId;
          if (!objectId) throw new Error('The focused field is unavailable.');
          try {
            const inserted = await command<{
              result: { value?: boolean };
              exceptionDetails?: unknown;
            }>('Runtime.callFunctionOn', {
              objectId,
              functionDeclaration: `function(text) { if (!this.isConnected || this.ownerDocument.activeElement !== this) return false; return this.ownerDocument.execCommand('insertText', false, text); }`,
              arguments: [{ value: input.text }],
              returnByValue: true,
              userGesture: true,
            });
            if (inserted.exceptionDetails || !inserted.result.value)
              throw new Error('The browser could not insert text into this field.');
          } finally {
            if (!guest.isDestroyed())
              void guest.debugger
                .sendCommand('Runtime.releaseObject', { objectId })
                .catch(() => undefined);
          }
        }
      } else if (method === 'press') {
        previouslyFocused = webContents.getFocusedWebContents();
        guest.focus();
        await command('Emulation.setFocusEmulationEnabled', { enabled: true });
        if (!input.key) throw new Error('Press requires key.');
        const key = keyEvent(input.key);
        try {
          await command('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
          await command('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
        } finally {
          if (signal.aborted && !guest.isDestroyed())
            void guest.debugger
              .sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
              .catch(() => undefined);
        }
      } else if (method === 'scroll') {
        await command('Runtime.evaluate', {
          expression: `(() => { let e = document.elementFromPoint(${input.x ?? 100}, ${input.y ?? 100}); while (e && e !== document.documentElement) { const s = getComputedStyle(e); if ((e.scrollHeight > e.clientHeight && /(auto|scroll)/.test(s.overflowY)) || (e.scrollWidth > e.clientWidth && /(auto|scroll)/.test(s.overflowX))) break; e = e.parentElement; } (e && e !== document.documentElement ? e : window).scrollBy({left:${input.deltaX ?? 0}, top:${input.deltaY ?? 500}, behavior:'instant'}); })()`,
        });
      }
      return text(this.describe(tab));
    } catch (error) {
      if (signal.aborted && method === 'navigate' && tab.guest && !tab.guest.isDestroyed())
        tab.guest.stop();
      if (method === 'open') {
        this.send(tab, { type: 'close', sessionID: tab.sessionID, tabID: tab.id });
        this.remove(tab);
      }
      throw error;
    } finally {
      this.pending.delete(requestID);
      tab.operation = undefined;
      tab.expectedOrigin = undefined;
      if (tab.guest && !tab.guest.isDestroyed()) {
        tab.guest.setBackgroundThrottling(true);
        if (previouslyFocused !== undefined && tab.guest.debugger.isAttached())
          void tab.guest.debugger
            .sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false })
            .catch(() => undefined);
        if (
          previouslyFocused &&
          !previouslyFocused.isDestroyed() &&
          webContents.getFocusedWebContents() === tab.guest
        )
          previouslyFocused.focus();
      }
      this.send(tab, { type: 'release', sessionID: tab.sessionID, tabID: tab.id });
      this.send(tab, {
        type: 'activity',
        sessionID: tab.sessionID,
        tabID: tab.id,
        method: null,
        paused: this.paused.has(tab.sessionID),
      });
    }
  };
}

type AXNode = {
  ignored?: boolean;
  backendDOMNodeId?: number;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: unknown };
};
function keyEvent(value: string) {
  const parts = value.split('+');
  let key = parts.pop()!;
  let modifiers = 0;
  for (const modifier of parts) {
    const bit = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Command: 4, Cmd: 4, Shift: 8 }[modifier];
    if (!bit) throw new Error(`Unsupported key modifier: ${modifier}`);
    modifiers |= bit;
  }
  if (key === 'Esc') key = 'Escape';
  const codes: Record<string, number> = {
    Enter: 13,
    Tab: 9,
    Escape: 27,
    Backspace: 8,
    Delete: 46,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Home: 36,
    End: 35,
    PageUp: 33,
    PageDown: 34,
    Space: 32,
  };
  const windowsVirtualKeyCode =
    codes[key] ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined);
  if (!windowsVirtualKeyCode) throw new Error('Unsupported key.');
  return {
    key: key === 'Space' ? ' ' : key,
    windowsVirtualKeyCode,
    modifiers,
    ...(key.toLowerCase() === 'a' && modifiers === (process.platform === 'darwin' ? 4 : 2)
      ? { commands: ['selectAll'] }
      : {}),
    ...(key === 'Enter' ? { text: '\r' } : key.length === 1 && !modifiers ? { text: key } : {}),
  };
}
export const browserControl = new BrowserControl();
