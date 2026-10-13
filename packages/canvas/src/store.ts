import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react';

/** The canvas's named JSON values. The host persists writes; the view only sees values. */
export type CanvasStore = {
  has(key: string): boolean;
  get(key: string): unknown;
  /** A write from the view: updates subscribers now and forwards it to the host. */
  set(key: string, value: unknown): void;
  subscribe(key: string, listener: () => void): () => void;
  scheme(): 'light' | 'dark';
  subscribeScheme(listener: () => void): () => void;
  /** Calls an exported function of the canvas's server.ts. */
  call(name: string, args: unknown[]): Promise<unknown>;
  /** Server functions running now, from any caller (a trigger, the agent, another view). */
  running(): readonly string[];
  subscribeRunning(listener: () => void): () => void;
  open(target: string | { session: string }): void;
};

type Host = {
  call(name: string, args: unknown[]): Promise<unknown>;
  open(target: string | { session: string }): void;
};
const noHost: Host = {
  call: () => Promise.reject(new Error('Server functions run only in OpenCodex.')),
  open() {},
};

export const StoreContext = createContext<CanvasStore | null>(null);

export function createStore(
  initial: Record<string, unknown>,
  forward: (key: string, value: unknown) => void,
  host: Host = noHost,
) {
  const values = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<() => void>>();
  const schemeListeners = new Set<() => void>();
  const runningListeners = new Set<() => void>();
  let scheme: 'light' | 'dark' = 'dark';
  let running: readonly string[] = [];
  const notify = (key: string) => {
    for (const listener of listeners.get(key) ?? []) listener();
  };
  const store: CanvasStore & {
    receive(key: string, value: unknown): void;
    setScheme(next: 'light' | 'dark'): void;
    setRunning(names: string[]): void;
  } = {
    has: (key) => values.has(key),
    get: (key) => values.get(key),
    set(key, value) {
      values.set(key, value);
      notify(key);
      forward(key, value);
    },
    receive(key, value) {
      if (value === undefined) values.delete(key);
      else values.set(key, value);
      notify(key);
    },
    subscribe(key, listener) {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      return () => set.delete(listener);
    },
    scheme: () => scheme,
    setScheme(next) {
      if (next === scheme) return;
      scheme = next;
      for (const listener of schemeListeners) listener();
    },
    subscribeScheme(listener) {
      schemeListeners.add(listener);
      return () => schemeListeners.delete(listener);
    },
    call: host.call,
    open: host.open,
    running: () => running,
    setRunning(names) {
      if (names.join('\0') === running.join('\0')) return;
      running = names;
      for (const listener of runningListeners) listener();
    },
    subscribeRunning(listener) {
      runningListeners.add(listener);
      return () => runningListeners.delete(listener);
    },
  };
  return store;
}

function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Canvas hooks only work inside a canvas.');
  return store;
}

type Update<T> = T | ((previous: T) => T);

/**
 * Reads and writes one of the canvas's data values (`data/<key>.json`). Values are shared
 * with the agent and every open view of this canvas, and saved when written.
 */
export function useData<T>(key: string, fallback: T): [T, (next: Update<T>) => void] {
  const store = useStore();
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, listener),
    [store, key],
  );
  const read = () => store.get(key);
  const value = useSyncExternalStore(subscribe, read, read);
  const set = useCallback(
    (next: Update<T>) => {
      const previous = (store.has(key) ? store.get(key) : fallback) as T;
      store.set(key, typeof next === 'function' ? (next as (previous: T) => T)(previous) : next);
    },
    [store, key, fallback],
  );
  return [store.has(key) ? (value as T) : fallback, set];
}

/** The host's color scheme, for custom drawing that can't use the theme's CSS variables. */
export function useColorScheme(): 'light' | 'dark' {
  const store = useStore();
  return useSyncExternalStore(store.subscribeScheme, store.scheme, store.scheme);
}

type ServerFunction = (...args: never[]) => unknown;

export type Fn<F extends ServerFunction> = {
  /** Runs the function; resolves with its return value, rejects with its error. */
  call: (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>;
  /** True while this view's call, or any other caller's run of it, is in progress. */
  running: boolean;
  /** The last call's error message, cleared by the next call. */
  error?: string;
};

/**
 * Calls an exported function of the canvas's `server.ts`. Type it from the server:
 * `import type { refresh } from './server'` then `useFn<typeof refresh>('refresh')`.
 * Arguments and the result travel as JSON.
 */
export function useFn<F extends ServerFunction = (...args: unknown[]) => Promise<unknown>>(
  name: string,
): Fn<F> {
  const store = useStore();
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string>();
  const elsewhere = useSyncExternalStore(
    store.subscribeRunning,
    () => store.running().includes(name),
    () => false,
  );
  const call = useCallback(
    async (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> => {
      setPending((count) => count + 1);
      setError(undefined);
      try {
        return (await store.call(name, args)) as Awaited<ReturnType<F>>;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        throw cause;
      } finally {
        setPending((count) => count - 1);
      }
    },
    [store, name],
  );
  return { call, running: pending > 0 || elsewhere, error };
}

/**
 * Opens a web link in the browser, or `{ session }` (an id from `oc.run`) as a chat in
 * OpenCodex. Canvases can't navigate themselves.
 */
export function useOpen() {
  const store = useStore();
  return store.open;
}
