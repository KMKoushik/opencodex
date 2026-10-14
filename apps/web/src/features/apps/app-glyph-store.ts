import { useSyncExternalStore } from 'react';
import { CANVAS_ICON_COLORS } from '@opencodex/contracts/canvas';
import type { GLYPHS } from './app-glyphs';

let glyphs: typeof GLYPHS | undefined;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  loading ??= import('./app-glyphs').then(
    (module) => {
      glyphs = module.GLYPHS;
      for (const notify of listeners) notify();
    },
    () => {
      // A failed chunk keeps glyph tiles blank; the next icon to mount tries again.
      loading = undefined;
    },
  );
  return () => listeners.delete(listener);
}
const read = () => glyphs;
const none = () => undefined;
const noop = () => () => {};

/** The icon set, loaded the first time an app icon needs a glyph. */
export function useGlyphs(needed: boolean) {
  return useSyncExternalStore(needed ? subscribe : noop, needed ? read : none, none);
}

/** Apps without a color keep a stable one, so the sidebar doesn't read as a gray column. */
export function fallbackColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const colors = CANVAS_ICON_COLORS.filter((color) => color !== 'gray');
  return colors[hash % colors.length]!;
}
