const VERSION = 'opencodex-extension-v1';
const MAX_CLAIMS = 64;
const MAX_PENDING = 32;
const claims = new Map();
const requests = new Map();
// Permission scope belongs to one request, never to the active browser tab or a global origin.
const dispatchOrigins = new WeakMap();
let connection;
let heartbeat;
let connectionError = '';
let cleanup = Promise.resolve();
let queue = Promise.resolve();
let connecting = false;

const text = (value) => {
  const serialized = JSON.stringify(value);
  if (serialized.length > 480_000)
    throw new Error('Browser result exceeds the text response limit.');
  return { content: [{ type: 'text', text: serialized }] };
};
const short = (value, length = 2000) => String(value ?? '').slice(0, length);
const check = (signal) => {
  if (signal.aborted) throw new Error('Browser request cancelled.');
};
function string(value, name, max = 2000) {
  if (typeof value !== 'string' || !value || value.length > max)
    throw new Error(`${name} must be a non-empty string of at most ${max} characters.`);
  return value;
}
function number(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${name} must be between ${min} and ${max}.`);
  return value;
}
function webURL(value) {
  const url = new URL(string(value, 'url', 16_384));
  if (!['http:', 'https:'].includes(url.protocol) && url.href !== 'about:blank')
    throw new Error('Only HTTP(S) URLs and about:blank are supported.');
  return url.href;
}
function pageOrigin(value) {
  const url = new URL(value);
  return url.href === 'about:blank' ? 'about:blank' : url.origin;
}
function describeTab(tab) {
  const url = tab.pendingUrl || tab.url || 'about:blank';
  return { tabID: String(tab.id), url: short(url, 2000), origin: pageOrigin(url) };
}
function tabID(value) {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(id) || id < 0)
    throw new Error('An explicit numeric tabID is required. Use browser.list or browser.open.');
  return id;
}
async function api(signal, action) {
  check(signal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Browser request cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        check(signal);
        return action();
      })
      .then(
        (value) => {
          signal.removeEventListener('abort', abort);
          if (signal.aborted) abort();
          else resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      );
  });
}
function assertOrigin(tab, expectedOrigin) {
  if (expectedOrigin === undefined) return;
  for (const url of [tab.url, tab.pendingUrl].filter(Boolean)) {
    if (pageOrigin(url) !== expectedOrigin)
      throw new Error(
        'The tab origin changed. Read a fresh tab list and approve the current origin before continuing.',
      );
  }
  if (!tab.url && !tab.pendingUrl) throw new Error('The tab origin is not available yet.');
}

async function verifyOrigin(id, signal) {
  const expectedOrigin = dispatchOrigins.get(signal);
  if (expectedOrigin === undefined) return;
  assertOrigin(await api(signal, () => chrome.tabs.get(id)), expectedOrigin);
}

async function cdp(id, signal, method, params = {}) {
  await verifyOrigin(id, signal);
  const result = await api(signal, () =>
    chrome.debugger.sendCommand({ tabId: id }, method, params),
  );
  // A read completing after cross-origin navigation must not disclose the new page's result.
  if (method === 'Page.captureScreenshot' || method === 'Page.getLayoutMetrics')
    await verifyOrigin(id, signal);
  return result;
}

async function release(id) {
  const claim = claims.get(id);
  if (!claim) return;
  claims.delete(id);
  if (claim.attached) await chrome.debugger.detach({ tabId: id }).catch(() => undefined);
}

function stop(socket, reason) {
  if (connection !== socket) return cleanup;
  connection = undefined;
  connectionError = reason;
  clearInterval(heartbeat);
  for (const request of requests.values()) request.abort();
  requests.clear();
  if (socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Disconnected');
  // Cancel queued work before releasing claims. Late debugger attaches detach themselves.
  cleanup = queue
    .catch(() => undefined)
    .then(async () => {
      await Promise.all([...claims.keys()].map(release));
    });
  return cleanup;
}

async function connect(pairingURL) {
  if (connecting || connection)
    throw new Error('Already connected or connecting. Disconnect first.');
  connecting = true;
  try {
    await cleanup;
    const url = new URL(string(pairingURL, 'pairingURL', 1000));
    const token = url.hash.slice(1);
    if (
      url.protocol !== 'ws:' ||
      !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      !url.port ||
      url.pathname !== '/browser-extension' ||
      url.search ||
      url.username ||
      url.password ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(token)
    )
      throw new Error('Paste the complete localhost pairing URL from OpenCodex.');
    url.hash = '';
    await chrome.storage.local.set({ pairingURL });
    connectionError = '';
    const socket = new WebSocket(url.href, [VERSION, `token.${token}`]);
    connection = socket;
    socket.addEventListener('message', (event) => receive(socket, event.data));
    socket.addEventListener('close', () => {
      void stop(socket, 'Disconnected. Click Connect to pair again.');
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        void stop(socket, 'Connection timed out.');
        reject(new Error('Connection timed out.'));
      }, 8000);
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          void stop(
            socket,
            'Connection failed. Check the pairing URL and disconnect any other paired Chrome/Edge profile.',
          );
          reject(new Error(connectionError));
        },
        { once: true },
      );
      socket.addEventListener(
        'close',
        () => {
          clearTimeout(timeout);
          reject(new Error(connectionError || 'Connection closed.'));
        },
        { once: true },
      );
    });
    if (connection !== socket) throw new Error('Connection closed.');
    // Chrome 116+ keeps an extension worker alive while WebSocket traffic is exchanged.
    heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"ping"}');
    }, 20_000);
  } finally {
    connecting = false;
  }
}

function receive(socket, raw) {
  if (socket !== connection) return;
  let message;
  try {
    if (typeof raw !== 'string' || raw.length > 256 * 1024)
      throw new Error('Invalid request size.');
    message = JSON.parse(raw);
    if (message.type === 'pong') return;
    string(message.id, 'id', 100);
    if (message.type === 'cancel') {
      requests.get(message.id)?.abort();
      return;
    }
    if (
      message.type !== 'call' ||
      !message.input ||
      typeof message.input !== 'object' ||
      Array.isArray(message.input)
    )
      throw new Error('Invalid request.');
    string(message.sessionID, 'sessionID', 200);
    string(message.method, 'method', 100);
    if (requests.has(message.id) || requests.size >= MAX_PENDING)
      throw new Error('Duplicate request or pending request limit reached.');
  } catch {
    void stop(socket, 'Invalid desktop protocol message.');
    return;
  }
  const controller = new AbortController();
  requests.set(message.id, controller);
  queue = queue.then(async () => {
    const send = (value) => {
      if (
        connection === socket &&
        socket.readyState === WebSocket.OPEN &&
        !controller.signal.aborted
      )
        socket.send(JSON.stringify({ id: message.id, ...value }));
    };
    try {
      check(controller.signal);
      send({ result: await handle(message, controller.signal) });
    } catch (error) {
      send({ error: short(error.message || error, 4000) });
    } finally {
      requests.delete(message.id);
    }
  });
}

async function claimTab(id, sessionID, signal) {
  const existing = claims.get(id);
  if (existing) {
    if (existing.sessionID !== sessionID)
      throw new Error('This tab is claimed by another OpenCode session.');
    return existing;
  }
  if (claims.size >= MAX_CLAIMS) throw new Error('Tab claim limit reached. Release a tab first.');
  const tab = await api(signal, () => chrome.tabs.get(id));
  assertOrigin(tab, dispatchOrigins.get(signal));
  webURL(tab.pendingUrl || tab.url || '');
  const claim = {
    sessionID,
    attached: false,
    console: [],
    network: [],
    sequence: 0,
    snapshotID: null,
    origin: pageOrigin(tab.pendingUrl || tab.url),
  };
  claims.set(id, claim);
  try {
    check(signal);
    await api(signal, async () => {
      await chrome.debugger.attach({ tabId: id }, '1.3');
      claim.attached = true;
      if (signal.aborted) await chrome.debugger.detach({ tabId: id }).catch(() => undefined);
    });
    await cdp(id, signal, 'Page.enable');
    await cdp(id, signal, 'Runtime.enable');
    await cdp(id, signal, 'Log.enable');
    await cdp(id, signal, 'Network.enable', {
      maxTotalBufferSize: 1_000_000,
      maxResourceBufferSize: 100_000,
    });
    return claim;
  } catch (error) {
    await release(id);
    throw error;
  }
}

function owned(id, sessionID) {
  const claim = claims.get(id);
  if (!claim || claim.sessionID !== sessionID)
    throw new Error('Claim this tab with browser.claim before operating on it.');
  return claim;
}

// These functions run in the extension's isolated world. Pages cannot read or replace the refs.
function snapshotDocument(snapshotID, expectedOrigin) {
  const origin = location.href === 'about:blank' ? 'about:blank' : location.origin;
  if (expectedOrigin !== null && origin !== expectedOrigin)
    throw new Error('The tab origin changed before the snapshot was dispatched.');
  const textOf = (root) => {
    if (!root) return '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text = '';
    let scanned = 0;
    let node;
    while ((node = walker.nextNode()) && text.length < 500 && scanned++ < 256) {
      if (!/^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.parentElement?.tagName || ''))
        text += (node.nodeValue || '').slice(0, 500 - text.length);
    }
    return text;
  };
  const refs = new Map();
  const elements = [];
  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_ELEMENT,
  );
  let scanned = 0;
  let element = walker.currentNode;
  while (element && scanned++ < 12_000 && elements.length < 250) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const semantic =
      role ||
      /^(a|button|input|textarea|select|summary|h[1-6]|label|img|details|dialog|form|main|nav|article|p|li|pre|code|td|th)$/.test(
        tag,
      ) ||
      element.isContentEditable ||
      element.hasAttribute('tabindex');
    if (semantic) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        !element.closest('[aria-hidden="true"], [inert]')
      ) {
        const id = `e${elements.length + 1}`;
        const labelledBy = (element.getAttribute('aria-labelledby') || '')
          .split(/\s+/)
          .slice(0, 8)
          .map((id) => textOf(document.getElementById(id)))
          .join(' ')
          .trim();
        const password =
          element instanceof globalThis.HTMLInputElement && element.type === 'password';
        const name =
          element.getAttribute('aria-label') ||
          labelledBy ||
          (element.labels ? [...element.labels].slice(0, 8).map(textOf).join(' ') : '') ||
          element.getAttribute('alt') ||
          element.getAttribute('placeholder') ||
          textOf(element);
        refs.set(id, element);
        elements.push({
          elementID: id,
          tag,
          role: role || undefined,
          name: name.replace(/\s+/g, ' ').trim().slice(0, 300),
          value: !password && 'value' in element ? String(element.value).slice(0, 300) : undefined,
          href: tag === 'a' ? element.href.slice(0, 1000) : undefined,
          disabled: Boolean(element.disabled),
          checked: 'checked' in element ? Boolean(element.checked) : undefined,
        });
      }
    }
    element = walker.nextNode();
  }
  globalThis.__opencodexSnapshot = { snapshotID, refs };
  return {
    snapshotID,
    url: location.href,
    title: document.title.slice(0, 500),
    elements,
    truncated: Boolean(element),
    note: 'Top document only; frame and shadow-root contents are not included.',
  };
}

function locateTarget(input, mode) {
  const origin = location.href === 'about:blank' ? 'about:blank' : location.origin;
  if (input.expectedOrigin !== undefined && origin !== input.expectedOrigin)
    throw new Error('The tab origin changed before the action was dispatched.');
  let element;
  if (input.selector) element = document.querySelector(input.selector);
  else {
    const snapshot = globalThis.__opencodexSnapshot;
    if (!snapshot || snapshot.snapshotID !== input.snapshotID)
      throw new Error('Snapshot is stale; take another browser.snapshot.');
    element = snapshot.refs.get(input.elementID);
  }
  if (!element || !element.isConnected)
    throw new Error('Target element no longer exists; take another browser.snapshot.');
  if (element.disabled) throw new Error('Target element is disabled.');
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  if (mode === 'type') {
    if (!(
      element instanceof globalThis.HTMLInputElement ||
      element instanceof globalThis.HTMLTextAreaElement ||
      element.isContentEditable
    ))
      throw new Error('Target is not editable.');
    element.focus({ preventScroll: true });
    if (input.clear) {
      if (typeof element.select === 'function') element.select();
      else {
        const selection = globalThis.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }
  const rect = element.getBoundingClientRect();
  const x =
    Math.max(0, rect.left) + (Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) / 2;
  const y =
    Math.max(0, rect.top) + (Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)) / 2;
  if (rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight)
    throw new Error('Target is not visible.');
  if (mode === 'click') {
    const hit = document.elementFromPoint(x, y);
    if (hit !== element && !element.contains(hit))
      throw new Error('Target is covered by another element.');
  }
  return { x, y };
}

async function script(id, signal, func, args) {
  await verifyOrigin(id, signal);
  const tab = await api(signal, () => chrome.tabs.get(id));
  if (tab.url === 'about:blank') {
    // scripting's HTTP(S) host permissions do not cover about:blank. The explicitly claimed
    // debugger target can run the same fixed functions in a separate, non-page execution world.
    const { frameTree } = await cdp(id, signal, 'Page.getFrameTree');
    if (frameTree.frame.url !== 'about:blank')
      throw new Error('The tab navigated before the blank-page operation was dispatched.');
    const { executionContextId } = await cdp(id, signal, 'Page.createIsolatedWorld', {
      frameId: frameTree.frame.id,
      worldName: 'opencodex-browser-control',
    });
    const result = await cdp(id, signal, 'Runtime.evaluate', {
      expression: `(${func.toString()})(...${JSON.stringify(args)})`,
      contextId: executionContextId,
      returnByValue: true,
      timeout: 5000,
    });
    await verifyOrigin(id, signal);
    if (result.exceptionDetails)
      throw new Error(
        short(result.exceptionDetails.exception?.description || result.exceptionDetails.text),
      );
    if (result.result.value === undefined) throw new Error('Blank-page script returned no result.');
    return result.result.value;
  }
  const results = await api(signal, () =>
    chrome.scripting.executeScript({ target: { tabId: id }, world: 'ISOLATED', func, args }),
  );
  await verifyOrigin(id, signal);
  if (!results[0] || results[0].error || results[0].result === undefined)
    throw new Error(
      results[0]?.error?.message || 'Page script failed. The page may have navigated.',
    );
  return results[0].result;
}

async function target(id, input, signal, mode) {
  const hasSelector = input.selector !== undefined;
  const hasRef = input.elementID !== undefined;
  const hasPoint = input.x !== undefined || input.y !== undefined;
  if ([hasSelector, hasRef, hasPoint].filter(Boolean).length !== 1)
    throw new Error('Provide exactly one target: selector, elementID + snapshotID, or x + y.');
  if (hasPoint) return { x: number(input.x, 'x', 0, 100_000), y: number(input.y, 'y', 0, 100_000) };
  if (hasSelector) string(input.selector, 'selector', 4000);
  else {
    string(input.elementID, 'elementID', 100);
    string(input.snapshotID, 'snapshotID', 100);
  }
  return script(id, signal, locateTarget, [
    {
      selector: input.selector,
      elementID: input.elementID,
      snapshotID: input.snapshotID,
      clear: input.clear === true,
      expectedOrigin: dispatchOrigins.get(signal),
    },
    mode,
  ]);
}

async function click(id, point, signal) {
  await cdp(id, signal, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    clickCount: 1,
  });
  await cdp(id, signal, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...point,
    button: 'left',
    clickCount: 1,
  });
}

async function press(id, key, signal) {
  const parts = string(key, 'key', 100).split('+');
  const final = parts.pop();
  let modifiers = 0;
  for (const part of parts) {
    const modifier = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Command: 4, Shift: 8 }[part];
    if (!modifier) throw new Error(`Unknown key modifier: ${part}`);
    modifiers |= modifier;
  }
  const special = {
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
  if (!special[final] && [...final].length !== 1)
    throw new Error(
      'Use a character, Enter, Tab, Escape, Backspace, Delete, an arrow, Home, End, PageUp, or PageDown.',
    );
  const character = final === 'Space' ? ' ' : final;
  const params = {
    key: character,
    modifiers,
    windowsVirtualKeyCode: special[final] || character.toUpperCase().charCodeAt(0),
  };
  await cdp(id, signal, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    ...params,
    ...(!(modifiers & 7) && (character.length === 1 || final === 'Enter')
      ? { text: final === 'Enter' ? '\r' : character }
      : {}),
  });
  await cdp(id, signal, 'Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

async function handle({ sessionID, method, input }, signal) {
  if (method === 'browser.list') {
    const tabs = await api(signal, () => chrome.tabs.query({}));
    const offset = number(input.offset ?? 0, 'offset', 0, 100_000);
    const visible = tabs.filter((tab) => /^(https?:|about:blank$)/.test(tab.url || ''));
    return text({
      tabs: visible.slice(offset, offset + 100).map((tab) => ({
        ...describeTab(tab),
        title: short(tab.title, 500),
        claimed: claims.has(tab.id),
        ownedBySession: claims.get(tab.id)?.sessionID === sessionID,
      })),
      nextOffset: visible.length > offset + 100 ? offset + 100 : null,
    });
  }
  if (method === 'browser.open') {
    if (claims.size >= MAX_CLAIMS) throw new Error('Tab claim limit reached.');
    const tab = await api(signal, () =>
      chrome.tabs.create({ url: webURL(input.url || 'about:blank'), active: false }),
    );
    await claimTab(tab.id, sessionID, signal);
    return text({ ...describeTab(tab), claimed: true });
  }
  const id = tabID(input.tabID);
  const expectedOrigin = input.expectedOrigin !== undefined ? input.expectedOrigin : input.origin;
  if (expectedOrigin !== undefined)
    dispatchOrigins.set(signal, string(expectedOrigin, 'expectedOrigin', 2000));
  // Check even reads, existing claims, and release, before touching page content/debugger state.
  await verifyOrigin(id, signal);
  if (method === 'browser.claim') {
    await claimTab(id, sessionID, signal);
    return text({ ...describeTab(await api(signal, () => chrome.tabs.get(id))), claimed: true });
  }
  const claim = owned(id, sessionID);
  if (method === 'browser.release') {
    await release(id);
    return text({ tabID: String(id), claimed: false });
  }
  // Block browser-internal pages even if a user navigated a claimed web tab there.
  const tab = await api(signal, () => chrome.tabs.get(id));
  assertOrigin(tab, expectedOrigin);
  webURL(tab.url || '');
  switch (method) {
    case 'browser.snapshot': {
      const snapshotID = crypto.randomUUID();
      const result = await script(id, signal, snapshotDocument, [
        snapshotID,
        expectedOrigin ?? null,
      ]);
      claim.snapshotID = snapshotID;
      return text({ tabID: String(id), origin: pageOrigin(result.url), ...result });
    }
    case 'browser.screenshot': {
      const metrics = await cdp(id, signal, 'Page.getLayoutMetrics');
      const viewport = metrics.cssVisualViewport;
      const width = Math.min(viewport.clientWidth, 4096);
      const height = Math.min(viewport.clientHeight, 4096);
      const result = await cdp(id, signal, 'Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
        clip: {
          x: viewport.pageX,
          y: viewport.pageY,
          width,
          height,
          scale: Math.min(1, 2048 / Math.max(width, height)),
        },
      });
      if (result.data.length > 15_000_000)
        throw new Error('Screenshot exceeds the response limit.');
      return {
        content: [
          { type: 'text', text: JSON.stringify(describeTab(tab)) },
          {
            type: 'file',
            uri: `data:image/png;base64,${result.data}`,
            mime: 'image/png',
            name: `tab-${id}.png`,
          },
        ],
      };
    }
    case 'browser.navigate': {
      const result = await cdp(id, signal, 'Page.navigate', { url: webURL(input.url) });
      claim.snapshotID = null;
      if (result.errorText) throw new Error(result.errorText);
      return text({
        tabID: String(id),
        url: input.url,
        origin: pageOrigin(input.url),
        navigationStarted: true,
      });
    }
    case 'browser.click':
    case 'browser.type':
    case 'browser.scroll':
    case 'browser.press': {
      if (input.elementID && input.snapshotID !== claim.snapshotID)
        throw new Error('Snapshot is stale; take another browser.snapshot.');
      if (method === 'browser.press') await press(id, input.key, signal);
      else if (method === 'browser.scroll') {
        let point;
        if (
          input.selector !== undefined ||
          input.elementID !== undefined ||
          input.x !== undefined ||
          input.y !== undefined
        )
          point = await target(id, input, signal, 'scroll');
        else {
          const { cssVisualViewport } = await cdp(id, signal, 'Page.getLayoutMetrics');
          point = { x: cssVisualViewport.clientWidth / 2, y: cssVisualViewport.clientHeight / 2 };
        }
        await cdp(id, signal, 'Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          ...point,
          deltaX: number(input.deltaX ?? 0, 'deltaX', -100_000, 100_000),
          deltaY: number(input.deltaY ?? 0, 'deltaY', -100_000, 100_000),
        });
      } else {
        if (
          method === 'browser.type' &&
          (typeof input.text !== 'string' || input.text.length > 100_000)
        )
          throw new Error('text must be a string of at most 100000 characters.');
        const hasTarget =
          input.selector !== undefined ||
          input.elementID !== undefined ||
          input.x !== undefined ||
          input.y !== undefined;
        if (method === 'browser.type' && (input.x !== undefined || !hasTarget) && input.clear)
          throw new Error('clear requires a selector or snapshot element target.');
        if (method === 'browser.click' || hasTarget) {
          const point = await target(
            id,
            input,
            signal,
            method === 'browser.type' ? 'type' : 'click',
          );
          if (method === 'browser.click' || input.x !== undefined) await click(id, point, signal);
        }
        if (method === 'browser.type') {
          await cdp(id, signal, 'Input.insertText', { text: input.text });
        }
      }
      claim.snapshotID = null;
      return text({ ...describeTab(tab), completed: true });
    }
    case 'browser.close':
      await verifyOrigin(id, signal);
      await api(signal, () => chrome.tabs.remove(id));
      await release(id);
      return text({ tabID: String(id), closed: true });
    case 'browser.console':
    case 'browser.network': {
      const after = number(input.after ?? 0, 'after', 0, Number.MAX_SAFE_INTEGER);
      const entries = (method === 'browser.console' ? claim.console : claim.network).filter(
        (entry) => entry.sequence > after,
      );
      return text({
        tabID: String(id),
        entries,
        next: claim.sequence,
        note: 'Bounded metadata captured since the tab was claimed; oldest entries are discarded.',
      });
    }
    default:
      throw new Error(`Unsupported browser method: ${method}`);
  }
}

function record(claim, kind, value) {
  const entries = claim[kind];
  entries.push({ sequence: ++claim.sequence, ...value });
  if (entries.length > 200) entries.shift();
}
chrome.debugger.onEvent.addListener((source, method, params) => {
  const claim = claims.get(source.tabId);
  if (!claim) return;
  if (method === 'Page.frameNavigated' && !params.frame.parentId) {
    claim.snapshotID = null;
    const origin = pageOrigin(params.frame.url);
    if (origin !== claim.origin) {
      claim.console.length = 0;
      claim.network.length = 0;
      claim.origin = origin;
    }
  }
  if (method === 'Runtime.consoleAPICalled')
    record(claim, 'console', {
      level: params.type,
      text: short(
        params.args
          .map((arg) => (arg.value === undefined ? arg.description || arg.type : String(arg.value)))
          .join(' '),
      ),
    });
  if (method === 'Runtime.exceptionThrown')
    record(claim, 'console', {
      level: 'error',
      text: short(params.exceptionDetails.exception?.description || params.exceptionDetails.text),
    });
  if (method === 'Log.entryAdded')
    record(claim, 'console', { level: params.entry.level, text: short(params.entry.text) });
  if (method === 'Network.requestWillBeSent')
    record(claim, 'network', {
      event: 'request',
      requestID: params.requestId,
      method: params.request.method,
      url: short(params.request.url),
    });
  if (method === 'Network.responseReceived')
    record(claim, 'network', {
      event: 'response',
      requestID: params.requestId,
      status: params.response.status,
      url: short(params.response.url),
      mime: params.response.mimeType,
    });
  if (method === 'Network.loadingFailed')
    record(claim, 'network', {
      event: 'failed',
      requestID: params.requestId,
      error: short(params.errorText),
    });
});
chrome.debugger.onDetach.addListener((source) => {
  claims.delete(source.tabId);
});
chrome.tabs.onRemoved.addListener((id) => {
  claims.delete(id);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html'))
    return false;
  const run = async () => {
    if (message.type === 'connect') await connect(message.pairingURL);
    else if (message.type === 'disconnect' && connection) await stop(connection, 'Disconnected');
    else if (message.type !== 'status' && message.type !== 'disconnect')
      throw new Error('Unsupported popup command.');
    return {
      connected: connection?.readyState === WebSocket.OPEN,
      claimedTabs: claims.size,
      error: connectionError,
    };
  };
  run().then(respond, (error) => respond({ error: short(error.message) }));
  return true;
});
