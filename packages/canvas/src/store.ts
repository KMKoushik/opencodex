import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

/** The canvas's named JSON values. The host persists writes; the view only sees values. */
export type CanvasStore = {
  has(key: string): boolean;
  get(key: string): unknown;
  /** A write from the view: updates subscribers now and forwards it to the host. */
  set(key: string, value: unknown): void;
  subscribe(key: string, listener: () => void): () => void;
  scheme(): 'light' | 'dark';
  subscribeScheme(listener: () => void): () => void;
};

export const StoreContext = createContext<CanvasStore | null>(null);

export function createStore(
  initial: Record<string, unknown>,
  forward: (key: string, value: unknown) => void,
) {
  const values = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<() => void>>();
  const schemeListeners = new Set<() => void>();
  let scheme: 'light' | 'dark' = 'dark';
  const notify = (key: string) => {
    for (const listener of listeners.get(key) ?? []) listener();
  };
  const store: CanvasStore & {
    receive(key: string, value: unknown): void;
    setScheme(next: 'light' | 'dark'): void;
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
