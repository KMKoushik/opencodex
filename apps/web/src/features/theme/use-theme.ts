import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { readStorage, writeStorage } from '../../lib/storage';
import { applyTheme, parseThemePreference, resolveVariant, type ThemePreference } from './theme';

const listeners = new Set<() => void>();
let preference: ThemePreference | undefined;

function getPreference() {
  preference ??= parseThemePreference(readStorage('theme'));
  return preference;
}

function setPreference(next: ThemePreference, persist = true) {
  preference = next;
  if (persist) writeStorage('theme', JSON.stringify(next));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function subscribeSystem(listener: () => void) {
  const query = darkQuery();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export function applyInitialTheme() {
  applyTheme(getPreference(), darkQuery().matches);
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, getPreference);
  const systemDark = useSyncExternalStore(subscribeSystem, () => darkQuery().matches);
  return {
    preference: current,
    variant: resolveVariant(current.mode, systemDark),
    update: setPreference,
    systemDark,
  };
}

/** Applies the theme for the lifetime of the app. Mount once. */
export function useThemeEffect() {
  const { preference, systemDark } = useTheme();

  useLayoutEffect(() => applyTheme(preference, systemDark), [preference, systemDark]);

  useEffect(() => {
    if (window.desktop) return;
    const sync = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key === 'opencodex:theme' || event.key === null) {
        setPreference(parseThemePreference(event.newValue), false);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
}
