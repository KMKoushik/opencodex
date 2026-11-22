// Minimal Chrome DevTools Protocol driver for the Electron build (launched with
// --remote-debugging-port). Used only to observe DOM milestones and click a session row.

type Target = { id: string; type: string; url: string; webSocketDebuggerUrl: string };

export class Cdp {
  private id = 0;
  private pending = new Map<number, (value: { result?: unknown; error?: unknown }) => void>();
  private constructor(private socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: unknown;
      };
      if (message.id !== undefined) this.pending.get(message.id)?.(message);
    });
  }

  /** Waits for the app page (an http: URL) and attaches to it. */
  static async attach(port: number, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const targets = (await (
          await fetch(`http://127.0.0.1:${port}/json/list`)
        ).json()) as Target[];
        const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http'));
        if (page) {
          const socket = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((resolve, reject) => {
            socket.addEventListener('open', resolve, { once: true });
            socket.addEventListener('error', reject, { once: true });
          });
          return new Cdp(socket);
        }
      } catch {
        // DevTools server not listening yet.
      }
      await Bun.sleep(10);
    }
    throw new Error('DevTools page target did not appear.');
  }

  send(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<{ result?: unknown; error?: unknown }>((resolve) =>
      this.pending.set(id, resolve),
    );
  }

  /** Evaluates an async expression in the page and returns its JSON value. */
  async eval<T>(expression: string): Promise<T> {
    const response = (await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { result?: { value?: T }; exceptionDetails?: unknown }; error?: unknown };
    if (response.error || response.result?.exceptionDetails)
      throw new Error(JSON.stringify(response.error ?? response.result?.exceptionDetails));
    return response.result!.result!.value as T;
  }

  /**
   * Waits until `selector` matches at least `count` elements. Returns wall-clock times (unix ms)
   * for DOM insertion (timer-polled, works while occluded) and for the second animation frame
   * after it (null if no frame within 3 s, e.g. an occluded window), plus page visibility.
   * Retries across navigations.
   */
  async paintedWhen(selector: string, count = 1, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    const script = `new Promise((resolve) => {
      const check = () => {
        if (document.querySelectorAll(${JSON.stringify(selector)}).length < ${count})
          return void setTimeout(check, 4);
        const domAt = Date.now();
        const visibility = document.visibilityState;
        const fallback = setTimeout(() => resolve({ domAt, paintAt: null, visibility }), 3000);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          clearTimeout(fallback);
          resolve({ domAt, paintAt: Date.now(), visibility });
        }));
      };
      check();
    })`;
    while (Date.now() < deadline) {
      try {
        return await this.eval<{ domAt: number; paintAt: number | null; visibility: string }>(
          script,
        );
      } catch {
        await Bun.sleep(10);
      }
    }
    throw new Error(`Timed out waiting for ${selector}`);
  }

  /**
   * Resolves with the time (unix ms) of the last change to the count of `selector` matches and
   * the scroll height of their scroll container, once both have been unchanged for `quietMs`.
   */
  async settled(selector: string, quietMs = 500) {
    return this.eval<{ at: number; count: number }>(`new Promise((resolve) => {
      let last = '', changedAt = Date.now();
      const scroller = (node) => {
        for (let el = node?.parentElement; el; el = el.parentElement)
          if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
        return document.scrollingElement;
      };
      const tick = () => {
        const nodes = document.querySelectorAll(${JSON.stringify(selector)});
        const key = nodes.length + ':' + scroller(nodes[0])?.scrollHeight;
        if (key !== last) { last = key; changedAt = Date.now(); }
        if (Date.now() - changedAt >= ${quietMs}) resolve({ at: changedAt, count: nodes.length });
        else setTimeout(tick, 16);
      };
      tick();
    })`);
  }

  close() {
    this.socket.close();
  }
}
