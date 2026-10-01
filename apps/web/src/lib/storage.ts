import type { DesktopPreferences, PreferenceKey } from '@opencodex/contracts/desktop';

let nativePreferences: DesktopPreferences = { project: null, projects: null, theme: null };

export async function initializeStorage() {
  if (!window.desktop) return;
  try {
    nativePreferences = await window.desktop.getPreferences();
  } catch {
    console.warn('Desktop preferences could not be loaded.');
  }
}

export function readStorage(key: PreferenceKey): string | null {
  if (window.desktop) return nativePreferences[key] ?? null;
  try {
    return localStorage.getItem(`opencodex:${key}`);
  } catch {
    return null;
  }
}

export function writeStorage(key: PreferenceKey, value: string | null) {
  if (window.desktop) {
    nativePreferences[key] = value;
    void window.desktop.setPreference(key, value).catch(() => {
      console.warn('Desktop preferences could not be saved.');
    });
    return;
  }
  try {
    if (value === null) localStorage.removeItem(`opencodex:${key}`);
    else localStorage.setItem(`opencodex:${key}`, value);
  } catch {
    // Preferences remain usable in memory when browser storage is unavailable.
  }
}
